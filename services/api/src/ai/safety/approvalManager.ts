import { classifyAgentIntent } from './riskClassifier';
import { logAgentActivity } from './agentAuditLogger';
import { logClinicalMutationEvent } from '../../audit/clinicalAuditLogger';

import { prisma } from '../../db/prisma';

export interface ProposalInput {
  userId: string;
  agentName?: string;
  actionType: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ProposalResult {
  proposalId: string;
  status: 'AUTO_EXECUTED' | 'PENDING' | 'REJECTED';
  riskTier: string;
  requiresClinicianApproval: boolean;
  canExecuteNow: boolean;
  message: string;
}

export async function submitAgentProposal(input: ProposalInput): Promise<ProposalResult> {
  const classification = classifyAgentIntent(input.actionType, input.payload);

  if (classification.riskTier === 'PROHIBITED') {
    const record = await logAgentActivity({
      userId: input.userId,
      agentName: input.agentName || 'Damu',
      riskTier: 'PROHIBITED',
      actionType: input.actionType,
      summary: input.summary,
      payload: input.payload,
      requiresClinicianApproval: true,
      approvalStatus: 'REJECTED',
      executionResult: `Rejected: ${classification.reason}`,
    });

    return {
      proposalId: record.id,
      status: 'REJECTED',
      riskTier: 'PROHIBITED',
      requiresClinicianApproval: true,
      canExecuteNow: false,
      message: classification.reason,
    };
  }

  if (classification.canAutoExecute) {
    const record = await logAgentActivity({
      userId: input.userId,
      agentName: input.agentName || 'Damu',
      riskTier: classification.riskTier,
      actionType: input.actionType,
      summary: input.summary,
      payload: input.payload,
      requiresClinicianApproval: false,
      approvalStatus: 'AUTO_EXECUTED',
      executionResult: 'Executed immediately within low-risk autonomy bounds.',
    });

    return {
      proposalId: record.id,
      status: 'AUTO_EXECUTED',
      riskTier: classification.riskTier,
      requiresClinicianApproval: false,
      canExecuteNow: true,
      message: 'Proposal approved for immediate low-risk execution.',
    };
  }

  // Medium or High Risk: Requires Human-in-the-Loop review
  const record = await logAgentActivity({
    userId: input.userId,
    agentName: input.agentName || 'Damu',
    riskTier: classification.riskTier,
    actionType: input.actionType,
    summary: input.summary,
    payload: input.payload,
    requiresClinicianApproval: classification.requiresClinicianApproval,
    approvalStatus: 'PENDING',
  });

  return {
    proposalId: record.id,
    status: 'PENDING',
    riskTier: classification.riskTier,
    requiresClinicianApproval: classification.requiresClinicianApproval,
    canExecuteNow: false,
    message: classification.reason,
  };
}

export interface ReviewProposalInput {
  proposalId: string;
  reviewerId: string;
  isClinician: boolean;
  decision: 'APPROVED' | 'REJECTED';
  notes?: string;
}

export async function reviewAgentProposal(input: ReviewProposalInput) {
  const proposal = await prisma.agentAuditRecord.findUnique({
    where: { id: input.proposalId },
  });

  if (!proposal) {
    throw new Error(`Agent proposal with ID ${input.proposalId} was not found.`);
  }

  if (proposal.approvalStatus !== 'PENDING') {
    throw new Error(`Proposal is already ${proposal.approvalStatus} and cannot be modified.`);
  }

  if (proposal.requiresClinicianApproval && !input.isClinician) {
    throw new Error('This clinical proposal requires authorization by a licensed doctor.');
  }

  const updated = await prisma.agentAuditRecord.update({
    where: { id: input.proposalId },
    data: {
      approvalStatus: input.decision,
      approvedBy: input.reviewerId,
      approvedAt: new Date(),
      executionResult: input.notes ? `Reviewer decision: ${input.decision}. Notes: ${input.notes}` : `Reviewer decision: ${input.decision}`,
    },
  });

  await logClinicalMutationEvent({
    userId: proposal.userId,
    actorId: input.reviewerId,
    action: `AGENT_PROPOSAL_${input.decision}`,
    entityType: 'AgentAuditRecord',
    entityId: proposal.id,
    before: { status: 'PENDING' },
    after: { status: input.decision, approvedBy: input.reviewerId },
    metadata: {
      actionType: proposal.actionType,
      riskTier: proposal.riskTier,
      isClinicianReviewer: input.isClinician,
    },
  });

  return updated;
}

