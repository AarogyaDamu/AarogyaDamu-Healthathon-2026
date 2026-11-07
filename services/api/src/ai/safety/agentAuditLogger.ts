import { AgentRiskTier } from '@aarogyadamu/contracts';
import { sanitizePhi, safeClinicalLog } from '../../audit/clinicalAuditLogger';
import { prisma } from '../../db/prisma';

export interface AgentLogParams {
  userId: string;
  agentName?: string;
  riskTier: AgentRiskTier;
  actionType: string;
  summary: string;
  payload?: Record<string, unknown>;
  requiresClinicianApproval?: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_EXECUTED';
  approvedBy?: string;
  approvedAt?: Date;
  executionResult?: string;
}

export async function logAgentActivity(params: AgentLogParams) {
  try {
    const sanitizedPayload = params.payload ? JSON.stringify(sanitizePhi(params.payload)) : null;

    const record = await prisma.agentAuditRecord.create({
      data: {
        userId: params.userId,
        agentName: params.agentName || 'Damu',
        riskTier: params.riskTier,
        actionType: params.actionType,
        summary: params.summary,
        payload: sanitizedPayload,
        requiresClinicianApproval: params.requiresClinicianApproval ?? false,
        approvalStatus: params.approvalStatus ?? 'PENDING',
        approvedBy: params.approvedBy,
        approvedAt: params.approvedAt,
        executionResult: params.executionResult,
      },
    });

    safeClinicalLog('info', `AI Agent Audit: ${params.agentName || 'Damu'} [${params.riskTier}] - ${params.actionType}`, {
      recordId: record.id,
      userId: params.userId,
      riskTier: params.riskTier,
      approvalStatus: record.approvalStatus,
    });

    return record;
  } catch (err) {
    safeClinicalLog('error', 'Failed to persist agent audit record', { error: String(err) });
    throw err;
  }
}

