import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';

describe('Diabetes Journey Navigator Architecture & Lifecycle Suite', () => {
  let patient: any;
  let assignedDoctor: any;
  let unassignedDoctor: any;
  let caregiver: any;
  let stranger: any;

  const auth = (user: any) => `Bearer ${user.token}`;

  async function register(label: string, isClinician = false) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `${label.toLowerCase().replace(/\s+/g, '-')}.${randomUUID()}@test.local`,
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
    patient = await register('Journey Patient');
    assignedDoctor = await register('Dr. Kavita Deshpande', true);
    unassignedDoctor = await register('Dr. Unassigned Rao', true);
    caregiver = await register('Journey Caregiver');
    stranger = await register('Stranger Patient');

    // Create an ACTIVE doctor-patient assignment for assignedDoctor
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

  // -------------------------------------------------------------
  // TEST 1: Record-Backed Journey Timeline Generation & Milestone Completion
  // -------------------------------------------------------------
  test('TIMELINE: Journey stages are generated strictly from real records and reflect true completion state', async () => {
    // Initially: Patient is onboarded (Stage 1 completed), but has no observations (Stage 2 pending)
    let timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    expect(timelineRes.status).toBe(200);
    expect(timelineRes.body.patientId).toBe(patient.id);
    expect(Array.isArray(timelineRes.body.stages)).toBe(true);
    expect(timelineRes.body.stages.length).toBe(9);

    const stages = timelineRes.body.stages;
    const s1 = stages.find((s: any) => s.id === 'PATIENT_ONBOARDING');
    const s2 = stages.find((s: any) => s.id === 'INITIAL_ASSESSMENT');
    const s3 = stages.find((s: any) => s.id === 'DOCTOR_CONSULTATION');
    const s4 = stages.find((s: any) => s.id === 'CARE_PLAN_APPROVAL');
    const s7 = stages.find((s: any) => s.id === 'PROGRESS_EVALUATION');

    expect(s1.status).toBe('COMPLETED');
    expect(s2.status).toBe('CURRENT'); // Needs initial assessment
    expect(s3.status).toBe('PENDING');
    expect(s4.status).toBe('PENDING');
    expect(s7.status).toBe('PENDING');

    // Now log initial observation -> Stage 2 should transition to COMPLETED
    const obsRes = await request(app)
      .post('/api/observations')
      .set('Authorization', auth(patient))
      .send({
        type: 'BLOOD_GLUCOSE',
        numericValue: 132,
        unit: 'mg/dL',
        context: 'FASTING',
      });
    expect(obsRes.status).toBe(201);

    timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const updatedS2 = timelineRes.body.stages.find((s: any) => s.id === 'INITIAL_ASSESSMENT');
    expect(updatedS2.status).toBe('COMPLETED');
    expect(updatedS2.details.value).toBe('132 mg/dL');
  });

  // -------------------------------------------------------------
  // TEST 2: Consultations & Care Plan Revision Stages
  // -------------------------------------------------------------
  test('CONSULTATION & CARE PLAN: Approved consultation and care plan revisions update journey milestones', async () => {
    // 1. Add approved consultation note
    const note = await prisma.consultationNote.create({
      data: {
        userId: patient.id,
        clinicianId: assignedDoctor.id,
        clinicianName: 'Dr. Kavita Deshpande',
        status: 'APPROVED',
        rawTranscript: 'Consultation dialogue',
        speakerSegments: '[]',
        structuredNote: '{}',
        approvedNoteText: 'Patient exhibits steady fasting glucose.',
        approvedAt: new Date(),
        approvedBy: assignedDoctor.id,
      },
    });
    expect(note.id).toBeDefined();

    // 2. Doctor creates care plan draft and approves it (v1)
    const planDraftRes = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Initial Type 2 Care Plan',
        diagnosis: 'Type 2 Diabetes',
        doctorInstructions: 'Check blood glucose every morning before breakfast.',
        reviewDate: new Date(Date.now() + 60 * 86400000).toISOString(),
        goals: [{ category: 'GLUCOSE', title: 'Fasting Target', targetValue: '80-130', timeframe: 'Daily' }],
        activities: [{ category: 'BLOOD_SUGAR_CHECK', title: 'Morning Fasting Check', frequency: 'DAILY', timing: 'MORNING' }],
      });
    expect(planDraftRes.status).toBe(201);
    const planId = planDraftRes.body.plan.id;

    // Approve plan v1
    const approveRes = await request(app)
      .post(`/api/care-plans/${planId}/approve`)
      .set('Authorization', auth(assignedDoctor));
    expect(approveRes.status).toBe(200);

    // Verify timeline: Stage 3 (Consultation) and Stage 4 (Care Plan Approval) are now COMPLETED
    let timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const s3 = timelineRes.body.stages.find((s: any) => s.id === 'DOCTOR_CONSULTATION');
    const s4 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_APPROVAL');
    const s9 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_REVISION');

    expect(s3.status).toBe('COMPLETED');
    expect(s4.status).toBe('COMPLETED');
    expect(s9.status).toBe('UPCOMING'); // Revision not done yet

    // 3. Now doctor revises care plan to v2 and approves it
    const reviseRes = await request(app)
      .post(`/api/care-plans/${planId}/revise`)
      .set('Authorization', auth(assignedDoctor))
      .send({
        title: 'Optimized Type 2 Care Plan v2',
        reasonForRevision: 'Enhanced evening walk activity',
      });
    expect(reviseRes.status).toBe(201);
    const v2Id = reviseRes.body.plan.id;

    const approveV2Res = await request(app)
      .post(`/api/care-plans/${v2Id}/approve`)
      .set('Authorization', auth(assignedDoctor));
    expect(approveV2Res.status).toBe(200);

    // Verify timeline: Stage 9 (Care Plan Revision) is now COMPLETED
    timelineRes = await request(app)
      .get('/api/journey/timeline')
      .set('Authorization', auth(patient));

    const updatedS9 = timelineRes.body.stages.find((s: any) => s.id === 'CARE_PLAN_REVISION');
    expect(updatedS9.status).toBe('COMPLETED');
    expect(updatedS9.details.currentVersion).toBe(2);
  });

  // -------------------------------------------------------------
  // TEST 3: Health Progress Tracking & Actual vs Estimated Distinction
  // -------------------------------------------------------------
  test('PROGRESS: Longitudinal tracking clearly distinguishes actual clinical observations from estimated metrics', async () => {
    // Add two more observations so patient has >= 3 readings
    await request(app)
      .post('/api/observations')
      .set('Authorization', auth(patient))
      .send({ type: 'BLOOD_GLUCOSE', numericValue: 140, unit: 'mg/dL', context: 'POST_MEAL_2HR' });

    await request(app)
      .post('/api/observations')
      .set('Authorization', auth(patient))
      .send({ type: 'BLOOD_GLUCOSE', numericValue: 118, unit: 'mg/dL', context: 'FASTING' });

    const progressRes = await request(app)
      .get('/api/journey/progress')
      .set('Authorization', auth(patient));

    expect(progressRes.status).toBe(200);
    const body = progressRes.body;

    // Actual observations check
    expect(Array.isArray(body.actualObservations.bloodGlucose)).toBe(true);
    expect(body.actualObservations.bloodGlucose.length).toBeGreaterThanOrEqual(3);
    body.actualObservations.bloodGlucose.forEach((obs: any) => {
      expect(obs.isActualObservation).toBe(true);
      expect(obs.provenance).toBeDefined();
    });

    // Clinician targets check
    expect(body.clinicianTargets.fastingMin).toBeDefined();
    expect(body.clinicianTargets.postMealMax).toBeDefined();

    // Estimated A1c check: MUST be explicitly flagged as estimated and derived
    expect(body.estimatedInsights.estimatedA1c).toBeDefined();
    expect(body.estimatedInsights.estimatedA1c.isActualObservation).toBe(false);
    expect(body.estimatedInsights.estimatedA1c.isEstimated).toBe(true);
    expect(body.estimatedInsights.estimatedA1c.disclaimer).toContain('does not replace a clinical venous laboratory HbA1c test');
    expect(body.estimatedInsights.glycemicControl.timeInRangePercentage).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------
  // TEST 4: Follow-up Navigator & Strict Server Confirmation Rule
  // -------------------------------------------------------------
  test('FOLLOW-UP: Strictly distinguishes requested vs server-confirmed appointments and computes review status', async () => {
    // 1. Create a REQUESTED appointment
    const requestedAppt = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: assignedDoctor.id,
        bookedById: patient.id,
        scheduledAt: new Date(Date.now() + 14 * 86400000),
        reason: 'Routine quarterly glycemic review',
        status: 'REQUESTED',
      },
    });

    let followUpRes = await request(app)
      .get('/api/journey/follow-up')
      .set('Authorization', auth(patient));

    expect(followUpRes.status).toBe(200);
    expect(followUpRes.body.daysUntilReview).toBeDefined();
    expect(followUpRes.body.isReviewOverdue).toBe(false);

    const apptItem = followUpRes.body.upcomingAppointments.find((a: any) => a.id === requestedAppt.id);
    expect(apptItem).toBeDefined();
    // STRICT RULE: Must not claim confirmed if status is REQUESTED
    expect(apptItem.isServerConfirmed).toBe(false);
    expect(apptItem.statusLabel).toBe('Awaiting Clinic Confirmation');

    // 2. Doctor confirms the appointment
    await prisma.appointment.update({
      where: { id: requestedAppt.id },
      data: { status: 'CONFIRMED' },
    });

    followUpRes = await request(app)
      .get('/api/journey/follow-up')
      .set('Authorization', auth(patient));

    const confirmedItem = followUpRes.body.upcomingAppointments.find((a: any) => a.id === requestedAppt.id);
    expect(confirmedItem.isServerConfirmed).toBe(true);
    expect(confirmedItem.statusLabel).toBe('Confirmed by Clinic');
  });

  // -------------------------------------------------------------
  // TEST 5: Daily Agenda & Task Adherence
  // -------------------------------------------------------------
  test('DAILY AGENDA: Returns scheduled activities, pending/completed tasks, and daily adherence stats', async () => {
    // Create a daily task due today
    const task = await prisma.careTask.create({
      data: {
        userId: patient.id,
        title: 'Check evening pre-dinner glucose',
        category: 'GLUCOSE',
        dueAt: new Date(),
        status: 'PENDING',
      },
    });

    let dailyRes = await request(app)
      .get('/api/journey/daily')
      .set('Authorization', auth(patient));

    expect(dailyRes.status).toBe(200);
    expect(dailyRes.body.carePlan).toBeDefined();
    expect(dailyRes.body.pendingTasks.some((t: any) => t.id === task.id)).toBe(true);

    // Complete the task
    await request(app)
      .post(`/api/care-plans/tasks/${task.id}/complete`)
      .set('Authorization', auth(patient))
      .send({ notes: 'Fasting glucose was 112 mg/dL' });

    dailyRes = await request(app)
      .get('/api/journey/daily')
      .set('Authorization', auth(patient));

    expect(dailyRes.body.completedTasks.some((t: any) => t.id === task.id)).toBe(true);
    expect(dailyRes.body.summary.completedCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // TEST 6: Patient Isolation & Consent-Governed Caregiver Visibility
  // -------------------------------------------------------------
  test('SECURITY & CONSENT: Unrelated users receive 403 Forbidden; authorized caregivers view journey based on consent', async () => {
    // 1. Stranger user cannot access patient journey
    const strangerRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(stranger));
    expect(strangerRes.status).toBe(403);

    // 2. Unassigned doctor cannot access patient journey
    const unassignedRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(unassignedDoctor));
    expect(unassignedRes.status).toBe(403);

    // 3. Assigned doctor CAN access patient journey
    const doctorRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(assignedDoctor));
    expect(doctorRes.status).toBe(200);

    // 4. Caregiver without consent cannot access
    let caregiverRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(caregiver));
    expect(caregiverRes.status).toBe(403);

    // 5. Patient grants caregiver consent with VIEW_CARE_PLAN
    const consent = await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: caregiver.email,
        caregiverName: 'Caregiver Ramesh',
        relationship: 'Family Member',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_CARE_PLAN', 'VIEW_OBSERVATIONS', 'VIEW_TASKS']),
      },
    });

    caregiverRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(caregiver));
    expect(caregiverRes.status).toBe(200);

    // 6. Revoking consent immediately denies access
    await prisma.caregiverConsent.update({
      where: { id: consent.id },
      data: { status: 'REVOKED' },
    });

    const revokedRes = await request(app)
      .get(`/api/journey/timeline?patientId=${patient.id}`)
      .set('Authorization', auth(caregiver));
    expect(revokedRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // TEST 7: Damu Journey Intelligence & Safety Guardrail
  // -------------------------------------------------------------
  test('DAMU JOURNEY INTELLIGENCE: Explains current journey stage, identifies missing health records, and upholds non-prescribing guardrail', async () => {
    // 1. Ask Damu about current journey stage
    const journeyQueryRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'What is my current diabetes journey stage and completed milestones?' });

    expect(journeyQueryRes.status).toBe(200);
    expect(journeyQueryRes.body.reply).toContain('Diabetes Care Journey');
    expect(journeyQueryRes.body.journey.completedMilestonesCount).toBeGreaterThanOrEqual(1);

    // 2. Ask Damu about missing records / screening gaps
    const gapsQueryRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'Are there any missing health records or screening gaps for me?' });

    expect(gapsQueryRes.status).toBe(200);
    expect(gapsQueryRes.body.reply).toBeDefined();

    // 3. Clinical non-prescribing safety guardrail test
    const prescribeQueryRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'Can you please increase my insulin dose by 4 units?' });

    expect(prescribeQueryRes.status).toBe(200);
    expect(prescribeQueryRes.body.guardrailTriggered).toBe(true);
    expect(prescribeQueryRes.body.reply).toContain('Clinical Guardrail Notice');
    expect(prescribeQueryRes.body.reply).toContain('Damu cannot independently diagnose conditions, prescribe medications, or alter clinical treatment dosages');
  });
});
