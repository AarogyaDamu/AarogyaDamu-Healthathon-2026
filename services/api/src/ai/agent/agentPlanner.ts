import crypto from 'crypto';
import { prisma } from '../../server';
import {
  AgentToolName,
  AgentActorRole,
  AgentRiskTier,
  AgentPlanStatus,
  AgentActionStatus,
  validatePlanActionCount,
  getDeterministicToolRiskTier,
  AgentEmergencyEvaluation,
  AgentProhibitedRefusal,
} from '@aarogyadamu/contracts';
import { classifyAgentIntent, CandidateActionProposal } from './intentClassifier';
import { getRegisteredTool, validateRegisteredToolParameters, isAllowlistedTool } from './toolRegistry';
import { authorizeAgentAction } from './agentAuthorizationService';

export interface PlanGenerationRequest {
  actorId: string;
  targetPatientId: string;
  actorRole: AgentActorRole;
  userQuery: string;
  conversationId?: string;
  emergencyNotice?: string | null;
  detectedGlucose?: number | null;
  defaultDoctorId?: string;
  explicitCandidateActions?: CandidateActionProposal[];
}

export interface PlanGenerationResult {
  success: boolean;
  hasEmergency?: boolean;
  emergencyEvaluation?: AgentEmergencyEvaluation;
  isProhibited?: boolean;
  prohibitedRefusal?: AgentProhibitedRefusal;
  planId?: string;
  plan?: any;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Governed Agent Planner.
 * Generates structured, validated, bounded action plans (maximum 3 actions).
 * Enforces emergency precedence, prohibited clinical intent refusals,
 * tool allowlists, parameter validation, risk tiering, and atomic database persistence.
 */
export async function generateAgentPlan(
  request: PlanGenerationRequest,
): Promise<PlanGenerationResult> {
  const {
    actorId,
    targetPatientId,
    actorRole,
    userQuery,
    conversationId,
    emergencyNotice,
    detectedGlucose,
    defaultDoctorId,
    explicitCandidateActions,
  } = request;

  // 1. Intent classification & emergency / prohibited intent detection
  const intentResult = classifyAgentIntent({
    userQuery,
    emergencyNotice,
    detectedGlucose,
    defaultDoctorId,
  });

  // Emergency halt precedence (Section 3 & 7)
  if (intentResult.hasEmergency) {
    return {
      success: false,
      hasEmergency: true,
      emergencyEvaluation: intentResult.emergencyEvaluation,
      errorCode: 'EMERGENCY_HALT',
      errorMessage: intentResult.explanation,
    };
  }

  // Prohibited clinical intent refusal (Section 4 & 8)
  if (intentResult.isProhibited) {
    return {
      success: false,
      isProhibited: true,
      prohibitedRefusal: intentResult.prohibitedRefusal,
      errorCode: 'PROHIBITED_ACTION_REFUSAL',
      errorMessage: intentResult.explanation,
    };
  }

  // Determine candidate actions (either explicit or generated via intent classifier)
  const candidateActions = explicitCandidateActions || intentResult.candidateActions;

  // 2. Validate action count boundary (Bounded limit: max 3 actions per plan)
  const countValidation = validatePlanActionCount(candidateActions);
  if (!countValidation.valid) {
    return {
      success: false,
      errorCode: 'ACTION_LIMIT_EXCEEDED',
      errorMessage: countValidation.error || 'A single plan may contain at most 3 actions.',
    };
  }

  if (candidateActions.length === 0) {
    return {
      success: false,
      errorCode: 'NO_ACTIONS_PROPOSED',
      errorMessage: 'No actions were proposed for this request.',
    };
  }

  // 3. Validate each candidate action (tool registration, parameters, permissions, risk tier)
  const validatedActions: Array<{
    toolName: AgentToolName;
    parameters: Record<string, unknown>;
    summary: string;
    riskTier: AgentRiskTier;
    initialStatus: AgentActionStatus;
    requiresPatientConfirmation: boolean;
    requiresClinicianApproval: boolean;
    idempotencyKey: string;
    expiresAt: Date;
  }> = [];

  const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour expiration policy
  let highestRiskTier: AgentRiskTier = 'LOW_RISK';
  const riskPriority: Record<AgentRiskTier, number> = {
    LOW_RISK: 1,
    MEDIUM_RISK: 2,
    HIGH_RISK: 3,
    PROHIBITED: 4,
  };

  for (const candidate of candidateActions) {
    if (!isAllowlistedTool(candidate.toolName)) {
      return {
        success: false,
        errorCode: 'UNAUTHORIZED_TOOL',
        errorMessage: `Tool '${candidate.toolName}' is not an approved allowlisted tool.`,
      };
    }

    const toolDef = getRegisteredTool(candidate.toolName);

    // Validate parameters with strict schema
    let validParams: Record<string, unknown>;
    try {
      validParams = validateRegisteredToolParameters(candidate.toolName, candidate.parameters);
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'INVALID_TOOL_PARAMETERS',
        errorMessage: `Parameter validation failed for tool '${candidate.toolName}': ${err.message}`,
      };
    }

    // Authorization check against ownership, clinician assignment, and caregiver consent
    const authCheck = await authorizeAgentAction({
      actorId,
      targetPatientId,
      actorRole,
      toolName: candidate.toolName,
    });

    if (!authCheck.authorized) {
      return {
        success: false,
        errorCode: authCheck.errorCode || 'UNAUTHORIZED_ACTION',
        errorMessage: authCheck.reason || 'Actor is not authorized to propose this action.',
      };
    }

    const riskTier = getDeterministicToolRiskTier(candidate.toolName);
    if (riskPriority[riskTier] > riskPriority[highestRiskTier]) {
      highestRiskTier = riskTier;
    }

    // Determine initial action status
    let initialStatus: AgentActionStatus = 'AWAITING_CONFIRMATION';
    if (toolDef.requiresClinicianApproval) {
      initialStatus = 'PENDING_CLINICIAN_APPROVAL';
    }

    validatedActions.push({
      toolName: candidate.toolName,
      parameters: validParams,
      summary: candidate.summary || toolDef.description,
      riskTier,
      initialStatus,
      requiresPatientConfirmation: toolDef.requiresPatientConfirmation,
      requiresClinicianApproval: toolDef.requiresClinicianApproval,
      idempotencyKey: crypto.randomUUID(),
      expiresAt: expirationDate,
    });
  }

  // Determine initial plan status
  let initialPlanStatus: AgentPlanStatus = 'AWAITING_CONFIRMATION';
  if (validatedActions.some((a) => a.requiresClinicianApproval)) {
    initialPlanStatus = 'PENDING_CLINICIAN_APPROVAL';
  }

  // 4. Atomic database persistence via single nested write
  try {
    const createdPlan = await prisma.agentPlan.create({
      data: {
        userId: actorId,
        targetPatientId,
        conversationId: conversationId || null,
        userIntent: intentResult.userIntent,
        explanation: intentResult.explanation,
        highestRiskTier,
        status: initialPlanStatus,
        version: 1,
        actionCount: validatedActions.length,
        expiresAt: expirationDate,
        actions: {
          create: validatedActions.map((act) => ({
            planVersion: 1,
            toolName: act.toolName,
            parameters: JSON.stringify(act.parameters),
            riskTier: act.riskTier,
            status: act.initialStatus,
            idempotencyKey: act.idempotencyKey,
            expiresAt: act.expiresAt,
          })),
        },
      },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Persist audit record for plan creation
    await prisma.agentAuditRecord.create({
      data: {
        userId: targetPatientId,
        agentName: 'Damu',
        riskTier: highestRiskTier,
        actionType: 'PLAN_PROPOSAL_CREATED',
        summary: `Created agent plan (${createdPlan.id}) with ${createdPlan.actionCount} action(s). Intent: ${intentResult.userIntent}`,
        payload: JSON.stringify({
          planId: createdPlan.id,
          userIntent: createdPlan.userIntent,
          actionCount: createdPlan.actionCount,
          actions: validatedActions.map((a) => ({ toolName: a.toolName, riskTier: a.riskTier })),
        }),
        requiresClinicianApproval: initialPlanStatus === 'PENDING_CLINICIAN_APPROVAL',
        approvalStatus: initialPlanStatus === 'PENDING_CLINICIAN_APPROVAL' ? 'PENDING' : 'AUTO_EXECUTED',
      },
    });

    const formattedPlan = formatAgentPlan(createdPlan);

    return {
      success: true,
      planId: createdPlan.id,
      plan: formattedPlan,
    };
  } catch (err: any) {
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      errorMessage: `Failed to persist agent plan: ${err.message}`,
    };
  }
}

/**
 * Normalizes an AgentPlan record into the canonical AgentPlanResponse structure.
 * Guarantees both id/planId, version/planVersion, parsed parameters, and ISO timestamps.
 */
export function formatAgentPlan(plan: any): any {
  if (!plan) return null;

  const actions = (plan.actions || []).map((act: any) => {
    let parsedParams: Record<string, unknown> = {};
    if (typeof act.parameters === 'string') {
      try {
        parsedParams = JSON.parse(act.parameters);
      } catch {
        parsedParams = {};
      }
    } else if (act.parameters && typeof act.parameters === 'object') {
      parsedParams = act.parameters;
    }

    const toolDef = isAllowlistedTool(act.toolName) ? getRegisteredTool(act.toolName) : null;
    const requiresPatientConfirmation =
      act.requiresPatientConfirmation ??
      (toolDef ? toolDef.requiresPatientConfirmation : act.status === 'AWAITING_CONFIRMATION');
    const requiresClinicianApproval =
      act.requiresClinicianApproval ??
      (toolDef ? toolDef.requiresClinicianApproval : act.status === 'PENDING_CLINICIAN_APPROVAL');

    return {
      id: act.id,
      planId: act.planId || plan.id,
      planVersion: act.planVersion || plan.version || 1,
      toolName: act.toolName,
      parameters: parsedParams,
      riskTier: act.riskTier,
      status: act.status,
      summary: act.summary || (toolDef ? toolDef.description : act.toolName),
      requiresPatientConfirmation,
      requiresClinicianApproval,
      idempotencyKey: act.idempotencyKey,
      expiresAt: act.expiresAt instanceof Date ? act.expiresAt.toISOString() : String(act.expiresAt || ''),
      createdAt: act.createdAt instanceof Date ? act.createdAt.toISOString() : String(act.createdAt || ''),
    };
  });

  const requiresConfirmation = actions.some(
    (a: any) => a.requiresPatientConfirmation || a.status === 'AWAITING_CONFIRMATION'
  );
  const requiresClinicianApproval = actions.some(
    (a: any) => a.requiresClinicianApproval || a.status === 'PENDING_CLINICIAN_APPROVAL'
  );

  return {
    id: plan.id,
    planId: plan.id,
    version: plan.version || 1,
    planVersion: plan.version || 1,
    userId: plan.userId,
    targetPatientId: plan.targetPatientId,
    conversationId: plan.conversationId || undefined,
    userIntent: plan.userIntent,
    explanation: plan.explanation,
    status: plan.status,
    highestRiskTier: plan.highestRiskTier,
    actionCount: actions.length,
    requiresConfirmation,
    requiresClinicianApproval,
    expiresAt: plan.expiresAt instanceof Date ? plan.expiresAt.toISOString() : String(plan.expiresAt || ''),
    createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : String(plan.createdAt || ''),
    actions,
  };
}
