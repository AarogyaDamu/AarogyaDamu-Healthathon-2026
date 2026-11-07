import request from 'supertest';
import { app, prisma } from '../server';
import { evaluateClinicalSafety } from '../safety/clinicalSafetyEvaluator';
import { sanitizePhi } from '../audit/clinicalAuditLogger';
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags } from '../features/featureFlags';
import { classifyAgentIntent } from '../ai/safety/riskClassifier';
import { submitAgentProposal, reviewAgentProposal } from '../ai/safety/approvalManager';
import { verifyAgentPermission } from '../ai/safety/permissionGuard';
import bcrypt from 'bcryptjs';

describe('P0.0 Safety & Data Foundation', () => {
  let patientToken: string;
  let doctorToken: string;
  let testPatientId: string;
  let testDoctorId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('TestPass123!', 8);
    const uniqueSuffix = Date.now();

    // Create test patient
    const patient = await prisma.user.create({
      data: {
        email: `p0.patient.${uniqueSuffix}@test.local`,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName: 'P0 Test Patient',
            diabetesType: 'TYPE_2_DIABETES',
          },
        },
      },
    });
    testPatientId = patient.id;

    // Create test doctor
    const doctor = await prisma.user.create({
      data: {
        email: `p0.doctor.${uniqueSuffix}@test.local`,
        passwordHash,
        isClinician: true,
        profile: {
          create: {
            fullName: 'Dr. P0 Tester',
          },
        },
      },
    });
    testDoctorId = doctor.id;

    // Login patient
    const pLogin = await request(app).post('/api/auth/login').send({
      email: patient.email,
      password: 'TestPass123!',
    });
    patientToken = pLogin.body.token;

    // Login doctor
    const dLogin = await request(app).post('/api/auth/login').send({
      email: doctor.email,
      password: 'TestPass123!',
    });
    doctorToken = dLogin.body.token;

    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: testDoctorId,
        patientId: testPatientId,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.agentAuditRecord.deleteMany({ where: { userId: testPatientId } });
    await prisma.healthObservation.deleteMany({ where: { userId: testPatientId } });
    await prisma.user.deleteMany({
      where: { id: { in: [testPatientId, testDoctorId] } },
    });
    await prisma.$disconnect();
  });

  describe('1. Clinical Safety Evaluator (ADA Guideline Thresholds)', () => {
    test('evaluates Blood Glucose levels accurately', () => {
      // Critical Hypoglycemia (< 54 mg/dL with assistance required = Level 3)
      const criticalLow = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 48,
        context: 'FASTING',
        clinicalContext: { requiresAssistance: true },
      });
      expect(criticalLow.clinicalFlag).toBe('CRITICAL_LOW');
      expect(criticalLow.isCritical).toBe(true);
      expect(criticalLow.requiresEmergencyEscalation).toBe(true);
      expect(criticalLow.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_3');

      // Level 2 Hypoglycemia (< 54 mg/dL, patient conscious/able to self-treat)
      const level2Low = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 48,
        context: 'FASTING',
      });
      expect(level2Low.clinicalFlag).toBe('CRITICAL_LOW');
      expect(level2Low.isCritical).toBe(true);
      expect(level2Low.requiresEmergencyEscalation).toBe(false);
      expect(level2Low.clinicalCategory).toBe('HYPOGLYCEMIA_LEVEL_2');

      // Alert Low (54 - 69 mg/dL)
      const alertLow = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 65,
        context: 'FASTING',
      });
      expect(alertLow.clinicalFlag).toBe('LOW');
      expect(alertLow.isCritical).toBe(false);

      // Fasting Target (80 - 130 mg/dL)
      const inTargetFasting = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 110,
        context: 'FASTING',
      });
      expect(inTargetFasting.clinicalFlag).toBe('IN_TARGET');

      // Post-Meal Target (<= 180 mg/dL)
      const postMealTarget = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 160,
        context: 'POST_MEAL_2HR',
      });
      expect(postMealTarget.clinicalFlag).toBe('IN_TARGET');

      // Hyperglycemia Alert (> 250 mg/dL)
      const hyperAlert = evaluateClinicalSafety({
        type: 'BLOOD_GLUCOSE',
        numericValue: 275,
        context: 'RANDOM',
      });
      expect(hyperAlert.clinicalFlag).toBe('CRITICAL_HIGH');
      expect(hyperAlert.isCritical).toBe(true);
    });

    test('evaluates Blood Pressure accurately', () => {
      // Normal BP (< 120/80)
      const normalBp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 115,
        secondaryValue: 75,
      });
      expect(normalBp.clinicalFlag).toBe('NORMAL');

      // Stage 1 Hypertension (130-139 / 80-89)
      const stage1Bp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 135,
        secondaryValue: 84,
      });
      expect(stage1Bp.clinicalFlag).toBe('STAGE_1_HYPERTENSION');

      // Stage 2 Hypertension (>= 140 or >= 90)
      const stage2Bp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 150,
        secondaryValue: 95,
      });
      expect(stage2Bp.clinicalFlag).toBe('STAGE_2_HYPERTENSION');

      // Hypertensive Crisis with acute symptoms (Emergency)
      const crisisBp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 185,
        secondaryValue: 125,
        clinicalContext: { hasSevereSymptoms: true },
      });
      expect(crisisBp.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(crisisBp.isCritical).toBe(true);
      expect(crisisBp.requiresEmergencyEscalation).toBe(true);
      expect(crisisBp.clinicalCategory).toBe('HYPERTENSIVE_EMERGENCY');

      // Hypertensive Crisis without acute symptoms (Urgency / Asymptomatic)
      const asymptomaticSevereBp = evaluateClinicalSafety({
        type: 'BLOOD_PRESSURE',
        numericValue: 185,
        secondaryValue: 125,
      });
      expect(asymptomaticSevereBp.clinicalFlag).toBe('HYPERTENSIVE_CRISIS');
      expect(asymptomaticSevereBp.isCritical).toBe(true);
      expect(asymptomaticSevereBp.requiresEmergencyEscalation).toBe(false);
      expect(asymptomaticSevereBp.clinicalCategory).toBe('SEVERE_HYPERTENSION_ASYMPTOMATIC');
    });

    test('evaluates HbA1c accurately', () => {
      const normalA1c = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 5.4 });
      expect(normalA1c.clinicalFlag).toBe('NORMAL');

      const targetA1c = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 6.8 });
      expect(targetA1c.clinicalFlag).toBe('IN_TARGET');

      const highA1c = evaluateClinicalSafety({ type: 'HBA1C', numericValue: 9.2 });
      expect(highA1c.clinicalFlag).toBe('CRITICAL_HIGH');
      expect(highA1c.isCritical).toBe(true);
    });
  });

  describe('2. PHI Sanitization & Audit Hygiene', () => {
    test('redacts sensitive credentials, tokens, and authorization headers', () => {
      const sensitivePayload = {
        patientName: 'Ramesh',
        password: 'SuperSecretPassword!',
        token: 'header.payload.signature',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.test',
        nested: {
          secret: 'clinical_api_key_123',
          diagnosticNotes: 'Stable fasting blood glucose',
        },
      };

      const sanitized = sanitizePhi(sensitivePayload);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.nested.secret).toBe('[REDACTED]');
      expect(sanitized.nested.diagnosticNotes).toBe('Stable fasting blood glucose');
      expect(sanitized.patientName).toBe('Ramesh');
    });
  });

  describe('3. Feature Flag Governance', () => {
    test('system defaults enforce P0.0 through P0.6 enabled and subsequent phases disabled', async () => {
      const p0Enabled = await isFeatureEnabled('P0_0_SAFETY_FOUNDATION');
      expect(p0Enabled).toBe(true);

      const p1Enabled = await isFeatureEnabled('P0_1_HEALTH_JOURNAL');
      expect(p1Enabled).toBe(true);

      const p2Enabled = await isFeatureEnabled('P0_2_MEDICATION_VAULT');
      expect(p2Enabled).toBe(true);

      const p3Enabled = await isFeatureEnabled('P0_3_LIFESTYLE_TWIN');
      expect(p3Enabled).toBe(true);

      const p4Enabled = await isFeatureEnabled('P0_4_NOTIFICATIONS_SOS');
      expect(p4Enabled).toBe(true);

      const p6Enabled = await isFeatureEnabled('P0_6_GROQ_DAMU_ASSISTANT');
      expect(p6Enabled).toBe(true);

      const p7Enabled = await isFeatureEnabled('P0_7_AGENTIC_EXECUTION');
      expect(p7Enabled).toBe(false);
    });

    test('getAllFeatureFlags returns full catalog with rollout tiers', async () => {
      const flags = await getAllFeatureFlags();
      expect(flags.length).toBeGreaterThanOrEqual(9);

      const p0 = flags.find((f) => f.id === 'P0_0_SAFETY_FOUNDATION');
      expect(p0).toBeDefined();
      expect(p0?.isEnabled).toBe(true);
    });

    test('features can be toggled via setFeatureFlag', async () => {
      await setFeatureFlag('P0_7_AGENTIC_EXECUTION', true, 'internal_testing');
      const updated = await isFeatureEnabled('P0_7_AGENTIC_EXECUTION');
      expect(updated).toBe(true);

      // Reset back to false for phase isolation
      await setFeatureFlag('P0_7_AGENTIC_EXECUTION', false, 'development');
      const reset = await isFeatureEnabled('P0_7_AGENTIC_EXECUTION');
      expect(reset).toBe(false);
    });

    test('GET /api/features returns publicly accessible flag list', async () => {
      const res = await request(app).get('/api/features');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.features)).toBe(true);
    });
  });

  describe('4. AI Agent Safety & Risk Governance', () => {
    test('classifies intent risk tiers correctly', () => {
      const lowRisk = classifyAgentIntent('INFORMATIONAL_QUERY', { query: 'What is HbA1c?' });
      expect(lowRisk.riskTier).toBe('LOW_RISK');
      expect(lowRisk.canAutoExecute).toBe(true);

      const mediumRisk = classifyAgentIntent('SCHEDULE_FOLLOW_UP', { weeks: 4 });
      expect(mediumRisk.riskTier).toBe('MEDIUM_RISK');
      expect(mediumRisk.canAutoExecute).toBe(false);

      const highRisk = classifyAgentIntent('MEDICATION_CHANGE_PROPOSAL', { drug: 'Metformin', newDose: '1000mg' });
      expect(highRisk.riskTier).toBe('HIGH_RISK');
      expect(highRisk.requiresClinicianApproval).toBe(true);

      const prohibited = classifyAgentIntent('AUTONOMOUS_PRESCRIBE', { drug: 'Insulin Glargine', dose: '20u' });
      expect(prohibited.riskTier).toBe('PROHIBITED');
      expect(prohibited.canAutoExecute).toBe(false);
    });

    test('proposals follow safety workflow: auto-execution, pending review, and rejection', async () => {
      // 1. Low risk auto-executes
      const lowExec = await submitAgentProposal({
        userId: testPatientId,
        agentName: 'Damu',
        actionType: 'INFORMATIONAL_QUERY',
        summary: 'Answered fasting blood sugar query',
        payload: { topic: 'ADA Guidelines' },
      });
      expect(lowExec.status).toBe('AUTO_EXECUTED');
      expect(lowExec.canExecuteNow).toBe(true);

      // 2. High risk requires clinician approval
      const highProp = await submitAgentProposal({
        userId: testPatientId,
        agentName: 'Damu',
        actionType: 'CLINICAL_NOTE_DRAFT',
        summary: 'Drafted post-consultation recommendation',
        payload: { suggestedTarget: '110 mg/dL' },
      });
      expect(highProp.status).toBe('PENDING');
      expect(highProp.requiresClinicianApproval).toBe(true);

      // 3. Prohibited action is rejected immediately
      const prohibitedProp = await submitAgentProposal({
        userId: testPatientId,
        agentName: 'Damu',
        actionType: 'DIAGNOSE_CONDITION',
        summary: 'Attempted independent medical diagnosis',
        payload: { assertion: 'Diabetic Retinopathy Stage 2' },
      });
      expect(prohibitedProp.status).toBe('REJECTED');
      expect(prohibitedProp.riskTier).toBe('PROHIBITED');

      // 4. Non-clinician cannot approve clinician-gated proposal
      await expect(
        reviewAgentProposal({
          proposalId: highProp.proposalId,
          reviewerId: testPatientId,
          isClinician: false,
          decision: 'APPROVED',
        })
      ).rejects.toThrow(/licensed doctor/i);

      // 5. Doctor can approve proposal
      const approved = await reviewAgentProposal({
        proposalId: highProp.proposalId,
        reviewerId: testDoctorId,
        isClinician: true,
        decision: 'APPROVED',
        notes: 'Reviewed and confirmed for patient care plan.',
      });
      expect(approved.approvalStatus).toBe('APPROVED');
      expect(approved.approvedBy).toBe(testDoctorId);
    });

    test('permission guard validates patient and role bounds', async () => {
      // Patient accessing their own data
      const selfAccess = await verifyAgentPermission({
        actorId: testPatientId,
        patientId: testPatientId,
      });
      expect(selfAccess.allowed).toBe(true);
      expect(selfAccess.actorRole).toBe('PATIENT');

      // Doctor accessing patient data
      const docAccess = await verifyAgentPermission({
        actorId: testDoctorId,
        patientId: testPatientId,
      });
      expect(docAccess.allowed).toBe(true);
      expect(docAccess.actorRole).toBe('CLINICIAN');

      // Non-existent or unauthorized actor
      const unauthorizedAccess = await verifyAgentPermission({
        actorId: '00000000-0000-0000-0000-000000000000',
        patientId: testPatientId,
      });
      expect(unauthorizedAccess.allowed).toBe(false);
    });
  });

  describe('5. Health Observation Safety Integration & Idempotency', () => {
    test('POST /api/observations records clinical flag and handles idempotency', async () => {
      const idempotencyKey = `p0-test-idempotency-${Date.now()}`;

      // First submission
      const res1 = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 45,
          unit: 'mg/dL',
          context: 'FASTING',
          notes: 'Dizziness and sweating experienced before breakfast',
          sourceProvenance: 'MANUAL_PATIENT',
          requiresAssistance: true,
          idempotencyKey,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.observation).toBeDefined();
      expect(res1.body.observation.clinicalFlag).toBe('CRITICAL_LOW');
      expect(res1.body.observation.sourceProvenance).toBe('MANUAL_PATIENT');
      expect(res1.body.safetyEvaluation).toBeDefined();
      expect(res1.body.safetyEvaluation.isCritical).toBe(true);
      expect(res1.body.safetyEvaluation.requiresEmergencyEscalation).toBe(true);

      // Idempotent re-submission with same key
      const res2 = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          type: 'BLOOD_GLUCOSE',
          numericValue: 45,
          unit: 'mg/dL',
          context: 'FASTING',
          idempotencyKey,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.isIdempotentReplay).toBe(true);
      expect(res2.body.observation.id).toBe(res1.body.observation.id);
    });

    test('POST /api/observations supports secondaryValue for blood pressure', async () => {
      const res = await request(app)
        .post('/api/observations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          type: 'BLOOD_PRESSURE',
          numericValue: 145,
          secondaryValue: 92,
          unit: 'mmHg',
          context: 'GENERAL',
          sourceProvenance: 'BLUETOOTH_DEVICE',
          deviceModel: 'Omron Hem-7120',
        });

      expect(res.status).toBe(201);
      expect(res.body.observation.clinicalFlag).toBe('STAGE_2_HYPERTENSION');
      expect(res.body.observation.secondaryValue).toBe(92);
      expect(res.body.observation.deviceModel).toBe('Omron Hem-7120');
    });
  });

  describe('6. AI Safety Proposals HTTP Endpoints', () => {
    test('POST /api/ai/proposals and POST /api/ai/proposals/:id/review', async () => {
      // 1. Patient submits agent proposal
      const propRes = await request(app)
        .post('/api/ai/proposals')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          actionType: 'SCHEDULE_FOLLOW_UP',
          summary: 'Schedule endocrinology follow-up in 4 weeks',
          payload: { targetWeeks: 4, reason: 'HbA1c review' },
        });

      expect(propRes.status).toBe(201);
      expect(propRes.body.proposalId).toBeDefined();
      expect(propRes.body.status).toBe('PENDING');

      // 2. Doctor reviews and approves
      const reviewRes = await request(app)
        .post(`/api/ai/proposals/${propRes.body.proposalId}/review`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          decision: 'APPROVED',
          notes: 'Appropriate follow-up interval given current readings.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);
      expect(reviewRes.body.proposal.approvalStatus).toBe('APPROVED');
    });

    test('proposal routes enforce patient scope and clinician assignment', async () => {
      const unassignedDoctor = await prisma.user.create({
        data: {
          email: `p0.unassigned.${Date.now()}@test.local`,
          passwordHash: await bcrypt.hash('TestPass123!', 8),
          isClinician: true,
          profile: { create: { fullName: 'Dr. Unassigned P0 Tester' } },
        },
      });
      const unassignedLogin = await request(app).post('/api/auth/login').send({
        email: unassignedDoctor.email,
        password: 'TestPass123!',
      });

      const crossPatientSubmit = await request(app)
        .post('/api/ai/proposals')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          targetPatientId: unassignedDoctor.id,
          actionType: 'SCHEDULE_FOLLOW_UP',
          payload: { targetWeeks: 4 },
        });
      expect(crossPatientSubmit.status).toBe(403);

      const proposal = await submitAgentProposal({
        userId: testPatientId,
        actionType: 'SCHEDULE_FOLLOW_UP',
        summary: 'Assignment-bound review test',
        payload: { targetWeeks: 4 },
      });

      const unassignedReview = await request(app)
        .post(`/api/ai/proposals/${proposal.proposalId}/review`)
        .set('Authorization', `Bearer ${unassignedLogin.body.token}`)
        .send({ decision: 'APPROVED', notes: 'Should be blocked by assignment.' });
      expect(unassignedReview.status).toBe(403);

      const crossPatientList = await request(app)
        .get(`/api/ai/proposals?patientId=${testPatientId}`)
        .set('Authorization', `Bearer ${unassignedLogin.body.token}`);
      expect(crossPatientList.status).toBe(403);

      await prisma.user.delete({ where: { id: unassignedDoctor.id } });
    });

    test('synthetic ABHA export and import are patient-scoped, local, and idempotent', async () => {
      const exported = await request(app)
        .get('/api/abha/export')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(exported.status).toBe(200);
      expect(exported.body.mode).toBe('SYNTHETIC_ABHA_SANDBOX');
      expect(exported.body.abhaId).toMatch(/^12-\d{4}-\d{4}-\d{4}$/);
      expect(exported.body.summary.isSynthetic).toBe(true);

      const imported = await request(app)
        .post('/api/abha/import')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(imported.status).toBe(200);
      expect(imported.body.imported).toBe(true);
      expect(imported.body.alreadyImported).toBe(false);
      expect(imported.body.summary.counts.observations).toBeGreaterThanOrEqual(2);
      expect(imported.body.summary.documents).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: 'ABHA_IMPORT' }),
      ]));

      const repeat = await request(app)
        .post('/api/abha/import')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(repeat.status).toBe(200);
      expect(repeat.body.alreadyImported).toBe(true);

      const doctorExport = await request(app)
        .get('/api/abha/export')
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('X-Target-Patient-Id', testPatientId);
      expect(doctorExport.status).toBe(200);
      expect(doctorExport.body.abhaId).toBe(exported.body.abhaId);
    });
  });
});
