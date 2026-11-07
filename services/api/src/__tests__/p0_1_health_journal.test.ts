import request from 'supertest';
import { app, prisma } from '../server';
import { isFeatureEnabled, getAllFeatureFlags } from '../features/featureFlags';
import bcrypt from 'bcryptjs';

describe('P0.1 Unified Health Journal Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let assignedDoctor: { id: string; email: string; token: string };
  let unassignedDoctor: { id: string; email: string; token: string };
  let activeCaregiver: { id: string; email: string; token: string };
  let revokedCaregiver: { id: string; email: string; token: string };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('JournalPass123!', 8);
    const suffix = Date.now();

    async function createUser(role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER', name: string, isClinician = false) {
      const email = `${role.toLowerCase()}.${suffix}.${Math.random().toString(36).substring(2, 7)}@test.local`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName: name,
              diabetesType: role === 'PATIENT' ? 'TYPE_2_DIABETES' : undefined,
            },
          },
        },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email,
        password: 'JournalPass123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
      };
    }

    patientA = await createUser('PATIENT', 'Patient Alice');
    patientB = await createUser('PATIENT', 'Patient Bob');
    assignedDoctor = await createUser('DOCTOR', 'Dr. Anand Joshi', true);
    unassignedDoctor = await createUser('DOCTOR', 'Dr. Sneha Patil', true);
    activeCaregiver = await createUser('CAREGIVER', 'Caregiver Carol');
    revokedCaregiver = await createUser('CAREGIVER', 'Caregiver Dave');

    // Assign doctor to Patient A
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Active caregiver consent for Carol -> Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: activeCaregiver.email,
        caregiverName: 'Caregiver Carol',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_OBSERVATIONS']),
      },
    });

    // Revoked caregiver consent for Dave -> Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: revokedCaregiver.email,
        caregiverName: 'Caregiver Dave',
        relationship: 'Neighbor',
        status: 'REVOKED',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_OBSERVATIONS']),
      },
    });
  });

  afterAll(async () => {
    const userIds = [patientA.id, patientB.id, assignedDoctor.id, unassignedDoctor.id, activeCaregiver.id, revokedCaregiver.id];
    await prisma.healthObservation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('1. Feature Flag Governance & Baseline Checks', () => {
    test('P0_1 through P0_6 are enabled, P0.7-P0.8 remain disabled', async () => {
      expect(await isFeatureEnabled('P0_1_HEALTH_JOURNAL')).toBe(true);
      expect(await isFeatureEnabled('P0_2_MEDICATION_VAULT')).toBe(true);
      expect(await isFeatureEnabled('P0_3_LIFESTYLE_TWIN')).toBe(true);
      expect(await isFeatureEnabled('P0_4_NOTIFICATIONS_SOS')).toBe(true);
      expect(await isFeatureEnabled('P0_6_GROQ_DAMU_ASSISTANT')).toBe(true);
      expect(await isFeatureEnabled('P0_7_AGENTIC_EXECUTION')).toBe(false);
      expect(await isFeatureEnabled('P0_8_EXTERNAL_INTEGRATIONS')).toBe(false);

      const catalog = await getAllFeatureFlags();
      const p01 = catalog.find((f) => f.id === 'P0_1_HEALTH_JOURNAL');
      expect(p01?.rolloutTier).toBe('development');
    });
  });

  describe('2. Multi-Vital Ingestion & Provenance Attribution', () => {
    test('Patient logs BLOOD_GLUCOSE with fasting context -> MANUAL_PATIENT provenance and NORMAL flag', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 105,
          unit: 'mg/dL',
          context: 'FASTING',
          notes: 'Felt well, taken before morning tea',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation).toBeDefined();
      expect(res.body.observation.numericValue).toBe(105);
      expect(res.body.observation.unit).toBe('mg/dL');
      expect(res.body.observation.sourceProvenance).toBe('MANUAL_PATIENT');
      expect(res.body.safetyEvaluation.clinicalFlag).toBe('IN_TARGET');
      expect(res.body.safetyEvaluation.isCritical).toBe(false);
    });

    test('Patient logs Critical Hypoglycemia (<54 mg/dL) -> CRITICAL_LOW flag', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 48,
          unit: 'mg/dL',
          context: 'FASTING',
          notes: 'Mild shakiness',
        });

      expect(res.status).toBe(201);
      expect(res.body.safetyEvaluation.clinicalFlag).toBe('CRITICAL_LOW');
      expect(res.body.safetyEvaluation.isCritical).toBe(true);
    });

    test('Patient logs BLOOD_PRESSURE with systolic & diastolic -> secondaryValue recorded and evaluated', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 124,
          secondaryValue: 78,
          unit: 'mmHg',
          context: 'RESTING',
          notes: 'Seated for 5 minutes before check',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.numericValue).toBe(124);
      expect(res.body.observation.secondaryValue).toBe(78);
      expect(res.body.observation.unit).toBe('mmHg');
      expect(res.body.safetyEvaluation.clinicalFlag).toBe('ELEVATED');
    });

    test('Patient logs Stage 2 Hypertension (150/95) -> STAGE_2_HYPERTENSION flag', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 150,
          secondaryValue: 95,
          unit: 'mmHg',
          context: 'RESTING',
        });

      expect(res.status).toBe(201);
      expect(res.body.safetyEvaluation.clinicalFlag).toBe('STAGE_2_HYPERTENSION');
    });

    test('Patient logs WEIGHT in kg and lbs -> NORMAL flag', async () => {
      const resKg = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'WEIGHT',
          numericValue: 74.2,
          unit: 'kg',
          context: 'MORNING',
        });

      expect(resKg.status).toBe(201);
      expect(resKg.body.observation.numericValue).toBe(74.2);
      expect(resKg.body.observation.unit).toBe('kg');
      expect(resKg.body.safetyEvaluation.clinicalFlag).toBe('NORMAL');

      const resLbs = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'WEIGHT',
          numericValue: 163.5,
          unit: 'lbs',
          context: 'GENERAL',
        });

      expect(resLbs.status).toBe(201);
      expect(resLbs.body.observation.unit).toBe('lbs');
    });

    test('Patient logs HBA1C (6.8%) -> IN_TARGET flag', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'HBA1C',
          numericValue: 6.8,
          unit: '%',
          context: 'LAB_CONFIRMED',
          notes: 'Quarterly venous blood sample',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.numericValue).toBe(6.8);
      expect(res.body.observation.unit).toBe('%');
      expect(res.body.safetyEvaluation.clinicalFlag).toBe('IN_TARGET');
    });

    test('Caregiver logs on behalf of patient -> CAREGIVER_INPUT provenance', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${activeCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 138,
          unit: 'mg/dL',
          context: 'POST_MEAL_2HR',
          notes: 'Logged by Carol after lunch',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.sourceProvenance).toBe('CAREGIVER_INPUT');
      expect(res.body.observation.userId).toBe(patientA.id);
    });

    test('Assigned Doctor logs in-clinic point-of-care vital -> DOCTOR_CLINICAL provenance', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 118,
          secondaryValue: 76,
          unit: 'mmHg',
          context: 'RESTING',
          notes: 'In-clinic automated sphygmomanometer check',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.sourceProvenance).toBe('DOCTOR_CLINICAL');
      expect(res.body.observation.userId).toBe(patientA.id);
    });
  });

  describe('3. Validation, Boundaries & Idempotency', () => {
    test('Rejects negative or 0 primary values with 400 Bad Request', async () => {
      const resZero = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 0,
          unit: 'mg/dL',
        });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: -50,
          unit: 'mg/dL',
        });
      expect(resNeg.status).toBe(400);
    });

    test('Rejects negative secondary values with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 120,
          secondaryValue: -80,
          unit: 'mmHg',
        });
      expect(res.status).toBe(400);
    });

    test('Rejects invalid vital type with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BODY_TEMPERATURE',
          numericValue: 98.6,
          unit: 'degF',
        });
      expect(res.status).toBe(400);
    });

    test('Idempotency key replay returns identical record without inserting duplicate', async () => {
      const key = `idemp-${Date.now()}-test`;
      const res1 = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 112,
          unit: 'mg/dL',
          context: 'FASTING',
          idempotencyKey: key,
        });
      expect(res1.status).toBe(201);
      const firstId = res1.body.observation.id;

      const res2 = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 112,
          unit: 'mg/dL',
          context: 'FASTING',
          idempotencyKey: key,
        });
      expect(res2.status).toBe(200);
      expect(res2.body.observation.id).toBe(firstId);
      expect(res2.body.replayed).toBe(true);

      const count = await prisma.healthObservation.count({
        where: { idempotencyKey: key },
      });
      expect(count).toBe(1);
    });
  });

  describe('4. Retrieval, Filtering & Keyset Pagination', () => {
    test('GET /api/observations filters by type and context', async () => {
      const resGlucose = await request(app)
        .get('/api/observations?type=BLOOD_GLUCOSE')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(resGlucose.status).toBe(200);
      expect(resGlucose.body.observations.length).toBeGreaterThan(0);
      resGlucose.body.observations.forEach((obs: any) => {
        expect(obs.type).toBe('BLOOD_GLUCOSE');
      });

      const resBp = await request(app)
        .get('/api/observations?type=BLOOD_PRESSURE')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(resBp.status).toBe(200);
      expect(resBp.body.observations.length).toBeGreaterThan(0);
      resBp.body.observations.forEach((obs: any) => {
        expect(obs.type).toBe('BLOOD_PRESSURE');
      });

      const resFasting = await request(app)
        .get('/api/observations?type=BLOOD_GLUCOSE&context=FASTING')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(resFasting.status).toBe(200);
      resFasting.body.observations.forEach((obs: any) => {
        expect(obs.context).toBe('FASTING');
      });
    });

    test('GET /api/observations supports keyset pagination (limit and cursor)', async () => {
      const page1 = await request(app)
        .get('/api/observations?limit=2')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(page1.status).toBe(200);
      expect(page1.body.observations.length).toBe(2);
      expect(page1.body.hasMore).toBe(true);
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request(app)
        .get(`/api/observations?limit=2&cursor=${page1.body.nextCursor}`)
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(page2.status).toBe(200);
      expect(page2.body.observations.length).toBeGreaterThan(0);

      const page1Ids = page1.body.observations.map((o: any) => o.id);
      const page2Ids = page2.body.observations.map((o: any) => o.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });

    test('GET /api/observations/:id retrieves a single observation by ID', async () => {
      const listRes = await request(app)
        .get('/api/observations?limit=1')
        .set('Authorization', `Bearer ${patientA.token}`);
      const obsId = listRes.body.observations[0].id;

      const singleRes = await request(app)
        .get(`/api/observations/${obsId}`)
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(singleRes.status).toBe(200);
      expect(singleRes.body.observation.id).toBe(obsId);
    });
  });

  describe('5. Ambulatory Vital Statistics (GET /api/observations/stats)', () => {
    test('Calculates Glucose ambulatory profile (Mean, SD, CV%, Time-in-Range)', async () => {
      const statsRes = await request(app)
        .get('/api/observations/stats?type=BLOOD_GLUCOSE&days=30')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats).toBeDefined();
      expect(statsRes.body.stats.type).toBe('BLOOD_GLUCOSE');
      expect(statsRes.body.stats.count).toBeGreaterThan(0);
      expect(typeof statsRes.body.stats.mean).toBe('number');
      expect(typeof statsRes.body.stats.standardDeviation).toBe('number');
      expect(typeof statsRes.body.stats.coefficientOfVariation).toBe('number');
      expect(statsRes.body.stats.timeInRange).toBeDefined();
      expect(statsRes.body.stats.timeInRange.target).toBeDefined();
      expect(statsRes.body.stats.timeInRange.target.percentage).toBeDefined();
      expect(statsRes.body.stats.timeInRange.veryLow).toBeDefined();
      expect(statsRes.body.stats.timeInRange.veryHigh).toBeDefined();
    });

    test('Calculates Blood Pressure profile (Mean Systolic/Diastolic, Staging distribution)', async () => {
      const statsRes = await request(app)
        .get('/api/observations/stats?type=BLOOD_PRESSURE&days=30')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats).toBeDefined();
      expect(statsRes.body.stats.type).toBe('BLOOD_PRESSURE');
      expect(statsRes.body.stats.meanSystolic).toBeGreaterThan(0);
      expect(statsRes.body.stats.meanDiastolic).toBeGreaterThan(0);
      expect(statsRes.body.stats.distribution).toBeDefined();
      expect(statsRes.body.stats.distribution.normal).toBeDefined();
      expect(statsRes.body.stats.distribution.elevated).toBeDefined();
      expect(statsRes.body.stats.distribution.stage1).toBeDefined();
      expect(statsRes.body.stats.distribution.stage2).toBeDefined();
      expect(statsRes.body.stats.distribution.hypertensiveCrisis).toBeDefined();
    });
  });

  describe('6. Audited Clinical Amendments (PATCH /api/observations/:id)', () => {
    test('Rejects amendment without reasonForCorrection with 400 Bad Request', async () => {
      const listRes = await request(app)
        .get('/api/observations?limit=1')
        .set('Authorization', `Bearer ${patientA.token}`);
      const obsId = listRes.body.observations[0].id;

      const patchRes = await request(app)
        .patch(`/api/observations/${obsId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          numericValue: 120,
        });
      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error).toMatch(/reasonForCorrection/i);
    });

    test('Allows clinical amendment with reason, recalculates flag, and creates AuditLog', async () => {
      // Create observation to amend: 195 mg/dL (HIGH)
      const createRes = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 195,
          unit: 'mg/dL',
          context: 'FASTING',
        });
      const obsId = createRes.body.observation.id;
      expect(createRes.body.safetyEvaluation.clinicalFlag).toBe('HIGH');

      // Patient amends: was actually 115 mg/dL (NORMAL)
      const patchRes = await request(app)
        .patch(`/api/observations/${obsId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          numericValue: 115,
          reasonForCorrection: 'Typo during manual keypad entry',
          notes: 'Corrected from 195 to 115',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.observation.numericValue).toBe(115);
      expect(patchRes.body.safetyEvaluation.clinicalFlag).toBe('IN_TARGET');

      // Verify AuditLog entry was recorded
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: obsId,
          action: 'OBSERVATION_AMENDED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.metadata).toMatch(/Typo during manual keypad entry/);
    });
  });

  describe('7. Role-Based Permissions & Isolation Security', () => {
    test('Cross-patient isolation: Patient B cannot view or amend Patient A observations (403)', async () => {
      const listRes = await request(app)
        .get('/api/observations?limit=1')
        .set('Authorization', `Bearer ${patientA.token}`);
      const obsId = listRes.body.observations[0].id;

      const readRes = await request(app)
        .get(`/api/observations/${obsId}`)
        .set('Authorization', `Bearer ${patientB.token}`);
      expect(readRes.status).toBe(404);

      const amendRes = await request(app)
        .patch(`/api/observations/${obsId}`)
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          numericValue: 100,
          reasonForCorrection: 'Unauthorized modification attempt',
        });
      expect(amendRes.status).toBe(404);

      const headerRes = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${patientB.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(headerRes.status).toBe(403);
    });

    test('Caregiver with revoked consent receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${revokedCaregiver.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(403);

      const postRes = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${revokedCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 120,
          unit: 'mg/dL',
        });
      expect(postRes.status).toBe(403);
    });

    test('Unassigned doctor receives 403 Forbidden attempting to access Patient A journal', async () => {
      const res = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${unassignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(403);

      const postRes = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${unassignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 120,
          secondaryValue: 80,
          unit: 'mmHg',
        });
      expect(postRes.status).toBe(403);
    });

    test('Assigned doctor has access to Patient A observations and stats', async () => {
      const res = await request(app)
        .get('/api/observations?type=BLOOD_GLUCOSE')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.observations)).toBe(true);

      const statsRes = await request(app)
        .get('/api/observations/stats?type=BLOOD_GLUCOSE')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats).toBeDefined();
    });
  });
});
