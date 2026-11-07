import crypto from 'crypto';
import { prisma } from '../../server';
import {
  AgentActorRole,
  evaluateConfirmationEmergencyPrecedence,
  verifyConfirmationBinding,
  isActionExecutable,
  AgentEmergencyEvaluation,
} from '@aarogyadamu/contracts';
import { executeClaimedAction, ActionExecutionOutcome } from './agentExecutionCoordinator';
import { authorizeAgentAction } from './agentAuthorizationService';

export interface ConfirmActionParams {
  actionId: string;
  planId?: string;
  planVersion?: number;
  confirm: true;
  idempotencyKey: string;
  confirmedByUserId: string;
  confirmedByRole: AgentActorRole;
  confirmationTextOrSpoken?: string | null;
  currentGlucose?: number | null;
  emergencyNotice?: string | null;
  symptoms?: string[];
}

export interface ConfirmActionResult {
  success: boolean;
  hasEmergency?: boolean;
  emergencyEvaluation?: AgentEmergencyEvaluation;
  replayed?: boolean;
  actionId?: string;
  status?: string;
  executionResult?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface ReviewProposalParams {
  actionId: string;
  planId: string;
  planVersion: number;
  decision: 'APPROVE' | 'REJECT';
  clinicianId: string;
  reviewNotes: string;
  rejectionReason?: string;
  idempotencyKey?: string;
}

export interface CancelActionParams {
  actionId: string;
  planId: string;
  planVersion?: number;
  cancelledByUserId: string;
  cancelledByRole?: AgentActorRole;
  reason: string;
}

export interface CancelActionResult {
  success: boolean;
  actionId: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Handles action confirmation with emergency precedence, binding verification,
 * atomic concurrency protection, and dispatch.
 */
export async function confirmAgentAction(
  params: ConfirmActionParams,
): Promise<ConfirmActionResult> {
  const {
    actionId,
    planId,
    planVersion,
    idempotencyKey,
    confirmedByUserId,
    confirmedByRole,
    confirmationTextOrSpoken,
    currentGlucose,
    emergencyNotice,
    symptoms = [],
  } = params;

  // 1. Fetch existing action and parent plan to resolve target plan and patient context
  const action = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: { plan: true },
  });

  if (!action) {
    return {
      success: false,
      errorCode: 'ACTION_NOT_FOUND',
      errorMessage: `AgentAction with ID '${actionId}' was not found.`,
    };
  }

  const effectivePlanId = planId || action.planId;
  const effectivePlanVersion = planVersion ?? action.planVersion ?? action.plan.version ?? 1;

  if (planId && action.planId !== planId) {
    return {
      success: false,
      errorCode: 'CONFIRMATION_BINDING_MISMATCH',
      errorMessage: `AgentAction with ID '${actionId}' belongs to plan '${action.planId}', but confirmation specified plan '${planId}'.`,
    };
  }

  const plan = action.plan;

  // 2. Emergency precedence evaluation at confirmation time (Section 3 & 7)
  const emergencyEval = evaluateConfirmationEmergencyPrecedence({
    emergencyNotice,
    currentGlucose,
    spokenOrTextInput: confirmationTextOrSpoken,
    symptoms,
  });

  if (emergencyEval.hasEmergency) {
    // Atomically halt parent plan to prioritize patient safety
    await prisma.agentPlan.update({
      where: { id: effectivePlanId },
      data: { status: 'EMERGENCY_ABORTED' },
    });

    await prisma.agentAuditRecord.create({
      data: {
        userId: confirmedByUserId,
        agentName: 'Damu',
        riskTier: 'HIGH_RISK',
        actionType: 'CONFIRMATION_EMERGENCY_HALT',
        summary: `Confirmation halted due to emergency condition for plan ${effectivePlanId}`,
        payload: JSON.stringify({
          actionId,
          planId: effectivePlanId,
          emergencyNotice: emergencyEval.emergencyNotice,
          haltReason: emergencyEval.haltReason,
          detectedGlucose: emergencyEval.detectedGlucose,
        }),
        approvalStatus: 'REJECTED',
      },
    });

    return {
      success: false,
      hasEmergency: true,
      emergencyEvaluation: emergencyEval,
      errorCode: 'EMERGENCY_HALT',
      errorMessage: emergencyEval.haltReason || 'Emergency condition detected. Action execution halted.',
    };
  }

  // 3. Verify confirmation binding (Action ID, Plan ID, Plan Version, Plan Owner / Target)
  const bindingCheck = verifyConfirmationBinding(
    {
      actionId: action.id,
      planId: plan.id,
      planVersion: plan.version,
      planOwnerUserId: plan.userId,
    },
    {
      actionId,
      planId: effectivePlanId,
      planVersion: effectivePlanVersion,
      confirmedByUserId,
    },
  );

  if (!bindingCheck.bound) {
    return {
      success: false,
      errorCode: 'CONFIRMATION_BINDING_MISMATCH',
      errorMessage: bindingCheck.mismatchReason || 'Confirmation parameters do not bind to the active plan version.',
    };
  }

  // 4. Check if action is executable according to canonical state machine
  const execCheck = isActionExecutable({
    action: {
      status: action.status as any,
      expiresAt: action.expiresAt,
    },
    parentPlan: {
      status: plan.status as any,
      expiresAt: plan.expiresAt,
    },
    pathway: 'PATIENT_CONFIRMATION',
  });

  // Idempotent replay: if already completed, return cached executionResult
  if (action.status === 'COMPLETED') {
    let cachedResult: Record<string, unknown> = {};
    try {
      cachedResult = JSON.parse(action.executionResult || '{}');
    } catch {
      cachedResult = {};
    }

    return {
      success: true,
      replayed: true,
      actionId: action.id,
      status: 'COMPLETED',
      executionResult: cachedResult,
    };
  }

  if (!execCheck.executable) {
    return {
      success: false,
      errorCode: execCheck.code || 'ACTION_NOT_EXECUTABLE',
      errorMessage: execCheck.reason || 'Action cannot be executed in its current state.',
    };
  }

  // 5. Atomic concurrency protection: conditional update claim
  const claimResult = await prisma.agentAction.updateMany({
    where: {
      id: actionId,
      planId,
      status: 'AWAITING_CONFIRMATION',
    },
    data: {
      status: 'EXECUTING',
      confirmedByUserId,
      confirmedByRole,
      confirmedAt: new Date(),
      confirmationSignature: idempotencyKey,
    },
  });

  if (claimResult.count === 0) {
    // Action was claimed concurrently or transitioned out of AWAITING_CONFIRMATION
    const freshAction = await prisma.agentAction.findUnique({ where: { id: actionId } });
    if (freshAction?.status === 'COMPLETED') {
      let cachedResult: Record<string, unknown> = {};
      try {
        cachedResult = JSON.parse(freshAction.executionResult || '{}');
      } catch {
        cachedResult = {};
      }
      return {
        success: true,
        replayed: true,
        actionId: freshAction.id,
        status: 'COMPLETED',
        executionResult: cachedResult,
      };
    }

    return {
      success: false,
      errorCode: 'CONCURRENT_CLAIM_CONFLICT',
      errorMessage: 'Action is no longer in awaiting confirmation state or has already been claimed by another process.',
    };
  }

  // 6. Action successfully claimed in EXECUTING state. Execute via coordinator.
  const outcome: ActionExecutionOutcome = await executeClaimedAction({
    actionId,
    actorId: confirmedByUserId,
    actorRole: confirmedByRole,
  });

  return {
    success: outcome.success,
    actionId: outcome.actionId,
    status: outcome.status,
    executionResult: outcome.executionResult,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
  };
}

/**
 * Handles clinician review (approval or rejection) of proposals held for clinical approval.
 */
export async function reviewProposalAction(
  params: ReviewProposalParams,
): Promise<{
  success: boolean;
  actionId: string;
  status: string;
  executionResult?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}> {
  const { actionId, planId, planVersion, decision, clinicianId, reviewNotes, rejectionReason, idempotencyKey } = params;

  // 1. Fetch action and parent plan
  const action = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: { plan: true },
  });

  if (!action || action.planId !== planId) {
    return {
      success: false,
      actionId,
      status: 'FAILED',
      errorCode: 'ACTION_NOT_FOUND',
      errorMessage: `AgentAction with ID '${actionId}' was not found in plan '${planId}'.`,
    };
  }

  if (action.planVersion !== planVersion) {
    return {
      success: false,
      actionId,
      status: 'FAILED',
      errorCode: 'PLAN_VERSION_MISMATCH',
      errorMessage: `Plan version mismatch: expected ${action.planVersion}, received ${planVersion}.`,
    };
  }

  const now = new Date();
  if (action.expiresAt <= now || action.plan.expiresAt <= now) {
    return {
      success: false,
      actionId,
      status: 'EXPIRED',
      errorCode: 'ACTION_EXPIRED',
      errorMessage: 'This clinical proposal has expired and cannot be approved or rejected.',
    };
  }

  // 2. Validate clinician authorization
  const auth = await authorizeAgentAction({
    actorId: clinicianId,
    targetPatientId: action.plan.targetPatientId,
    actorRole: 'CLINICIAN',
    toolName: action.toolName as any,
  });

  if (!auth.authorized) {
    return {
      success: false,
      actionId,
      status: 'UNAUTHORIZED',
      errorCode: auth.errorCode || 'UNASSIGNED_CLINICIAN',
      errorMessage: auth.reason || 'Clinician lacks active assignment to review this proposal.',
    };
  }

  // 3. Handle rejection
  if (decision === 'REJECT') {
    const updateResult = await prisma.agentAction.updateMany({
      where: {
        id: actionId,
        planId,
        status: 'PENDING_CLINICIAN_APPROVAL',
      },
      data: {
        status: 'REJECTED',
        confirmedByUserId: clinicianId,
        confirmedByRole: 'CLINICIAN',
        confirmedAt: new Date(),
        reviewNotes,
        reviewedByUserId: clinicianId,
        reviewedAt: new Date(),
        errorMessage: rejectionReason || 'Proposal rejected by clinician.',
      },
    });

    if (updateResult.count === 0) {
      return {
        success: false,
        actionId,
        status: action.status,
        errorCode: 'ACTION_NOT_IN_REVIEWABLE_STATE',
        errorMessage: `Cannot reject action in state '${action.status}'.`,
      };
    }

    return {
      success: true,
      actionId,
      status: 'REJECTED',
      errorMessage: rejectionReason || 'Proposal rejected by clinician.',
    };
  }

  // 4. Handle approval: atomic claim into EXECUTING
  const claimResult = await prisma.agentAction.updateMany({
    where: {
      id: actionId,
      planId,
      status: 'PENDING_CLINICIAN_APPROVAL',
    },
    data: {
      status: 'EXECUTING',
      confirmedByUserId: clinicianId,
      confirmedByRole: 'CLINICIAN',
      confirmedAt: new Date(),
      confirmationSignature: idempotencyKey || crypto.randomUUID(),
      reviewNotes,
      reviewedByUserId: clinicianId,
      reviewedAt: new Date(),
    },
  });

  if (claimResult.count === 0) {
    return {
      success: false,
      actionId,
      status: action.status,
      errorCode: 'CONCURRENT_CLAIM_CONFLICT',
      errorMessage: 'Action is no longer in pending clinician approval state.',
    };
  }

  // 5. Execute claimed proposal tool
  const outcome = await executeClaimedAction({
    actionId,
    actorId: clinicianId,
    actorRole: 'CLINICIAN',
  });

  return {
    success: outcome.success,
    actionId: outcome.actionId,
    status: outcome.status,
    executionResult: outcome.executionResult,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
  };
}

/**
 * Cancels an action that is awaiting confirmation or review.
 * Enforces clinician assignment authorization (SEC-P0.7.4-02), prohibits
 * cancelling EXECUTING or terminal actions, and uses atomic conditional updates (SEC-P0.7.4-03).
 */
export async function cancelAgentAction(
  params: CancelActionParams,
): Promise<CancelActionResult> {
  const { actionId, planId, planVersion, cancelledByUserId, cancelledByRole, reason } = params;

  const action = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: { plan: true },
  });

  if (!action || action.planId !== planId) {
    return {
      success: false,
      actionId,
      status: 'NOT_FOUND',
      errorCode: 'ACTION_NOT_FOUND',
      errorMessage: `Action '${actionId}' not found in plan '${planId}'.`,
    };
  }

  if (planVersion && action.planVersion !== planVersion) {
    return {
      success: false,
      actionId,
      status: 'VERSION_MISMATCH',
      errorCode: 'PLAN_VERSION_MISMATCH',
      errorMessage: `Plan version mismatch: expected ${action.planVersion}, received ${planVersion}.`,
    };
  }

  // 1. Service-layer authorization checks (SEC-P0.7.4-02)
  if (cancelledByRole === 'CLINICIAN') {
    const assignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        doctorId: cancelledByUserId,
        patientId: action.plan.targetPatientId,
        status: 'ACTIVE',
      },
    });

    if (!assignment) {
      return {
        success: false,
        actionId,
        status: action.status,
        errorCode: 'UNASSIGNED_CLINICIAN',
        errorMessage: `Access denied: Clinician does not have an active assignment to patient '${action.plan.targetPatientId}'.`,
      };
    }
  }

  if (cancelledByRole === 'PATIENT' && action.plan.targetPatientId !== cancelledByUserId) {
    return {
      success: false,
      actionId,
      status: action.status,
      errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
      errorMessage: 'Cross-patient action cancellation is strictly prohibited.',
    };
  }

  // 2. State-machine guard: prevent cancelling EXECUTING or terminal states (SEC-P0.7.4-03)
  if (action.status === 'EXECUTING') {
    return {
      success: false,
      actionId,
      status: action.status,
      errorCode: 'CANNOT_CANCEL_EXECUTING_ACTION',
      errorMessage: 'Cannot cancel an action that is currently executing.',
    };
  }

  if (['COMPLETED', 'CANCELLED', 'EXPIRED', 'REJECTED', 'FAILED', 'PROHIBITED_REFUSED'].includes(action.status)) {
    return {
      success: false,
      actionId,
      status: action.status,
      errorCode: 'ACTION_NOT_IN_CANCELLABLE_STATE',
      errorMessage: `Cannot cancel action in terminal state '${action.status}'.`,
    };
  }

  // 3. Atomic conditional update against race conditions (SEC-P0.7.4-03)
  const updateResult = await prisma.agentAction.updateMany({
    where: {
      id: actionId,
      planId,
      status: { in: ['AWAITING_CONFIRMATION', 'PENDING_CLINICIAN_APPROVAL'] },
    },
    data: {
      status: 'CANCELLED',
      errorMessage: `Cancelled by user ${cancelledByUserId}: ${reason}`,
    },
  });

  if (updateResult.count === 0) {
    // Action was concurrently claimed into EXECUTING or another terminal state
    const freshAction = await prisma.agentAction.findUnique({ where: { id: actionId } });
    if (freshAction?.status === 'EXECUTING') {
      return {
        success: false,
        actionId,
        status: 'EXECUTING',
        errorCode: 'CANNOT_CANCEL_EXECUTING_ACTION',
        errorMessage: 'Cannot cancel an action that is currently executing.',
      };
    }
    return {
      success: false,
      actionId,
      status: freshAction?.status || action.status,
      errorCode: 'ACTION_NOT_IN_CANCELLABLE_STATE',
      errorMessage: `Cannot cancel action in state '${freshAction?.status || action.status}'.`,
    };
  }

  // 4. Audit logging
  await prisma.agentAuditRecord.create({
    data: {
      userId: action.plan.targetPatientId,
      riskTier: action.riskTier,
      actionType: 'AGENT_ACTION_CANCELLED',
      summary: `Agent action ${action.toolName} was cancelled by user ${cancelledByUserId}. Reason: ${reason}`,
      payload: JSON.stringify({
        actionId,
        planId,
        toolName: action.toolName,
        reason,
        cancelledByUserId,
        cancelledByRole,
      }),
    },
  });

  // 5. Aggregate parent plan state
  const siblingActions = await prisma.agentAction.findMany({
    where: { planId },
  });

  const allCancelled = siblingActions.every((a) => a.status === 'CANCELLED');
  if (allCancelled) {
    await prisma.agentPlan.update({
      where: { id: planId },
      data: { status: 'CANCELLED' },
    });
  } else {
    const anyCompleted = siblingActions.some((a) => a.status === 'COMPLETED');
    const allTerminal = siblingActions.every((a) =>
      ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(a.status),
    );
    if (anyCompleted && allTerminal) {
      await prisma.agentPlan.update({
        where: { id: planId },
        data: { status: 'PARTIALLY_EXECUTED' },
      });
    }
  }

  return {
    success: true,
    actionId,
    status: 'CANCELLED',
  };
}

