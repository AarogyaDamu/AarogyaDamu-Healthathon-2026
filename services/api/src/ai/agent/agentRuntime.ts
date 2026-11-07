import { prisma } from '../../server';
import { generateAgentPlan, PlanGenerationRequest, PlanGenerationResult } from './agentPlanner';
import {
  confirmAgentAction,
  ConfirmActionParams,
  ConfirmActionResult,
  reviewProposalAction,
  ReviewProposalParams,
  cancelAgentAction,
  CancelActionParams,
} from './agentConfirmationService';
import { authorizeAgentAction } from './agentAuthorizationService';
import { AgentActorRole } from '@aarogyadamu/contracts';

export class AgentRuntimeEngine {
  /**
   * Generates a bounded, validated, governed agent plan.
   */
  async generatePlan(request: PlanGenerationRequest): Promise<PlanGenerationResult> {
    return generateAgentPlan(request);
  }

  /**
   * Confirms and executes an agent action.
   */
  async confirmAction(params: ConfirmActionParams): Promise<ConfirmActionResult> {
    return confirmAgentAction(params);
  }

  /**
   * Reviews and executes or rejects a proposal held for clinician approval.
   */
  async reviewProposal(params: ReviewProposalParams) {
    return reviewProposalAction(params);
  }

  /**
   * Cancels a pending action.
   */
  async cancelAction(params: CancelActionParams) {
    return cancelAgentAction(params);
  }

  /**
   * Retrieves an agent plan by ID, verifying tenant and patient access.
   */
  async getPlan(
    planId: string,
    actorContext?: { actorId: string; actorRole: AgentActorRole },
  ) {
    const plan = await prisma.agentPlan.findUnique({
      where: { id: planId },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!plan) {
      return null;
    }

    if (actorContext) {
      // Validate access authorization
      const auth = await authorizeAgentAction({
        actorId: actorContext.actorId,
        targetPatientId: plan.targetPatientId,
        actorRole: actorContext.actorRole,
        toolName: 'tool_query_health_summary', // read-only check
      });

      if (!auth.authorized && plan.userId !== actorContext.actorId) {
        throw new Error(`Unauthorized: Actor does not have access to plan '${planId}'.`);
      }
    }

    return plan;
  }

  /**
   * Retrieves an individual action by ID.
   */
  async getAction(
    actionId: string,
    actorContext?: { actorId: string; actorRole: AgentActorRole },
  ) {
    const action = await prisma.agentAction.findUnique({
      where: { id: actionId },
      include: { plan: true },
    });

    if (!action) {
      return null;
    }

    if (actorContext) {
      const auth = await authorizeAgentAction({
        actorId: actorContext.actorId,
        targetPatientId: action.plan.targetPatientId,
        actorRole: actorContext.actorRole,
        toolName: action.toolName as any,
      });

      if (!auth.authorized && action.plan.userId !== actorContext.actorId) {
        throw new Error(`Unauthorized: Actor does not have access to action '${actionId}'.`);
      }
    }

    return action;
  }

  /**
   * Reconciles an action abandoned in EXECUTING state (e.g. following an unexpected server crash)
   * before permitting recovery or timeout (SEC-P0.7.3-02).
   */
  private async reconcileAbandonedExecutingAction(action: {
    id: string;
    planId: string;
    toolName: string;
    idempotencyKey: string;
    plan: { targetPatientId: string; status: string; id: string };
  }): Promise<{ reconciledStatus: 'COMPLETED' | 'FAILED'; details: string }> {
    const { id, toolName, idempotencyKey, plan } = action;

    // 1. Verify if the underlying database mutation already succeeded prior to crash
    switch (toolName) {
      case 'tool_schedule_care_task': {
        const existing = await prisma.careTask.findUnique({ where: { idempotencyKey } });
        if (existing) {
          await prisma.agentAction.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              executedAt: existing.createdAt,
              executionResult: JSON.stringify({
                taskId: existing.id,
                title: existing.title,
                dueAt: existing.dueAt.toISOString(),
                status: existing.status,
                reconciledAfterTimeout: true,
              }),
              errorCode: null,
              errorMessage: 'Reconciled: underlying CareTask was persisted prior to crash.',
            },
          });
          return { reconciledStatus: 'COMPLETED', details: 'CareTask verified via idempotency key.' };
        }
        break;
      }

      case 'tool_schedule_reminder': {
        const existing = await prisma.reminder.findUnique({ where: { idempotencyKey } });
        if (existing) {
          await prisma.agentAction.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              executedAt: existing.createdAt,
              executionResult: JSON.stringify({
                reminderId: existing.id,
                title: existing.title,
                remindAt: existing.remindAt.toISOString(),
                recurrence: existing.recurrence,
                status: existing.status,
                reconciledAfterTimeout: true,
              }),
              errorCode: null,
              errorMessage: 'Reconciled: underlying Reminder was persisted prior to crash.',
            },
          });
          return { reconciledStatus: 'COMPLETED', details: 'Reminder verified via idempotency key.' };
        }
        break;
      }

      case 'tool_request_appointment': {
        const existing = await prisma.appointment.findUnique({ where: { idempotencyKey } });
        if (existing) {
          await prisma.agentAction.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              executedAt: existing.createdAt,
              executionResult: JSON.stringify({
                appointmentId: existing.id,
                scheduledAt: existing.scheduledAt.toISOString(),
                durationMinutes: existing.durationMinutes,
                status: existing.status,
                reconciledAfterTimeout: true,
              }),
              errorCode: null,
              errorMessage: 'Reconciled: underlying Appointment was persisted prior to crash.',
            },
          });
          return { reconciledStatus: 'COMPLETED', details: 'Appointment verified via idempotency key.' };
        }
        break;
      }

      case 'tool_log_lifestyle_record': {
        const existing = await prisma.lifestyleRecord.findUnique({ where: { idempotencyKey } });
        if (existing) {
          await prisma.agentAction.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              executedAt: existing.createdAt,
              executionResult: JSON.stringify({
                recordId: existing.id,
                category: existing.category,
                numericValue: existing.numericValue,
                unit: existing.unit,
                recordedAt: existing.recordedAt.toISOString(),
                reconciledAfterTimeout: true,
              }),
              errorCode: null,
              errorMessage: 'Reconciled: underlying LifestyleRecord was persisted prior to crash.',
            },
          });
          return { reconciledStatus: 'COMPLETED', details: 'LifestyleRecord verified via idempotency key.' };
        }
        break;
      }

      case 'tool_draft_care_proposal': {
        const existing = await prisma.agentAuditRecord.findFirst({
          where: {
            userId: plan.targetPatientId,
            actionType: 'CLINICAL_CARE_PROPOSAL',
            payload: { contains: idempotencyKey },
          },
        });
        if (existing) {
          await prisma.agentAction.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              executedAt: existing.createdAt,
              executionResult: JSON.stringify({
                proposalId: existing.id,
                title: existing.summary,
                requiresClinicianApproval: true,
                approvalStatus: 'PENDING',
                reconciledAfterTimeout: true,
              }),
              errorCode: null,
              errorMessage: 'Reconciled: underlying Care Proposal was logged prior to crash.',
            },
          });
          return { reconciledStatus: 'COMPLETED', details: 'Care proposal audit record verified.' };
        }
        break;
      }

      case 'tool_query_health_summary': {
        // Read-only query: no mutation occurred.
        await prisma.agentAction.update({
          where: { id },
          data: {
            status: 'FAILED',
            errorCode: 'ABANDONED_EXECUTION_TIMEOUT',
            errorMessage: 'Read-only query action abandoned in EXECUTING state. Marked FAILED past timeout.',
          },
        });
        return { reconciledStatus: 'FAILED', details: 'Read-only query action abandoned.' };
      }
    }

    // 2. Underlying entity was NOT found: Fail closed to prevent duplicate execution
    await prisma.agentAction.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorCode: 'ABANDONED_EXECUTION_TIMEOUT',
        errorMessage: 'Action abandoned in EXECUTING state without confirmed database mutation. Marked FAILED to prevent duplicate execution.',
      },
    });

    return { reconciledStatus: 'FAILED', details: 'No underlying mutation found; marked FAILED.' };
  }

  /**
   * Scans for stale plans and actions past their expiration timestamps and marks them EXPIRED.
   * Also recovers and reconciles abandoned EXECUTING actions (SEC-P0.7.3-02).
   */
  async expireStalePlansAndActions(referenceTime: Date = new Date()): Promise<{
    expiredActionsCount: number;
    expiredPlansCount: number;
    reconciledExecutingActionsCount: number;
  }> {
    // 1. Recover / reconcile abandoned actions in EXECUTING state beyond execution validity
    const abandonedExecutingActions = await prisma.agentAction.findMany({
      where: {
        status: 'EXECUTING',
        expiresAt: { lte: referenceTime },
      },
      include: {
        plan: true,
      },
    });

    let reconciledExecutingActionsCount = 0;
    const affectedPlanIds = new Set<string>();

    for (const act of abandonedExecutingActions) {
      await this.reconcileAbandonedExecutingAction(act);
      reconciledExecutingActionsCount++;
      affectedPlanIds.add(act.planId);
    }

    // 2. Expire actions still awaiting confirmation or approval
    const expiredActions = await prisma.agentAction.updateMany({
      where: {
        status: { in: ['AWAITING_CONFIRMATION', 'PENDING_CLINICIAN_APPROVAL'] },
        expiresAt: { lte: referenceTime },
      },
      data: {
        status: 'EXPIRED',
        errorMessage: 'Action expired past its 24-hour validity window without execution.',
      },
    });

    // 3. Reconcile parent plan statuses for plans with recovered executing actions
    for (const planId of affectedPlanIds) {
      const siblingActions = await prisma.agentAction.findMany({ where: { planId } });
      const allCompleted = siblingActions.every((a) => a.status === 'COMPLETED');
      const allFailed = siblingActions.every((a) => a.status === 'FAILED');
      const anyCompleted = siblingActions.some((a) => a.status === 'COMPLETED');

      let newStatus: string = 'EXPIRED';
      if (allCompleted) {
        newStatus = 'COMPLETED';
      } else if (allFailed) {
        newStatus = 'FAILED';
      } else if (anyCompleted) {
        newStatus = 'PARTIALLY_EXECUTED';
      }

      await prisma.agentPlan.update({
        where: { id: planId },
        data: { status: newStatus },
      });
    }

    // 4. Expire plans still awaiting confirmation or approval
    const expiredPlans = await prisma.agentPlan.updateMany({
      where: {
        status: { in: ['AWAITING_CONFIRMATION', 'PENDING_CLINICIAN_APPROVAL', 'PLANNING'] },
        expiresAt: { lte: referenceTime },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return {
      expiredActionsCount: expiredActions.count,
      expiredPlansCount: expiredPlans.count,
      reconciledExecutingActionsCount,
    };
  }
}

export const agentRuntime = new AgentRuntimeEngine();

