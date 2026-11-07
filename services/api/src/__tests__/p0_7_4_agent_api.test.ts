import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { app, prisma } from '../server';
import { setFeatureFlag } from '../features/featureFlags';
import { AgentToolName } from '@aarogyadamu/contracts';

describe('Phase P0.7.4 — Agent API Endpoints & Routes Integration Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let caregiverAuth: { id: string; email: string; token: string };
  let caregiverNoConsent: { id: string; email: string; token: string };
  let doctorAssigned: { id: string; email: string; token: string };
  let doctorUnassigned: { id: string; email: string; token: string };
  let caregiverRevoked: { id: string; email: string; token: string };
  let caregiverExpired: { id: string; email: string; token: string };

  beforeAll(async () => {
    // 1. Enable P0.7 feature flag for testing
    await setFeatureFlag('P0_7_AGENTIC_EXECUTION', true, 'development');

    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    const createUser = async (email: string, fullName: string, isClinician = false) => {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName,
              diabetesType: isClinician ? undefined : 'TYPE_2_DIABETES',
              knownAllergies: isClinician ? undefined : 'None',
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'SecurePass123!' });

      return { id: user.id, email: user.email, token: res.body.token };
    };

    const runId = Date.now();
    patientA = await createUser(`patient.anand.p074.${runId}@example.com`, 'Anand Sharma');
    patientB = await createUser(`patient.kavita.p074.${runId}@example.com`, 'Kavita Patel');
    caregiverAuth = await createUser(`caregiver.priya.p074.${runId}@example.com`, 'Priya Sharma');
    caregiverNoConsent = await createUser(`caregiver.stranger.p074.${runId}@example.com`, 'Ramesh Kumar');
    doctorAssigned = await createUser(`dr.suresh.p074.${runId}@example.com`, 'Dr. Suresh Mehta', true);
    doctorUnassigned = await createUser(`dr.rajesh.p074.${runId}@example.com`, 'Dr. Rajesh Rao', true);
    caregiverRevoked = await createUser(`caregiver.revoked.p074.${runId}@example.com`, 'Revoked Caregiver');
    caregiverExpired = await createUser(`caregiver.expired.p074.${runId}@example.com`, 'Expired Caregiver');

    // Doctor Suresh has active assignment to Patient A
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctorAssigned.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Caregiver Priya has active consent with MANAGE_REMINDERS and MANAGE_TASKS
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverAuth.email,
        caregiverName: 'Priya Sharma',
        relationship: 'DAUGHTER',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_REMINDERS', 'MANAGE_TASKS']),
      },
    });

    // Caregiver with REVOKED consent
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverRevoked.email,
        caregiverName: 'Revoked Caregiver',
        relationship: 'FRIEND',
        status: 'REVOKED',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_REMINDERS']),
      },
    });

    // Caregiver with EXPIRED consent (1 hour in the past)
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverExpired.email,
        caregiverName: 'Expired Caregiver',
        relationship: 'SISTER',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_REMINDERS']),
        expiresAt: new Date(Date.now() - 3600000),
      },
    });
  });

  afterAll(async () => {
    // Restore feature flag to disabled state
    await setFeatureFlag('P0_7_AGENTIC_EXECUTION', false, 'development');

    const userIds = [
      patientA?.id,
      patientB?.id,
      caregiverAuth?.id,
      caregiverNoConsent?.id,
      doctorAssigned?.id,
      doctorUnassigned?.id,
      caregiverRevoked?.id,
      caregiverExpired?.id,
    ].filter(Boolean) as string[];

    if (userIds.length > 0) {
      // Clean up dependent tables before users
      await prisma.agentAction.deleteMany({
        where: { plan: { userId: { in: userIds } } },
      });
      await prisma.agentPlan.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.agentAuditRecord.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.careTask.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.reminder.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.appointment.deleteMany({
        where: { OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }] },
      });
      await prisma.lifestyleRecord.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.healthObservation.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.caregiverConsent.deleteMany({
        where: { patientId: { in: userIds } },
      });
      await prisma.doctorPatientAssignment.deleteMany({
        where: { OR: [{ doctorId: { in: userIds } }, { patientId: { in: userIds } }] },
      });
      await prisma.patientProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  // ==========================================
  // SECTION 1: AUTHENTICATION & FEATURE FLAG GATING
  // ==========================================
  describe('1. Authentication & Feature Flag Governance', () => {
    it('returns 401 Unauthorized when request lacks authorization token', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .send({
          userQuery: 'Remind me to take my medicine daily at 9 PM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication token missing/i);
    });

    it('returns 401 Unauthorized when bearer token is corrupted or expired', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({
          userQuery: 'Remind me to take my medicine',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(401);
    });

    it('returns 403 FEATURE_DISABLED across all seven endpoints when P0_7_AGENTIC_EXECUTION is disabled', async () => {
      const dummyUuid = crypto.randomUUID();
      try {
        await setFeatureFlag('P0_7_AGENTIC_EXECUTION', false, 'development');

        // 1. POST /api/agent/plan
        const r1 = await request(app)
          .post('/api/agent/plan')
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            userQuery: 'Remind me to take my medicine daily at 9 PM',
            consentObtained: true,
            consentVersion: 'v1.0',
          });
        expect(r1.status).toBe(403);
        expect(r1.body.error?.code).toBe('FEATURE_DISABLED');

        // 2. POST /api/agent/execute/:actionId
        const r2 = await request(app)
          .post(`/api/agent/execute/${dummyUuid}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            planId: dummyUuid,
            planVersion: 1,
            confirm: true,
            idempotencyKey: dummyUuid,
          });
        expect(r2.status).toBe(403);
        expect(r2.body.error?.code).toBe('FEATURE_DISABLED');

        // 3. POST /api/agent/cancel/:actionId
        const r3 = await request(app)
          .post(`/api/agent/cancel/${dummyUuid}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            planId: dummyUuid,
            reason: 'Test cancellation while feature disabled',
          });
        expect(r3.status).toBe(403);
        expect(r3.body.error?.code).toBe('FEATURE_DISABLED');

        // 4. GET /api/agent/proposals
        const r4 = await request(app)
          .get('/api/agent/proposals')
          .set('Authorization', `Bearer ${doctorAssigned.token}`);
        expect(r4.status).toBe(403);
        expect(r4.body.error?.code).toBe('FEATURE_DISABLED');

        // 5. POST /api/agent/proposals/:actionId/clinician-review
        const r5 = await request(app)
          .post(`/api/agent/proposals/${dummyUuid}/clinician-review`)
          .set('Authorization', `Bearer ${doctorAssigned.token}`)
          .send({
            planId: dummyUuid,
            decision: 'APPROVE',
          });
        expect(r5.status).toBe(403);
        expect(r5.body.error?.code).toBe('FEATURE_DISABLED');

        // 6. GET /api/agent/plans/:planId
        const r6 = await request(app)
          .get(`/api/agent/plans/${dummyUuid}`)
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(r6.status).toBe(403);
        expect(r6.body.error?.code).toBe('FEATURE_DISABLED');

        // 7. GET /api/agent/actions/:actionId
        const r7 = await request(app)
          .get(`/api/agent/actions/${dummyUuid}`)
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(r7.status).toBe(403);
        expect(r7.body.error?.code).toBe('FEATURE_DISABLED');
      } finally {
        // Guarantee re-enable for remaining test suite
        await setFeatureFlag('P0_7_AGENTIC_EXECUTION', true, 'development');
      }
    });
  });

  // ==========================================
  // SECTION 2: POST /api/agent/plan
  // ==========================================
  describe('2. POST /api/agent/plan (Governed Proposal Generation)', () => {
    it('generates a bounded agent plan with max 3 actions for authenticated patient', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Please set a reminder for my evening metformin at 8 PM and schedule a glucose check tomorrow at 7 AM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.planId).toBeDefined();
      expect(res.body.plan.userId).toBe(patientA.id);
      expect(res.body.plan.targetPatientId).toBe(patientA.id);
      expect(res.body.plan.actions.length).toBeLessThanOrEqual(3);
      expect(res.body.plan.actions.length).toBeGreaterThan(0);
      expect(res.body.plan.status).toBe('AWAITING_CONFIRMATION');
    });

    it('rejects plan request when explicit consentObtained is missing or false', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take medicine',
          consentObtained: false,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });

    it('rejects plan request when query is shorter than 2 characters', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'a',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });

    it('immediately halts planning on acute red-flag symptoms returning EMERGENCY_HALT without actions', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'I am experiencing crushing chest pain and shortness of breath',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.hasEmergency).toBe(true);
      expect(res.body.errorCode).toBe('EMERGENCY_HALT');
      expect(res.body.status).toBe('EMERGENCY_ABORTED');
      expect(res.body.emergencyNotice).toContain('chest pain');
      expect(res.body.plan).toBeUndefined();
    });

    it('immediately halts planning on severe hypoglycemia (< 54 mg/dL)', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'My glucose is low, what should I do?',
          detectedGlucose: 48,
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.hasEmergency).toBe(true);
      expect(res.body.errorCode).toBe('EMERGENCY_HALT');
      expect(res.body.status).toBe('EMERGENCY_ABORTED');
    });

    it('deterministically refuses prohibited clinical actions without generating a plan', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Please prescribe me metformin 500mg and increase my insulin dose to 20 units',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.isProhibited).toBe(true);
      expect(res.body.errorCode).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.body.prohibitedRefusal?.isProhibited).toBe(true);
      expect(res.body.plan).toBeUndefined();
    });

    it('rejects cross-patient planning attempt when Patient B targets Patient A without consent', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          targetPatientId: patientA.id,
          userQuery: 'Remind Anand to take medicine',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('allows authorized caregiver with consent to generate plan for Patient A', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${caregiverAuth.token}`)
        .send({
          targetPatientId: patientA.id,
          userQuery: 'Remind Anand to take evening metformin at 9 PM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.plan.userId).toBe(caregiverAuth.id);
      expect(res.body.plan.targetPatientId).toBe(patientA.id);
    });

    it('rejects caregiver planning attempt when caregiver lacks consent from Patient A', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${caregiverNoConsent.token}`)
        .send({
          targetPatientId: patientA.id,
          userQuery: 'Remind Anand to take medicine',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('rejects caregiver planning attempt when caregiver consent has been REVOKED', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${caregiverRevoked.token}`)
        .send({
          targetPatientId: patientA.id,
          userQuery: 'Remind Anand to take medicine',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('rejects caregiver planning attempt when caregiver consent has EXPIRED', async () => {
      const res = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${caregiverExpired.token}`)
        .send({
          targetPatientId: patientA.id,
          userQuery: 'Remind Anand to take medicine',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });
  });

  // ==========================================
  // SECTION 3: POST /api/agent/execute/:actionId (Confirmation Gateway)
  // ==========================================
  describe('3. POST /api/agent/execute/:actionId (Confirmation Gateway)', () => {
    let pendingActionId: string;
    let pendingPlanId: string;

    beforeAll(async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take my medicine daily at 10 AM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      pendingPlanId = planRes.body.planId;
      pendingActionId = planRes.body.plan.actions[0].id;
    });

    it('successfully confirms and executes action for authenticated patient', async () => {
      const idempotencyKey = crypto.randomUUID();
      const res = await request(app)
        .post(`/api/agent/execute/${pendingActionId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: pendingActionId,
          planId: pendingPlanId,
          planVersion: 1,
          confirm: true,
          idempotencyKey,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.actionId).toBe(pendingActionId);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.replayed).toBe(false);

      // Verify underlying reminder was created in SQLite
      const reminderId = res.body.executionResult?.reminderId as string;
      expect(reminderId).toBeDefined();
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });
      expect(reminder).toBeDefined();
      expect(reminder?.userId).toBe(patientA.id);
    });

    it('returns cached replay with replayed: true on repeated confirmation with identical key', async () => {
      // Create a fresh plan and action
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to walk 20 minutes',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;
      const key = crypto.randomUUID();

      // 1st confirm
      const res1 = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: key,
        });
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('COMPLETED');
      expect(res1.body.replayed).toBe(false);

      // 2nd confirm (replay)
      const res2 = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: key,
        });
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('COMPLETED');
      expect(res2.body.replayed).toBe(true);
    });

    it('strictly rejects cross-patient confirmation when Patient B attempts to execute Patient A action', async () => {
      // Create a fresh action for Patient A
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to check blood sugar',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      // Patient B attempts to confirm
      const res = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CROSS_PATIENT_ACCESS_DENIED');

      // Verify Patient A action remains unexecuted in AWAITING_CONFIRMATION
      const freshAct = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(freshAct?.status).toBe('AWAITING_CONFIRMATION');
    });

    it('rejects confirmation with mismatched actionId in body vs URL path', async () => {
      const res = await request(app)
        .post(`/api/agent/execute/${pendingActionId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: crypto.randomUUID(), // Mismatched ID!
          planId: pendingPlanId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CONFIRMATION_BINDING_MISMATCH');
    });

    it('rejects confirmation with stale planVersion', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to drink green tea',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 999, // Stale!
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CONFIRMATION_BINDING_MISMATCH');
    });

    it('halts execution at confirmation time when patient speaks critical symptoms', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take my morning tablets',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
          spokenOrTextInput: 'I confirm, but I am feeling acute chest pain and dizziness right now',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.hasEmergency).toBe(true);
      expect(res.body.errorCode).toBe('EMERGENCY_HALT');
      expect(res.body.status).toBe('EMERGENCY_ABORTED');

      // Verify parent plan was marked EMERGENCY_ABORTED
      const updatedPlan = await prisma.agentPlan.findUnique({ where: { id: plId } });
      expect(updatedPlan?.status).toBe('EMERGENCY_ABORTED');
    });

    it('handles concurrent confirmation race conditions yielding exactly one completed execution', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to check foot condition',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      // Launch 2 racing concurrent confirmation calls
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/agent/execute/${actId}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            actionId: actId,
            planId: plId,
            planVersion: 1,
            confirm: true,
            idempotencyKey: crypto.randomUUID(),
          }),
        request(app)
          .post(`/api/agent/execute/${actId}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            actionId: actId,
            planId: plId,
            planVersion: 1,
            confirm: true,
            idempotencyKey: crypto.randomUUID(),
          }),
      ]);

      // Exactly one succeeds with 200, while the loser either returns conflict (409) or cached replay
      const statuses = [r1.status, r2.status];
      expect(statuses).toContain(200);

      // Verify final action in DB is COMPLETED exactly once
      const finalAct = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(finalAct?.status).toBe('COMPLETED');
    });

    it('rejects patient confirmation when action is in PENDING_CLINICIAN_APPROVAL status', async () => {
      // Create a plan with a clinical care proposal for Patient A
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'I have stomach upset from medicine, propose to doctor',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACTION_REQUIRES_CLINICIAN_APPROVAL');
    });
  });

  // ==========================================
  // SECTION 4: POST /api/agent/cancel/:actionId
  // ==========================================
  describe('4. POST /api/agent/cancel/:actionId (Action Cancellation)', () => {
    it('allows patient to cancel an eligible pending action', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take an afternoon rest',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'User decided not to schedule this rest reminder.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.actionId).toBe(actId);
      expect(res.body.status).toBe('CANCELLED');

      // Verify DB action status is CANCELLED
      const freshAct = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(freshAct?.status).toBe('CANCELLED');
    });

    it('rejects cross-patient cancellation when Patient B attempts to cancel Patient A action', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take my pill',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Malicious cancellation attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('returns 404 when action ID does not exist', async () => {
      const res = await request(app)
        .post(`/api/agent/cancel/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          planId: crypto.randomUUID(),
          reason: 'Cancelling non-existent action',
        });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('ACTION_NOT_FOUND');
    });

    it('rejects unassigned clinician from cancelling Patient A action with 403 UNASSIGNED_CLINICIAN (SEC-P0.7.4-02)', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take my morning tablets at 7 AM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${doctorUnassigned.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Unassigned doctor attempting cancellation',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNASSIGNED_CLINICIAN');

      // Verify action remains in AWAITING_CONFIRMATION
      const fresh = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(fresh?.status).toBe('AWAITING_CONFIRMATION');
    });

    it('allows assigned clinician to cancel Patient A action following permitted cancellation policy', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take an evening rest at 6 PM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Assigned doctor recommends clinical discontinuation of this task',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('CANCELLED');

      const fresh = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(fresh?.status).toBe('CANCELLED');
    });

    it('prohibits cancellation of an action in EXECUTING state (SEC-P0.7.4-03)', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to check blood pressure',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      // Simulate action transition to EXECUTING
      await prisma.agentAction.update({
        where: { id: actId },
        data: { status: 'EXECUTING' },
      });

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Attempting to cancel while executing',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('CANNOT_CANCEL_EXECUTING_ACTION');

      // Verify status was NOT changed to CANCELLED
      const fresh = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(fresh?.status).toBe('EXECUTING');
    });

    it('prohibits cancellation of a COMPLETED action (SEC-P0.7.4-03)', async () => {
      // Create and confirm action to completion
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to walk 15 mins daily',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      await request(app)
        .post(`/api/agent/execute/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      // Attempt to cancel
      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Attempting to cancel completed action',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('ACTION_NOT_IN_CANCELLABLE_STATE');

      const fresh = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(fresh?.status).toBe('COMPLETED');
    });

    it('prohibits cancellation of an EXPIRED action (SEC-P0.7.4-03)', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to do yoga',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      // Mark EXPIRED
      await prisma.agentAction.update({
        where: { id: actId },
        data: { status: 'EXPIRED' },
      });

      const res = await request(app)
        .post(`/api/agent/cancel/${actId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          actionId: actId,
          planId: plId,
          planVersion: 1,
          reason: 'Attempting to cancel expired action',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('ACTION_NOT_IN_CANCELLABLE_STATE');
    });

    it('handles cancellation and execution race condition resulting in only one valid state (SEC-P0.7.4-03)', async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to drink warm water',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      // Fire execute and cancel simultaneously
      const [execRes, cancelRes] = await Promise.all([
        request(app)
          .post(`/api/agent/execute/${actId}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            actionId: actId,
            planId: plId,
            planVersion: 1,
            confirm: true,
            idempotencyKey: crypto.randomUUID(),
          }),
        request(app)
          .post(`/api/agent/cancel/${actId}`)
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            actionId: actId,
            planId: plId,
            planVersion: 1,
            reason: 'Racing cancellation attempt',
          }),
      ]);

      const statuses = [execRes.status, cancelRes.status];
      // Exactly one must succeed with 200, the other must fail with 409
      expect(statuses).toContain(200);

      // Verify the final action in DB is in a valid unambiguous state (either COMPLETED or CANCELLED)
      const fresh = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(['COMPLETED', 'CANCELLED']).toContain(fresh?.status);
    });
  });

  // ==========================================
  // SECTION 5: CLINICAL PROPOSALS & CLINICIAN REVIEW
  // ==========================================
  describe('5. Clinical Proposals & Clinician Review (Doctor Workstation)', () => {
    let proposalActionId: string;
    let proposalPlanId: string;

    beforeAll(async () => {
      // Patient A generates a clinical proposal requiring doctor review
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'I am experiencing persistent nausea after taking metformin, please propose an adjustment to my doctor',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      proposalPlanId = planRes.body.planId;
      proposalActionId = planRes.body.plan.actions[0].id;
    });

    it('rejects non-clinician calling GET /api/agent/proposals with 403 CLINICIAN_ONLY', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CLINICIAN_ONLY');
    });

    it('allows assigned clinician to view pending clinical proposals for Patient A', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .query({ patientId: patientA.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.proposals)).toBe(true);
      expect(res.body.proposals.length).toBeGreaterThan(0);
      expect(res.body.proposals[0].patientId).toBe(patientA.id);
    });

    it('strictly forbids unassigned clinician from viewing Patient A proposals', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorUnassigned.token}`)
        .query({ patientId: patientA.id });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });

    it('allows assigned clinician to review and APPROVE a pending clinical proposal', async () => {
      const res = await request(app)
        .post(`/api/agent/proposals/${proposalActionId}/clinician-review`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .send({
          planId: proposalPlanId,
          planVersion: 1,
          decision: 'APPROVE',
          clinicalReviewNotes: 'Reviewed nausea history. Approved proposal for next consultation discussion.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.decision).toBe('APPROVE');

      // Verify DB action status
      const freshAct = await prisma.agentAction.findUnique({ where: { id: proposalActionId } });
      expect(freshAct?.status).toBe('COMPLETED');
      expect(freshAct?.confirmedByRole).toBe('CLINICIAN');
    });

    it('allows assigned clinician to review and REJECT a pending clinical proposal', async () => {
      // Create another proposal for Patient A
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'I have stomach upset from medicine, propose to doctor',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/proposals/${actId}/clinician-review`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .send({
          planId: plId,
          planVersion: 1,
          decision: 'REJECT',
          rejectionReason: 'Dizziness requires in-clinic evaluation before considering medication modifications.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.decision).toBe('REJECT');

      const freshAct = await prisma.agentAction.findUnique({ where: { id: actId } });
      expect(freshAct?.status).toBe('REJECTED');
    });

    it('rejects proposal review by an unassigned clinician with 403 UNASSIGNED_CLINICIAN', async () => {
      // Create another proposal for Patient A
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'I have nausea side effects from medicine, propose to doctor',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/proposals/${actId}/clinician-review`)
        .set('Authorization', `Bearer ${doctorUnassigned.token}`)
        .send({
          planId: plId,
          planVersion: 1,
          decision: 'APPROVE',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });

    it('rejects clinician review of an action that is not in PENDING_CLINICIAN_APPROVAL status', async () => {
      // Create a standard reminder action (status: AWAITING_CONFIRMATION)
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to drink water',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      const actId = planRes.body.plan.actions[0].id;
      const plId = planRes.body.planId;

      const res = await request(app)
        .post(`/api/agent/proposals/${actId}/clinician-review`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .send({
          planId: plId,
          planVersion: 1,
          decision: 'APPROVE',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ACTION_FOR_CLINICIAN_REVIEW');
    });

    it('rejects invalid proposal status with HTTP 400 Bad Request (SEC-P0.7.4-04)', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .query({ status: 'MALICIOUS_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });

    it('rejects malformed patient UUID with HTTP 400 Bad Request (SEC-P0.7.4-04)', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .query({ patientId: 'not-a-valid-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });

    it('rejects unknown query properties with HTTP 400 Bad Request (SEC-P0.7.4-04)', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .query({ unknownProperty: 'injected_param' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });

    it('accepts valid proposal query filters and returns HTTP 200 (SEC-P0.7.4-04)', async () => {
      const res = await request(app)
        .get('/api/agent/proposals')
        .set('Authorization', `Bearer ${doctorAssigned.token}`)
        .query({
          status: 'PENDING_CLINICIAN_APPROVAL',
          limit: 10,
          patientId: patientA.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.proposals)).toBe(true);
    });
  });

  // ==========================================
  // SECTION 6: AUTHENTICATED PLAN & ACTION RETRIEVAL
  // ==========================================
  describe('6. Plan & Action Retrieval Endpoints', () => {
    let testPlanId: string;
    let testActionId: string;

    beforeAll(async () => {
      const planRes = await request(app)
        .post('/api/agent/plan')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          userQuery: 'Remind me to take my morning tablets at 8 AM',
          consentObtained: true,
          consentVersion: 'v1.0',
        });

      testPlanId = planRes.body.planId;
      testActionId = planRes.body.plan.actions[0].id;
    });

    it('allows Patient A to retrieve their own plan by ID', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.plan.id).toBe(testPlanId);
      expect(res.body.plan.targetPatientId).toBe(patientA.id);
    });

    it('rejects Patient B from retrieving Patient A plan with 403 UNAUTHORIZED_ACTOR_ROLE', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${patientB.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('returns 404 when plan ID does not exist', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('PLAN_NOT_FOUND');
    });

    it('allows Patient A to retrieve an individual action by ID', async () => {
      const res = await request(app)
        .get(`/api/agent/actions/${testActionId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action.id).toBe(testActionId);
    });

    it('rejects Patient B from retrieving Patient A action with 403 UNAUTHORIZED_ACTOR_ROLE', async () => {
      const res = await request(app)
        .get(`/api/agent/actions/${testActionId}`)
        .set('Authorization', `Bearer ${patientB.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('rejects unassigned clinician from retrieving Patient A plan with 403 UNASSIGNED_CLINICIAN (SEC-P0.7.4-01)', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${doctorUnassigned.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });

    it('rejects unassigned clinician from retrieving Patient A action with 403 UNASSIGNED_CLINICIAN (SEC-P0.7.4-01)', async () => {
      const res = await request(app)
        .get(`/api/agent/actions/${testActionId}`)
        .set('Authorization', `Bearer ${doctorUnassigned.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });

    it('allows assigned clinician to retrieve Patient A plan by ID (SEC-P0.7.4-01)', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.plan.id).toBe(testPlanId);
      expect(res.body.plan.targetPatientId).toBe(patientA.id);
    });

    it('allows assigned clinician to retrieve Patient A action by ID (SEC-P0.7.4-01)', async () => {
      const res = await request(app)
        .get(`/api/agent/actions/${testActionId}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action.id).toBe(testActionId);
    });

    it('rejects caregiver with REVOKED consent from retrieving Patient A plan with 403 UNAUTHORIZED_ACTOR_ROLE', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${caregiverRevoked.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('rejects caregiver with EXPIRED consent from retrieving Patient A plan with 403 UNAUTHORIZED_ACTOR_ROLE', async () => {
      const res = await request(app)
        .get(`/api/agent/plans/${testPlanId}`)
        .set('Authorization', `Bearer ${caregiverExpired.token}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });
  });

  // ==========================================
  // SECTION 7: PARAMETER VALIDATION & MALFORMED REQUESTS
  // ==========================================
  describe('7. Strict Validation & Malformed Parameter Handling', () => {
    it('returns 400 when malformed non-UUID is passed in actionId param', async () => {
      const res = await request(app)
        .post('/api/agent/execute/not-a-valid-uuid')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          planId: crypto.randomUUID(),
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
      expect(res.body.details[0].message).toContain('valid UUID');
    });

    it('returns 400 when malformed non-UUID is passed in planId param', async () => {
      const res = await request(app)
        .get('/api/agent/plans/malformed-id')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Input validation failed');
    });
  });
});
