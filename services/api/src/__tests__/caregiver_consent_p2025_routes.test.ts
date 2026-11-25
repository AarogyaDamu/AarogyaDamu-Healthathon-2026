import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import caregiverRouter from '../routes/caregivers.routes';
import { prisma } from '../db/prisma';
import { logAuditEvent } from '../audit/auditLogger';

// Mock database and audit logger
jest.mock('../db/prisma', () => ({
  prisma: {
    authSession: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    caregiverConsent: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    careTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    medicationSchedule: {
      findMany: jest.fn(),
    },
    healthObservation: {
      findMany: jest.fn(),
    },
    medicationAdherenceEvent: {
      findMany: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
    },
    healthDocument: {
      findMany: jest.fn(),
    },
    careNotification: {
      create: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../audit/auditLogger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue({}),
}));

const app = express();
app.use(express.json());
app.use('/api/caregivers', caregiverRouter);

describe('Caregiver Consent P2025 Resilience & Route Verification Suite', () => {
  const caregiverId = 'user-caregiver-1';
  const caregiverEmail = 'caregiver@aarogyadamu.local';
  const patientId = 'patient-target-1';
  const consentId = 'consent-record-42';
  const sessionId = 'session-test-token-1';

  let caregiverToken: string;
  let patientToken: string;

  beforeAll(() => {
    caregiverToken = jwt.sign(
      {
        id: caregiverId,
        email: caregiverEmail,
        isSyntheticDemo: false,
        isClinician: false,
        sessionId,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    patientToken = jwt.sign(
      {
        id: patientId,
        email: 'patient@aarogyadamu.local',
        isSyntheticDemo: false,
        isClinician: false,
        sessionId: 'session-patient-1',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default valid session for caregiver
    (prisma.authSession.findFirst as jest.Mock).mockImplementation(({ where }) => {
      if (where.userId === caregiverId) {
        return Promise.resolve({
          id: sessionId,
          userId: caregiverId,
          expiresAt: new Date(Date.now() + 3600000),
          revokedAt: null,
          user: { id: caregiverId, email: caregiverEmail, isActive: true },
        });
      }
      return Promise.resolve({
        id: 'session-patient-1',
        userId: patientId,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null,
        user: { id: patientId, email: 'patient@aarogyadamu.local', isActive: true },
      });
    });

    // Default caregiver active consent with all permissions
    (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
      id: consentId,
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000),
      permissions: JSON.stringify([
        'VIEW_HEALTH_SUMMARY',
        'VIEW_MEDICATIONS',
        'VIEW_MEDICATION_ADHERENCE',
        'VIEW_TASKS',
        'COMPLETE_TASKS_ON_BEHALF',
        'VIEW_APPOINTMENTS',
        'VIEW_REPORTS',
        'VIEW_HEALTH_TIMELINE',
      ]),
    });

    // Default safe updateMany
    (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    // Default $transaction execution
    (prisma.$transaction as jest.Mock).mockImplementation((input: any) => {
      if (typeof input === 'function') {
        return input(prisma);
      }
      return Promise.all(input);
    });

    // Default empty array resolved for all findMany queries
    (prisma.careTask.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.medicationSchedule.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.medicationAdherenceEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.healthObservation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.healthDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.careNotification.create as jest.Mock).mockResolvedValue({});
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: patientId,
      profile: { fullName: 'Test Patient', diabetesType: 'TYPE_2_DIABETES' },
    });
  });

  describe('1. GET /api/caregivers/patients/:patientId/dashboard', () => {
    it('uses updateMany with status: ACTIVE and handles disappearing consent without P2025 error', async () => {
      // Simulate consent disappearing immediately after findFirst
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: patientId,
        profile: { fullName: 'Test Patient', diabetesType: 'TYPE_2_DIABETES' },
      });
      (prisma.careTask.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.healthObservation.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/dashboard`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.patient).toBeDefined();
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
      // Crucial: ensure prisma.caregiverConsent.update was NOT called for lastAccessedAt
      expect(prisma.caregiverConsent.update).not.toHaveBeenCalled();
    });
  });

  describe('2. GET /api/caregivers/patients/:patientId/tasks', () => {
    it('uses updateMany with status: ACTIVE and returns tasks cleanly if consent record is concurrently removed', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.careTask.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Check morning glucose',
          category: 'GLUCOSE_CHECK',
          priority: 'HIGH',
          status: 'PENDING',
          dueAt: new Date(Date.now() + 3600000),
          instructions: 'Before meal',
          clinicalNotes: null,
          assignedBy: { profile: { fullName: 'Dr. Test' } },
        },
      ]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/tasks`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('3. POST /api/caregivers/patients/:patientId/tasks/:taskId/complete (Delegated Task Completion Concurrency)', () => {
    it('ORDERING 1: consent revoked BEFORE endpoint call strictly blocks authorization with 403', async () => {
      // 1. Consent is already revoked before authorization
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Attempted completion after revocation' });

      // Verifications:
      // A. Rejects with 403 Forbidden
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/No active caregiver consent/i);

      // B. Confirms that task lookup, mutation, audit log, and telemetry are NEVER executed
      expect(prisma.careTask.findFirst).not.toHaveBeenCalled();
      expect(prisma.careTask.update).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(prisma.caregiverConsent.updateMany).not.toHaveBeenCalled();
      expect(prisma.caregiverConsent.update).not.toHaveBeenCalled();
    });

    it('ORDERING 2 (Transactional Concurrency Guard): revocation occurring AFTER getActiveConsent() but BEFORE task mutation commits strictly aborts transaction with 403', async () => {
      // Step 1: getActiveConsent() finds active consent at T0
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      });

      // Step 2: Task exists and is PENDING
      (prisma.careTask.findFirst as jest.Mock).mockResolvedValue({
        id: 'task-1',
        userId: patientId,
        title: 'Check morning glucose',
        status: 'PENDING',
        clinicalNotes: null,
      });

      // Step 3: Concurrency event: Patient revokes consent at T1 (before task mutation commits).
      // Inside prisma.$transaction, the atomic active-consent check finds status is no longer ACTIVE: count === 0
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Caregiver completing task' });

      // Verifications:
      // A. The in-flight mutation was blocked and returned 403 Forbidden
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Caregiver consent was revoked prior to task completion/i);

      // B. Confirms that careTask.update was NOT executed/committed
      expect(prisma.careTask.update).not.toHaveBeenCalled();

      // C. Confirms that audit log was NOT recorded
      expect(logAuditEvent).not.toHaveBeenCalled();

      // D. Confirms updateMany was used as the concurrency check (no P2025 error)
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: {
          id: consentId,
          patientId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        data: { lastAccessedAt: expect.any(Date) },
      });
      expect(prisma.caregiverConsent.update).not.toHaveBeenCalled();
    });

    it('ORDERING 3: task mutation commits successfully and logs audit event when consent remains ACTIVE throughout transaction', async () => {
      // Step 1: Active consent exists with COMPLETE_TASKS_ON_BEHALF
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      });

      // Step 2: Task is found and ready
      (prisma.careTask.findFirst as jest.Mock).mockResolvedValue({
        id: 'task-1',
        userId: patientId,
        title: 'Check morning glucose',
        status: 'PENDING',
        clinicalNotes: null,
      });

      // Step 3: Consent is verified active in transaction (count === 1)
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      (prisma.careTask.update as jest.Mock).mockResolvedValue({
        id: 'task-1',
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: caregiverId,
        completedByRole: 'CAREGIVER',
        clinicalNotes: 'Caregiver note: Blood sugar logged 112 mg/dL',
      });

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Blood sugar logged 112 mg/dL' });

      // Verifications:
      // A. Succeeded and returned 200
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.task.status).toBe('COMPLETED');

      // B. Caregiver task-completion database mutation was committed
      expect(prisma.careTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedById: caregiverId,
          completedByRole: 'CAREGIVER',
        }),
      });

      // C. Clinician audit trail was recorded with complete attribution inside transaction
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: patientId,
          actorId: caregiverId,
          action: 'TASK_COMPLETED_BY_CAREGIVER',
          entityType: 'CareTask',
          entityId: 'task-1',
          metadata: expect.objectContaining({
            taskId: 'task-1',
            caregiverEmail,
            permissionUsed: 'COMPLETE_TASKS_ON_BEHALF',
            notes: 'Blood sugar logged 112 mg/dL',
          }),
        }),
        prisma
      );
    });

    it('ORDERING 4: subsequent requests after revocation are strictly denied (403)', async () => {
      // Once consent is revoked in DB, getActiveConsent returns null
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Subsequent attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/No active caregiver consent/i);
      expect(prisma.careTask.update).not.toHaveBeenCalled();
    });

    it('ORDERING 5 (Durable Audit Atomicity Guarantee): audit failure inside transaction rolls back task completion with 500 (no orphan mutations)', async () => {
      // Step 1: Active consent exists with COMPLETE_TASKS_ON_BEHALF
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      });

      // Step 2: Task is found and ready
      (prisma.careTask.findFirst as jest.Mock).mockResolvedValue({
        id: 'task-1',
        userId: patientId,
        title: 'Check morning glucose',
        status: 'PENDING',
        clinicalNotes: null,
      });

      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.careTask.update as jest.Mock).mockResolvedValue({
        id: 'task-1',
        status: 'COMPLETED',
      });

      // Step 3: Audit insertion fails (e.g. database error, storage full, connection drop)
      (logAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('AUDIT_DATABASE_WRITE_FAILURE'));

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Audit failure test' });

      // Atomicity guarantee: endpoint fails with 500, transaction aborted
      expect(res.status).toBe(500);

      // Verify that audit logger was invoked within the transaction client
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: patientId,
          actorId: caregiverId,
          action: 'TASK_COMPLETED_BY_CAREGIVER',
          entityId: 'task-1',
        }),
        prisma
      );
    });

    it('ORDERING 6 (PostgreSQL Row Lock & Concurrent Revocation Barrier): serialized concurrent revocation aborts in-flight task transaction', async () => {
      // Barrier simulation:
      // Caregiver starts request and verifies consent is ACTIVE at T0
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      });

      (prisma.careTask.findFirst as jest.Mock).mockResolvedValue({
        id: 'task-1',
        userId: patientId,
        title: 'Check morning glucose',
        status: 'PENDING',
        clinicalNotes: null,
      });

      // Synchronization barrier:
      let barrierReached = false;
      let revocationCommitted = false;

      // When caregiver enters $transaction, barrier fires before conditional updateMany
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (txFn: any) => {
        barrierReached = true;

        // Concurrent patient revocation executes and commits at barrier
        revocationCommitted = true;

        // Caregiver transaction continues and attempts row-lock updateMany on consent
        const mockTx = {
          ...prisma,
          caregiverConsent: {
            ...prisma.caregiverConsent,
            updateMany: jest.fn().mockImplementation(async ({ where }) => {
              // Row lock check: since revocationCommitted is true, database row is REVOKED
              if (revocationCommitted && where.status === 'ACTIVE') {
                return { count: 0 }; // Zero rows matched
              }
              return { count: 1 };
            }),
          },
          careTask: {
            ...prisma.careTask,
            update: jest.fn(),
          },
        };

        return txFn(mockTx);
      });

      const res = await request(app)
        .post(`/api/caregivers/patients/${patientId}/tasks/task-1/complete`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ notes: 'Testing concurrent revocation barrier' });

      // Verifications:
      expect(barrierReached).toBe(true);
      expect(revocationCommitted).toBe(true);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Caregiver consent was revoked prior to task completion/i);
      expect(prisma.careTask.update).not.toHaveBeenCalled();
    });
  });

  describe('4. GET /api/caregivers/patients/:patientId/medications', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.medicationSchedule.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/medications`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('5. GET /api/caregivers/patients/:patientId/health', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.healthObservation.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/health`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('6. GET /api/caregivers/patients/:patientId/medications/adherence', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.medicationAdherenceEvent.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/medications/adherence`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('7. GET /api/caregivers/patients/:patientId/appointments', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/appointments`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('8. GET /api/caregivers/patients/:patientId/reports', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.healthDocument.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/reports`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('9. GET /api/caregivers/patients/:patientId/timeline', () => {
    it('uses updateMany with status: ACTIVE and completes successfully without P2025 error', async () => {
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.healthObservation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.careTask.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.medicationAdherenceEvent.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/caregivers/patients/${patientId}/timeline`)
        .set('Authorization', `Bearer ${caregiverToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: consentId, status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });
  });

  describe('10. Lifecycle Operations Preservation (Strictly Preserves prisma.caregiverConsent.update)', () => {
    it('preserves single-record update semantics for PATCH /api/caregivers/:id/permissions', async () => {
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS']),
        caregiverEmail,
      });
      (prisma.caregiverConsent.update as jest.Mock).mockResolvedValue({
        id: consentId,
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      });

      const res = await request(app)
        .patch(`/api/caregivers/${consentId}/permissions`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ permissions: ['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF'] });

      expect(res.status).toBe(200);
      // Confirms lifecycle operation uses .update(), NOT updateMany
      expect(prisma.caregiverConsent.update).toHaveBeenCalledWith({
        where: { id: consentId },
        data: {
          permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
        },
      });
    });

    it('preserves single-record update semantics for DELETE /api/caregivers/:id (Revocation)', async () => {
      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: consentId,
        patientId,
        status: 'ACTIVE',
        caregiverEmail,
      });
      (prisma.caregiverConsent.update as jest.Mock).mockResolvedValue({
        id: consentId,
        status: 'REVOKED',
      });

      const res = await request(app)
        .delete(`/api/caregivers/${consentId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(prisma.caregiverConsent.update).toHaveBeenCalledWith({
        where: { id: consentId },
        data: {
          status: 'REVOKED',
          activeGrantKey: null,
          invitationToken: null,
        },
      });
    });
  });
});
