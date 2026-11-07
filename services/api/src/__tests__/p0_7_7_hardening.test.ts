import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  assertCanSafelyDeleteUser,
  deactivateUser,
  reactivateUser,
  isUserActive,
  ClinicalProvenanceError,
} from '../services/userProvenanceService';
import { AgentExpiryWorker } from '../ai/agent/agentExpiryWorker';
import { AgentRuntimeEngine } from '../ai/agent/agentRuntime';
import { authorizeAgentAction } from '../ai/agent/agentAuthorizationService';
import { AgentToolNameEnum, DETERMINISTIC_TOOL_RISK_TIERS } from '@aarogyadamu/contracts';
import { REGISTERED_AGENT_TOOLS } from '../ai/agent/toolRegistry';

const prisma = new PrismaClient();

describe('Phase P0.7.7 — Post-Audit Targeted Hardening Suite', () => {
  const uniqueSuffix = Date.now().toString(36);
  let testPatient: { id: string; email: string };
  let testCaregiver: { id: string; email: string };
  let testDoctor: { id: string; email: string };
  let cleanUser: { id: string; email: string };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    testPatient = await prisma.user.create({
      data: {
        email: `patient_${uniqueSuffix}@aarogyadamu.test`,
        passwordHash,
        isClinician: false,
        isActive: true,
      },
    });

    testCaregiver = await prisma.user.create({
      data: {
        email: `caregiver_${uniqueSuffix}@aarogyadamu.test`,
        passwordHash,
        isClinician: false,
        isActive: true,
      },
    });

    testDoctor = await prisma.user.create({
      data: {
        email: `doctor_${uniqueSuffix}@aarogyadamu.test`,
        passwordHash,
        isClinician: true,
        isActive: true,
      },
    });

    cleanUser = await prisma.user.create({
      data: {
        email: `clean_${uniqueSuffix}@aarogyadamu.test`,
        passwordHash,
        isClinician: false,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    const allIds = [testPatient?.id, testCaregiver?.id, testDoctor?.id, cleanUser?.id].filter(Boolean);
    if (allIds.length > 0) {
      await prisma.agentAction.deleteMany({
        where: { plan: { userId: { in: allIds } } },
      });
      await prisma.agentPlan.deleteMany({
        where: { userId: { in: allIds } },
      });
      await prisma.agentAuditRecord.deleteMany({
        where: { userId: { in: allIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: allIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: allIds } },
      });
    }
    await prisma.$disconnect();
  });

  // ==========================================
  // SECTION 1: CANONICAL TOOL ALLOWLIST RECONCILIATION
  // ==========================================
  describe('1. Canonical Tool Allowlist Reconciliation', () => {
    it('confirms the canonical 6-tool allowlist includes tool_query_health_summary', () => {
      const allowedTools = AgentToolNameEnum.options;
      expect(allowedTools).toHaveLength(6);
      expect(allowedTools).toContain('tool_schedule_care_task');
      expect(allowedTools).toContain('tool_schedule_reminder');
      expect(allowedTools).toContain('tool_request_appointment');
      expect(allowedTools).toContain('tool_log_lifestyle_record');
      expect(allowedTools).toContain('tool_draft_care_proposal');
      expect(allowedTools).toContain('tool_query_health_summary');
    });

    it('confirms tool_log_health_vital is NOT in backend AgentToolNameEnum or REGISTERED_AGENT_TOOLS', () => {
      const allowedTools = AgentToolNameEnum.options;
      expect(allowedTools).not.toContain('tool_log_health_vital');
      expect(REGISTERED_AGENT_TOOLS['tool_log_health_vital' as any]).toBeUndefined();
      expect(REGISTERED_AGENT_TOOLS['tool_query_health_summary']).toBeDefined();
      expect(DETERMINISTIC_TOOL_RISK_TIERS['tool_query_health_summary']).toBe('LOW_RISK');
    });
  });

  // ==========================================
  // SECTION 2: CLINICAL PROVENANCE & USER DELETION PROTECTION (MED-P0.7.7-01)
  // ==========================================
  describe('2. Clinical Provenance Protection & Deactivation (MED-P0.7.7-01)', () => {
    it('permits hard deletion for a user with zero clinical records', async () => {
      await expect(assertCanSafelyDeleteUser(prisma, cleanUser.id)).resolves.not.toThrow();
    });

    it('strictly blocks hard deletion when user has authored an AgentPlan', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const plan = await prisma.agentPlan.create({
        data: {
          userId: testCaregiver.id,
          targetPatientId: testPatient.id,
          userIntent: 'SCHEDULE_REMINDER',
          explanation: 'Caregiver planned reminder for patient',
          status: 'AWAITING_CONFIRMATION',
          version: 1,
          actionCount: 1,
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Insulin reminder' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: crypto.randomUUID(),
                expiresAt,
              },
            ],
          },
        },
      });

      // Attempting to safely delete caregiver must be rejected to preserve clinical history
      await expect(assertCanSafelyDeleteUser(prisma, testCaregiver.id)).rejects.toThrow(
        ClinicalProvenanceError
      );
      await expect(assertCanSafelyDeleteUser(prisma, testCaregiver.id)).rejects.toThrow(
        /immutable clinical record/
      );
    });

    it('strictly blocks hard deletion when user has AgentAuditRecord entries', async () => {
      await prisma.agentAuditRecord.create({
        data: {
          userId: testPatient.id,
          actionType: 'CLINICAL_CARE_PROPOSAL',
          riskTier: 'HIGH_RISK',
          summary: 'Audit log of care proposal',
          approvalStatus: 'PENDING',
        },
      });

      await expect(assertCanSafelyDeleteUser(prisma, testPatient.id)).rejects.toThrow(
        ClinicalProvenanceError
      );
    });

    it('deactivates user safely while preserving all historical plans and actions intact', async () => {
      // Create session for caregiver
      const session = await prisma.authSession.create({
        data: {
          userId: testCaregiver.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      // Deactivate caregiver
      const deactResult = await deactivateUser(prisma, testCaregiver.id, 'Caregiver relationship terminated');
      expect(deactResult.success).toBe(true);
      expect(deactResult.userId).toBe(testCaregiver.id);
      expect(deactResult.deactivatedAt).toBeInstanceOf(Date);

      // Verify user flags in database
      const userRecord = await prisma.user.findUnique({ where: { id: testCaregiver.id } });
      expect(userRecord?.isActive).toBe(false);
      expect(userRecord?.deactivatedAt).not.toBeNull();

      // Verify auth sessions were revoked
      const updatedSession = await prisma.authSession.findUnique({ where: { id: session.id } });
      expect(updatedSession?.revokedAt).not.toBeNull();

      // Verify plans and actions remain 100% intact and queryable
      const preservedPlans = await prisma.agentPlan.findMany({
        where: { userId: testCaregiver.id },
        include: { actions: true },
      });
      expect(preservedPlans.length).toBeGreaterThan(0);
      expect(preservedPlans[0].actions.length).toBeGreaterThan(0);
      expect(preservedPlans[0].actions[0].toolName).toBe('tool_schedule_reminder');

      // Verify isUserActive helper
      const activeStatus = await isUserActive(prisma, testCaregiver.id);
      expect(activeStatus).toBe(false);
    });

    it('rejects agent authorization when actor is deactivated', async () => {
      const authResult = await authorizeAgentAction({
        actorId: testCaregiver.id,
        targetPatientId: testPatient.id,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_reminder',
      });

      expect(authResult.authorized).toBe(false);
      expect(authResult.reason).toBe('Actor account has been deactivated.');
    });

    it('rejects agent authorization when target patient is deactivated', async () => {
      // Temporarily deactivate patient
      await deactivateUser(prisma, testPatient.id, 'Patient paused care');

      const authResult = await authorizeAgentAction({
        actorId: testDoctor.id,
        targetPatientId: testPatient.id,
        actorRole: 'CLINICIAN',
        toolName: 'tool_schedule_care_task',
      });

      expect(authResult.authorized).toBe(false);
      expect(authResult.reason).toBe('Target patient account has been deactivated.');

      // Reactivate patient
      await reactivateUser(prisma, testPatient.id);
      const reactivated = await isUserActive(prisma, testPatient.id);
      expect(reactivated).toBe(true);
    });
  });

  // ==========================================
  // SECTION 3: BACKGROUND EXPIRY WORKER (MED-P0.7.7-02)
  // ==========================================
  describe('3. Background Expiry Worker Lifecycle & Reconciliation (MED-P0.7.7-02)', () => {
    let worker: AgentExpiryWorker;

    beforeAll(() => {
      worker = new AgentExpiryWorker({
        intervalMs: 15 * 60 * 1000,
        prisma,
      });
    });

    afterAll(() => {
      worker.stop();
    });

    it('starts and stops gracefully updating worker status', () => {
      expect(worker.getStatus().isStarted).toBe(false);
      worker.start();
      expect(worker.getStatus().isStarted).toBe(true);
      expect(worker.getStatus().intervalMs).toBe(15 * 60 * 1000);
      worker.stop();
      expect(worker.getStatus().isStarted).toBe(false);
    });

    it('triggers sweep and expires stale actions without executing them', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      const stalePlan = await prisma.agentPlan.create({
        data: {
          userId: testPatient.id,
          targetPatientId: testPatient.id,
          userIntent: 'STALE_SWEEP_TEST',
          explanation: 'Testing worker sweep',
          status: 'AWAITING_CONFIRMATION',
          version: 1,
          actionCount: 1,
          expiresAt: pastTime,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Unconfirmed expired reminder' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: crypto.randomUUID(),
                expiresAt: pastTime,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const staleActionId = stalePlan.actions[0].id;

      // Run worker sweep
      const sweepResult = await worker.triggerSweep(new Date());
      expect(sweepResult.success).toBe(true);
      expect(sweepResult.expiredActionsCount).toBeGreaterThanOrEqual(1);
      expect(sweepResult.durationMs).toBeGreaterThanOrEqual(0);

      // Verify the stale action transitioned to EXPIRED and was NOT executed
      const updatedAction = await prisma.agentAction.findUnique({
        where: { id: staleActionId },
      });
      expect(updatedAction?.status).toBe('EXPIRED');
      expect(updatedAction?.executedAt).toBeNull();
      expect(updatedAction?.confirmedAt).toBeNull();

      // Verify the parent plan transitioned to EXPIRED
      const updatedPlan = await prisma.agentPlan.findUnique({
        where: { id: stalePlan.id },
      });
      expect(updatedPlan?.status).toBe('EXPIRED');
    });

    it('prevents overlapping concurrent sweeps via in-process mutex', async () => {
      // Simulate mutex lock
      (worker as any).isSweeping = true;

      const concurrentResult = await worker.triggerSweep(new Date());
      expect(concurrentResult.success).toBe(false);
      expect(concurrentResult.skippedDueToLock).toBe(true);

      // Release simulated lock
      (worker as any).isSweeping = false;
    });

    it('reconciles abandoned EXECUTING actions failing closed without blind redispatch', async () => {
      const pastTime = new Date(Date.now() - 10000); // 10s ago
      const abandonedPlan = await prisma.agentPlan.create({
        data: {
          userId: testPatient.id,
          targetPatientId: testPatient.id,
          userIntent: 'ABANDONED_RECONCILE_TEST',
          explanation: 'Crash recovery simulation',
          status: 'IN_PROGRESS',
          version: 1,
          actionCount: 1,
          expiresAt: pastTime,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Crashed in-flight action' }),
                riskTier: 'MEDIUM_RISK',
                status: 'EXECUTING',
                idempotencyKey: crypto.randomUUID(),
                expiresAt: pastTime,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const abandonedActionId = abandonedPlan.actions[0].id;

      // Trigger sweep
      const sweep = await worker.triggerSweep(new Date());
      expect(sweep.success).toBe(true);

      // Since no reminder was committed in database, action must fail closed (FAILED), never redispatched
      const reconciledAction = await prisma.agentAction.findUnique({
        where: { id: abandonedActionId },
      });
      expect(reconciledAction?.status).toBe('FAILED');
      expect(reconciledAction?.errorCode).toBe('ABANDONED_EXECUTION_TIMEOUT');
      expect(reconciledAction?.errorMessage).toContain('prevent duplicate execution');
    });
  });
});
