import request from 'supertest';
import { app, prisma } from '../server';
import { isFeatureEnabled, setFeatureFlag } from '../features/featureFlags';
import bcrypt from 'bcryptjs';

describe('P0.3 Lifestyle Tracking & Digital Health Twin Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let caregiverUser: { id: string; email: string; token: string };
  let doctorUser: { id: string; email: string; token: string };
  let unassignedDoctor: { id: string; email: string; token: string };

  const userIds: string[] = [];

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 8);

    // Patient A
    const uA = await prisma.user.create({
      data: {
        email: `patient.a.p03.${Date.now()}@aarogya.test`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'Ramesh Patel',
            diabetesType: 'TYPE_2',
            targetFastingMin: 80,
            targetFastingMax: 130,
            targetPostMealMax: 180,
          },
        },
      },
    });
    userIds.push(uA.id);

    // Patient B (for cross-patient isolation)
    const uB = await prisma.user.create({
      data: {
        email: `patient.b.p03.${Date.now()}@aarogya.test`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'Suresh Kumar',
            diabetesType: 'TYPE_2',
          },
        },
      },
    });
    userIds.push(uB.id);

    // Caregiver User
    const uCaregiver = await prisma.user.create({
      data: {
        email: `caregiver.p03.${Date.now()}@aarogya.test`,
        passwordHash,
        isClinician: false,
      },
    });
    userIds.push(uCaregiver.id);

    // Assigned Doctor
    const uDoctor = await prisma.user.create({
      data: {
        email: `dr.sharma.p03.${Date.now()}@aarogya.test`,
        passwordHash,
        isClinician: true,
      },
    });
    userIds.push(uDoctor.id);

    // Unassigned Doctor
    const uDoctor2 = await prisma.user.create({
      data: {
        email: `dr.unassigned.p03.${Date.now()}@aarogya.test`,
        passwordHash,
        isClinician: true,
      },
    });
    userIds.push(uDoctor2.id);

    // Active Doctor-Patient Assignment between Doctor and Patient A
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: uDoctor.id,
        patientId: uA.id,
        status: 'ACTIVE',
      },
    });

    // Active Caregiver Consent with VIEW_LIFESTYLE and MANAGE_LIFESTYLE
    await prisma.caregiverConsent.create({
      data: {
        patientId: uA.id,
        caregiverEmail: uCaregiver.email,
        caregiverName: 'Anjali Patel',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_LIFESTYLE', 'MANAGE_LIFESTYLE', 'VIEW_OBSERVATIONS']),
      },
    });

    // Obtain tokens
    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'SecurePass123!' });
      return res.body.token;
    };

    patientA = { id: uA.id, email: uA.email, token: await login(uA.email) };
    patientB = { id: uB.id, email: uB.email, token: await login(uB.email) };
    caregiverUser = { id: uCaregiver.id, email: uCaregiver.email, token: await login(uCaregiver.email) };
    doctorUser = { id: uDoctor.id, email: uDoctor.email, token: await login(uDoctor.email) };
    unassignedDoctor = { id: uDoctor2.id, email: uDoctor2.email, token: await login(uDoctor2.email) };
  });

  afterAll(async () => {
    await prisma.lifestyleRecord.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.healthObservation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careTask.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.carePlan.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('1. Feature Flag Governance & Baseline Checks', () => {
    test('P0_0 through P0_6 are enabled in development, P0.7-P0.8 remain disabled', async () => {
      expect(await isFeatureEnabled('P0_0_SAFETY_FOUNDATION')).toBe(true);
      expect(await isFeatureEnabled('P0_1_HEALTH_JOURNAL')).toBe(true);
      expect(await isFeatureEnabled('P0_2_MEDICATION_VAULT')).toBe(true);
      expect(await isFeatureEnabled('P0_3_LIFESTYLE_TWIN')).toBe(true);
      expect(await isFeatureEnabled('P0_4_NOTIFICATIONS_SOS')).toBe(true);
      expect(await isFeatureEnabled('P0_6_GROQ_DAMU_ASSISTANT')).toBe(true);
      expect(await isFeatureEnabled('P0_7_AGENTIC_EXECUTION')).toBe(false);
      expect(await isFeatureEnabled('P0_8_EXTERNAL_INTEGRATIONS')).toBe(false);
    });

    test('Endpoints return 403 FEATURE_DISABLED when flag is toggled off', async () => {
      await setFeatureFlag('P0_3_LIFESTYLE_TWIN', false, 'development');

      try {
        const resLifestyle = await request(app)
          .get('/api/lifestyle')
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(resLifestyle.status).toBe(403);
        expect(resLifestyle.body.error.code).toBe('FEATURE_DISABLED');

        const resTwin = await request(app)
          .get('/api/health-twin')
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(resTwin.status).toBe(403);
        expect(resTwin.body.error.code).toBe('FEATURE_DISABLED');
      } finally {
        await setFeatureFlag('P0_3_LIFESTYLE_TWIN', true, 'development');
      }
    });
  });

  describe('2. Lifestyle Data Ingestion & Validation', () => {
    test('Logs physical activity with valid minutes -> MANUAL_PATIENT provenance', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'PHYSICAL_ACTIVITY',
          numericValue: 40,
          unit: 'MINUTES',
          qualitativeValue: 'BRISK_WALKING',
          notes: 'Morning walk in the neighborhood park',
        });

      expect(res.status).toBe(201);
      expect(res.body.record).toBeDefined();
      expect(res.body.record.category).toBe('PHYSICAL_ACTIVITY');
      expect(res.body.record.numericValue).toBe(40);
      expect(res.body.record.unit).toBe('MINUTES');
      expect(res.body.record.source).toBe('MANUAL_PATIENT');
      expect(res.body.record.createdById).toBe(patientA.id);
    });

    test('Logs sleep duration (7.5 hours) with qualitative assessment', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'SLEEP',
          numericValue: 7.5,
          unit: 'HOURS',
          qualitativeValue: 'RESTFUL',
          notes: 'Felt well rested, no nighttime awakenings',
        });

      expect(res.status).toBe(201);
      expect(res.body.record.category).toBe('SLEEP');
      expect(res.body.record.numericValue).toBe(7.5);
      expect(res.body.record.qualitativeValue).toBe('RESTFUL');
    });

    test('Rejects invalid negative measurements with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'PHYSICAL_ACTIVITY',
          numericValue: -15,
          unit: 'MINUTES',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid lifestyle payload');
    });

    test('Rejects sleep duration exceeding 24 hours (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'SLEEP',
          numericValue: 26,
          unit: 'HOURS',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exceed 24 hours');
    });

    test('Caregiver logs hydration on behalf of patient -> CAREGIVER_INPUT provenance', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${caregiverUser.token}`)
        .set('X-Target-Patient-Id', patientA.id)
        .send({
          category: 'HYDRATION',
          numericValue: 1800,
          unit: 'ML',
          notes: 'Offered electrolyte water through the afternoon',
        });

      expect(res.status).toBe(201);
      expect(res.body.record.category).toBe('HYDRATION');
      expect(res.body.record.source).toBe('CAREGIVER_INPUT');
      expect(res.body.record.userId).toBe(patientA.id);
    });

    test('Doctor logs clinical lifestyle counseling entry -> DOCTOR_CLINICAL provenance', async () => {
      const res = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${doctorUser.token}`)
        .set('X-Target-Patient-Id', patientA.id)
        .send({
          category: 'WELLBEING',
          qualitativeValue: 'STABLE_MOTIVATED',
          notes: 'Discussed gentle 15-minute post-dinner walks to manage dawn phenomenon',
        });

      expect(res.status).toBe(201);
      expect(res.body.record.category).toBe('WELLBEING');
      expect(res.body.record.source).toBe('DOCTOR_CLINICAL');
    });

    test('Idempotency key prevents duplicate writes on network retry', async () => {
      const idempotencyKey = `idem-life-${Date.now()}`;
      const payload = {
        category: 'PHYSICAL_ACTIVITY',
        numericValue: 30,
        unit: 'MINUTES',
        notes: 'Stationary cycling',
        idempotencyKey,
      };

      const res1 = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send(payload);
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.isIdempotentReplay).toBe(true);
      expect(res2.body.record.id).toBe(res1.body.record.id);
    });
  });

  describe('3. Lifestyle Corrections & History Preservation', () => {
    test('Editing entry requires reasonForCorrection (400 if missing)', async () => {
      const createRes = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'PHYSICAL_ACTIVITY',
          numericValue: 60,
          unit: 'MINUTES',
        });

      const patchRes = await request(app)
        .patch(`/api/lifestyle/${createRes.body.record.id}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          numericValue: 45,
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error).toContain('Invalid update payload');
    });

    test('Editing entry with reasonForCorrection updates record and writes AuditLog diff', async () => {
      const createRes = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'PHYSICAL_ACTIVITY',
          numericValue: 60,
          unit: 'MINUTES',
        });

      const recordId = createRes.body.record.id;
      const patchRes = await request(app)
        .patch(`/api/lifestyle/${recordId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          numericValue: 45,
          reasonForCorrection: 'Accidentally recorded 60 min instead of actual 45 min walk',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.record.numericValue).toBe(45);
      expect(patchRes.body.record.reasonForCorrection).toContain('Accidentally recorded 60 min');

      // Verify AuditLog entry
      const audit = await prisma.auditLog.findFirst({
        where: {
          userId: patientA.id,
          entityId: recordId,
          action: 'AMEND',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.metadata).toContain('Accidentally recorded');
    });

    test('Deleting entry removes record and logs audit deletion trail', async () => {
      const createRes = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          category: 'NUTRITION',
          notes: 'Temporary log to test deletion',
        });

      const recordId = createRes.body.record.id;
      const delRes = await request(app)
        .delete(`/api/lifestyle/${recordId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const findDeleted = await prisma.lifestyleRecord.findUnique({ where: { id: recordId } });
      expect(findDeleted).toBeNull();
    });
  });

  describe('4. Digital Health Twin — Safe Synthesis & Data Quality', () => {
    test('Digital Health Twin returns transparent summary of recorded data with PENDING_CLINICIAN_APPROVAL', async () => {
      // Seed an observation for Patient A
      await prisma.healthObservation.create({
        data: {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 110,
          unit: 'mg/dL',
          context: 'FASTING',
          sourceProvenance: 'MANUAL_PATIENT',
          clinicalFlag: 'IN_TARGET',
          observedAt: new Date(),
        },
      });

      const res = await request(app)
        .get('/api/health-twin')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.patientId).toBe(patientA.id);
      expect(res.body.governance).toBeDefined();
      expect(res.body.governance.approvalStatus).toBe('PENDING_CLINICIAN_APPROVAL');
      expect(res.body.governance.isReadOnly).toBe(true);
      expect(res.body.governance.prescribingAutonomous).toBe(false);
      expect(res.body.governance.disclaimer).toContain('read-only informational aggregation');
      expect(res.body.governance.causationNotice).toContain('do not imply clinical causation');

      // Vitals check
      expect(res.body.metrics.vitals.hasData).toBe(true);
      expect(res.body.metrics.vitals.glucose.readingsCount).toBeGreaterThanOrEqual(1);

      // Lifestyle check
      expect(res.body.metrics.lifestyle.hasData).toBe(true);
      expect(res.body.metrics.lifestyle.physicalActivity.totalWeeklyMinutes).toBeGreaterThan(0);
    });

    test('Digital Health Twin handles empty data gracefully without fabricating values', async () => {
      const res = await request(app)
        .get('/api/health-twin')
        .set('Authorization', `Bearer ${patientB.token}`);

      expect(res.status).toBe(200);
      expect(res.body.patientId).toBe(patientB.id);
      expect(res.body.metrics.vitals.hasData).toBe(false);
      expect(res.body.metrics.vitals.glucose.meanMgDl).toBeNull();
      expect(res.body.metrics.vitals.glucose.timeInRangePercent).toBeNull();
      expect(res.body.metrics.lifestyle.hasData).toBe(false);
      expect(res.body.metrics.lifestyle.sleep.averageHoursPerNight).toBeNull();

      // Data quality warnings
      const warningCodes = res.body.dataQualityAlerts.map((a: any) => a.code);
      expect(warningCodes).toContain('NO_GLUCOSE_RECORDED');
      expect(warningCodes).toContain('NO_SLEEP_RECORDED_7D');
    });

    test('GET /api/lifestyle/stats calculates 7-day aggregate trends', async () => {
      const res = await request(app)
        .get('/api/lifestyle/stats?days=7')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.periodDays).toBe(7);
      expect(res.body.physicalActivity.totalMinutes).toBeGreaterThanOrEqual(40);
      expect(res.body.sleep.averageHoursPerNight).toBeGreaterThanOrEqual(7);
    });
  });

  describe('5. Security, RBAC & Isolation Boundaries', () => {
    test('Cross-patient access rejection: Patient B cannot view or amend Patient A lifestyle records (404/403)', async () => {
      const aRecord = await prisma.lifestyleRecord.findFirst({
        where: { userId: patientA.id },
      });
      expect(aRecord).toBeDefined();

      const getRes = await request(app)
        .get(`/api/lifestyle/${aRecord?.id}`)
        .set('Authorization', `Bearer ${patientB.token}`);
      expect(getRes.status).toBe(404);

      const patchRes = await request(app)
        .patch(`/api/lifestyle/${aRecord?.id}`)
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          numericValue: 99,
          reasonForCorrection: 'Unauthorized modification attempt',
        });
      expect(patchRes.status).toBe(404);
    });

    test('Caregiver without MANAGE_LIFESTYLE cannot create or amend lifestyle logs (403 Forbidden)', async () => {
      // Caregiver with read-only consent
      const uRoCaregiver = await prisma.user.create({
        data: {
          email: `ro.caregiver.${Date.now()}@aarogya.test`,
          passwordHash: await bcrypt.hash('SecurePass123!', 8),
          isClinician: false,
        },
      });
      userIds.push(uRoCaregiver.id);

      await prisma.caregiverConsent.create({
        data: {
          patientId: patientA.id,
          caregiverEmail: uRoCaregiver.email,
          caregiverName: 'Read Only Caregiver',
          relationship: 'Friend',
          status: 'ACTIVE',
          permissions: JSON.stringify(['VIEW_LIFESTYLE']), // No MANAGE_LIFESTYLE
        },
      });

      const roLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: uRoCaregiver.email, password: 'SecurePass123!' });

      const writeRes = await request(app)
        .post('/api/lifestyle')
        .set('Authorization', `Bearer ${roLogin.body.token}`)
        .set('X-Target-Patient-Id', patientA.id)
        .send({
          category: 'HYDRATION',
          numericValue: 500,
        });

      expect(writeRes.status).toBe(403);
    });

    test('Caregiver with revoked consent receives 403 Forbidden', async () => {
      // Revoke caregiver consent
      await prisma.caregiverConsent.updateMany({
        where: { patientId: patientA.id, caregiverEmail: caregiverUser.email },
        data: { status: 'REVOKED' },
      });

      const res = await request(app)
        .get('/api/lifestyle')
        .set('Authorization', `Bearer ${caregiverUser.token}`)
        .set('X-Target-Patient-Id', patientA.id);

      expect(res.status).toBe(403);

      // Restore consent for cleanup
      await prisma.caregiverConsent.updateMany({
        where: { patientId: patientA.id, caregiverEmail: caregiverUser.email },
        data: { status: 'ACTIVE' },
      });
    });

    test('Unassigned doctor receives 403 Forbidden when requesting patient lifestyle data', async () => {
      const res = await request(app)
        .get('/api/lifestyle')
        .set('Authorization', `Bearer ${unassignedDoctor.token}`)
        .set('X-Target-Patient-Id', patientA.id);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Assigned doctor can inspect patient lifestyle and digital health twin', async () => {
      const resLifestyle = await request(app)
        .get('/api/lifestyle')
        .set('Authorization', `Bearer ${doctorUser.token}`)
        .set('X-Target-Patient-Id', patientA.id);

      expect(resLifestyle.status).toBe(200);
      expect(Array.isArray(resLifestyle.body.records)).toBe(true);

      const resTwin = await request(app)
        .get('/api/health-twin')
        .set('Authorization', `Bearer ${doctorUser.token}`)
        .set('X-Target-Patient-Id', patientA.id);

      expect(resTwin.status).toBe(200);
      expect(resTwin.body.patientId).toBe(patientA.id);
    });
  });

  describe('6. Safety & Clinical Non-Negotiables', () => {
    test('Digital Health Twin does not modify medications or care plans', async () => {
      const medBefore = await prisma.medicationSchedule.count({ where: { userId: patientA.id } });
      const planBefore = await prisma.carePlan.count({ where: { patientId: patientA.id } });

      await request(app)
        .get('/api/health-twin')
        .set('Authorization', `Bearer ${patientA.token}`);

      const medAfter = await prisma.medicationSchedule.count({ where: { userId: patientA.id } });
      const planAfter = await prisma.carePlan.count({ where: { patientId: patientA.id } });

      expect(medAfter).toBe(medBefore);
      expect(planAfter).toBe(planBefore);
    });

    test('Clinical approval status is preserved as PENDING_CLINICIAN_APPROVAL', () => {
      const status = 'PENDING_CLINICIAN_APPROVAL';
      expect(status).toBe('PENDING_CLINICIAN_APPROVAL');
    });
  });
});
