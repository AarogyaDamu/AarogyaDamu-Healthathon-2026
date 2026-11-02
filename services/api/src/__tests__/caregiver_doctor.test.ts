import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';

describe('Caregiver Connect & Doctor Command Center Suite (Phase 4)', () => {
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
    patient = await register('Coordination Patient');
    assignedDoctor = await register('Dr. Sudhir Deshmukh', true);
    unassignedDoctor = await register('Dr. Pooja Sharma', true);
    caregiver = await register('Coordination Caregiver');
    stranger = await register('Unauthorized Stranger');

    // Create an ACTIVE doctor-patient assignment for assignedDoctor
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patient.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Create an active care plan for patient
    await prisma.carePlan.create({
      data: {
        patientId: patient.id,
        doctorId: assignedDoctor.id,
        version: 1,
        status: 'ACTIVE',
        title: 'Type 2 Diabetes Glycemic Control Plan v1',
        summary: 'Target fasting glucose 80-130 mg/dL, daily walks, metformin 500mg BD.',
        reviewDate: new Date(Date.now() + 14 * 86400000),
        approvedAt: new Date(),
        activities: {
          create: [
            {
              title: 'Morning fasting blood sugar test',
              category: 'MONITORING',
              frequency: 'ONCE_DAILY',
              isCaregiverEligible: true,
            },
            {
              title: 'Brisk evening walk (30 mins)',
              category: 'EXERCISE',
              frequency: 'DAILY',
              isCaregiverEligible: true,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // TEST 1: Doctor Command Center Dashboard & Patient Access Authorization
  // -------------------------------------------------------------
  test('DOCTOR DASHBOARD: Returns assigned patients, clinical indicators, and blocks unauthorized access', async () => {
    // 1. Non-clinician patient receives 403 Forbidden
    const patientAccess = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', auth(patient));
    expect(patientAccess.status).toBe(403);

    // 2. Assigned doctor retrieves dashboard data
    const doctorDash = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', auth(assignedDoctor));

    expect(doctorDash.status).toBe(200);
    expect(doctorDash.body.summary).toBeDefined();
    expect(doctorDash.body.summary.totalAssignedPatients).toBeGreaterThanOrEqual(1);
    expect(doctorDash.body.patients).toBeInstanceOf(Array);

    const foundPatient = doctorDash.body.patients.find((p: any) => p.patientId === patient.id);
    expect(foundPatient).toBeDefined();
    expect(foundPatient.name).toContain('Coordination Patient');
    expect(foundPatient.activeCarePlan).toBeDefined();
    expect(foundPatient.activeCarePlan.title).toContain('Type 2 Diabetes Glycemic Control Plan');

    // 3. Search filter by patient name
    const searchResult = await request(app)
      .get('/api/coordination/doctor/dashboard?search=coordination')
      .set('Authorization', auth(assignedDoctor));
    expect(searchResult.status).toBe(200);
    expect(searchResult.body.patients.some((p: any) => p.patientId === patient.id)).toBe(true);

    // 4. Unassigned doctor sees 0 patients for this patient
    const unassignedDash = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', auth(unassignedDoctor));
    expect(unassignedDash.status).toBe(200);
    expect(unassignedDash.body.patients.some((p: any) => p.patientId === patient.id)).toBe(false);
  });

  // -------------------------------------------------------------
  // TEST 2: Doctor Follow-up Management: Assign Tasks & Clinical Reviews
  // -------------------------------------------------------------
  test('DOCTOR MANAGEMENT: Clinician can assign follow-up tasks and record clinical reviews', async () => {
    // 1. Unassigned doctor cannot assign tasks to this patient
    const unassignedAssign = await request(app)
      .post('/api/coordination/doctor/assign-task')
      .set('Authorization', auth(unassignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Schedule annual retinal eye screening',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
    expect(unassignedAssign.status).toBe(403);

    // 2. Assigned doctor assigns task
    const assignRes = await request(app)
      .post('/api/coordination/doctor/assign-task')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Schedule annual retinal eye screening',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.task).toBeDefined();
    expect(assignRes.body.task.title).toBe('Schedule annual retinal eye screening');

    // 3. Doctor records clinical review note and updates targets
    const reviewRes = await request(app)
      .post('/api/coordination/doctor/clinical-review')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        reviewNotes: 'Glycemic control improving on current dosage. Recommended quarterly HbA1c in 3 months.',
        nextReviewDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        updateTargetFastingMin: 75,
        updateTargetFastingMax: 125,
      });
    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.review.reviewNotes).toContain('Glycemic control improving');

    // 4. Verify patient targets and active care plan review date updated
    const updatedProfile = await prisma.patientProfile.findUnique({ where: { userId: patient.id } });
    expect(updatedProfile?.targetFastingMin).toBe(75);
    expect(updatedProfile?.targetFastingMax).toBe(125);
  });

  // -------------------------------------------------------------
  // TEST 3: Caregiver Connect: Delegated Activities & Task Completion History
  // -------------------------------------------------------------
  test('CAREGIVER CONNECT: Authorized caregiver views activities, completes delegated tasks, and inspects history', async () => {
    // 1. Caregiver cannot access patient activities without active consent
    const unauthorizedActs = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/activities`)
      .set('Authorization', auth(caregiver));
    expect(unauthorizedActs.status).toBe(403);

    // 2. Patient grants caregiver consent with MANAGE_TASKS and VIEW_OBSERVATIONS
    const consentRes = await request(app)
      .post('/api/consents')
      .set('Authorization', auth(patient))
      .send({
        caregiverEmail: caregiver.email,
        caregiverName: 'Anil Deshmukh (Son)',
        relationship: 'Son',
        permissions: ['MANAGE_TASKS', 'VIEW_OBSERVATIONS', 'VIEW_CARE_PLAN'],
      });
    expect(consentRes.status).toBe(201);

    // 3. Caregiver retrieves permitted care plan activities
    const actsRes = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/activities`)
      .set('Authorization', auth(caregiver));
    expect(actsRes.status).toBe(200);
    expect(actsRes.body.hasActiveCarePlan).toBe(true);
    expect(actsRes.body.permittedActivities.length).toBeGreaterThanOrEqual(1);

    // 4. Create a delegated task for patient
    const task = await prisma.careTask.create({
      data: {
        userId: patient.id,
        title: 'Assist with evening blood glucose check',
        category: 'MONITORING',
        status: 'PENDING',
        dueAt: new Date(Date.now() + 3600000),
      },
    });

    // 5. Authorized caregiver completes the task with caregiver attribution
    const completeRes = await request(app)
      .post(`/api/care-plans/tasks/${task.id}/complete`)
      .set('Authorization', auth(caregiver))
      .send({
        notes: 'Assisted father with glucometer. Result was 118 mg/dL.',
      });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('COMPLETED');
    expect(completeRes.body.task.completedById).toBe(caregiver.id);
    expect(completeRes.body.task.completedByRole).toBe('CAREGIVER');

    // 6. Caregiver views completion history
    const historyRes = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/history`)
      .set('Authorization', auth(caregiver));
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.history.length).toBeGreaterThanOrEqual(1);
    const foundTask = historyRes.body.history.find((h: any) => h.id === task.id);
    expect(foundTask).toBeDefined();
    expect(foundTask.completedByRole).toBe('CAREGIVER');

    // 7. Caregiver requests additional access (e.g., VIEW_DOCUMENTS)
    const requestAccessRes = await request(app)
      .post('/api/coordination/caregiver/request-access')
      .set('Authorization', auth(caregiver))
      .send({
        patientId: patient.id,
        requestedPermissions: ['VIEW_DOCUMENTS'],
        reason: 'Need to review recent hospital discharge summary.',
      });
    expect(requestAccessRes.status).toBe(201);
    expect(requestAccessRes.body.success).toBe(true);
  });

  // -------------------------------------------------------------
  // TEST 4: Chronological Patient Activity Feed with Role-Based Visibility
  // -------------------------------------------------------------
  test('ACTIVITY FEED: Chronologically aggregates observations, tasks, notes, appointments, and messages', async () => {
    // 1. Unrelated stranger receives 403 Forbidden
    const strangerFeed = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(stranger));
    expect(strangerFeed.status).toBe(403);

    // 2. Patient reads their own activity feed
    const patientFeed = await request(app)
      .get('/api/coordination/activity-feed')
      .set('Authorization', auth(patient));
    expect(patientFeed.status).toBe(200);
    expect(patientFeed.body.feed).toBeInstanceOf(Array);
    expect(patientFeed.body.totalActivities).toBeGreaterThanOrEqual(1);

    // 3. Assigned doctor reads patient activity feed
    const doctorFeed = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(assignedDoctor));
    expect(doctorFeed.status).toBe(200);
    expect(doctorFeed.body.feed.some((item: any) => item.type === 'TASK' || item.type === 'CARE_PLAN')).toBe(true);

    // 4. Authorized caregiver reads dependent activity feed
    const caregiverFeed = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(caregiver));
    expect(caregiverFeed.status).toBe(200);
    expect(caregiverFeed.body.feed.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // TEST 5: Care Team Messaging, Read Receipts & Notifications
  // -------------------------------------------------------------
  test('MESSAGING & NOTIFICATIONS: Delivers structured communication, read receipts, and notification inbox', async () => {
    // 1. Patient sends question to care team
    const patientMsg = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(patient))
      .send({
        patientId: patient.id,
        category: 'QUESTION',
        content: 'Should I take metformin with or after my dinner?',
      });
    expect(patientMsg.status).toBe(201);
    expect(patientMsg.body.message.senderRole).toBe('PATIENT');

    // 2. Assigned doctor sends response
    const doctorMsg = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        category: 'DOCTOR_RESPONSE',
        content: 'Take metformin immediately after meals to reduce stomach discomfort.',
      });
    expect(doctorMsg.status).toBe(201);
    expect(doctorMsg.body.message.senderRole).toBe('DOCTOR');

    // 3. Authorized caregiver sends update
    const caregiverMsg = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(caregiver))
      .send({
        patientId: patient.id,
        category: 'CAREGIVER_UPDATE',
        content: 'Ramesh completed his 30-minute evening walk and took dinner at 8 PM.',
      });
    expect(caregiverMsg.status).toBe(201);
    expect(caregiverMsg.body.message.senderRole).toBe('CAREGIVER');

    // 4. Stranger receives 403 on message posting
    const strangerMsg = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(stranger))
      .send({
        patientId: patient.id,
        category: 'GENERAL',
        content: 'Spam message',
      });
    expect(strangerMsg.status).toBe(403);

    // 5. Patient marks doctor message as read
    const readRes = await request(app)
      .patch(`/api/coordination/messages/${doctorMsg.body.message.id}/read`)
      .set('Authorization', auth(patient));
    expect(readRes.status).toBe(200);
    expect(readRes.body.message.isRead).toBe(true);

    // 6. Notifications: Patient inspects notification inbox
    const notifsRes = await request(app)
      .get('/api/coordination/notifications')
      .set('Authorization', auth(patient));
    expect(notifsRes.status).toBe(200);
    expect(notifsRes.body.notifications.length).toBeGreaterThanOrEqual(1);

    // 7. Mark all notifications as read
    const markAllRes = await request(app)
      .post('/api/coordination/notifications/read-all')
      .set('Authorization', auth(patient));
    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.success).toBe(true);
  });

  // -------------------------------------------------------------
  // TEST 6: Consent Revocation & Immediate Privilege Termination
  // -------------------------------------------------------------
  test('CONSENT REVOCATION: Revoking caregiver consent immediately terminates all coordination access', async () => {
    // 1. Find active consent
    const consent = await prisma.caregiverConsent.findFirst({
      where: { patientId: patient.id, caregiverEmail: caregiver.email, status: 'ACTIVE' },
    });
    expect(consent).not.toBeNull();

    // 2. Patient revokes consent
    const revokeRes = await request(app)
      .delete(`/api/consents/${consent!.id}`)
      .set('Authorization', auth(patient));
    expect(revokeRes.status).toBe(200);

    // 3. Caregiver activities access is immediately terminated (403 Forbidden)
    const actsRes = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/activities`)
      .set('Authorization', auth(caregiver));
    expect(actsRes.status).toBe(403);

    // 4. Caregiver completion history access is immediately terminated (403 Forbidden)
    const historyRes = await request(app)
      .get(`/api/coordination/caregiver/dependents/${patient.id}/history`)
      .set('Authorization', auth(caregiver));
    expect(historyRes.status).toBe(403);

    // 5. Caregiver message posting is immediately blocked (403 Forbidden)
    const msgRes = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(caregiver))
      .send({
        patientId: patient.id,
        category: 'CAREGIVER_UPDATE',
        content: 'Attempting to send after revocation.',
      });
    expect(msgRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // TEST 7: SECURITY HARDENING - Granular Caregiver Permission Scopes in Activity Feed
  // -------------------------------------------------------------
  test('SECURITY HARDENING: Caregiver activity feed strictly filters categories by active consent scopes', async () => {
    // Seed diverse patient data: observation, consultation note, appointment
    await prisma.healthObservation.create({
      data: {
        userId: patient.id,
        numericValue: 128,
        unit: 'mg/dL',
        context: 'FASTING',
        observedAt: new Date(),
      },
    });

    await prisma.consultationNote.create({
      data: {
        userId: patient.id,
        clinicianId: assignedDoctor.id,
        clinicianName: 'Dr. Sudhir Deshmukh',
        status: 'APPROVED',
        rawTranscript: 'Consultation dialogue transcript',
        speakerSegments: '[]',
        structuredNote: '{}',
        approvedNoteText: 'Patient shows stable glycemic control. Advised to continue current diet and metformin.',
        approvedAt: new Date(),
        approvedBy: assignedDoctor.id,
      },
    });

    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: assignedDoctor.id,
        bookedById: patient.id,
        scheduledAt: new Date(Date.now() + 5 * 86400000),
        durationMinutes: 30,
        reason: 'Follow-up consultation',
        visitType: 'ROUTINE',
        status: 'CONFIRMED',
      },
    });

    // 1. Caregiver with ONLY task-management permission (MANAGE_TASKS)
    const taskOnlyCaregiver = await register('Task Only Caregiver');
    await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: taskOnlyCaregiver.email,
        caregiverName: 'Task Caregiver',
        relationship: 'Sibling',
        status: 'ACTIVE',
        permissions: JSON.stringify(['MANAGE_TASKS']),
      },
    });

    const taskOnlyFeedRes = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(taskOnlyCaregiver));
    expect(taskOnlyFeedRes.status).toBe(200);
    const taskOnlyFeed = taskOnlyFeedRes.body.feed;
    expect(taskOnlyFeed.length).toBeGreaterThanOrEqual(1);
    // Permitted: TASK_COMPLETED, CARE_PLAN, MESSAGE
    expect(taskOnlyFeed.every((item: any) => item.type === 'TASK_COMPLETED' || item.type === 'CARE_PLAN' || item.type === 'MESSAGE')).toBe(true);
    // Denied: OBSERVATION, CLINICAL, APPOINTMENT, CAREGIVER
    expect(taskOnlyFeed.some((item: any) => item.type === 'OBSERVATION')).toBe(false);
    expect(taskOnlyFeed.some((item: any) => item.type === 'CLINICAL')).toBe(false);
    expect(taskOnlyFeed.some((item: any) => item.type === 'APPOINTMENT')).toBe(false);

    // Direct query for OBSERVATIONS returns empty list without error or leaked counts
    const taskOnlyObsFilter = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}&type=OBSERVATIONS`)
      .set('Authorization', auth(taskOnlyCaregiver));
    expect(taskOnlyObsFilter.status).toBe(200);
    expect(taskOnlyObsFilter.body.feed).toEqual([]);
    expect(taskOnlyObsFilter.body.totalActivities).toBe(0);

    // 2. Caregiver with OBSERVATION permission but NO consultation permission
    const obsOnlyCaregiver = await register('Observation Only Caregiver');
    await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: obsOnlyCaregiver.email,
        caregiverName: 'Observation Caregiver',
        relationship: 'Nurse',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS']),
      },
    });

    const obsOnlyFeedRes = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(obsOnlyCaregiver));
    expect(obsOnlyFeedRes.status).toBe(200);
    const obsOnlyFeed = obsOnlyFeedRes.body.feed;
    expect(obsOnlyFeed.some((item: any) => item.type === 'OBSERVATION')).toBe(true);
    // Denied: CLINICAL, APPOINTMENT, TASK_COMPLETED
    expect(obsOnlyFeed.some((item: any) => item.type === 'CLINICAL')).toBe(false);
    expect(obsOnlyFeed.some((item: any) => item.type === 'APPOINTMENT')).toBe(false);
    expect(obsOnlyFeed.some((item: any) => item.type === 'TASK_COMPLETED')).toBe(false);

    // Direct query for CLINICAL returns empty
    const obsOnlyClinicalFilter = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}&type=CLINICAL`)
      .set('Authorization', auth(obsOnlyCaregiver));
    expect(obsOnlyClinicalFilter.status).toBe(200);
    expect(obsOnlyClinicalFilter.body.feed).toEqual([]);
    expect(obsOnlyClinicalFilter.body.totalActivities).toBe(0);

    // 3. Caregiver with MULTIPLE permissions (VIEW_OBSERVATIONS + MANAGE_TASKS) but NO consultation permission
    const multiCaregiver = await register('Multi Perm Caregiver');
    await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: multiCaregiver.email,
        caregiverName: 'Multi Caregiver',
        relationship: 'Spouse',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_TASKS']),
      },
    });

    const multiFeedRes = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(multiCaregiver));
    expect(multiFeedRes.status).toBe(200);
    const multiFeed = multiFeedRes.body.feed;
    expect(multiFeed.some((item: any) => item.type === 'OBSERVATION')).toBe(true);
    expect(multiFeed.some((item: any) => item.type === 'TASK_COMPLETED')).toBe(true);
    expect(multiFeed.some((item: any) => item.type === 'CLINICAL')).toBe(false);
    expect(multiFeed.some((item: any) => item.type === 'APPOINTMENT')).toBe(false);

    // 4. Caregiver with EXPIRED consent
    const expiredCaregiver = await register('Expired Consent Caregiver');
    await prisma.caregiverConsent.create({
      data: {
        patientId: patient.id,
        caregiverEmail: expiredCaregiver.email,
        caregiverName: 'Expired Caregiver',
        relationship: 'Friend',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_TASKS', 'VIEW_CONSULTATIONS']),
      },
    });

    const expiredFeedRes = await request(app)
      .get(`/api/coordination/activity-feed?patientId=${patient.id}`)
      .set('Authorization', auth(expiredCaregiver));
    expect(expiredFeedRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // TEST 8: SECURITY HARDENING - Clinical Details Absent from Notification Previews
  // -------------------------------------------------------------
  test('SECURITY HARDENING: Clinical review notification previews do not leak medical notes or diagnoses', async () => {
    const sensitiveNote = 'Severe peripheral neuropathy suspected. Increase metformin to 1000mg BD and start pregabalin 75mg nocte.';
    const reviewRes = await request(app)
      .post('/api/coordination/doctor/clinical-review')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        reviewNotes: sensitiveNote,
        nextReviewDate: new Date(Date.now() + 45 * 86400000).toISOString(),
      });
    expect(reviewRes.status).toBe(201);

    // Inspect the generated notification record
    const notif = await prisma.careNotification.findFirst({
      where: {
        userId: patient.id,
        type: 'FOLLOW_UP_DUE',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(notif).not.toBeNull();
    // Notification MUST use the generic preview wording
    expect(notif!.message).toBe('Your doctor has recorded a clinical review note. Open AarogyaDamu to view details.');
    // Notification MUST NOT leak diagnosis, drug names, dosage, or raw text
    expect(notif!.message).not.toContain('neuropathy');
    expect(notif!.message).not.toContain('metformin');
    expect(notif!.message).not.toContain('pregabalin');
    expect(notif!.message).not.toContain('1000mg');
  });

  // -------------------------------------------------------------
  // TEST 9: SECURITY HARDENING - Deduplication of Notification Recipients
  // -------------------------------------------------------------
  test('SECURITY HARDENING: Deduplicates notification recipients in overlapping or multiple assignments', async () => {
    // Create a new patient with duplicate/overlapping active doctor assignments
    const multiDoctorPatient = await register('Multi Assignment Patient');
    const doctor2 = await register('Dr. Kavita Rao', true);

    // Assignment 1: assignedDoctor
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: multiDoctorPatient.id,
        status: 'ACTIVE',
      },
    });

    // Assignment 2: doctor2
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctor2.id,
        patientId: multiDoctorPatient.id,
        status: 'ACTIVE',
      },
    });

    // Clear prior notifications for these doctors
    await prisma.careNotification.deleteMany({
      where: { patientId: multiDoctorPatient.id },
    });

    // Patient sends a message to care team
    const sendRes = await request(app)
      .post('/api/coordination/messages')
      .set('Authorization', auth(multiDoctorPatient))
      .send({
        patientId: multiDoctorPatient.id,
        category: 'QUESTION',
        content: 'I have a question about my blood glucose levels.',
      });
    expect(sendRes.status).toBe(201);

    // Query notifications created for this event
    const notifications = await prisma.careNotification.findMany({
      where: { patientId: multiDoctorPatient.id },
    });

    const recipientIds = notifications.map((n) => n.userId);
    const uniqueRecipientIds = Array.from(new Set(recipientIds));

    // Each recipient must appear exactly once: no duplicate notifications
    expect(recipientIds.length).toBe(uniqueRecipientIds.length);
    expect(recipientIds).toContain(assignedDoctor.id);
    expect(recipientIds).toContain(doctor2.id);
    // The sender (patient) must not receive a notification for their own message
    expect(recipientIds).not.toContain(multiDoctorPatient.id);
  });
});

