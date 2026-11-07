import request from 'supertest';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { app, prisma } from '../server';
import { setFeatureFlag } from '../features/featureFlags';
import { classifyDamuIntent } from '../ai/agent/damuNluService';
import { searchDiabetesKnowledge } from '../ai/knowledge/diabetesKnowledgeBase';
import { getAggregatedPatientHealthContext } from '../services/damuHealthContextService';
import {
  getPatientHealthSummary,
  getGlucoseReadings,
  compareGlucosePeriods,
  getPrescribedMedications,
  getMedicationAdherence,
  getCarePlan,
  getPendingTasks,
  getAppointmentDetails,
  getApprovedConsultationSummaries,
  searchApprovedHealthKnowledge,
} from '../ai/agent/readOnlyTools';

describe('Phase 6 — Damu AI Health Intelligence & Patient Agent Test Suite', () => {
  let doctorA: { id: string; email: string; token: string };
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let caregiverA: { id: string; email: string; token: string };
  let caregiverStranger: { id: string; email: string; token: string };

  let approvedNoteId: string;
  let draftNoteId: string;
  let appointmentId: string;

  jest.setTimeout(45000);

  beforeAll(async () => {
    await setFeatureFlag('P0_6_GROQ_VOICE_ASSISTANT', true, 'development');
    await setFeatureFlag('P0_6_GROQ_DAMU_ASSISTANT', true, 'development');

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
              diabetesType: isClinician ? undefined : 'Type 2 Diabetes Mellitus',
              targetFastingMin: 80,
              targetFastingMax: 130,
              targetPostMealMax: 180,
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
    doctorA = await createUser(`dr.sharma.p6.${runId}@example.com`, 'Dr. Ananya Sharma', true);
    patientA = await createUser(`patient.ramesh.p6.${runId}@example.com`, 'Ramesh Deshmukh');
    patientB = await createUser(`patient.priya.p6.${runId}@example.com`, 'Priya Sharma');
    caregiverA = await createUser(`caregiver.sunil.p6.${runId}@example.com`, 'Sunil Deshmukh');
    caregiverStranger = await createUser(`caregiver.stranger.p6.${runId}@example.com`, 'Stranger Caregiver');

    // Caregiver consent for Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverA.email,
        caregiverName: 'Sunil Deshmukh',
        relationship: 'SON',
        status: 'ACTIVE',
        permissions: JSON.stringify([
          'VIEW_OBSERVATIONS',
          'VIEW_HEALTH_SUMMARY',
          'VIEW_MEDICATIONS',
          'VIEW_TASKS',
          'VIEW_CONSULTATIONS',
        ]),
      },
    });

    // Populate Patient A clinical records
    const now = new Date();

    // 1. Blood Glucose Observations (recent 7 days)
    await prisma.healthObservation.createMany({
      data: [
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 110,
          unit: 'mg/dL',
          context: 'FASTING',
          observedAt: new Date(now.getTime() - 1 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 145,
          unit: 'mg/dL',
          context: 'POST_PRANDIAL',
          observedAt: new Date(now.getTime() - 2 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 65, // Mild hypo
          unit: 'mg/dL',
          context: 'FASTING',
          observedAt: new Date(now.getTime() - 3 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 195, // Mild hyper
          unit: 'mg/dL',
          context: 'POST_PRANDIAL',
          observedAt: new Date(now.getTime() - 4 * 86400000),
        },
        // Prior 7-14 days observations
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 130,
          unit: 'mg/dL',
          context: 'FASTING',
          observedAt: new Date(now.getTime() - 9 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 160,
          unit: 'mg/dL',
          context: 'POST_PRANDIAL',
          observedAt: new Date(now.getTime() - 10 * 86400000),
        },
      ],
    });

    // 2. Prescribed Medication in Med Vault
    const med = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        medicineName: 'Metformin 500mg',
        dosage: '1 tablet twice daily',
        timing: 'MORNING_AND_EVENING',
        foodInstructions: 'Take with or after meals',
        prescriber: 'Dr. Ananya Sharma',
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
        isActive: true,
      },
    });

    // 3. Medication Adherence Events
    await prisma.medicationAdherenceEvent.createMany({
      data: [
        {
          medicationId: med.id,
          userId: patientA.id,
          action: 'TAKEN',
          scheduledTime: new Date(now.getTime() - 86400000),
          recordedBy: patientA.id,
          sourceProvenance: 'MANUAL_PATIENT',
        },
        {
          medicationId: med.id,
          userId: patientA.id,
          action: 'TAKEN',
          scheduledTime: new Date(now.getTime() - 2 * 86400000),
          recordedBy: patientA.id,
          sourceProvenance: 'MANUAL_PATIENT',
        },
        {
          medicationId: med.id,
          userId: patientA.id,
          action: 'SKIPPED',
          scheduledTime: new Date(now.getTime() - 3 * 86400000),
          recordedBy: patientA.id,
          notes: 'Travel delay',
          sourceProvenance: 'MANUAL_PATIENT',
        },
      ],
    });

    // 4. Care Plan
    const cp = await prisma.carePlan.create({
      data: {
        patientId: patientA.id,
        doctorId: doctorA.id,
        title: 'Comprehensive Type 2 Glycemic Control Plan',
        diagnosis: 'Type 2 Diabetes Mellitus',
        status: 'ACTIVE',
        doctorInstructions: 'Maintain regular walking 30 mins/day and log fasting sugars.',
      },
    });

    await prisma.carePlanGoal.create({
      data: {
        carePlanId: cp.id,
        title: 'Fasting Blood Sugar Target',
        targetValue: '80 - 130 mg/dL',
      },
    });

    await prisma.carePlanActivity.create({
      data: {
        carePlanId: cp.id,
        title: 'Daily Morning Fasting Blood Glucose Check',
        category: 'BLOOD_SUGAR_CHECK',
        instructions: 'Check before breakfast',
      },
    });

    // 5. Tasks and Reminders
    await prisma.careTask.create({
      data: {
        userId: patientA.id,
        assignedById: doctorA.id,
        title: 'Submit Weekly Fasting Sugar Log',
        instructions: 'Log 7 days of fasting readings for review',
        priority: 'HIGH',
        status: 'PENDING',
        dueAt: new Date(now.getTime() + 2 * 86400000),
      },
    });

    await prisma.reminder.create({
      data: {
        userId: patientA.id,
        createdById: doctorA.id,
        title: 'Evening Metformin Dose',
        remindAt: new Date(now.getTime() + 6 * 3600000),
        status: 'SCHEDULED',
      },
    });

    // 6. Upcoming Appointment
    const apt = await prisma.appointment.create({
      data: {
        patientId: patientA.id,
        doctorId: doctorA.id,
        bookedById: patientA.id,
        scheduledAt: new Date(now.getTime() + 3 * 86400000),
        status: 'CONFIRMED',
        clinicName: 'Apollo Sugar Clinic, Pune',
        visitType: 'FOLLOW_UP',
        reason: 'Routine quarterly diabetes checkup',
      },
    });
    appointmentId = apt.id;

    // 7. Approved Consultation Note (sharedWithPatient = true)
    const approvedNote = await prisma.consultationNote.create({
      data: {
        userId: patientA.id,
        clinicianId: doctorA.id,
        clinicianName: 'Dr. Ananya Sharma',
        status: 'APPROVED',
        sharedWithPatient: true,
        sharedAt: now,
        rawTranscript: 'DOCTOR: How are you feeling today Ramesh? PATIENT: Feeling okay...',
        speakerSegments: JSON.stringify([{ speaker: 'DOCTOR', text: 'How are you feeling' }]),
        structuredNote: JSON.stringify({
          assessmentAndPlan: 'Continue Metformin 500mg BID. Fasting glucose well controlled.',
        }),
        approvedNoteText: 'Continue Metformin 500mg twice daily with meals. Glucose control is improving nicely.',
        approvedAt: now,
        approvedBy: doctorA.id,
      },
    });
    approvedNoteId = approvedNote.id;

    // 8. Incomplete / Unapproved Consultation Note Draft (sharedWithPatient = false)
    const draftNote = await prisma.consultationNote.create({
      data: {
        userId: patientA.id,
        clinicianId: doctorA.id,
        clinicianName: 'Dr. Ananya Sharma',
        status: 'RECORDING',
        sharedWithPatient: false,
        rawTranscript: 'INTERNAL CLINICIAN DRAFT: Patient mentioned intermittent fatigue...',
        speakerSegments: JSON.stringify([{ speaker: 'DOCTOR', text: 'Internal draft notes' }]),
        structuredNote: JSON.stringify({ draftObservation: 'Confidential clinical discussion' }),
      },
    });
    draftNoteId = draftNote.id;
  });

  afterAll(async () => {
    const userIds = [
      doctorA.id,
      patientA.id,
      patientB.id,
      caregiverA.id,
      caregiverStranger.id,
    ];

    await prisma.damuConversation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.consultationNoteVersion.deleteMany({ where: { revisedBy: { in: userIds } } });
    await prisma.consultationNote.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { clinicianId: { in: userIds } },
          { approvedBy: { in: userIds } },
        ],
      },
    });
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { patientId: { in: userIds } },
          { doctorId: { in: userIds } },
          { bookedById: { in: userIds } },
        ],
      },
    });
    await prisma.carePlan.deleteMany({
      where: {
        OR: [
          { patientId: { in: userIds } },
          { doctorId: { in: userIds } },
          { approvedById: { in: userIds } },
        ],
      },
    });
    await prisma.doctorPatientAssignment.deleteMany({
      where: {
        OR: [{ doctorId: { in: userIds } }, { patientId: { in: userIds } }],
      },
    });
    await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careTask.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { assignedById: { in: userIds } },
          { completedById: { in: userIds } },
        ],
      },
    });
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.healthObservation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('1. 12+ Intent Classification & Clinical Safety Guard', () => {
    it('classifies GLUCOSE_SUMMARY intent', () => {
      const res = classifyDamuIntent('How was my blood sugar over the last month?');
      expect(res.intent).toBe('GLUCOSE_SUMMARY');
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
    });

    it('classifies GLUCOSE_COMPARISON intent', () => {
      const res = classifyDamuIntent('Can you compare my sugar this week vs last week?');
      expect(res.intent).toBe('GLUCOSE_COMPARISON');
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
    });

    it('classifies MEDICATION_SCHEDULE intent', () => {
      const res = classifyDamuIntent('What medicines do I need to take today?');
      expect(res.intent).toBe('MEDICATION_SCHEDULE');
      expect(res.hasEmergency).toBe(false);
    });

    it('classifies MEDICATION_ADHERENCE intent', () => {
      const res = classifyDamuIntent('What is my medication adherence rate and missed doses?');
      expect(res.intent).toBe('MEDICATION_ADHERENCE');
    });

    it('classifies CARE_PLAN_TARGETS intent', () => {
      const res = classifyDamuIntent('What are my care plan targets and goals?');
      expect(res.intent).toBe('CARE_PLAN_TARGETS');
    });

    it('classifies TASKS_AND_REMINDERS intent', () => {
      const res = classifyDamuIntent('What doctor tasks do I have pending?');
      expect(res.intent).toBe('TASKS_AND_REMINDERS');
    });

    it('classifies APPOINTMENTS_SCHEDULE intent', () => {
      const res = classifyDamuIntent('When is my next doctor appointment with Dr. Sharma?');
      expect(res.intent).toBe('APPOINTMENTS_SCHEDULE');
    });

    it('classifies CONSULTATION_SUMMARY intent', () => {
      const res = classifyDamuIntent('What did the doctor say in my last consultation summary?');
      expect(res.intent).toBe('CONSULTATION_SUMMARY');
    });

    it('classifies MEDICAL_REPORTS_SUMMARY intent', () => {
      const res = classifyDamuIntent('Can you check my recent lab report documents?');
      expect(res.intent).toBe('MEDICAL_REPORTS_SUMMARY');
    });

    it('classifies lifestyle and diabetes education intents', () => {
      const res1 = classifyDamuIntent('What should I eat using the plate method?');
      expect(res1.intent).toBe('LIFESTYLE_GUIDANCE');

      const res2 = classifyDamuIntent('How does the rule of 15 work for low sugar?');
      expect(res2.intent).toBe('DIABETES_EDUCATION');
    });

    it('classifies GREETING intent', () => {
      const res = classifyDamuIntent('Namaste Damu, how are you today?');
      expect(res.intent).toBe('GREETING');
    });

    it('triggers deterministic EMERGENCY_ESCALATION on acute red-flag symptoms', () => {
      const res = classifyDamuIntent('I have severe chest pain and cannot breathe');
      expect(res.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.hasEmergency).toBe(true);
      expect(res.emergencyNotice).toContain('112');
    });

    it('triggers deterministic EMERGENCY_ESCALATION on severe metabolic hypoglycemia (<54 mg/dL)', () => {
      const res = classifyDamuIntent('My sugar level is feeling very low right now', 48);
      expect(res.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.hasEmergency).toBe(true);
      expect(res.emergencyNotice).toContain('severely low');
      expect(res.emergencyNotice).toContain('112');
    });

    it('triggers deterministic EMERGENCY_ESCALATION on severe hyperglycemia (>300 mg/dL)', () => {
      const res = classifyDamuIntent('Feeling nauseous after lunch', 340);
      expect(res.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.hasEmergency).toBe(true);
      expect(res.emergencyNotice).toContain('DKA');
    });

    it('refuses PROHIBITED prescribing requests with clinical disclaimer', () => {
      const res = classifyDamuIntent('Can you prescribe me insulin glargine?');
      expect(res.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.isProhibited).toBe(true);
      expect(res.refusalReason).toContain('not licensed to prescribe');
    });

    it('refuses PROHIBITED dose modification requests', () => {
      const res = classifyDamuIntent('Should I double my metformin dose tonight?');
      expect(res.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.isProhibited).toBe(true);
      expect(res.refusalReason).toContain('cannot alter or recommend changes to your medication dosages');
    });

    it('refuses PROHIBITED independent medical diagnosis requests', () => {
      const res = classifyDamuIntent('Please diagnose my symptoms and tell me what disease I have');
      expect(res.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.isProhibited).toBe(true);
      expect(res.refusalReason).toContain('cannot provide a formal medical diagnosis');
    });
  });

  describe('2. Approved Diabetes Educational Knowledge Base (RAG)', () => {
    it('retrieves relevant knowledge items for glucose targets', () => {
      const results = searchDiabetesKnowledge('glucose target range normal fasting', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Blood Glucose Targets');
      expect(results[0].clinicalSource).toContain('ADA');
      expect(results[0].content).toContain('80 to 130 mg/dL');
    });

    it('retrieves Rule of 15 guidance for low blood sugar', () => {
      const results = searchDiabetesKnowledge('low sugar rule of 15', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Rule of 15');
      expect(results[0].content).toContain('15 grams of simple, fast-acting carbohydrates');
    });

    it('retrieves HbA1c guidance when the acronym is punctuated', () => {
      const results = searchDiabetesKnowledge('What is HbA1c?', 2);
      expect(results[0].id).toBe('kb_hba1c_explained');
    });

    it('retrieves diabetes plate method for nutrition questions', () => {
      const results = searchDiabetesKnowledge('diet what to eat plate method', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Plate Method');
      expect(results[0].content).toContain('1/2 of your 9-inch plate with non-starchy vegetables');
    });
  });

  describe('3. Patient Health Context Aggregation & Read-Only Tools', () => {
    it('aggregates patient glucose metrics correctly', async () => {
      const ctx = await getAggregatedPatientHealthContext(patientA.id);
      expect(ctx.fullName).toBe('Ramesh Deshmukh');
      expect(ctx.glucoseMetrics.totalReadings30d).toBe(6);
      expect(ctx.glucoseMetrics.overallAverage).toBeGreaterThan(0);
      expect(ctx.glucoseMetrics.hypoCount).toBe(1);
      expect(ctx.glucoseMetrics.hyperCount).toBe(1);
      expect(ctx.glucoseMetrics.timeInRangePercent).toBeGreaterThan(0);
    });

    it('calculates 7-day vs prior 7-day comparison delta', async () => {
      const res = await compareGlucosePeriods(patientA.id);
      expect(res.toolName).toBe('compare_glucose_periods');
      expect(res.summary).toContain('7-Day Glucose Trend Comparison');
      expect(res.sources[0].type).toBe('PATIENT_RECORD');
    });

    it('retrieves doctor-prescribed medications from Med Vault', async () => {
      const res = await getPrescribedMedications(patientA.id);
      expect(res.toolName).toBe('get_prescribed_medications');
      expect(res.summary).toContain('Metformin 500mg');
      expect(res.sources.length).toBe(1);
      expect(res.sources[0].type).toBe('PATIENT_RECORD');
    });

    it('retrieves medication adherence rate from logged events', async () => {
      const res = await getMedicationAdherence(patientA.id);
      expect(res.toolName).toBe('get_medication_adherence');
      expect(res.summary.toLowerCase()).toContain('adherence rate');
      expect(res.sources[0].type).toBe('PATIENT_RECORD');
    });

    it('retrieves doctor care plan goals and instructions', async () => {
      const res = await getCarePlan(patientA.id);
      expect(res.toolName).toBe('get_care_plan');
      expect(res.summary).toContain('Comprehensive Type 2 Glycemic Control Plan');
      expect(res.sources[0].type).toBe('CARE_PLAN');
    });

    it('retrieves pending doctor tasks and reminders', async () => {
      const res = await getPendingTasks(patientA.id);
      expect(res.toolName).toBe('get_pending_tasks');
      expect(res.summary).toContain('Submit Weekly Fasting Sugar Log');
    });

    it('retrieves upcoming doctor appointments', async () => {
      const res = await getAppointmentDetails(patientA.id);
      expect(res.toolName).toBe('get_appointment_details');
      expect(res.summary).toContain('Dr. Ananya Sharma');
      expect(res.summary).toContain('Apollo Sugar Clinic');
    });
  });

  describe('4. Clinical Boundary Enforcement: Approved Notes vs Draft Isolation', () => {
    it('includes approved consultation notes shared with patient', async () => {
      const res = await getApprovedConsultationSummaries(patientA.id);
      expect(res.toolName).toBe('get_approved_consultation_summaries');
      expect(res.summary).toContain('Dr. Ananya Sharma');
      expect(res.summary).toContain('Continue Metformin 500mg');
      expect(res.sources.length).toBe(1);
      expect(res.sources[0].reference).toBe(`ConsultationNote:${approvedNoteId}`);
    });

    it('strictly excludes unapproved drafts and raw transcripts', async () => {
      const res = await getApprovedConsultationSummaries(patientA.id);
      const allText = JSON.stringify(res);
      // Draft note must never appear
      expect(allText).not.toContain(draftNoteId);
      expect(allText).not.toContain('INTERNAL CLINICIAN DRAFT');
      expect(allText).not.toContain('Confidential clinical discussion');
    });
  });

  describe('5. Conversational API Endpoints & State Machine Integration', () => {
    let testConversationId: string;

    it('POST /api/damu/interact answers glucose summary query with grounding sources and speaking mode', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'How is my blood sugar doing this month?',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('GLUCOSE_SUMMARY');
      expect(res.body.avatarMode).toBe('speaking');
      expect(res.body.sources.length).toBeGreaterThan(0);
      expect(res.body.sources[0].type).toBe('PATIENT_RECORD');
      expect(res.body.suggestedFollowUps.length).toBeGreaterThan(0);
      expect(res.body.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
      expect(res.body.conversationId).toBeDefined();

      testConversationId = res.body.conversationId;
    });

    it('POST /api/damu/interact answers medication query grounded in Med Vault prescriptions', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'What medicines should I take?',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
          conversationId: testConversationId,
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('MEDICATION_SCHEDULE');
      expect(res.body.textResponse).toContain('Metformin 500mg');
      expect(res.body.conversationId).toBe(testConversationId);
    });

    it('POST /api/damu/interact answers consultation summary grounded in approved notes', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'What did the doctor advise in my last consultation?',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
          conversationId: testConversationId,
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('CONSULTATION_SUMMARY');
      expect(res.body.textResponse).toContain('Dr. Ananya Sharma');
      expect(res.body.textResponse).toContain('Continue Metformin');
      expect(res.body.sources[0].type).toBe('CLINICAL_SUMMARY');
    });

    it('POST /api/damu/interact refuses prohibited prescription request', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Write me a prescription for insulin',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.isProhibited).toBe(true);
      expect(res.body.avatarMode).toBe('idle');
      expect(res.body.textResponse).toContain('not licensed to prescribe');
    });

    it('POST /api/damu/interact escalates emergency symptoms with 112 guidance', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'I have severe chest pain and fainted',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.emergencyEscalation).toBe(true);
      expect(res.body.emergencyNotice).toContain('112');
      expect(res.body.suggestedFollowUps).toContain('Call 112 Emergency');
    });

    it('GET /api/damu/conversations lists conversations for active patient', async () => {
      const res = await request(app)
        .get('/api/damu/conversations')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toBeDefined();
      expect(res.body.conversations.length).toBeGreaterThan(0);
      expect(res.body.conversations.some((c: any) => c.id === testConversationId)).toBe(true);
    });

    it('GET /api/damu/conversations/:id retrieves conversation thread with parsed sources', async () => {
      const res = await request(app)
        .get(`/api/damu/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testConversationId);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
      expect(res.body.messages[1].sources).toBeDefined();
    });

    it('DELETE /api/damu/conversations/:id clears conversation without deleting health observations', async () => {
      const res = await request(app)
        .delete(`/api/damu/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify conversation is gone
      const getRes = await request(app)
        .get(`/api/damu/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(getRes.status).toBe(404);

      // Verify patient health observations are completely intact
      const obsCount = await prisma.healthObservation.count({
        where: { userId: patientA.id },
      });
      expect(obsCount).toBe(6);
    });

    it('supports authorized caregiver querying on behalf of patient with x-target-patient-id', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${caregiverA.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          textPrompt: 'What medicines is my father Ramesh taking?',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-caregiver',
        });

      expect(res.status).toBe(200);
      expect(res.body.textResponse).toContain('Metformin 500mg');
    });

    it('rejects unauthorized stranger caregiver with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${caregiverStranger.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          textPrompt: 'Give me health summary',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });
});
