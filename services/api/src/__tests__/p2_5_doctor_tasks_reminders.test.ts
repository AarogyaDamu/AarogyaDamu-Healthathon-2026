import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

describe('Phase 2.5: Doctor-Managed Tasks, Reminders & Patient Adherence Tracking Suite', () => {
  let patientA: { id: string; email: string; token: string; fullName: string };
  let patientB: { id: string; email: string; token: string; fullName: string };
  let assignedDoctor: { id: string; email: string; token: string; fullName: string };
  let unassignedDoctor: { id: string; email: string; token: string; fullName: string };
  let authorizedCaregiver: { id: string; email: string; token: string; fullName: string };
  let unauthorizedCaregiver: { id: string; email: string; token: string; fullName: string };
  let revokedCaregiver: { id: string; email: string; token: string; fullName: string };

  let task1Id: string;
  let task2Id: string;
  let task3Id: string;
  let reminder1Id: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecureClinPass123!', 10);

    async function createUser(role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER', name: string, isClinician = false) {
      const email = `test.${role.toLowerCase()}.${Date.now()}.${Math.random().toString(36).substring(7)}@aarogyadamu.test`;
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
        password: 'SecureClinPass123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
        fullName: name,
      };
    }

    patientA = await createUser('PATIENT', 'Aarav Patel');
    patientB = await createUser('PATIENT', 'Bhavna Sharma');
    assignedDoctor = await createUser('DOCTOR', 'Dr. Ramesh Deshmukh, MD', true);
    unassignedDoctor = await createUser('DOCTOR', 'Dr. Sunita Kulkarni, MD', true);
    authorizedCaregiver = await createUser('CAREGIVER', 'Priya Patel (Authorized)');
    unauthorizedCaregiver = await createUser('CAREGIVER', 'Neha Nurse (Unauthorized for Tasks)');
    revokedCaregiver = await createUser('CAREGIVER', 'Rohit Relative (Revoked)');

    // Active DoctorPatientAssignment for assignedDoctor -> patientA
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Caregiver consent with COMPLETE_TASKS_ON_BEHALF for authorizedCaregiver -> patientA
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: authorizedCaregiver.email,
        caregiverName: 'Priya Patel',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      },
    });

    // Caregiver consent with VIEW_TASKS only (no task completion) for unauthorizedCaregiver -> patientA
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: unauthorizedCaregiver.email,
        caregiverName: 'Neha Nurse',
        relationship: 'Nurse',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_TASKS']),
      },
    });

    // Revoked caregiver consent for revokedCaregiver -> patientA
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: revokedCaregiver.email,
        caregiverName: 'Rohit Relative',
        relationship: 'Brother',
        status: 'REVOKED',
        permissions: JSON.stringify(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']),
      },
    });
  });

  afterAll(async () => {
    const userIds = [
      patientA.id,
      patientB.id,
      assignedDoctor.id,
      unassignedDoctor.id,
      authorizedCaregiver.id,
      unauthorizedCaregiver.id,
      revokedCaregiver.id,
    ];
    await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careTask.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // Scenario 1: Assigned doctor creates a task
  test('1. Assigned doctor creates a task', async () => {
    const res = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Record fasting blood sugar',
        category: 'BLOOD_SUGAR_CHECK',
        instructions: 'Check before breakfast and log result in journal',
        priority: 'HIGH',
        frequency: 'DAILY',
        recurrence: 'Every morning at 8:00 AM',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        clinicalNotes: 'Target fasting between 80-130 mg/dL',
      });

    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.title).toBe('Record fasting blood sugar');
    expect(res.body.task.category).toBe('BLOOD_SUGAR_CHECK');
    expect(res.body.task.instructions).toBe('Check before breakfast and log result in journal');
    expect(res.body.task.priority).toBe('HIGH');
    expect(res.body.task.frequency).toBe('DAILY');
    expect(res.body.task.assignedById).toBe(assignedDoctor.id);
    expect(res.body.task.status).toBe('PENDING');

    task1Id = res.body.task.id;

    // Verify patient notification was created
    const notif = await prisma.careNotification.findFirst({
      where: {
        userId: patientA.id,
        type: 'TASK_ASSIGNED',
      },
    });
    expect(notif).not.toBeNull();
    expect(notif?.title).toBe('New Clinical Task Assigned');
  });

  // Scenario 2: Unassigned doctor cannot create a task
  test('2. Unassigned doctor cannot create a task', async () => {
    const res = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${unassignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Walk for 20 minutes',
        category: 'PHYSICAL_ACTIVITY',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/assigned/i);
  });

  // Scenario 3: Patient receives the assigned task
  test('3. Patient receives the assigned task', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    const found = res.body.tasks.find((t: any) => t.id === task1Id);
    expect(found).toBeDefined();
    expect(found.title).toBe('Record fasting blood sugar');
    expect(found.instructions).toBe('Check before breakfast and log result in journal');
    expect(found.assigningDoctorName).toBe('Dr. Ramesh Deshmukh, MD');
  });

  // Scenario 4: Patient can view task details
  test('4. Patient can view task details', async () => {
    const res = await request(app)
      .get(`/api/tasks/${task1Id}`)
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.id).toBe(task1Id);
    expect(res.body.task.title).toBe('Record fasting blood sugar');
    expect(res.body.task.instructions).toBe('Check before breakfast and log result in journal');
    expect(res.body.task.priority).toBe('HIGH');
  });

  // Scenario 5: Patient cannot create tasks
  test('5. Patient cannot create tasks', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        title: 'Patient self-created task',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/authorized clinician/i);
  });

  // Scenario 6: Patient cannot alter instructions
  test('6. Patient cannot alter instructions', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${task1Id}`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        instructions: 'Altered by patient without clinical review',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/authorized clinician/i);
  });

  // Scenario 7: Patient completes a task
  test('7. Patient completes a task', async () => {
    const res = await request(app)
      .post(`/api/tasks/${task1Id}/complete`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(200);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.status).toBe('COMPLETED');
    expect(res.body.task.completedAt).toBeDefined();
  });

  // Scenario 8: Doctor sees completion
  test('8. Doctor sees completion', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(res.status).toBe(200);
    const found = res.body.tasks.find((t: any) => t.id === task1Id);
    expect(found).toBeDefined();
    expect(found.status).toBe('COMPLETED');
  });

  // Scenario 9: Completion timestamp is accurate
  test('9. Completion timestamp is accurate', async () => {
    const res = await request(app)
      .get(`/api/tasks/${task1Id}`)
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(res.status).toBe(200);
    const completedAt = new Date(res.body.task.completedAt).getTime();
    const now = Date.now();
    expect(Math.abs(now - completedAt)).toBeLessThan(15000); // within 15 seconds
  });

  // Scenario 10: Actor attribution is accurate
  test('10. Actor attribution is accurate', async () => {
    const res = await request(app)
      .get(`/api/tasks/${task1Id}`)
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(res.status).toBe(200);
    expect(res.body.task.completedById).toBe(patientA.id);
    expect(res.body.task.completedByRole).toBe('PATIENT');
  });

  // Scenario 11: Patient cannot complete another patient's task
  test("11. Patient cannot complete another patient's task", async () => {
    // Create task for patient B
    const createRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientB.id);

    // Now Patient A tries to complete Patient B's task (if any exists)
    const res = await request(app)
      .post(`/api/tasks/${task1Id}/complete`)
      .set('Authorization', `Bearer ${patientB.token}`);

    expect([403, 404]).toContain(res.status);
  });

  // Scenario 12: Doctor can cancel an assigned task
  test('12. Doctor can cancel an assigned task', async () => {
    // Create task 2
    const createRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Walk for 20 minutes',
        category: 'PHYSICAL_ACTIVITY',
        instructions: 'Brisk walk post-dinner',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    task2Id = createRes.body.task.id;

    // Doctor cancels task with reason
    const cancelRes = await request(app)
      .post(`/api/tasks/${task2Id}/cancel`)
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        cancellationReason: 'Patient reported acute foot pain, pausing physical exercise',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.task.status).toBe('CANCELLED');
    expect(cancelRes.body.task.cancelledAt).toBeDefined();
    expect(cancelRes.body.task.cancellationReason).toBe(
      'Patient reported acute foot pain, pausing physical exercise'
    );
  });

  // Scenario 13: Cancelled task remains in history
  test('13. Cancelled task remains in history', async () => {
    const res = await request(app)
      .get('/api/tasks?status=CANCELLED')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(res.status).toBe(200);
    const found = res.body.tasks.find((t: any) => t.id === task2Id);
    expect(found).toBeDefined();
    expect(found.status).toBe('CANCELLED');
    expect(found.cancellationReason).toMatch(/foot pain/i);
  });

  // Scenario 14: Reminder is created successfully
  test('14. Reminder is created successfully', async () => {
    const res = await request(app)
      .post('/api/reminders')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Time to record your fasting blood sugar',
        category: 'CARE_TASK',
        entityType: 'CARE_TASK',
        entityId: task1Id,
        remindAt: new Date(Date.now() + 3600000).toISOString(),
        recurrence: 'ONCE',
      });

    expect(res.status).toBe(201);
    expect(res.body.reminder).toBeDefined();
    expect(res.body.reminder.title).toBe('Time to record your fasting blood sugar');
    expect(res.body.reminder.entityType).toBe('CARE_TASK');
    expect(res.body.reminder.entityId).toBe(task1Id);

    reminder1Id = res.body.reminder.id;
  });

  // Scenario 15: Reminder is delivered to the correct patient
  test('15. Reminder is delivered to the correct patient', async () => {
    // Patient A retrieves reminders
    const resA = await request(app)
      .get('/api/reminders')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(resA.status).toBe(200);
    const foundA = resA.body.reminders.find((r: any) => r.id === reminder1Id);
    expect(foundA).toBeDefined();

    // Patient B retrieves reminders
    const resB = await request(app)
      .get('/api/reminders')
      .set('Authorization', `Bearer ${patientB.token}`);

    expect(resB.status).toBe(200);
    const foundB = resB.body.reminders.find((r: any) => r.id === reminder1Id);
    expect(foundB).toBeUndefined();
  });

  // Scenario 16: Reminder notification does not mark a task complete
  test('16. Reminder notification does not mark a task complete', async () => {
    // Create new uncompleted task
    const taskRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Check evening pre-dinner glucose',
        category: 'BLOOD_SUGAR_CHECK',
        dueAt: new Date(Date.now() + 7200000).toISOString(),
      });
    const uncompletedTaskId = taskRes.body.task.id;

    // Create reminder for this task
    const remRes = await request(app)
      .post('/api/reminders')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Pre-dinner glucose reminder',
        category: 'CARE_TASK',
        entityType: 'CARE_TASK',
        entityId: uncompletedTaskId,
        remindAt: new Date(Date.now() + 7200000).toISOString(),
      });
    const testRemId = remRes.body.reminder.id;

    // Acknowledge the reminder
    const ackRes = await request(app)
      .post(`/api/reminders/${testRemId}/acknowledge`)
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.reminder.status).toBe('ACKNOWLEDGED');

    // Verify task is STILL pending and NOT marked completed
    const checkTask = await prisma.careTask.findUnique({
      where: { id: uncompletedTaskId },
    });
    expect(checkTask?.status).toBe('PENDING');
    expect(checkTask?.completedAt).toBeNull();
  });

  // Scenario 17: Caregiver without permission cannot complete tasks
  test('17. Caregiver without permission cannot complete tasks', async () => {
    // Create task 3
    const createRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Follow recommended diabetic diet plan',
        category: 'DIET_PLAN',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    task3Id = createRes.body.task.id;

    // Unauthorized caregiver attempts completion
    const completeRes = await request(app)
      .post(`/api/tasks/${task3Id}/complete`)
      .set('Authorization', `Bearer ${unauthorizedCaregiver.token}`);

    expect(completeRes.status).toBe(403);
    expect(completeRes.body.error).toMatch(/permission/i);
  });

  // Scenario 18: Caregiver with explicit permission can complete an authorized task
  test('18. Caregiver with explicit permission can complete an authorized task', async () => {
    const completeRes = await request(app)
      .post(`/api/tasks/${task3Id}/complete`)
      .set('Authorization', `Bearer ${authorizedCaregiver.token}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('COMPLETED');
    expect(completeRes.body.task.completedById).toBe(authorizedCaregiver.id);
    expect(completeRes.body.task.completedByRole).toBe('CAREGIVER');
  });

  // Scenario 19: Doctor can distinguish patient completion from caregiver completion
  test('19. Doctor can distinguish patient completion from caregiver completion', async () => {
    const listRes = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(listRes.status).toBe(200);
    const t1 = listRes.body.tasks.find((t: any) => t.id === task1Id);
    const t3 = listRes.body.tasks.find((t: any) => t.id === task3Id);

    expect(t1.completedByRole).toBe('PATIENT');
    expect(t3.completedByRole).toBe('CAREGIVER');

    // Check stats endpoint
    const statsRes = await request(app)
      .get('/api/tasks/stats')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.stats.patientCompletedCount).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.stats.caregiverCompletedCount).toBeGreaterThanOrEqual(1);
  });

  // Scenario 20: Revoked caregiver cannot complete additional tasks
  test('20. Revoked caregiver cannot complete additional tasks', async () => {
    // Create task 4
    const createRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Daily foot-care inspection',
        category: 'FOOT_CARE',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
    const task4Id = createRes.body.task.id;

    // Revoked caregiver attempts completion
    const completeRes = await request(app)
      .post(`/api/tasks/${task4Id}/complete`)
      .set('Authorization', `Bearer ${revokedCaregiver.token}`);

    expect(completeRes.status).toBe(403);
    expect(completeRes.body.error).toMatch(/consent/i);
  });

  // Scenario 21: Duplicate requests do not create duplicate completion events (Idempotency)
  test('21. Duplicate requests do not create duplicate completion events (Idempotency)', async () => {
    const key = crypto.randomUUID();

    // First completion
    const res1 = await request(app)
      .post(`/api/tasks/${task1Id}/complete`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({ idempotencyKey: key });

    expect(res1.status).toBe(200);
    expect(res1.body.replayed).toBe(true);

    // Replay completion
    const res2 = await request(app)
      .post(`/api/tasks/${task1Id}/complete`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({ idempotencyKey: key });

    expect(res2.status).toBe(200);
    expect(res2.body.replayed).toBe(true);
  });

  // Scenario 22: Unconfirmed and overdue tasks are displayed correctly
  test('22. Unconfirmed and overdue tasks are displayed correctly', async () => {
    // Create an overdue task (due 2 days ago)
    const overdueRes = await request(app)
      .post('/api/tasks/assign')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        title: 'Overdue Laboratory HbA1c Panel',
        category: 'LAB_TEST',
        dueAt: new Date(Date.now() - 172800000).toISOString(),
      });
    expect(overdueRes.status).toBe(201);
    const overdueTaskId = overdueRes.body.task.id;

    // Check stats endpoint
    const statsRes = await request(app)
      .get('/api/tasks/stats')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.stats.overdueTasks).toBeGreaterThanOrEqual(1);

    // Check tasks list endpoint with computed status
    const listRes = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(listRes.status).toBe(200);
    const found = listRes.body.tasks.find((t: any) => t.id === overdueTaskId);
    expect(found).toBeDefined();
    expect(found.computedStatus).toBe('OVERDUE');
  });
});
