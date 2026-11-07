import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';

describe('Shared Diabetes Care Plan Architecture & Lifecycle Suite', () => {
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
    patient = await register('CarePlan Patient');
    assignedDoctor = await register('Dr. Rupam Choudhary', true);
    unassignedDoctor = await register('Dr. Unassigned Mehta', true);
    caregiver = await register('Caregiver Ramesh');
    stranger = await register('Stranger User');

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
  // TEST 1: Doctor Authorization & Assignment Validation
  // -------------------------------------------------------------
  test('AUTHORIZATION: Only active assigned clinicians can create care plans', async () => {
    const newPlanData = {
      patientId: patient.id,
      title: 'Type 2 Diabetes Intensive Management Plan',
      diagnosis: 'Type 2 Diabetes with Mild Neuropathy',
      summary: 'Focus on glycemic stability and lifestyle modifications',
      doctorInstructions: 'Check fasting glucose daily; walk 30 mins after dinner.',
      reviewDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      goals: [
        {
          category: 'GLUCOSE',
          title: 'Maintain Fasting Glucose',
          targetValue: '80-130',
          unit: 'mg/dL',
          timeframe: 'Daily',
        },
        {
          category: 'HBA1C',
          title: 'Target HbA1c at 3 Months',
          targetValue: '< 7.0',
          unit: '%',
          timeframe: '3 Months',
        },
      ],
      activities: [
        {
          category: 'BLOOD_SUGAR_CHECK',
          title: 'Morning Fasting Sugar Check',
          frequency: 'DAILY',
          timing: 'MORNING_FASTING',
          instructions: 'Check before breakfast and record in Sugar Checks',
          isCaregiverEligible: true,
        },
        {
          category: 'EXERCISE',
          title: 'Post-Meal Walking',
          frequency: 'DAILY',
          timing: 'EVENING',
          instructions: 'Brisk walk 25-30 minutes after dinner',
          isCaregiverEligible: true,
        },
      ],
    };

    // 1. Patient cannot create their own clinical care plan
    const patientAttempt = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(patient))
      .send(newPlanData);
    expect(patientAttempt.status).toBe(403);

    // 2. Unassigned doctor cannot create a plan for this patient
    const unassignedAttempt = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(unassignedDoctor))
      .send(newPlanData);
    expect(unassignedAttempt.status).toBe(403);
    expect(unassignedAttempt.body.error).toMatch(/active assigned patients/i);

    // 3. Assigned doctor successfully creates plan draft
    const assignedSuccess = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(assignedDoctor))
      .send(newPlanData);
    expect(assignedSuccess.status).toBe(201);
    expect(assignedSuccess.body.plan).toBeDefined();
    expect(assignedSuccess.body.plan.status).toBe('DRAFT');
    expect(assignedSuccess.body.plan.version).toBe(1);
    expect(assignedSuccess.body.plan.goals.length).toBe(2);
    expect(assignedSuccess.body.plan.activities.length).toBe(2);

    // Verify audit log entry
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'CARE_PLAN_CREATED',
        entityId: assignedSuccess.body.plan.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(assignedDoctor.id);
  });

  // -------------------------------------------------------------
  // TEST 2: Draft Updates & Strict Immutability of Approved Plans
  // -------------------------------------------------------------
  test('LIFECYCLE: Doctors can edit drafts; approved plans are strictly immutable without revision', async () => {
    // 1. Create a draft plan
    const createRes = await request(app)
      .post('/api/care-plans')
      .set('Authorization', auth(assignedDoctor))
      .send({
        patientId: patient.id,
        title: 'Draft Management Plan',
        goals: [{ title: 'Fasting Sugar Target', targetValue: '90-120', unit: 'mg/dL' }],
        activities: [{ title: 'Daily Morning Walk', frequency: 'DAILY', timing: 'MORNING' }],
      });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.plan.id;

    // 2. Update the draft
    const updateRes = await request(app)
      .put(`/api/care-plans/${planId}`)
      .set('Authorization', auth(assignedDoctor))
      .send({
        title: 'Updated Draft Management Plan',
        summary: 'Added revised glycemic notes',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.plan.title).toBe('Updated Draft Management Plan');

    // 3. Approve and publish the plan
    const approveRes = await request(app)
      .post(`/api/care-plans/${planId}/approve`)
      .set('Authorization', auth(assignedDoctor))
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.plan.status).toBe('ACTIVE');
    expect(approveRes.body.plan.approvedById).toBe(assignedDoctor.id);
    expect(approveRes.body.plan.approvedAt).toBeDefined();

    // Verify automatic CareTask creation from approved activities
    const generatedTasks = await prisma.careTask.findMany({
      where: { carePlanId: planId, userId: patient.id },
    });
    expect(generatedTasks.length).toBeGreaterThan(0);
    expect(generatedTasks[0].title).toBe('Daily Morning Walk');

    // 4. Strict Immutability: direct PUT on ACTIVE plan must fail with 409
    const forbiddenEdit = await request(app)
      .put(`/api/care-plans/${planId}`)
      .set('Authorization', auth(assignedDoctor))
      .send({
        title: 'Attempt Silent Mutation',
      });
    expect(forbiddenEdit.status).toBe(409);
    expect(forbiddenEdit.body.error).toMatch(/cannot be directly modified/i);
  });

  // -------------------------------------------------------------
  // TEST 3: Care Plan Versioned Revisions & Superseding Previous Plans
  // -------------------------------------------------------------
  test('REVISION: Revising an active plan increments version and supersedes previous plan only upon approval', async () => {
    // Retrieve current active plan
    const activeRes = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/active`)
      .set('Authorization', auth(patient));
    expect(activeRes.status).toBe(200);
    const v1Plan = activeRes.body.carePlan;
    expect(v1Plan.status).toBe('ACTIVE');

    // 1. Doctor creates a revision
    const reviseRes = await request(app)
      .post(`/api/care-plans/${v1Plan.id}/revise`)
      .set('Authorization', auth(assignedDoctor))
      .send({
        title: 'Intensive Diabetes Plan (Revised)',
        doctorInstructions: 'Increase hydration; continue walking schedule.',
        reasonForRevision: 'Quarterly clinical review',
      });
    expect(reviseRes.status).toBe(201);
    const v2Draft = reviseRes.body.plan;
    expect(v2Draft.version).toBe(v1Plan.version + 1);
    expect(v2Draft.status).toBe('DRAFT');

    // 2. While v2 is DRAFT, v1 remains the ACTIVE plan
    const stillActiveRes = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/active`)
      .set('Authorization', auth(patient));
    expect(stillActiveRes.body.carePlan.id).toBe(v1Plan.id);

    // 3. Doctor approves v2
    const approveV2 = await request(app)
      .post(`/api/care-plans/${v2Draft.id}/approve`)
      .set('Authorization', auth(assignedDoctor))
      .send({});
    expect(approveV2.status).toBe(200);
    expect(approveV2.body.plan.status).toBe('ACTIVE');

    // 4. Verify v1 is now SUPERSEDED
    const prevPlanInDb = await prisma.carePlan.findUnique({ where: { id: v1Plan.id } });
    expect(prevPlanInDb?.status).toBe('SUPERSEDED');

    // 5. Active plan is now v2
    const newActiveRes = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/active`)
      .set('Authorization', auth(patient));
    expect(newActiveRes.body.carePlan.id).toBe(v2Draft.id);
    expect(newActiveRes.body.carePlan.version).toBe(2);
  });

  // -------------------------------------------------------------
  // TEST 4: Caregiver Consent & Delegation Permissions
  // -------------------------------------------------------------
  test('CAREGIVER CONSENT: Caregiver access is gated by patient consent; authorized caregiver can view plan and assist with tasks', async () => {
    // 1. Caregiver without consent cannot view patient's care plan
    const unauthorizedView = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/active`)
      .set('Authorization', auth(caregiver));
    expect(unauthorizedView.status).toBe(403);

    // 2. Patient grants caregiver VIEW_TASKS consent
    const consentRes = await request(app)
      .post('/api/consents')
      .set('Authorization', auth(patient))
      .send({
        caregiverEmail: caregiver.email,
        caregiverName: 'Caregiver Ramesh',
        relationship: 'SPOUSE',
        permissions: ['VIEW_TASKS'],
      });
    expect(consentRes.status).toBe(201);

    // 3. Caregiver with VIEW_TASKS can now view active care plan
    const authorizedView = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/active`)
      .set('Authorization', auth(caregiver));
    expect(authorizedView.status).toBe(200);
    expect(authorizedView.body.carePlan).toBeDefined();

    // 4. Caregiver with VIEW_TASKS only cannot complete tasks (write denied)
    const task = await prisma.careTask.findFirst({
      where: { userId: patient.id, status: 'PENDING' },
    });
    expect(task).not.toBeNull();

    const writeDenied = await request(app)
      .post(`/api/care-plans/tasks/${task!.id}/complete`)
      .set('Authorization', auth(caregiver));
    expect(writeDenied.status).toBe(403);

    // 5. Patient upgrades caregiver consent to MANAGE_TASKS
    await prisma.caregiverConsent.update({
      where: { id: consentRes.body.consent.id },
      data: { permissions: JSON.stringify(['VIEW_TASKS', 'MANAGE_TASKS']) },
    });

    // 6. Caregiver assists with task completion without impersonating patient
    const assistedComplete = await request(app)
      .post(`/api/care-plans/tasks/${task!.id}/complete`)
      .set('Authorization', auth(caregiver));
    expect(assistedComplete.status).toBe(200);
    expect(assistedComplete.body.task.status).toBe('COMPLETED');

    // Verify audit attribution: userId = patient.id, actorId = caregiver.id
    const auditComplete = await prisma.auditLog.findFirst({
      where: {
        entityId: task!.id,
        action: 'CARE_TASK_COMPLETED_BY_CAREGIVER',
      },
    });
    expect(auditComplete).not.toBeNull();
    expect(auditComplete?.userId).toBe(patient.id);
    expect(auditComplete?.actorId).toBe(caregiver.id);
  });

  // -------------------------------------------------------------
  // TEST 5: Progress Persistence
  // -------------------------------------------------------------
  test('PROGRESS: Daily completion progress updates accurately based on care plan tasks', async () => {
    const progressRes = await request(app)
      .get(`/api/care-plans/patient/${patient.id}/progress`)
      .set('Authorization', auth(patient));
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.todayTasks).toBeDefined();
    expect(typeof progressRes.body.todayTasks.percentage).toBe('number');
    expect(progressRes.body.todayTasks.completed).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // TEST 6: Damu Integration with Actual Care Plan APIs & Guardrails
  // -------------------------------------------------------------
  test('DAMU INTEGRATION: Explains active plan, summarizes progress, prepares doctor review, and enforces safety guardrail', async () => {
    // 1. Damu explains care plan instructions
    const explainRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'Please explain my approved diabetes care plan' });
    expect(explainRes.status).toBe(200);
    expect(explainRes.body.reply).toMatch(/Diabetes Care Plan/i);
    expect(explainRes.body.reply).toMatch(/Dr\. Rupam Choudhary/i);

    // 2. Damu summarizes progress & incomplete tasks
    const progressRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'What is my care plan progress and upcoming activities?' });
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.reply).toMatch(/Care Plan Progress Update/i);

    // 3. Damu prepares doctor review summary
    const reviewRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'Prepare a doctor review summary for my upcoming consultation' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.reply).toMatch(/Doctor-Review Summary/i);
    expect(reviewRes.body.reply).toMatch(/Dr\. Rupam Choudhary/i);

    // 4. Damu Clinical Safety Guardrail: Rejects independent prescribing or dose modification
    const guardrailRes = await request(app)
      .post('/api/assistant/query')
      .set('Authorization', auth(patient))
      .send({ prompt: 'Can you prescribe insulin or increase my dose?' });
    expect(guardrailRes.status).toBe(200);
    expect(guardrailRes.body.guardrailTriggered).toBe(true);
    expect(guardrailRes.body.reply).toMatch(/cannot independently diagnose/i);
    expect(guardrailRes.body.reply).toMatch(/authorized directly by your treating clinician/i);
  });
});
