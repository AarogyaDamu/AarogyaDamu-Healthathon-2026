import request from 'supertest';
import { app, prisma } from '../server';
import { evaluateClinicalSafety } from '../safety/clinicalSafetyEvaluator';
import bcrypt from 'bcryptjs';

describe('P0.0.1 Clinical Safety Validation & Boundary Suite', () => {
  let patientAId: string;
  let patientAToken: string;
  let patientBId: string;
  let patientBToken: string;
  let caregiverId: string;
  let caregiverToken: string;
  let doctorId: string;
  let doctorToken: string;
  let caregiverConsentId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('TestPass123!', 8);
    const suffix = Date.now();

    // Patient A (with individualized targets)
    const patientA = await prisma.user.create({
      data: {
        email: `p001.patient.a.${suffix}@test.local`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'Patient A (Custom Targets)',
            diabetesType: 'TYPE_2_DIABETES',
            targetFastingMin: 90,
            targetFastingMax: 140,
            targetPostMealMax: 190,
          },
        },
      },
    });
    patientAId = patientA.id;

    // Patient B
    const patientB = await prisma.user.create({
      data: {
        email: `p001.patient.b.${suffix}@test.local`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'Patient B (Standard Targets)',
            diabetesType: 'TYPE_1_DIABETES',
          },
        },
      },
    });
    patientBId = patientB.id;

    // Caregiver
    const caregiver = await prisma.user.create({
      data: {
        email: `p001.caregiver.${suffix}@test.local`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'Authorized Caregiver',
          },
        },
      },
    });
    caregiverId = caregiver.id;

    // Doctor
    const doctor = await prisma.user.create({
      data: {
        email: `p001.doctor.${suffix}@test.local`,
        passwordHash,
        isClinician: true,
        profile: {
          create: {
            fullName: 'Dr. Clinician Validator',
          },
        },
      },
    });
    doctorId = doctor.id;

    // Active Caregiver Consent
    const consent = await prisma.caregiverConsent.create({
      data: {
        patientId: patientAId,
        caregiverEmail: caregiver.email,
        caregiverName: 'Authorized Caregiver',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_OBSERVATIONS']),
      },
    });
    caregiverConsentId = consent.id;

    // Logins
    const resPA = await request(app).post('/api/auth/login').send({ email: patientA.email, password: 'TestPass123!' });
    patientAToken = resPA.body.token;

    const resPB = await request(app).post('/api/auth/login').send({ email: patientB.email, password: 'TestPass123!' });
    patientBToken = resPB.body.token;

    const resCG = await request(app).post('/api/auth/login').send({ email: caregiver.email, password: 'TestPass123!' });
    caregiverToken = resCG.body.token;

    const resDoc = await request(app).post('/api/auth/login').send({ email: doctor.email, password: 'TestPass123!' });
    doctorToken = resDoc.body.token;
  });

  afterAll(async () => {
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: [patientAId, patientBId] } } });
    await prisma.healthObservation.deleteMany({ where: { userId: { in: [patientAId, patientBId] } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: [patientAId, patientBId, caregiverId, doctorId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [patientAId, patientBId, caregiverId, doctorId] } } });
    await prisma.$disconnect();
  });

  describe('TASK 2 & 4: Glucose Exact Boundary Testing', () => {
    test('Glucose 53 mg/dL: Level 2 Hypoglycemia (<54 mg/dL)', () => {
      // Conscious, self-treatable (No emergency escalation)
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 53, context: 'FASTING' });
      expect(res.clinicalFlag).toBe('CRITICAL_LOW');
      expect(res.isCritical).toBe(true);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_2');

      // Unconscious or requiring assistance (Level 3 Emergency)
      const resL3 = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 53,
        context: 'FASTING',
        clinicalContext: { requiresAssistance: true },
      });
      expect(resL3.clinicalFlag).toBe('CRITICAL_LOW');
      expect(resL3.isCritical).toBe(true);
      expect(resL3.requiresEmergencyEscalation).toBe(true);
      expect(resL3.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_3');
    });

    test('Glucose 54 mg/dL: Level 1 Hypoglycemia lower boundary (54-69 mg/dL)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 54, context: 'FASTING' });
      expect(res.clinicalFlag).toBe('LOW');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_1');
    });

    test('Glucose 69 mg/dL: Level 1 Hypoglycemia upper boundary (54-69 mg/dL)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 69, context: 'FASTING' });
      expect(res.clinicalFlag).toBe('LOW');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_1');
    });

    test('Glucose 70 mg/dL: Normal lower physiological threshold (not alert low)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 70, context: 'FASTING' });
      expect(res.clinicalFlag).toBe('IN_TARGET');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('GLUCOSE_LOW_NORMAL');
    });

    test('Glucose 179 mg/dL: Post-meal within target (<= 180 mg/dL)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 179, context: 'POST_MEAL_2HR' });
      expect(res.clinicalFlag).toBe('IN_TARGET');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
    });

    test('Glucose 180 mg/dL: Exact post-meal target ceiling', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 180, context: 'POST_MEAL_2HR' });
      expect(res.clinicalFlag).toBe('IN_TARGET');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
    });

    test('Glucose 181 mg/dL: Exceeds standard post-meal target (> 180 mg/dL)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 181, context: 'POST_MEAL_2HR' });
      expect(res.clinicalFlag).toBe('HIGH');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('GLUCOSE_ELEVATED_POST_MEAL');
    });

    test('Glucose 250 mg/dL: Upper alert ceiling, not universal emergency', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 250, context: 'GENERAL' });
      expect(res.clinicalFlag).toBe('HIGH');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
    });

    test('Glucose 251 mg/dL: Marked hyperglycemia alert without emergency unless DKA symptoms', () => {
      // Asymptomatic
      const res = evaluateClinicalSafety({ type: 'BLOOD_GLUCOSE', numericValue: 251, context: 'RANDOM' });
      expect(res.clinicalFlag).toBe('CRITICAL_HIGH');
      expect(res.isCritical).toBe(true);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('HYPERGLYCEMIA_ALERT');

      // With DKA symptoms (vomiting, fruity breath, confusion)
      const resDka = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 251,
        context: 'RANDOM',
        clinicalContext: { hasSevereSymptoms: true },
      });
      expect(resDka.clinicalFlag).toBe('CRITICAL_HIGH');
      expect(resDka.isCritical).toBe(true);
      expect(resDka.requiresEmergencyEscalation).toBe(true);
      expect(resDka.clinicalCategory).toBe('HYPERGLYCEMIC_EMERGENCY_DKA_HHS');
    });
  });

  describe('TASK 2 & 4: Blood Pressure Exact Boundary Testing', () => {
    test('BP 119/79: Normal blood pressure (<120 and <80)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 119, secondaryValue: 79 });
      expect(res.clinicalFlag).toBe('NORMAL');
      expect(res.isCritical).toBe(false);
      expect(res.requiresEmergencyEscalation).toBe(false);
      expect(res.clinicalCategory).toBe('NORMAL_BLOOD_PRESSURE');
    });

    test('BP 120/79: Elevated blood pressure (120-129 and <80)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 120, secondaryValue: 79 });
      expect(res.clinicalFlag).toBe('ELEVATED');
      expect(res.isCritical).toBe(false);
      expect(res.clinicalCategory).toBe('ELEVATED_BLOOD_PRESSURE');
    });

    test('BP 129/79: Upper limit of Elevated blood pressure', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 129, secondaryValue: 79 });
      expect(res.clinicalFlag).toBe('ELEVATED');
      expect(res.isCritical).toBe(false);
    });

    test('BP 130/80: Lower limit of Stage 1 Hypertension (130-139 or 80-89)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 130, secondaryValue: 80 });
      expect(res.clinicalFlag).toBe('STAGE_1_HYPERTENSION');
      expect(res.isCritical).toBe(false);
    });

    test('BP 139/89: Upper limit of Stage 1 Hypertension', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 139, secondaryValue: 89 });
      expect(res.clinicalFlag).toBe('STAGE_1_HYPERTENSION');
      expect(res.isCritical).toBe(false);
    });

    test('BP 140/90: Lower limit of Stage 2 Hypertension (>=140 or >=90)', () => {
      const res = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 140, secondaryValue: 90 });
      expect(res.clinicalFlag).toBe('STAGE_2_HYPERTENSION');
      expect(res.isCritical).toBe(false);
    });

    test('Systolic and Diastolic evaluated independently for crisis threshold', () => {
      // Isolated Systolic Severe (180/75)
      const resSys = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 180, secondaryValue: 75 });
      expect(resSys.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(resSys.isCritical).toBe(true);

      // Isolated Diastolic Severe (120/120)
      const resDia = evaluateClinicalSafety({ type: 'BLOOD_PRESSURE', numericValue: 120, secondaryValue: 120 });
      expect(resDia.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(resDia.isCritical).toBe(true);
    });

    test('Severe BP with and without concerning symptoms (Emergency vs Urgency)', () => {
      // Asymptomatic Severe BP (Hypertensive Urgency) -> Rest 5 min and repeat
      const resAsymp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 195,
        secondaryValue: 115,
        clinicalContext: { hasSevereSymptoms: false },
      });
      expect(resAsymp.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(resAsymp.isCritical).toBe(true);
      expect(resAsymp.requiresEmergencyEscalation).toBe(false);
      expect(resAsymp.clinicalCategory).toBe('SEVERE_HYPERTENSION_ASYMPTOMATIC');
      expect(resAsymp.actionableGuidance).toMatch(/Rest quietly.*5 minutes.*repeat/i);

      // Symptomatic Severe BP (Hypertensive Emergency) -> Immediate emergency dispatch
      const resSymp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 195,
        secondaryValue: 115,
        clinicalContext: { hasSevereSymptoms: true, symptoms: ['severe chest pain', 'dyspnea'] },
      });
      expect(resSymp.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(resSymp.isCritical).toBe(true);
      expect(resSymp.requiresEmergencyEscalation).toBe(true);
      expect(resSymp.clinicalCategory).toBe('HYPERTENSIVE_EMERGENCY');
    });

    test('Repeat measurement after rest confirms or resolves severe reading', () => {
      const resRepeat = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 142,
        secondaryValue: 88,
        clinicalContext: { isRepeatMeasurement: true },
      });
      expect(resRepeat.clinicalFlag).toBe('STAGE_2_HYPERTENSION');
      expect(resRepeat.isCritical).toBe(false);
      expect(resRepeat.requiresEmergencyEscalation).toBe(false);
    });
  });

  describe('TASK 2 & 4: HbA1c Clinical Goals & Individualized Targets', () => {
    test('HbA1c across clinical categories: Normal, Prediabetes, In-Target, High', () => {
      const normal = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 5.4 });
      expect(normal.clinicalFlag).toBe('NORMAL');
      expect(normal.isCritical).toBe(false);

      const prediabetes = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 6.0 });
      expect(prediabetes.clinicalFlag).toBe('ELEVATED');
      expect(prediabetes.clinicalCategory).toBe('HBA1C_PREDIABETES');

      const inTarget = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 6.8 });
      expect(inTarget.clinicalFlag).toBe('IN_TARGET');

      const high = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 7.5 });
      expect(high.clinicalFlag).toBe('HIGH');
      expect(high.isCritical).toBe(false);
      expect(high.requiresEmergencyEscalation).toBe(false);

      const criticalHigh = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 8.9 });
      expect(criticalHigh.clinicalFlag).toBe('CRITICAL_HIGH');
      expect(criticalHigh.isCritical).toBe(true);
      expect(criticalHigh.requiresEmergencyEscalation).toBe(false); // Chronic marker, never 911
    });

    test('HbA1c individualized target for elderly/comorbid patient (<8.0%)', () => {
      // 7.6% is above default 7.0%, but IN_TARGET under individualized 8.0% goal
      const res = evaluateClinicalSafety({
        type: 'HBA1C',
        numericValue: 7.6,
        individualizedTargets: { targetHbA1cMax: 8.0 },
      });
      expect(res.clinicalFlag).toBe('IN_TARGET');
      expect(res.individualizedTargetApplied).toBe(true);
    });
  });

  describe('TASK 4: API Error Handling, Boundary Validation & Security Integration', () => {
    test('Rejects invalid negative or zero measurements with 400 Bad Request', async () => {
      const resNegative = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: -15,
          unit: 'mg/dL',
          context: 'FASTING',
        });
      expect(resNegative.status).toBe(400);

      const resZero = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 0,
          unit: 'mg/dL',
          context: 'FASTING',
        });
      expect(resZero.status).toBe(400);
    });

    test('Patient A individualized profile targets applied during observation recording', async () => {
      // Patient A has targetFastingMax = 140 mg/dL. Reading 135 mg/dL is IN_TARGET for Patient A
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 135,
          unit: 'mg/dL',
          context: 'FASTING',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.clinicalFlag).toBe('IN_TARGET');
      expect(res.body.safetyEvaluation.individualizedTargetApplied).toBe(true);
    });

    test('Duplicate idempotency key safely returns existing record without duplication', async () => {
      const key = `p001-idem-${Date.now()}`;

      const resFirst = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 105,
          unit: 'mg/dL',
          context: 'FASTING',
          idempotencyKey: key,
        });
      expect(resFirst.status).toBe(201);

      const resReplay = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 105,
          unit: 'mg/dL',
          context: 'FASTING',
          idempotencyKey: key,
        });
      expect(resReplay.status).toBe(200);
      expect(resReplay.body.isIdempotentReplay).toBe(true);
      expect(resReplay.body.observation.id).toBe(resFirst.body.observation.id);
    });

    test('Cross-patient access rejection: Patient B cannot view Patient A observations', async () => {
      const res = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${patientBToken}`)
        .set('X-Target-Patient-Id', patientAId);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|Access denied/i);
    });

    test('Caregiver permission revocation immediately cuts off observation access', async () => {
      // 1. Authorized Caregiver can read Patient A observations
      const resAllowed = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${caregiverToken}`)
        .set('X-Target-Patient-Id', patientAId);
      expect(resAllowed.status).toBe(200);

      // 2. Revoke consent
      await prisma.caregiverConsent.update({
        where: { id: caregiverConsentId },
        data: { status: 'REVOKED' },
      });

      // 3. Subsequent read is rejected immediately
      const resBlocked = await request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${caregiverToken}`)
        .set('X-Target-Patient-Id', patientAId);
      expect(resBlocked.status).toBe(403);
      expect(resBlocked.body.error).toMatch(/Forbidden|Access denied/i);
    });
  });
});

