import { prisma } from '../../server';
import { AgentToolName, AgentActorRole, AgentPlanStatus } from '@aarogyadamu/contracts';
import { executeAgentTool, ToolExecutionResult } from './toolExecutor';

export interface ExecuteClaimedActionParams {
  actionId: string;
  actorId: string;
  actorRole: AgentActorRole;
}

export interface ActionExecutionOutcome {
  success: boolean;
  actionId: string;
  toolName: AgentToolName;
  status: 'COMPLETED' | 'FAILED';
  executionResult?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  planStatus?: AgentPlanStatus;
}

/**
 * Coordinates dispatch, audit logging, and lifecycle transition for claimed agent actions.
 */
export async function executeClaimedAction(
  params: ExecuteClaimedActionParams,
): Promise<ActionExecutionOutcome> {
  const { actionId, actorId, actorRole } = params;

  // 1. Fetch action with parent plan
  const action = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: { plan: true },
  });

  if (!action) {
    throw new Error(`AgentAction with ID '${actionId}' was not found.`);
  }

  if (action.status !== 'EXECUTING') {
    throw new Error(
      `Cannot execute action '${actionId}': action must be in 'EXECUTING' state, but found '${action.status}'.`,
    );
  }

  let parsedParams: Record<string, unknown> = {};
  try {
    parsedParams = JSON.parse(action.parameters || '{}');
  } catch {
    parsedParams = {};
  }

  // 2. Dispatch underlying tool
  const toolResult: ToolExecutionResult = await executeAgentTool(
    action.toolName as AgentToolName,
    parsedParams,
    {
      actorId,
      targetPatientId: action.plan.targetPatientId,
      actorRole,
      idempotencyKey: action.idempotencyKey,
      actionId: action.id,
      planId: action.planId,
    },
  );

  let updatedActionStatus: 'COMPLETED' | 'FAILED' = 'COMPLETED';
  let auditRecordId: string | undefined = undefined;

  // 3. Handle success vs failure
  if (toolResult.success) {
    // Create audit record
    const audit = await prisma.agentAuditRecord.create({
      data: {
        userId: action.plan.targetPatientId,
        agentName: 'Damu',
        riskTier: action.riskTier,
        actionType: action.toolName,
        summary: `Executed agent action: ${action.toolName}`,
        payload: JSON.stringify({
          parameters: parsedParams,
          result: toolResult.result,
        }),
        requiresClinicianApproval: action.riskTier === 'HIGH_RISK',
        approvalStatus: 'APPROVED',
        approvedBy: action.confirmedByUserId || actorId,
        approvedAt: action.confirmedAt || new Date(),
        executionResult: JSON.stringify(toolResult.result),
      },
    });
    auditRecordId = audit.id;

    await prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'COMPLETED',
        executedAt: new Date(),
        executionResult: JSON.stringify(toolResult.result),
        errorCode: null,
        errorMessage: null,
        auditRecordId,
      },
    });
    updatedActionStatus = 'COMPLETED';
  } else {
    await prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'FAILED',
        executedAt: new Date(),
        errorCode: toolResult.errorCode || 'EXECUTION_FAILED',
        errorMessage: toolResult.errorMessage || 'Execution failed',
        executionResult: JSON.stringify({ error: toolResult.errorMessage }),
      },
    });
    updatedActionStatus = 'FAILED';
  }

  // 4. Update parent plan status based on aggregate action states
  const siblingActions = await prisma.agentAction.findMany({
    where: { planId: action.planId },
  });

  const allCompleted = siblingActions.every((a) => a.status === 'COMPLETED');
  const allFailed = siblingActions.every((a) => a.status === 'FAILED');
  const anyCompleted = siblingActions.some((a) => a.status === 'COMPLETED');

  let newPlanStatus: AgentPlanStatus = action.plan.status as AgentPlanStatus;
  if (allCompleted) {
    newPlanStatus = 'COMPLETED';
  } else if (allFailed) {
    newPlanStatus = 'FAILED';
  } else if (anyCompleted) {
    newPlanStatus = 'PARTIALLY_EXECUTED';
  }

  await prisma.agentPlan.update({
    where: { id: action.planId },
    data: { status: newPlanStatus },
  });

  return {
    success: toolResult.success,
    actionId: action.id,
    toolName: action.toolName as AgentToolName,
    status: updatedActionStatus,
    executionResult: toolResult.result,
    errorCode: toolResult.errorCode,
    errorMessage: toolResult.errorMessage,
    planStatus: newPlanStatus,
  };
}

