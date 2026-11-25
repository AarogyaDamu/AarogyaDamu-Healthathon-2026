import { confirmAgentAction } from '../ai/agent/agentConfirmationService';
import { executeClaimedAction } from '../ai/agent/agentExecutionCoordinator';
import { prisma } from '../server';

jest.mock('../server', () => ({
  prisma: {
    agentAction: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    agentPlan: {
      update: jest.fn(),
    },
    agentAuditRecord: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../ai/agent/agentExecutionCoordinator', () => ({
  executeClaimedAction: jest.fn(),
}));

describe('Damu Agent Confirmation vs Expiry Race Safety', () => {
  const actionId = 'action-1';
  const planId = 'plan-1';
  const userId = 'patient-1';
  const idempotencyKey = 'idem-key-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (executeClaimedAction as jest.Mock).mockResolvedValue({
      success: true,
      actionId: 'action-1',
      status: 'COMPLETED',
      executionResult: { status: 'OK' },
    });
  });

  it('rejects confirmation if action expired past its 24-hour validity window', async () => {
    const expiredTime = new Date(Date.now() - 3600_000); // 1 hour ago
    const futureTime = new Date(Date.now() + 3600_000);
    (prisma.agentAction.findUnique as jest.Mock).mockResolvedValue({
      id: actionId,
      planId,
      planVersion: 1,
      status: 'AWAITING_CONFIRMATION',
      expiresAt: expiredTime,
      toolName: 'tool_log_lifestyle_record',
      plan: {
        id: planId,
        version: 1,
        userId,
        targetPatientId: userId,
        status: 'AWAITING_PATIENT_CONFIRMATION',
        expiresAt: futureTime,
      },
    });

    const result = await confirmAgentAction({
      actionId,
      planId,
      planVersion: 1,
      confirm: true,
      idempotencyKey,
      confirmedByUserId: userId,
      confirmedByRole: 'PATIENT',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ACTION_EXPIRED');
  });

  it('atomically claims action to EXECUTING when valid and unexpired', async () => {
    const futureTime = new Date(Date.now() + 3600_000);
    (prisma.agentAction.findUnique as jest.Mock).mockResolvedValue({
      id: actionId,
      planId,
      planVersion: 1,
      status: 'AWAITING_CONFIRMATION',
      expiresAt: futureTime,
      toolName: 'tool_log_lifestyle_record',
      plan: {
        id: planId,
        version: 1,
        userId,
        targetPatientId: userId,
        status: 'AWAITING_PATIENT_CONFIRMATION',
        expiresAt: futureTime,
      },
    });

    // Mock successful atomic claim
    (prisma.agentAction.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await confirmAgentAction({
      actionId,
      planId,
      planVersion: 1,
      confirm: true,
      idempotencyKey,
      confirmedByUserId: userId,
      confirmedByRole: 'PATIENT',
    });

    expect(result.success).toBe(true);
    // Verifies conditional update included expiresAt guard
    expect(prisma.agentAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: actionId,
          status: 'AWAITING_CONFIRMATION',
          expiresAt: expect.anything(),
        }),
        data: expect.objectContaining({
          status: 'EXECUTING',
          confirmationSignature: idempotencyKey,
        }),
      }),
    );
  });

  it('detects expiry if action expires during concurrent race and returns ACTION_EXPIRED', async () => {
    const futureTime = new Date(Date.now() + 100);
    (prisma.agentAction.findUnique as jest.Mock)
      // First read: looks valid
      .mockResolvedValueOnce({
        id: actionId,
        planId,
        planVersion: 1,
        status: 'AWAITING_CONFIRMATION',
        expiresAt: futureTime,
        toolName: 'tool_log_lifestyle_record',
        plan: {
          id: planId,
          version: 1,
          userId,
          targetPatientId: userId,
          status: 'AWAITING_PATIENT_CONFIRMATION',
          expiresAt: futureTime,
        },
      })
      // Second read after updateMany returns 0 (expired):
      .mockResolvedValueOnce({
        id: actionId,
        planId,
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 1000),
      });

    // Concurrency conflict: 0 rows updated because expiresAt passed
    (prisma.agentAction.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await confirmAgentAction({
      actionId,
      planId,
      planVersion: 1,
      confirm: true,
      idempotencyKey,
      confirmedByUserId: userId,
      confirmedByRole: 'PATIENT',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ACTION_EXPIRED');
  });

  it('replays cached result idempotently if action is already COMPLETED', async () => {
    (prisma.agentAction.findUnique as jest.Mock).mockResolvedValue({
      id: actionId,
      planId,
      planVersion: 1,
      status: 'COMPLETED',
      executionResult: JSON.stringify({ recordId: 'rec-123', logged: true }),
      expiresAt: new Date(Date.now() + 3600_000),
      plan: {
        id: planId,
        version: 1,
        userId,
        targetPatientId: userId,
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const result = await confirmAgentAction({
      actionId,
      planId,
      planVersion: 1,
      confirm: true,
      idempotencyKey,
      confirmedByUserId: userId,
      confirmedByRole: 'PATIENT',
    });

    expect(result.success).toBe(true);
    expect(result.replayed).toBe(true);
    expect(result.executionResult).toEqual({ recordId: 'rec-123', logged: true });
  });

  it('rejects confirmation if action was CANCELLED', async () => {
    (prisma.agentAction.findUnique as jest.Mock).mockResolvedValue({
      id: actionId,
      planId,
      planVersion: 1,
      status: 'CANCELLED',
      expiresAt: new Date(Date.now() + 3600_000),
      plan: {
        id: planId,
        version: 1,
        userId,
        targetPatientId: userId,
        status: 'CANCELLED',
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const result = await confirmAgentAction({
      actionId,
      planId,
      planVersion: 1,
      confirm: true,
      idempotencyKey,
      confirmedByUserId: userId,
      confirmedByRole: 'PATIENT',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ACTION_CANCELLED');
  });
});
