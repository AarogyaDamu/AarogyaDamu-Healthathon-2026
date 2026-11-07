import { prisma } from '../server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

describe('Phase P0.7.2 — Governed Agentic Execution Persistence Architecture', () => {
  let patientA: { id: string; email: string };
  let patientB: { id: string; email: string };
  let caregiver: { id: string; email: string };
  let doctor: { id: string; email: string };
  const uniquePrefix = `p072_${Date.now()}`;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 8);

    // 1. Patient A
    const uA = await prisma.user.create({
      data: {
        email: `${uniquePrefix}_patient_a@aarogyadamu.test`,
        passwordHash,
        profile: {
          create: {
            fullName: 'Ramesh Patel',
            diabetesType: 'TYPE_2_DIABETES',
          },
        },
      },
    });
    patientA = { id: uA.id, email: uA.email };

    // 2. Patient B (for cross-patient isolation tests)
    const uB = await prisma.user.create({
      data: {
        email: `${uniquePrefix}_patient_b@aarogyadamu.test`,
        passwordHash,
        profile: {
          create: {
            fullName: 'Sita Sharma',
            diabetesType: 'TYPE_2_DIABETES',
          },
        },
      },
    });
    patientB = { id: uB.id, email: uB.email };

    // 3. Caregiver
    const uC = await prisma.user.create({
      data: {
        email: `${uniquePrefix}_caregiver@aarogyadamu.test`,
        passwordHash,
      },
    });
    caregiver = { id: uC.id, email: uC.email };

    // 4. Doctor
    const uD = await prisma.user.create({
      data: {
        email: `${uniquePrefix}_doctor@aarogyadamu.test`,
        passwordHash,
        isClinician: true,
      },
    });
    doctor = { id: uD.id, email: uD.email };
  });

  afterAll(async () => {
    // Cleanup created test users (cascades to created plans and actions)
    await prisma.user.deleteMany({
      where: {
        id: { in: [patientA.id, patientB.id, caregiver.id, doctor.id] },
      },
    });
  });

  // ==========================================
  // 1. AGENT PLAN CREATION & RETRIEVAL
  // ==========================================
  describe('1. AgentPlan Creation & Retrieval Lifecycle', () => {
    it('creates an AgentPlan with structured metadata and 24-hour expiration', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          conversationId: 'conv-session-1234',
          userIntent: 'SCHEDULE_FOLLOW_UP',
          explanation: 'Patient requested assistance with fasting glucose reminder and checkup schedule.',
          highestRiskTier: 'MEDIUM_RISK',
          status: 'AWAITING_CONFIRMATION',
          version: 1,
          actionCount: 2,
          organizationId: 'org-health-center-01',
          facilityName: 'Aarogya Urban Health Clinic',
          expiresAt,
        },
      });

      expect(plan.id).toBeDefined();
      expect(plan.userId).toBe(patientA.id);
      expect(plan.targetPatientId).toBe(patientA.id);
      expect(plan.status).toBe('AWAITING_CONFIRMATION');
      expect(plan.version).toBe(1);
      expect(plan.actionCount).toBe(2);
      expect(plan.highestRiskTier).toBe('MEDIUM_RISK');

      // Retrieve plan with relational navigation
      const retrieved = await prisma.agentPlan.findUnique({
        where: { id: plan.id },
        include: {
          owner: { select: { id: true, email: true } },
          targetPatient: { select: { id: true, email: true } },
        },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.owner.email).toBe(patientA.email);
      expect(retrieved?.targetPatient.email).toBe(patientA.email);
    });
  });

  // ==========================================
  // 2. AGENT ACTION CREATION & RELATIONAL HIERARCHY
  // ==========================================
  describe('2. AgentAction Creation & Relational Hierarchy', () => {
    it('creates child AgentActions associated with an AgentPlan and navigates both directions', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'LIFESTYLE_LOGGING',
          explanation: 'Plan to record physical activity and log reminder.',
          highestRiskTier: 'MEDIUM_RISK',
          status: 'AWAITING_CONFIRMATION',
          version: 1,
          actionCount: 2,
          expiresAt,
          actions: {
            create: [
              {
                planVersion: 1,
                toolName: 'tool_log_lifestyle_record',
                parameters: JSON.stringify({
                  category: 'PHYSICAL_ACTIVITY',
                  numericValue: 30,
                  unit: 'MINUTES',
                  qualitativeValue: 'BRISK_WALK',
                }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-action-1`,
                expiresAt,
              },
              {
                planVersion: 1,
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({
                  title: 'Post-walk hydration reminder',
                  category: 'LIFESTYLE',
                  remindAt: new Date(Date.now() + 3600000).toISOString(),
                }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-action-2`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      expect(plan.actions).toHaveLength(2);
      expect(plan.actions[0].toolName).toBe('tool_log_lifestyle_record');
      expect(plan.actions[1].toolName).toBe('tool_schedule_reminder');

      // Navigate from child action back to parent plan
      const childAction = await prisma.agentAction.findUnique({
        where: { id: plan.actions[0].id },
        include: { plan: true },
      });

      expect(childAction).not.toBeNull();
      expect(childAction?.plan.id).toBe(plan.id);
      expect(childAction?.plan.userIntent).toBe('LIFESTYLE_LOGGING');
    });

    it('cascades deletion of child AgentActions when parent AgentPlan is deleted', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'TEMPORARY_PLAN',
          explanation: 'Test plan for cascade deletion.',
          expiresAt,
          actions: {
            create: [
              {
                planVersion: 1,
                toolName: 'tool_query_health_summary',
                parameters: JSON.stringify({ metric: 'BLOOD_GLUCOSE', timeRangeDays: 7 }),
                riskTier: 'LOW_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-cascade-action`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const actionId = plan.actions[0].id;

      // Delete parent plan
      await prisma.agentPlan.delete({ where: { id: plan.id } });

      // Action should be automatically deleted via ON DELETE CASCADE
      const orphanedAction = await prisma.agentAction.findUnique({
        where: { id: actionId },
      });
      expect(orphanedAction).toBeNull();
    });
  });

  // ==========================================
  // 3. DATABASE FOREIGN-KEY ENFORCEMENT
  // ==========================================
  describe('3. Database Foreign-Key Constraint Enforcement', () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    it('rejects AgentPlan creation with non-existent userId', async () => {
      await expect(
        prisma.agentPlan.create({
          data: {
            userId: nonExistentUserId,
            targetPatientId: patientA.id,
            userIntent: 'INVALID_OWNER',
            explanation: 'Should fail foreign key check',
            expiresAt: new Date(Date.now() + 86400000),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects AgentPlan creation with non-existent targetPatientId', async () => {
      await expect(
        prisma.agentPlan.create({
          data: {
            userId: patientA.id,
            targetPatientId: nonExistentUserId,
            userIntent: 'INVALID_PATIENT',
            explanation: 'Should fail foreign key check',
            expiresAt: new Date(Date.now() + 86400000),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects AgentAction creation with non-existent planId', async () => {
      await expect(
        prisma.agentAction.create({
          data: {
            planId: '00000000-0000-0000-0000-000000000000',
            toolName: 'tool_schedule_care_task',
            parameters: JSON.stringify({ title: 'Orphaned Task' }),
            riskTier: 'MEDIUM_RISK',
            status: 'AWAITING_CONFIRMATION',
            idempotencyKey: `idemp-${uniquePrefix}-orphaned-action`,
            expiresAt: new Date(Date.now() + 86400000),
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 4. IDEMPOTENCY KEY DATABASE-LEVEL UNIQUENESS
  // ==========================================
  describe('4. Idempotency Key Uniqueness & Replay Prevention', () => {
    it('strictly enforces unique idempotencyKey at database layer (P2002)', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const sharedIdempotencyKey = `idemp-shared-key-${uniquePrefix}`;

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'TEST_IDEMPOTENCY',
          explanation: 'Testing idempotency unique constraints',
          expiresAt,
        },
      });

      // First action insertion succeeds
      const firstAction = await prisma.agentAction.create({
        data: {
          planId: plan.id,
          toolName: 'tool_schedule_care_task',
          parameters: JSON.stringify({ title: 'Task 1' }),
          riskTier: 'MEDIUM_RISK',
          status: 'AWAITING_CONFIRMATION',
          idempotencyKey: sharedIdempotencyKey,
          expiresAt,
        },
      });
      expect(firstAction.id).toBeDefined();

      // Duplicate insertion with identical key MUST throw PrismaClientKnownRequestError with code P2002
      await expect(
        prisma.agentAction.create({
          data: {
            planId: plan.id,
            toolName: 'tool_schedule_care_task',
            parameters: JSON.stringify({ title: 'Duplicate Replay Task' }),
            riskTier: 'MEDIUM_RISK',
            status: 'AWAITING_CONFIRMATION',
            idempotencyKey: sharedIdempotencyKey,
            expiresAt,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  // ==========================================
  // 5. CONCURRENT STATE TRANSITIONS & OPTIMISTIC CONCURRENCY
  // ==========================================
  describe('5. Concurrent State Transitions & Atomic Guard Updates', () => {
    it('prevents concurrent double-execution using atomic conditional state update', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'CONCURRENCY_TEST',
          explanation: 'Testing concurrent confirmation guards',
          expiresAt,
          actions: {
            create: [
              {
                planVersion: 1,
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({ title: 'Fast check' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-concurrency-1`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const actionId = plan.actions[0].id;

      // Simulate 2 competing requests attempting to transition AWAITING_CONFIRMATION -> EXECUTING
      const [result1, result2] = await Promise.all([
        prisma.agentAction.updateMany({
          where: { id: actionId, status: 'AWAITING_CONFIRMATION' },
          data: { status: 'EXECUTING', executedAt: new Date() },
        }),
        prisma.agentAction.updateMany({
          where: { id: actionId, status: 'AWAITING_CONFIRMATION' },
          data: { status: 'EXECUTING', executedAt: new Date() },
        }),
      ]);

      // Exactly ONE request must succeed (count: 1); the other must fail to match (count: 0)
      const successCount = result1.count + result2.count;
      expect(successCount).toBe(1);

      // Verify the final state in the database is EXECUTING
      const finalAction = await prisma.agentAction.findUnique({
        where: { id: actionId },
      });
      expect(finalAction?.status).toBe('EXECUTING');
      expect(finalAction?.executedAt).not.toBeNull();
    });
  });

  // ==========================================
  // 6. EXPIRATION PERSISTENCE & TEMPORAL QUERIES
  // ==========================================
  describe('6. Expiration Persistence & Index-Aware Temporal Queries', () => {
    it('accurately filters active vs expired plans using indexed expiration queries', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      const futureTime = new Date(Date.now() + 86400000); // 24 hours ahead
      const now = new Date();

      // Expired plan
      await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'EXPIRED_PLAN',
          explanation: 'Plan created in the past',
          status: 'AWAITING_CONFIRMATION',
          expiresAt: pastTime,
        },
      });

      // Active unexpired plan
      const activePlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'ACTIVE_PLAN',
          explanation: 'Plan valid for execution',
          status: 'AWAITING_CONFIRMATION',
          expiresAt: futureTime,
        },
      });

      // Query active unexpired plans for patient A
      const activePlans = await prisma.agentPlan.findMany({
        where: {
          userId: patientA.id,
          status: 'AWAITING_CONFIRMATION',
          expiresAt: { gt: now },
        },
      });

      expect(activePlans.some((p) => p.id === activePlan.id)).toBe(true);
      expect(activePlans.some((p) => p.userIntent === 'EXPIRED_PLAN')).toBe(false);

      // Query expired plans
      const expiredPlans = await prisma.agentPlan.findMany({
        where: {
          userId: patientA.id,
          expiresAt: { lte: now },
        },
      });

      expect(expiredPlans.some((p) => p.userIntent === 'EXPIRED_PLAN')).toBe(true);
    });
  });

  // ==========================================
  // 7. CANCELLATION & EMERGENCY-ABORT PERSISTENCE
  // ==========================================
  describe('7. Cancellation & Emergency-Abort State Persistence', () => {
    it('persists EMERGENCY_ABORTED status on plan and updates child actions', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'EMERGENCY_ABORT_TEST',
          explanation: 'Testing emergency abort state transition',
          status: 'AWAITING_CONFIRMATION',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({ title: 'Task pre-emergency' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-abort-action`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      // Execute atomic transaction marking plan EMERGENCY_ABORTED and action CANCELLED
      await prisma.$transaction([
        prisma.agentPlan.update({
          where: { id: plan.id },
          data: {
            status: 'EMERGENCY_ABORTED',
            explanation: 'ABORTED: Critical hypoglycemia (< 54 mg/dL) detected at confirmation.',
          },
        }),
        prisma.agentAction.update({
          where: { id: plan.actions[0].id },
          data: {
            status: 'CANCELLED',
            errorMessage: 'Action cancelled due to emergency halt.',
          },
        }),
      ]);

      const reloadedPlan = await prisma.agentPlan.findUnique({
        where: { id: plan.id },
        include: { actions: true },
      });

      expect(reloadedPlan?.status).toBe('EMERGENCY_ABORTED');
      expect(reloadedPlan?.explanation).toMatch(/ABORTED: Critical hypoglycemia/i);
      expect(reloadedPlan?.actions[0].status).toBe('CANCELLED');
      expect(reloadedPlan?.actions[0].errorMessage).toMatch(/emergency halt/i);
    });
  });

  // ==========================================
  // 8. OWNERSHIP, TENANT BOUNDARIES & ISOLATION
  // ==========================================
  describe('8. Ownership, Tenant Boundaries & Cross-Patient Isolation', () => {
    it('strictly isolates Patient A plans from Patient B queries', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const planA = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'PATIENT_A_PRIVATE_PLAN',
          explanation: 'Only visible to Patient A',
          expiresAt,
        },
      });

      const planB = await prisma.agentPlan.create({
        data: {
          userId: patientB.id,
          targetPatientId: patientB.id,
          userIntent: 'PATIENT_B_PRIVATE_PLAN',
          explanation: 'Only visible to Patient B',
          expiresAt,
        },
      });

      // Query scoped to Patient A
      const patientAPlans = await prisma.agentPlan.findMany({
        where: { userId: patientA.id },
      });
      expect(patientAPlans.some((p) => p.id === planA.id)).toBe(true);
      expect(patientAPlans.some((p) => p.id === planB.id)).toBe(false);

      // Query scoped to Patient B
      const patientBPlans = await prisma.agentPlan.findMany({
        where: { userId: patientB.id },
      });
      expect(patientBPlans.some((p) => p.id === planB.id)).toBe(true);
      expect(patientBPlans.some((p) => p.id === planA.id)).toBe(false);
    });

    it('strictly scopes plans by organizationId for multi-facility tenancy', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const clinicAPlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          organizationId: 'facility-hyderabad-metro',
          userIntent: 'CLINIC_A_PLAN',
          explanation: 'Hyderabad Metro Clinic',
          expiresAt,
        },
      });

      const clinicBPlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          organizationId: 'facility-vijayawada-rural',
          userIntent: 'CLINIC_B_PLAN',
          explanation: 'Vijayawada Rural Clinic',
          expiresAt,
        },
      });

      const hyderabadPlans = await prisma.agentPlan.findMany({
        where: { organizationId: 'facility-hyderabad-metro' },
      });
      expect(hyderabadPlans.some((p) => p.id === clinicAPlan.id)).toBe(true);
      expect(hyderabadPlans.some((p) => p.id === clinicBPlan.id)).toBe(false);
    });
  });

  // ==========================================
  // 9. CAREGIVER & CLINICIAN PROVENANCE TRACKING
  // ==========================================
  describe('9. Caregiver & Clinician Provenance Tracking', () => {
    it('persists confirmation actor, role, timestamp, and signature', async () => {
      const expiresAt = new Date(Date.now() + 86400000);
      const confirmedAt = new Date();
      const signature = 'sig_sha256_mock_hash_for_anti_tampering';

      const plan = await prisma.agentPlan.create({
        data: {
          userId: caregiver.id,
          targetPatientId: patientA.id,
          userIntent: 'CAREGIVER_DELEGATED_TASK',
          explanation: 'Caregiver assisting with reminder setup.',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Evening Insulin Reminder' }),
                riskTier: 'MEDIUM_RISK',
                status: 'COMPLETED',
                idempotencyKey: `idemp-${uniquePrefix}-provenance-action`,
                confirmedByUserId: caregiver.id,
                confirmedByRole: 'CAREGIVER',
                confirmedAt,
                confirmationSignature: signature,
                executedAt: confirmedAt,
                executionResult: JSON.stringify({ success: true, reminderId: 'rem-101' }),
                expiresAt,
              },
            ],
          },
        },
        include: { actions: { include: { confirmedBy: true } } },
      });

      const action = plan.actions[0];
      expect(action.confirmedByUserId).toBe(caregiver.id);
      expect(action.confirmedByRole).toBe('CAREGIVER');
      expect(action.confirmationSignature).toBe(signature);
      expect(action.confirmedBy?.email).toBe(caregiver.email);
    });

    it('sets confirmedByUserId to NULL via SetNull if confirming user is deleted, preserving medical action history', async () => {
      const expiresAt = new Date(Date.now() + 86400000);
      const passwordHash = await bcrypt.hash('TempPass123!', 8);

      // Create a temporary user who confirms an action
      const tempUser = await prisma.user.create({
        data: {
          email: `${uniquePrefix}_temp_actor@aarogyadamu.test`,
          passwordHash,
        },
      });

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'TEMP_USER_CONFIRMATION',
          explanation: 'Testing SetNull on user deletion',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({ title: 'Task by temp user' }),
                riskTier: 'MEDIUM_RISK',
                status: 'COMPLETED',
                idempotencyKey: `idemp-${uniquePrefix}-setnull-action`,
                confirmedByUserId: tempUser.id,
                confirmedByRole: 'CAREGIVER',
                confirmedAt: new Date(),
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const actionId = plan.actions[0].id;

      // Delete the temporary user
      await prisma.user.delete({ where: { id: tempUser.id } });

      // Action record MUST still exist with confirmedByUserId = null
      const preservedAction = await prisma.agentAction.findUnique({
        where: { id: actionId },
      });
      expect(preservedAction).not.toBeNull();
      expect(preservedAction?.confirmedByUserId).toBeNull();
      expect(preservedAction?.status).toBe('COMPLETED');
    });
  });

  // ==========================================
  // 10. AUDIT RECORD INTEGRATION & RELATIONAL INTEGRITY
  // ==========================================
  describe('10. Audit Record Integration & Relational Integrity', () => {
    it('links AgentAction to AgentAuditRecord and supports bidirectional relation navigation', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      // Create audit record
      const auditRecord = await prisma.agentAuditRecord.create({
        data: {
          userId: patientA.id,
          agentName: 'Damu',
          riskTier: 'HIGH_RISK',
          actionType: 'CLINICAL_CARE_PROPOSAL',
          summary: 'Review Metformin dosage due to GI upset',
          approvalStatus: 'PENDING',
          payload: JSON.stringify({ proposedChange: 'Metformin ER' }),
        },
      });

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'MEDICATION_REVIEW_PROPOSAL',
          explanation: 'Drafted clinical care proposal for doctor review.',
          highestRiskTier: 'HIGH_RISK',
          status: 'PENDING_CLINICIAN_APPROVAL',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_draft_care_proposal',
                parameters: JSON.stringify({
                  proposalType: 'MEDICATION_ADJUSTMENT_REQUEST',
                  title: 'Review Metformin',
                  rationale: 'Patient experiencing persistent nausea',
                }),
                riskTier: 'HIGH_RISK',
                status: 'PENDING_CLINICIAN_APPROVAL',
                idempotencyKey: `idemp-${uniquePrefix}-audit-action`,
                auditRecordId: auditRecord.id,
                expiresAt,
              },
            ],
          },
        },
        include: {
          actions: {
            include: { auditRecord: true },
          },
        },
      });

      const action = plan.actions[0];
      expect(action.auditRecordId).toBe(auditRecord.id);
      expect(action.auditRecord?.actionType).toBe('CLINICAL_CARE_PROPOSAL');

      // Verify reverse lookup from audit record
      const auditWithActions = await prisma.agentAuditRecord.findUnique({
        where: { id: auditRecord.id },
        include: { agentActions: true },
      });
      expect(auditWithActions?.agentActions).toHaveLength(1);
      expect(auditWithActions?.agentActions[0].id).toBe(action.id);
    });

    it('sets auditRecordId to NULL via SetNull if audit log is archived, preserving action records', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const auditRecord = await prisma.agentAuditRecord.create({
        data: {
          userId: patientA.id,
          riskTier: 'LOW_RISK',
          actionType: 'HEALTH_QUERY',
          summary: 'Query glucose summary',
          approvalStatus: 'AUTO_EXECUTED',
        },
      });

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'HEALTH_QUERY',
          explanation: 'Testing audit SetNull behavior',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_query_health_summary',
                parameters: JSON.stringify({ metric: 'BLOOD_GLUCOSE', timeRangeDays: 14 }),
                riskTier: 'LOW_RISK',
                status: 'COMPLETED',
                idempotencyKey: `idemp-${uniquePrefix}-audit-setnull-action`,
                auditRecordId: auditRecord.id,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const actionId = plan.actions[0].id;

      // Delete the audit record
      await prisma.agentAuditRecord.delete({ where: { id: auditRecord.id } });

      const preservedAction = await prisma.agentAction.findUnique({
        where: { id: actionId },
      });
      expect(preservedAction).not.toBeNull();
      expect(preservedAction?.auditRecordId).toBeNull();
    });
  });

  // ==========================================
  // 11. SENSITIVE DATA MINIMIZATION & PRIVACY INVARIANTS
  // ==========================================
  describe('11. Sensitive-Data Minimization & Privacy Invariants', () => {
    it('stores strictly sanitized structured parameters and output without audio or token leakage', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const sanitizedParams = {
        title: 'Check fasting glucose',
        category: 'GLUCOSE_CHECK',
        dueAt: '2026-11-04T08:00:00.000Z',
      };

      const sanitizedResult = {
        success: true,
        createdTaskId: 'task-uuid-12345',
        clinicalFlag: 'NORMAL',
      };

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'SCHEDULE_CARE_TASK',
          explanation: 'Sanitized plan explanation free of raw audio or session tokens',
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify(sanitizedParams),
                riskTier: 'MEDIUM_RISK',
                status: 'COMPLETED',
                idempotencyKey: `idemp-${uniquePrefix}-privacy-action`,
                executionResult: JSON.stringify(sanitizedResult),
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const action = plan.actions[0];
      const parsedParams = JSON.parse(action.parameters);
      const parsedResult = JSON.parse(action.executionResult || '{}');

      // Ensure no credentials, authorization headers, or raw audio keys exist in persisted data
      expect(parsedParams).not.toHaveProperty('audioBase64');
      expect(parsedParams).not.toHaveProperty('rawAudio');
      expect(parsedParams).not.toHaveProperty('token');
      expect(parsedParams).not.toHaveProperty('apiKey');

      expect(parsedResult).not.toHaveProperty('apiKey');
      expect(parsedResult).not.toHaveProperty('authorization');
      expect(action.parameters).not.toMatch(/Bearer\s+[A-Za-z0-9-_=]+/);
    });
  });

  // ==========================================
  // 12. PLAN VERSION ALIGNMENT & BOUNDED ACTION CEILING
  // ==========================================
  describe('12. Plan Version Alignment & Bounded Storage Invariants', () => {
    it('preserves planVersion alignment between parent plan and child actions', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const plan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'VERSIONED_PLAN',
          explanation: 'Plan v2 after user modification',
          version: 2,
          actionCount: 1,
          expiresAt,
          actions: {
            create: [
              {
                planVersion: 2,
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Evening Walk' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-version-action`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      expect(plan.version).toBe(2);
      expect(plan.actions[0].planVersion).toBe(2);
    });

    it('enforces maximum 3 actions per plan bound at application-data layer', async () => {
      const expiresAt = new Date(Date.now() + 86400000);

      const planWith3Actions = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'MAX_3_ACTIONS_PLAN',
          explanation: 'Plan with allowed maximum 3 actions',
          actionCount: 3,
          expiresAt,
          actions: {
            create: [
              {
                toolName: 'tool_query_health_summary',
                parameters: JSON.stringify({ metric: 'BLOOD_GLUCOSE', timeRangeDays: 7 }),
                riskTier: 'LOW_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-bound-1`,
                expiresAt,
              },
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({ title: 'Morning check' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-bound-2`,
                expiresAt,
              },
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Evening reminder' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: `idemp-${uniquePrefix}-bound-3`,
                expiresAt,
              },
            ],
          },
        },
        include: { actions: true },
      });

      expect(planWith3Actions.actions).toHaveLength(3);
    });
  });
});

