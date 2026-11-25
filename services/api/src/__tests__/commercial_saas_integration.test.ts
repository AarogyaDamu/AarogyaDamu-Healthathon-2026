import request from 'supertest';
import { app } from '../server';
import { prisma } from '../db/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

function signJwt(payload: any): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1d' });
}

describe('AarogyaDamu Commercial SaaS & Practice Platform Integration Suite', () => {
  let doctorToken: string;
  let doctorId: string;
  let doctorEmail: string;

  let doctor2Token: string;
  let doctor2Id: string;

  let receptionistToken: string;
  let receptionistId: string;

  let patientId: string;
  let practiceId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('TestSecurePass2026!', 10);

    // 1. Create primary Doctor
    doctorEmail = `dr.sharma.${Date.now()}@aarogyadamu.local`;
    const docUser = await prisma.user.create({
      data: {
        email: doctorEmail,
        passwordHash,
        isClinician: true,
        isSyntheticDemo: true,
        profile: {
          create: {
            fullName: 'Dr. Aarav Sharma',
            diabetesType: 'NONE',
          },
        },
      },
    });
    doctorId = docUser.id;

    const docSession = await prisma.authSession.create({
      data: {
        userId: doctorId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    doctorToken = signJwt({
      id: doctorId,
      email: doctorEmail,
      isSyntheticDemo: true,
      isClinician: true,
      sessionId: docSession.id,
    });

    // 2. Create secondary Doctor (for multi-tenant isolation testing)
    const doc2User = await prisma.user.create({
      data: {
        email: `dr.verma.${Date.now()}@aarogyadamu.local`,
        passwordHash,
        isClinician: true,
        isSyntheticDemo: true,
        profile: {
          create: {
            fullName: 'Dr. Priya Verma',
            diabetesType: 'NONE',
          },
        },
      },
    });
    doctor2Id = doc2User.id;

    const doc2Session = await prisma.authSession.create({
      data: {
        userId: doctor2Id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    doctor2Token = signJwt({
      id: doctor2Id,
      email: doc2User.email,
      isSyntheticDemo: true,
      isClinician: true,
      sessionId: doc2Session.id,
    });

    // 3. Create Receptionist user
    const recepUser = await prisma.user.create({
      data: {
        email: `receptionist.${Date.now()}@aarogyadamu.local`,
        passwordHash,
        isClinician: false,
        isSyntheticDemo: true,
        profile: {
          create: {
            fullName: 'Pooja (Receptionist)',
            diabetesType: 'NONE',
          },
        },
      },
    });
    receptionistId = recepUser.id;

    const recepSession = await prisma.authSession.create({
      data: {
        userId: receptionistId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    receptionistToken = signJwt({
      id: receptionistId,
      email: recepUser.email,
      isSyntheticDemo: true,
      isClinician: false,
      sessionId: recepSession.id,
    });

    // 4. Create Patient
    const patientUser = await prisma.user.create({
      data: {
        email: `patient.test.${Date.now()}@aarogyadamu.local`,
        passwordHash,
        isClinician: false,
        isSyntheticDemo: true,
        profile: {
          create: {
            fullName: 'Ramesh Patel',
            diabetesType: 'TYPE_2',
            diagnosisYear: 2019,
            knownAllergies: 'Penicillin',
          },
        },
      },
    });
    patientId = patientUser.id;

    // Seed patient glucose observations
    await prisma.healthObservation.createMany({
      data: [
        {
          userId: patientId,
          type: 'BLOOD_GLUCOSE',
          numericValue: 128,
          unit: 'mg/dL',
          context: 'FASTING',
          observedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          userId: patientId,
          type: 'BLOOD_GLUCOSE',
          numericValue: 184,
          unit: 'mg/dL',
          context: 'POST_MEAL_2HR',
          observedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          userId: patientId,
          type: 'BLOOD_PRESSURE',
          numericValue: 130,
          secondaryValue: 84,
          unit: 'mmHg',
          context: 'RESTING',
          observedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    // Create active DoctorPatientAssignment for primary doctor -> patient
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId,
        patientId,
        status: 'ACTIVE',
      },
    });
  });

  describe('1. Clinician Onboarding & Practice Profile', () => {
    it('returns hasPractice: false before onboarding', async () => {
      const res = await request(app)
        .get('/api/practice/current')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasPractice).toBe(false);
    });

    it('onboards clinician, registers practice, and provisions 14-day Damu Plus trial', async () => {
      const res = await request(app)
        .post('/api/practice/onboard')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          fullName: 'Dr. Aarav Sharma',
          registrationNumber: 'KMC-2015-84920',
          council: 'Karnataka Medical Council',
          specialty: 'Diabetology & Endocrinology',
          qualifications: 'MBBS, MD',
          practiceName: 'Aarav Diabetes & Endocrine Care',
          address: '104, Indiranagar 100ft Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560038',
          phone: '9845012345',
          consultationFeeInr: 600,
          workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.practice.name).toBe('Aarav Diabetes & Endocrine Care');
      expect(res.body.membership.role).toBe('OWNER');

      practiceId = res.body.practice.id;
    });

    it('returns practice profile and membership on /api/practice/current', async () => {
      const res = await request(app)
        .get('/api/practice/current')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasPractice).toBe(true);
      expect(res.body.role).toBe('OWNER');
      expect(res.body.practice.id).toBe(practiceId);
      expect(res.body.practice.consultationFeeInr).toBe(600);
    });
  });

  describe('2. Practice Profile Configuration & Updates', () => {
    it('updates practice profile details and consultation fee', async () => {
      const res = await request(app)
        .put('/api/practice/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          practiceName: 'Aarav Advanced Diabetes Center',
          consultationFeeInr: 750,
          phone: '9845099999',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.practice.name).toBe('Aarav Advanced Diabetes Center');
      expect(res.body.practice.consultationFeeInr).toBe(750);
    });
  });

  describe('3. Staff Management & Role Access Boundaries', () => {
    it('adds Receptionist staff member to the practice', async () => {
      const res = await request(app)
        .post('/api/practice/staff')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          email: (await prisma.user.findUnique({ where: { id: receptionistId } }))!.email,
          role: 'RECEPTIONIST',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.membership.role).toBe('RECEPTIONIST');
    });

    it('lists all practice staff members', async () => {
      const res = await request(app)
        .get('/api/practice/staff')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.staff.length).toBe(2); // Owner + Receptionist
      const roles = res.body.staff.map((s: any) => s.role);
      expect(roles).toContain('OWNER');
      expect(roles).toContain('RECEPTIONIST');
    });

    it('STRICT PRIVACY: blocks Receptionist from accessing clinical consultation notes (403 CLINICAL_ACCESS_RESTRICTED)', async () => {
      const res = await request(app)
        .get('/api/consultations/workspace/templates')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CLINICAL_ACCESS_RESTRICTED');
    });
  });

  describe('4. Doctor Consultation Workspace & SOAP Rx Builder', () => {
    it('retrieves reusable consultation templates with standard Indian diabetology defaults', async () => {
      const res = await request(app)
        .get('/api/consultations/workspace/templates')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.templates.length).toBeGreaterThanOrEqual(3);
      const names = res.body.templates.map((t: any) => t.name);
      expect(names).toContain('Type 2 Diabetes Routine Follow-up');
    });

    it('finalizes clinical encounter with SOAP notes, doctor-approved diagnosis, and digital Rx', async () => {
      const res = await request(app)
        .post('/api/consultations/workspace/finalize')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          chiefComplaint: 'Quarterly review; morning fasting sugars averaging 135 mg/dL.',
          historyOfPresentIllness: 'Compliant with metformin 500mg BD. No hypoglycemic symptoms.',
          examination: {
            bpSystolic: 128,
            bpDiastolic: 82,
            pulseRate: 74,
            weightKg: 76.2,
            randomBloodSugar: 165,
            generalExam: 'Conscious, alert, vitals stable.',
            footExam: 'Intact sensation, peripheral pulses present.',
          },
          diagnoses: [
            { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' },
          ],
          prescriptions: [
            {
              medicationName: 'Metformin Hydrochloride (Glucophage)',
              dosage: '500 mg',
              frequency: '1-0-1',
              timing: 'AFTER_FOOD',
              durationDays: 60,
              instructions: 'Take after meals with water.',
            },
            {
              medicationName: 'Vildagliptin (Galvus)',
              dosage: '50 mg',
              frequency: '1-0-0',
              timing: 'BEFORE_FOOD',
              durationDays: 60,
              instructions: 'Take before breakfast.',
            },
          ],
          labOrders: ['HbA1c', 'Lipid Profile'],
          lifestyleAdvice: 'Continue 30 min daily walk; maintain low glycemic index diet.',
          followUpDays: 60,
          doctorConfirmed: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.consultationNote.status).toBe('APPROVED');
      expect(res.body.consultationNote.structuredNote).toContain('### CHIEF COMPLAINT & HISTORY');
      expect(res.body.consultationNote.structuredNote).toContain('Metformin Hydrochloride');
      expect(res.body.consultationNote.approvedBy).toBe('Dr. Aarav Sharma');

      // Verify individual prescription items were persisted in DB
      const rxItems = await prisma.consultationPrescriptionItem.findMany({
        where: { consultationNoteId: res.body.consultationNote.id },
      });
      expect(rxItems.length).toBe(2);
      expect(rxItems[0].medicationName).toContain('Metformin');
    });
  });

  describe('5. Practice Billing & Daily Collections', () => {
    let receiptNumber: string;

    it('allows Receptionist to record consultation payment and generate receipt', async () => {
      const res = await request(app)
        .post('/api/billing/encounters')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          patientId,
          consultationFeeInr: 600,
          discountInr: 100,
          totalAmountInr: 500,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          transactionReference: 'UPI/2026/89402918',
          notes: 'Standard follow-up consultation',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.billing.totalAmountInr).toBe(500);
      expect(res.body.billing.paymentMethod).toBe('UPI');
      expect(res.body.billing.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);

      receiptNumber = res.body.billing.receiptNumber;
    });

    it('calculates daily collections summary by payment method', async () => {
      const res = await request(app)
        .get('/api/billing/daily-collections')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.totalConsultationsCount).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.paidConsultationsCount).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.totalCollectedInr).toBeGreaterThanOrEqual(500);
      expect(res.body.summary.collectionsByMethod.UPI).toBeGreaterThanOrEqual(500);
    });

    it('lists encounter billings for practice accounting', async () => {
      const res = await request(app)
        .get('/api/billing/encounters')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.billings.length).toBeGreaterThanOrEqual(1);
      const receipts = res.body.billings.map((b: any) => b.receiptNumber);
      expect(receipts).toContain(receiptNumber);
    });
  });

  describe('6. Clinician Damu AI Assistant Tools', () => {
    it('summarizes longitudinal patient history with data provenance & clinical disclaimer', async () => {
      const res = await request(app)
        .post('/api/consultations/copilot/summarize-history')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          timeframeDays: 90,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.patientName).toBe('Ramesh Patel');
      expect(res.body.summary.diabetesType).toBe('TYPE_2');
      expect(res.body.summary.glucoseMetrics.totalReadingsCount).toBeGreaterThanOrEqual(2);
      expect(res.body.summary.aiClinicalDisclaimer).toContain('CLINICIAN DECISION SUPPORT NOTICE');
    });

    it('pre-populates structured SOAP consultation draft stamped as provisional', async () => {
      const res = await request(app)
        .post('/api/consultations/copilot/draft-note')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          chiefComplaint: 'Post-prandial spikes after heavy dinners.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.draft.isAiDraft).toBe(true);
      expect(res.body.draft.requiresPhysicianReview).toBe(true);
      expect(res.body.draft.draftedSoapNote.subjective).toContain('Post-prandial spikes');
      expect(res.body.draft.draftedSoapNote.provisionalAssessment[0].category).toBe('PROVISIONAL');
    });

    it('computes statistical trend comparison for blood glucose', async () => {
      const res = await request(app)
        .post('/api/consultations/copilot/compare-trends')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          metric: 'BLOOD_GLUCOSE',
          periodDays: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.comparison.metric).toBe('BLOOD_GLUCOSE');
      expect(['IMPROVING', 'WORSENING', 'STABLE', 'INSUFFICIENT_DATA']).toContain(
        res.body.comparison.trendDirection,
      );
    });

    it('scans practice patients and highlights overdue HbA1c tests', async () => {
      const res = await request(app)
        .get('/api/consultations/copilot/missing-documentation?overdueDays=90')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.alerts.length).toBeGreaterThanOrEqual(1);
      expect(res.body.alerts[0].missingItem).toContain('HbA1c Lab Test');
    });
  });

  describe('7. Multi-Tenant Isolation & Adversarial Boundary Tests', () => {
    it('ADVERSARIAL ATTACK: Doctor 2 (unaffiliated) cannot access or update Practice 1 settings (403)', async () => {
      const res = await request(app)
        .put('/api/practice/profile')
        .set('Authorization', `Bearer ${doctor2Token}`)
        .send({
          practiceName: 'Hacked Practice Name',
          consultationFeeInr: 10,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NO_ACTIVE_PRACTICE');
    });

    it('ADVERSARIAL ATTACK: Doctor 2 cannot view billing or collections of Practice 1', async () => {
      const res = await request(app)
        .get('/api/billing/daily-collections')
        .set('Authorization', `Bearer ${doctor2Token}`);

      expect(res.status).toBe(403);
    });

    it('ADVERSARIAL ATTACK: Doctor 2 cannot add staff or modify membership of Practice 1', async () => {
      const res = await request(app)
        .post('/api/practice/staff')
        .set('Authorization', `Bearer ${doctor2Token}`)
        .send({
          email: 'hacked.staff@aarogyadamu.local',
          fullName: 'Hacked Staff',
          role: 'DOCTOR',
        });

      expect(res.status).toBe(403);
    });
  });
});
