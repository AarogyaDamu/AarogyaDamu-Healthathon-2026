import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';
import { deletePrivateFile } from '../services/storageService';

describe('Phase 5 — Pilot Readiness & Synthetic Patient End-to-End Lifecycle Suite', () => {
  let patient: any;
  let assignedDoctor: any;
  let unassignedDoctor: any;
  let caregiver: any;
  let stranger: any;

  let activeCarePlanId: string;
  let delegatedTaskId: string;
  let activeConsentId: string;
  let appointmentId: string;

  const auth = (user: any) => `Bearer ${user.token}`;

  async function registerUser(label: string, isClinician = false) {
    const email = `${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${randomUUID()}@aarogyadamu.local`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'Password123!',
        fullName: label,
      });

    expect(res.status).toBe(201);
    const user = { token: res.body.token, ...res.body.user };

    if (isClinician) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isClinician: true },
      });
      user.isClinician = true;
    }

    return user;
  }

  beforeAll(async () => {
    // Register all role actors with distinct identities
    patient = await registerUser('Ramesh Deshmukh');
    assignedDoctor = await registerUser('Dr. Rupam Choudhary (Diabetologist)', true);
    unassignedDoctor = await registerUser('Dr. Vikram Rao', true);
    caregiver = await registerUser('Meera Joshi');
    stranger = await registerUser('Unrelated Stranger');

    // Create active doctor-patient assignment for assignedDoctor
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patient.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // TASK 2 — SEQUENTIAL MULTI-ROLE SYNTHETIC PATIENT LIFECYCLE
  // =========================================================================

  test('STEP 1: Patient Clinical Onboarding updates profile and advances timeline', async () => {
    // 1. Verify initial timeline shows onboarding stage
    let timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));
    expect(timelineRes.status).toBe(200);

    // 2. Complete clinical onboarding via POST /api/profile/onboarding
    const onboardingRes = await request(app)
      .post('/api/profile/onboarding')
      .set('Authorization', auth(patient))
      .send({
        fullName: 'Ramesh Deshmukh',
        diabetesType: 'TYPE_2_DIABETES',
        diagnosisYear: 2021,
        primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
        knownAllergies: 'Sulfa drugs',
        targetFastingMin: 80,
        targetFastingMax: 130,
        targetPostMealMax: 180,
      });

    expect(onboardingRes.status).toBe(201);
    expect(onboardingRes.body.profile).toBeDefined();
    expect(onboardingRes.body.profile.primaryClinician).toBe('Dr. Rupam Choudhary (Diabetologist)');
    expect(onboardingRes.body.profile.targetFastingMin).toBe(80);
    expect(onboardingRes.body.profile.targetFastingMax).toBe(130);

    // 3. Confirm Stage 1 (PATIENT_ONBOARDING) is COMPLETED and Stage 2 (INITIAL_ASSESSMENT) is CURRENT
    timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));
    expect(timelineRes.status).toBe(200);

    const stages = timelineRes.body.stages;
    const s1 = stages.find((s: any) => s.id === 'PATIENT_ONBOARDING');
    const s2 = stages.find((s: any) => s.id === 'INITIAL_ASSESSMENT');
    expect(s1.status).toBe('COMPLETED');
    expect(s2.status).toBe('CURRENT');
  });

  test('STEP 2: Baseline Glucose Observation logging marks Stage 2 COMPLETED', async () => {
    // Log initial fasting glucose observation
    const obsRes = await request(app)
      .post('/api/observations')
      .set('Authorization', auth(patient))
      .send({
        type: 'BLOOD_GLUCOSE',
        numericValue: 142,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Baseline pilot fasting observation',
      });

    expect(obsRes.status).toBe(201);
    expect(obsRes.body.observation.numericValue).toBe(142);
    expect(obsRes.body.observation.provenance).toBe('PATIENT_ENTERED');

    // Verify timeline transition: Stage 2 (INITIAL_ASSESSMENT) completes, Stage 3 is PENDING (until appointment or note)
    const timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const s2 = timelineRes.body.stages.find((s: any) => s.id === 'INITIAL_ASSESSMENT');
    const s3 = timelineRes.body.stages.find((s: any) => s.id === 'DOCTOR_CONSULTATION');
    expect(s2.status).toBe('COMPLETED');
    expect(s2.details.value).toBe('142 mg/dL');
    expect(s3.status).toBe('PENDING');
  });

  test('STEP 3: Consultation Preparation & Approved Clinical Note marks Stage 3 COMPLETED', async () => {
    // 1. Patient prepares consultation notes
    const prepRes = await request(app)
      .post('/api/consultations/prepare')
      .set('Authorization', auth(patient))
      .send({
        concernsAndQuestions: 'Fasting glucose consistently elevated above 140 mg/dL. Morning lethargy.',
        personalNotes: 'Checked glucometer daily for the past week.',
      });

    expect(prepRes.status).toBe(201);
    expect(prepRes.body.consultationPrep).toBeDefined();

    // 2. Doctor conducts consultation and an approved clinical note is recorded
    const note = await prisma.consultationNote.create({
      data: {
        userId: patient.id,
        clinicianId: assignedDoctor.id,
        clinicianName: 'Dr. Rupam Choudhary (Diabetologist)',
        status: 'APPROVED',
        rawTranscript: 'Consultation dialogue covering elevated fasting glucose.',
        speakerSegments: '[]',
        structuredNote: JSON.stringify({
          chiefComplaint: 'Fasting glucose elevated',
          assessment: 'Suboptimal glycemic control',
        }),
        approvedNoteText: 'Initiate structured diabetes care plan with daily morning monitoring and lifestyle activity.',
        approvedAt: new Date(),
        approvedBy: assignedDoctor.id,
      },
    });
    expect(note.id).toBeDefined();

    // 3. Verify timeline: Stage 3 (DOCTOR_CONSULTATION) is COMPLETED and Stage 4 is PENDING (until draft created)
    const timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const s3 = timelineRes.body.stages.find((s: any) => s.id === 'DOCTOR_CONSULTATION');
    const s4 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_APPROVAL');
    expect(s3.status).toBe('COMPLETED');
    expect(s4.status).toBe('PENDING');
  });

  test('STEP 4: Doctor creates CarePlan v1, approves it, and revises to v2', async () => {
    // 1. Doctor creates draft CarePlan v1
    const createDraftRes = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Type 2 Diabetes Glycemic Stabilization Plan v1',
        diagnosis: 'Type 2 Diabetes Mellitus',
        doctorInstructions: 'Check fasting glucose daily before breakfast. 30-minute evening walk.',
        reviewDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        goals: [
          { category: 'GLUCOSE', title: 'Fasting Glucose Target', targetValue: '80-130', timeframe: 'Daily' },
          { category: 'LIFESTYLE', title: 'Evening Brisk Walk', targetValue: '30 mins/day', timeframe: 'Daily' },
        ],
        activities: [
          { category: 'BLOOD_SUGAR_CHECK', title: 'Morning Fasting Blood Sugar', frequency: 'DAILY', timing: 'MORNING' },
          { category: 'EXERCISE', title: 'Brisk Walk Post Dinner', frequency: 'DAILY', timing: 'EVENING' },
        ],
      });

    expect(createDraftRes.status).toBe(201);
    const planV1 = createDraftRes.body.plan;
    expect(planV1.version).toBe(1);
    expect(planV1.status).toBe('DRAFT');
    activeCarePlanId = planV1.id;

    // 2. Doctor approves CarePlan v1
    const approveV1Res = await request(app)
      .post(`/api/care-plans/${activeCarePlanId}/approve`)
      .set('Authorization', auth(assignedDoctor));

    expect(approveV1Res.status).toBe(200);
    expect(approveV1Res.body.plan.status).toBe('ACTIVE');
    expect(approveV1Res.body.plan.approvedAt).toBeDefined();

    // 3. Verify timeline: Stage 4 (CARE_PLAN_APPROVAL) is now COMPLETED
    let timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const s4 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_APPROVAL');
    expect(s4.status).toBe('COMPLETED');

    // 4. Doctor revises CarePlan to v2
    const reviseRes = await request(app)
      .post(`/api/care-plans/${activeCarePlanId}/revise`)
      .set('Authorization', auth(assignedDoctor))
      .send({
        title: 'Type 2 Diabetes Glycemic Stabilization Plan v2',
        reasonForRevision: 'Optimized exercise protocol and tightened fasting glycemic band',
      });

    expect(reviseRes.status).toBe(201);
    const planV2 = reviseRes.body.plan;
    expect(planV2.version).toBe(2);
    expect(planV2.status).toBe('DRAFT');

    // 5. Doctor approves CarePlan v2
    const approveV2Res = await request(app)
      .post(`/api/care-plans/${planV2.id}/approve`)
      .set('Authorization', auth(assignedDoctor));

    expect(approveV2Res.status).toBe(200);
    expect(approveV2Res.body.plan.status).toBe('ACTIVE');
    activeCarePlanId = planV2.id;

    // 6. Verify timeline: Stage 9 (CARE_PLAN_REVISION) is COMPLETED
    timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const s9 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_REVISION');
    expect(s9.status).toBe('COMPLETED');
    expect(s9.details.currentVersion).toBe(2);
  });

  test('STEP 5: Caregiver Consent grant, Delegated Task completion, and Attribution', async () => {
    // 1. Patient grants explicit scoped consent to caregiver
    const consentRes = await request(app)
      .post('/api/consents')
      .set('Authorization', auth(patient))
      .send({
        caregiverEmail: caregiver.email,
        caregiverName: 'Meera Joshi',
        relationship: 'Daughter',
        permissions: ['MANAGE_TASKS', 'VIEW_OBSERVATIONS', 'VIEW_CARE_PLAN'],
      });

    expect(consentRes.status).toBe(201);
    expect(consentRes.body.consent).toBeDefined();
    expect(consentRes.body.consent.status).toBe('ACTIVE');
    activeConsentId = consentRes.body.consent.id;

    // 2. Doctor assigns a care task
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Fasting Blood Sugar Log Assistance',
        category: 'MONITORING',
        dueAt: new Date(Date.now() + 1800000).toISOString(),
      });

    expect(taskRes.status).toBe(201);
    delegatedTaskId = taskRes.body.task.id;

    // 3. Caregiver completes the delegated task
    const completeRes = await request(app)
      .post(`/api/care-plans/tasks/${delegatedTaskId}/complete`)
      .set('Authorization', auth(caregiver))
      .send({ notes: 'Assisted patient with morning fingerprick test.' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('COMPLETED');

    // 4. Attribution check:
    // - Patient remains the beneficiary (task.userId === patient.id)
    // - Caregiver is recorded as the actor (completedById === caregiver.id, completedByRole === 'CAREGIVER')
    expect(completeRes.body.task.userId).toBe(patient.id);
    expect(completeRes.body.task.completedById).toBe(caregiver.id);
    expect(completeRes.body.task.completedByRole).toBe('CAREGIVER');

    // 5. Task completion idempotency check under rapid double-submission:
    const repeatComplete = await request(app)
      .post(`/api/care-plans/tasks/${delegatedTaskId}/complete`)
      .set('Authorization', auth(caregiver))
      .send({ notes: 'Duplicate submission attempt' });

    expect(repeatComplete.status).toBe(200);
    expect(repeatComplete.body.task.status).toBe('COMPLETED');
    expect(repeatComplete.body.task.completedById).toBe(caregiver.id);
    expect(repeatComplete.body.task.completedByRole).toBe('CAREGIVER');
  });

  test('STEP 6: Daily Agenda & Adherence reflects active CarePlan v2 and completed tasks', async () => {
    const agendaRes = await request(app)
      .get('/api/journey/daily')
      .set('Authorization', auth(patient));

    expect(agendaRes.status).toBe(200);
    expect(agendaRes.body.patientId).toBe(patient.id);
    expect(agendaRes.body.carePlan).toBeDefined();
    expect(agendaRes.body.carePlan.version).toBe(2);
    expect(agendaRes.body.completedTasks).toBeInstanceOf(Array);

    const taskInAgenda = agendaRes.body.completedTasks.find((t: any) => t.id === delegatedTaskId);
    expect(taskInAgenda).toBeDefined();
    expect(agendaRes.body.summary).toBeDefined();
    expect(agendaRes.body.summary.adherencePercentage).toBeGreaterThanOrEqual(0);
  });

  test('STEP 7: Doctor Clinical Review and Target-Range updates', async () => {
    const reviewRes = await request(app)
      .post('/api/coordination/doctor/clinical-review')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        reviewNotes: 'Steady glycemic response observed. Fasting target tightened to 75-125 mg/dL.',
        nextReviewDate: new Date(Date.now() + 28 * 86400000).toISOString(),
        updateTargetFastingMin: 75,
        updateTargetFastingMax: 125,
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.review.reviewNotes).toContain('Steady glycemic response');

    // Verify patient profile reflects the new target range
    const updatedProfile = await prisma.patientProfile.findUnique({
      where: { userId: patient.id },
    });
    expect(updatedProfile?.targetFastingMin).toBe(75);
    expect(updatedProfile?.targetFastingMax).toBe(125);
  });

  test('STEP 8: Follow-up Appointment Creation and Confirmation', async () => {
    // 1. Patient schedules follow-up appointment with assigned doctor
    const scheduledTime = new Date(Date.now() + 7 * 86400000).toISOString();
    const apptRes = await request(app)
      .post('/api/coordination/appointments')
      .set('Authorization', auth(patient))
      .send({
        doctorId: assignedDoctor.id,
        scheduledAt: scheduledTime,
        durationMinutes: 30,
        reason: 'Four-week glycemic progress review and prescription evaluation',
        idempotencyKey: randomUUID(),
      });

    expect(apptRes.status).toBe(201);
    expect(apptRes.body.appointment).toBeDefined();
    expect(apptRes.body.appointment.status).toBe('REQUESTED');
    appointmentId = apptRes.body.appointment.id;

    // 2. Doctor confirms appointment
    const confirmRes = await request(app)
      .patch(`/api/coordination/appointments/${appointmentId}/status`)
      .set('Authorization', auth(assignedDoctor))
      .send({ status: 'CONFIRMED' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.appointment.status).toBe('CONFIRMED');

    // 3. Confirm appointment appears in patient's appointments list
    const patientAppts = await request(app)
      .get(`/api/coordination/appointments?patientId=${patient.id}`)
      .set('Authorization', auth(patient));

    expect(patientAppts.status).toBe(200);
    expect(patientAppts.body.appointments.some((a: any) => a.id === appointmentId && a.status === 'CONFIRMED')).toBe(true);
  });

  test('STEP 9: Assigned doctor uploads a report into the selected patient Health Vault', async () => {
    const minimalPngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const uploadRes = await request(app)
      .post('/api/documents/upload-report')
      .set('Authorization', auth(assignedDoctor))
      .set('X-Target-Patient-Id', patient.id)
      .field('title', 'Synthetic HbA1c report')
      .field('issuingFacility', 'Synthetic clinic')
      .attach('file', minimalPngSignature, {
        filename: 'synthetic-hba1c.png',
        contentType: 'image/png',
      });

    expect(uploadRes.status).toBe(202);
    expect(uploadRes.body.document.processingStatus).toBe('PENDING');
    const saved = await prisma.healthDocument.findUnique({ where: { id: uploadRes.body.document.id } });
    expect(saved?.userId).toBe(patient.id);
    expect(saved?.mimeType).toBe('image/png');

    // Let the real asynchronous OCR worker settle before cleaning up its row/file.
    let settled = saved;
    for (let attempt = 0; attempt < 20 && settled?.processingStatus === 'PENDING'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      settled = await prisma.healthDocument.findUnique({ where: { id: saved!.id } });
    }
    expect(settled?.processingStatus).toMatch(/NEEDS_REVIEW|OCR_NO_TEXT|EXTRACTION_FAILED/);

    const patientVault = await request(app)
      .get('/api/documents')
      .set('Authorization', auth(patient));
    expect(patientVault.status).toBe(200);
    expect(patientVault.body.documents.some((doc: any) => doc.id === saved?.id)).toBe(true);

    if (saved) {
      if (saved.storagePath) await deletePrivateFile(saved.storagePath);
      await prisma.healthDocument.delete({ where: { id: saved.id } });
    }
  }, 15000);

  // =========================================================================
  // TASK 3 — CROSS-ROLE CONSISTENCY & AUTHORIZATION BOUNDARY ENFORCEMENT
  // =========================================================================

  test('AUTH 1: Assigned Doctor has access; Unassigned Doctor receives 403 Forbidden', async () => {
    // Assigned doctor dashboard includes patient
    const assignedDash = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', auth(assignedDoctor));
    expect(assignedDash.status).toBe(200);
    expect(assignedDash.body.patients.some((p: any) => p.patientId === patient.id)).toBe(true);

    // Assigned doctor can view patient activity feed
    const assignedFeed = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(assignedDoctor));
    expect(assignedFeed.status).toBe(200);

    // Unassigned doctor cannot assign tasks to patient
    const unassignedTask = await request(app)
      .post('/api/coordination/doctor/assign-task')
      .set('Authorization', auth(unassignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Unassigned doctor task assignment',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(unassignedTask.status).toBe(403);

    // Unassigned doctor cannot conduct clinical review
    const unassignedReview = await request(app)
      .post('/api/coordination/doctor/clinical-review')
      .set('Authorization', auth(unassignedDoctor))
      .send({
        patientId: patient.id,
        reviewNotes: 'Unauthorized clinical review note',
        nextReviewDate: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(unassignedReview.status).toBe(403);
  });

  test('AUTH 2: Caregiver scope enforcement blocks unpermitted categories', async () => {
    // Caregiver has MANAGE_TASKS, VIEW_OBSERVATIONS, VIEW_CARE_PLAN.
    // Caregiver does NOT have VIEW_DOCUMENTS permission.
    const docAccess = await request(app)
      .get('/api/documents')
      .set('Authorization', auth(caregiver))
      .set('X-Target-Patient-Id', patient.id);
    expect(docAccess.status).toBe(403);

    // Caregiver CAN access permitted observations
    const obsAccess = await request(app)
      .get('/api/observations')
      .set('Authorization', auth(caregiver))
      .set('X-Target-Patient-Id', patient.id);
    expect(obsAccess.status).toBe(200);
    expect(obsAccess.body.observations).toBeInstanceOf(Array);
  });

  test('AUTH 3: Cross-patient ID substitution is rejected consistently', async () => {
    // Caregiver attempts to access stranger's activities using caregiver token
    const strangerActs = await request(app)
      .get(`/api/coordination/caregiver/dependents/${stranger.id}/activities`)
      .set('Authorization', auth(caregiver));
    expect(strangerActs.status).toBe(403);

    // Stranger attempts to access patient's activity feed
    const strangerFeed = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(stranger));
    expect(strangerFeed.status).toBe(403);
  });

  test('AUTH 4: Consent Revocation blocks all subsequent caregiver access', async () => {
    // 1. Patient revokes consent
    const revokeRes = await request(app)
      .delete(`/api/consents/${activeConsentId}`)
      .set('Authorization', auth(patient));
    expect(revokeRes.status).toBe(200);

    // 2. Caregiver attempts to view observations -> 403 Forbidden
    const deniedObs = await request(app)
      .get('/api/observations')
      .set('Authorization', auth(caregiver))
      .set('X-Target-Patient-Id', patient.id);
    expect(deniedObs.status).toBe(403);

    // 3. Caregiver attempts to view activities -> 403 Forbidden
    const deniedActs = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/activities`)
      .set('Authorization', auth(caregiver));
    expect(deniedActs.status).toBe(403);
  });

  test('AUTH 5: Expired Consent blocks delegated access', async () => {
    // Create an expired consent directly
    const expiredConsent = await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: stranger.email,
        caregiverName: 'Expired Caregiver',
        relationship: 'Acquaintance',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_TASKS']),
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    const deniedExpired = await request(app)
      .get('/api/observations')
      .set('Authorization', auth(stranger))
      .set('X-Target-Patient-Id', patient.id);

    expect(deniedExpired.status).toBe(403);

    // Clean up
    await prisma.caregiverConsent.delete({ where: { id: expiredConsent.id } });
  });

  test('AUTH 6: Message visibility and read receipts remain role-protected', async () => {
    // 1. Patient sends a care team question
    const msgRes = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(patient))
      .send({
        patientId: patient.id,
        category: 'QUESTION',
        content: 'Should I check fasting blood glucose immediately upon waking up?',
      });

    expect(msgRes.status).toBe(201);
    const messageId = msgRes.body.message.id;

    // 2. Assigned doctor can read messages
    const doctorMsgs = await request(app)
      .get(`/api/coordination/messages?patientId=${patient.id}`)
      .set('Authorization', auth(assignedDoctor));
    expect(doctorMsgs.status).toBe(200);
    expect(doctorMsgs.body.messages.some((m: any) => m.id === messageId)).toBe(true);

    // 3. Assigned doctor marks read receipt
    const markReadRes = await request(app)
      .patch(`/api/coordination/messages/${messageId}/read`)
      .set('Authorization', auth(assignedDoctor));
    expect(markReadRes.status).toBe(200);

    // 4. Stranger cannot read messages
    const strangerMsgs = await request(app)
      .get(`/api/coordination/messages?patientId=${patient.id}`)
      .set('Authorization', auth(stranger));
    expect(strangerMsgs.status).toBe(403);

    // 5. Stranger cannot mark read
    const strangerRead = await request(app)
      .patch(`/api/coordination/messages/${messageId}/read`)
      .set('Authorization', auth(stranger));
    expect(strangerRead.status).toBe(403);
  });

  test('AUTH 7: Browser Client (Expo Web / Mobile Web) CORS Preflight and Registration Verification', async () => {
    // 1. Verify OPTIONS preflight allows Accept and Content-Type headers from web client
    const preflight = await request(app)
      .options('/api/auth/register')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,accept');

    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toMatch(/(\*|http:\/\/localhost:8081)/);
    const allowHeaders = preflight.headers['access-control-allow-headers']?.toLowerCase() || '';
    expect(allowHeaders).toContain('accept');
    expect(allowHeaders).toContain('content-type');

    // 2. Perform registration from browser origin
    const regRes = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:8081')
      .send({
        email: `browser.web.${randomUUID()}@aarogyadamu.local`,
        password: 'Password123!',
        fullName: 'Browser Web Patient',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    expect(regRes.body.user.id).toBeDefined();

    // 3. Perform login from browser origin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:8081')
      .send({
        email: regRes.body.user.email,
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });
});
