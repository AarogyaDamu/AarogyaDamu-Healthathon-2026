import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

describe('Phase 3: Dedicated Caregiver Experience & Permission-Governed Access Suite', () => {
  let patientA: { id: string; email: string; token: string; fullName: string };
  let patientB: { id: string; email: string; token: string; fullName: string };
  let doctor: { id: string; email: string; token: string; fullName: string };
  let caregiverFull: { id: string; email: string; token: string; fullName: string };
  let caregiverPartial: { id: string; email: string; token: string; fullName: string };
  let caregiverUnconsented: { id: string; email: string; token: string; fullName: string };

  let fullConsentId: string;
  let partialConsentId: string;
  let pendingConsentId: string;
  let invitationToken: string;

  let doctorTaskId1: string;
  let doctorTaskId2: string;
  let medicationId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('CaregiverPass123!', 10);

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
        password: 'CaregiverPass123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
        fullName: name,
      };
    }

    patientA = await createUser('PATIENT', 'Patient Anil');
    patientB = await createUser('PATIENT', 'Patient Bina');
    doctor = await createUser('DOCTOR', 'Dr. Sneha Kulkarni, MD', true);
    caregiverFull = await createUser('CAREGIVER', 'Caregiver Priya (Full Access)');
    caregiverPartial = await createUser('CAREGIVER', 'Caregiver Rakesh (Tasks Only)');
    caregiverUnconsented = await createUser('CAREGIVER', 'Caregiver Maya (No Consents)');

    // Assign doctor to patientA
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // 1. Create Active Consent for caregiverFull -> patientA with all Phase 3 permissions
    const fullConsent = await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverFull.email,
        caregiverName: 'Caregiver Priya',
        relationship: 'Daughter',
        status: 'ACTIVE',
        acceptedAt: new Date(),
        permissions: JSON.stringify([
          'VIEW_HEALTH_SUMMARY',
          'VIEW_MEDICATIONS',
          'VIEW_MEDICATION_ADHERENCE',
          'VIEW_TASKS',
          'COMPLETE_TASKS_ON_BEHALF',
          'VIEW_APPOINTMENTS',
          'VIEW_REPORTS',
          'VIEW_HEALTH_TIMELINE',
        ]),
      },
    });
    fullConsentId = fullConsent.id;

    // 2. Create Active Consent for caregiverPartial -> patientA with VIEW_TASKS ONLY (NO COMPLETE_TASKS_ON_BEHALF, NO MEDS)
    const partialConsent = await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverPartial.email,
        caregiverName: 'Caregiver Rakesh',
        relationship: 'Nurse',
        status: 'ACTIVE',
        acceptedAt: new Date(),
        permissions: JSON.stringify(['VIEW_TASKS']),
      },
    });
    partialConsentId = partialConsent.id;

    // 3. Create Doctor Tasks for Patient A
    const task1 = await prisma.careTask.create({
      data: {
        userId: patientA.id,
        title: 'Morning Fasting Sugar Check & Log',
        instructions: 'Check fasting glucose before breakfast and log the reading',
        category: 'GLUCOSE_CHECK',
        priority: 'HIGH',
        status: 'PENDING',
        dueAt: new Date(Date.now() + 3600000),
        assignedById: doctor.id,
      },
    });
    doctorTaskId1 = task1.id;

    const task2 = await prisma.careTask.create({
      data: {
        userId: patientA.id,
        title: 'Post-Lunch 15min Brisk Walk',
        instructions: 'Walk for 15 minutes after lunch to reduce glucose spike',
        category: 'LIFESTYLE',
        priority: 'MEDIUM',
        status: 'PENDING',
        dueAt: new Date(Date.now() + 7200000),
        assignedById: doctor.id,
      },
    });
    doctorTaskId2 = task2.id;

    // 4. Create Medication Schedule for Patient A
    const med = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        prescriber: doctor.fullName,
        medicineName: 'Metformin 500mg SR',
        genericName: 'Metformin Hydrochloride',
        dosage: '500mg',
        timing: 'AFTER_MEALS',
        frequency: 'TWICE_DAILY',
        instructions: 'Take 1 tablet after breakfast and dinner',
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
      },
    });
    medicationId = med.id;

    // 5. Create Blood Glucose HealthObservation for Patient A
    await prisma.healthObservation.create({
      data: {
        userId: patientA.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 128,
        unit: 'mg/dL',
        context: 'FASTING',
        observedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const userIds = [
      patientA.id,
      patientB.id,
      doctor.id,
      caregiverFull.id,
      caregiverPartial.id,
      caregiverUnconsented.id,
    ];
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careTask.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.healthObservation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('1. Caregiver Invitation & Acceptance Flow', () => {
    it('allows patient to issue a caregiver invitation with token and notification', async () => {
      const inviteEmail = caregiverUnconsented.email;
      const res = await request(app)
        .post('/api/caregivers')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          caregiverEmail: inviteEmail,
          caregiverName: 'Anil Junior',
          relationship: 'Son',
          status: 'PENDING',
          permissions: ['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF'],
        });

      expect(res.status).toBe(201);
      expect(res.body.consent).toBeDefined();
      expect(res.body.consent.status).toBe('PENDING');
      expect(res.body.consent.invitationToken).toBeDefined();

      pendingConsentId = res.body.consent.id;
      invitationToken = res.body.consent.invitationToken;

      // Verify CareNotification dispatched to patient
      const notifs = await prisma.careNotification.findMany({
        where: { userId: patientA.id, type: 'CAREGIVER_INVITE_SENT' },
      });
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('rejects caregiver invitation acceptance with invalid token', async () => {
      const res = await request(app)
        .post(`/api/caregivers/invitations/${pendingConsentId}/accept`)
        .set('Authorization', `Bearer ${caregiverUnconsented.token}`)
        .send({ token: 'invalid-token-123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid invitation token/i);
    });

    it('allows caregiver to accept pending invitation with valid token', async () => {
      const res = await request(app)
        .post(`/api/caregivers/invitations/${pendingConsentId}/accept`)
        .set('Authorization', `Bearer ${caregiverUnconsented.token}`)
        .send({ token: invitationToken });

      expect(res.status).toBe(200);
      expect(res.body.consent.status).toBe('ACTIVE');
      expect(res.body.consent.acceptedAt).toBeDefined();

      // Clean up accepted consent
      await prisma.caregiverConsent.delete({ where: { id: pendingConsentId } });
    });
  });

  describe('2. Authorized Patients Listing & Switcher (GET /api/caregivers/patients)', () => {
    it('returns authorized patients for caregiver with active consent', async () => {
      const res = await request(app)
        .get('/api/caregivers/patients')
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.patients)).toBe(true);
      expect(res.body.patients.length).toBe(1);
      expect(res.body.patients[0].patientId).toBe(patientA.id);
      expect(res.body.patients[0].name).toBe('Patient Anil');
      expect(res.body.patients[0].permissions).toContain('VIEW_HEALTH_SUMMARY');
      expect(res.body.patients[0].permissions).toContain('COMPLETE_TASKS_ON_BEHALF');
    });

    it('returns empty list for caregiver with no active consents', async () => {
      const res = await request(app)
        .get('/api/caregivers/patients')
        .set('Authorization', `Bearer ${caregiverUnconsented.token}`);

      expect(res.status).toBe(200);
      expect(res.body.patients).toEqual([]);
    });
  });

  describe('3. Permission-Governed Dashboard Payload', () => {
    it('returns full dashboard sections for caregiver with complete permissions', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/dashboard`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(200);
      expect(res.body.patient.name).toBe('Patient Anil');

      // Tasks present
      expect(res.body.tasks).toBeDefined();
      expect(res.body.tasks.summary.total).toBeGreaterThanOrEqual(2);
      expect(res.body.tasks.summary.canCompleteOnBehalf).toBe(true);

      // Medications present
      expect(res.body.medications).toBeDefined();
      expect(res.body.medications.activeCount).toBe(1);
      expect(res.body.medications.items[0].medicineName).toBe('Metformin 500mg SR');

      // Health summary present
      expect(res.body.healthSummary).toBeDefined();
      expect(res.body.healthSummary.latestReading).toBeDefined();
      expect(res.body.healthSummary.latestReading.numericValue).toBe(128);
    });

    it('suppresses restricted sections when caregiver lacks permissions', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/dashboard`)
        .set('Authorization', `Bearer ${caregiverPartial.token}`);

      expect(res.status).toBe(200);

      // Tasks allowed
      expect(res.body.tasks).toBeDefined();
      expect(res.body.tasks.summary.canCompleteOnBehalf).toBe(false);

      // Restricted sections must be null
      expect(res.body.medications).toBeNull();
      expect(res.body.adherence).toBeNull();
      expect(res.body.healthSummary).toBeNull();
      expect(res.body.appointments).toBeNull();
    });

    it('rejects caregiver dashboard request for unconsented patient with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientB.id}/dashboard`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/No active caregiver consent/i);
    });
  });

  describe('4. Caregiver Delegated Tasks & Complete On Behalf', () => {
    it('returns tasks with canComplete = true for authorized caregiver', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/tasks`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tasks)).toBe(true);
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(2);

      const t1 = res.body.tasks.find((t: any) => t.id === doctorTaskId1);
      expect(t1).toBeDefined();
      expect(t1.canComplete).toBe(true);
      expect(t1.assignedByDoctor).toBe('Dr. Sneha Kulkarni, MD');
    });

    it('returns tasks with canComplete = false for caregiver without COMPLETE_TASKS_ON_BEHALF', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/tasks`)
        .set('Authorization', `Bearer ${caregiverPartial.token}`);

      expect(res.status).toBe(200);
      const t1 = res.body.tasks.find((t: any) => t.id === doctorTaskId1);
      expect(t1).toBeDefined();
      expect(t1.canComplete).toBe(false);
    });

    it('blocks caregiver without COMPLETE_TASKS_ON_BEHALF from completing a task (403)', async () => {
      const res = await request(app)
        .post(`/api/caregivers/patients/${patientA.id}/tasks/${doctorTaskId1}/complete`)
        .set('Authorization', `Bearer ${caregiverPartial.token}`)
        .send({ notes: 'Trying without permission' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/COMPLETE_TASKS_ON_BEHALF/i);
    });

    it('allows authorized caregiver to complete task on behalf with actor attribution', async () => {
      const res = await request(app)
        .post(`/api/caregivers/patients/${patientA.id}/tasks/${doctorTaskId1}/complete`)
        .set('Authorization', `Bearer ${caregiverFull.token}`)
        .send({ notes: 'Fasting glucose was 112 mg/dL. Logged on behalf.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.task.status).toBe('COMPLETED');
      expect(res.body.task.completedByRole).toBe('CAREGIVER');

      // Verify in DB that completedById is caregiverFull.id and NOT patientA.id
      const updatedTask = await prisma.careTask.findUnique({ where: { id: doctorTaskId1 } });
      expect(updatedTask?.status).toBe('COMPLETED');
      expect(updatedTask?.completedById).toBe(caregiverFull.id);
      expect(updatedTask?.completedByRole).toBe('CAREGIVER');
      expect(updatedTask?.completedAt).toBeDefined();

      // Verify clinical audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: doctorTaskId1,
          action: 'TASK_COMPLETED_BY_CAREGIVER',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(caregiverFull.id);
    });

    it('replays idempotently when completing an already completed task', async () => {
      const res = await request(app)
        .post(`/api/caregivers/patients/${patientA.id}/tasks/${doctorTaskId1}/complete`)
        .set('Authorization', `Bearer ${caregiverFull.token}`)
        .send({ notes: 'Replaying completion' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.replayed).toBe(true);
    });
  });

  describe('5. Clinical Boundary Enforcement (No Doctor Capabilities)', () => {
    it('blocks caregiver from creating a prescription', async () => {
      const res = await request(app)
        .post('/api/medications/prescribe')
        .set('Authorization', `Bearer ${caregiverFull.token}`)
        .send({
          patientId: patientA.id,
          medicineName: 'Insulin Glargine',
          dosage: '10 units',
          timing: 'BEDTIME',
        });

      // Caregivers cannot access doctor-only prescribing endpoints
      expect(res.status).toBe(403);
    });

    it('blocks caregiver from assigning doctor tasks', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${caregiverFull.token}`)
        .send({
          patientId: patientA.id,
          title: 'Caregiver Created Task',
          instructions: 'Illegal task creation',
        });

      expect([400, 403]).toContain(res.status);
    });
  });

  describe('6. Prescribed Medications & Health Observations View', () => {
    it('allows caregiver with VIEW_MEDICATIONS to view active medications', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/medications`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.medications)).toBe(true);
      expect(res.body.medications.length).toBe(1);
      expect(res.body.medications[0].medicineName).toBe('Metformin 500mg SR');
    });

    it('blocks caregiver without VIEW_MEDICATIONS from inspecting medications (403)', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/medications`)
        .set('Authorization', `Bearer ${caregiverPartial.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/VIEW_MEDICATIONS/i);
    });

    it('allows caregiver with VIEW_HEALTH_SUMMARY to view glucose logs and TIR stats', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/health`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.observations)).toBe(true);
      expect(res.body.observations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.stats.averageGlucose).toBe(128);
      expect(res.body.stats.timeInRangePercentage).toBe(100);
    });

    it('blocks caregiver without VIEW_HEALTH_SUMMARY from viewing health records (403)', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/health`)
        .set('Authorization', `Bearer ${caregiverPartial.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/VIEW_HEALTH_SUMMARY/i);
    });
  });

  describe('7. Patient Access Management: Permissions, Audit History & Revocation', () => {
    it('updates lastAccessedAt on caregiver consent during delegated access', async () => {
      const consentBefore = await prisma.caregiverConsent.findUnique({
        where: { id: fullConsentId },
      });

      // Perform a delegated read
      await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/dashboard`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      const consentAfter = await prisma.caregiverConsent.findUnique({
        where: { id: fullConsentId },
      });

      expect(consentAfter?.lastAccessedAt).toBeDefined();
      if (consentBefore?.lastAccessedAt) {
        expect(new Date(consentAfter!.lastAccessedAt!).getTime()).toBeGreaterThanOrEqual(
          new Date(consentBefore.lastAccessedAt).getTime()
        );
      }
    });

    it('allows patient to inspect caregiver action history', async () => {
      const res = await request(app)
        .get(`/api/caregivers/${fullConsentId}/actions`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.caregiverName).toBe('Caregiver Priya');
      expect(Array.isArray(res.body.actions)).toBe(true);

      const taskAction = res.body.actions.find(
        (a: any) => a.type === 'TASK_COMPLETION' && a.title.includes('Morning Fasting Sugar')
      );
      expect(taskAction).toBeDefined();
      expect(taskAction.details).toMatch(/Fasting glucose was 112 mg\/dL/i);
    });

    it('allows patient to dynamically modify caregiver permissions', async () => {
      // Patient revokes COMPLETE_TASKS_ON_BEHALF from caregiverFull
      const res = await request(app)
        .patch(`/api/caregivers/${fullConsentId}/permissions`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          permissions: ['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS'], // Removed COMPLETE_TASKS_ON_BEHALF & VIEW_MEDICATIONS
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consent.permissions).toEqual(['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS']);

      // Subsequent attempt by caregiverFull to complete task2 must now fail with 403
      const taskRes = await request(app)
        .post(`/api/caregivers/patients/${patientA.id}/tasks/${doctorTaskId2}/complete`)
        .set('Authorization', `Bearer ${caregiverFull.token}`)
        .send({ notes: 'Attempting after permission revoked' });

      expect(taskRes.status).toBe(403);
      expect(taskRes.body.error).toMatch(/COMPLETE_TASKS_ON_BEHALF/i);
    });

    it('allows patient to immediately revoke caregiver consent, cutting off all access', async () => {
      const res = await request(app)
        .delete(`/api/caregivers/${fullConsentId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify status in DB is REVOKED
      const consent = await prisma.caregiverConsent.findUnique({ where: { id: fullConsentId } });
      expect(consent?.status).toBe('REVOKED');

      // Subsequent dashboard request by caregiverFull must return 403
      const dashRes = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/dashboard`)
        .set('Authorization', `Bearer ${caregiverFull.token}`);

      expect(dashRes.status).toBe(403);
      expect(dashRes.body.error).toMatch(/No active caregiver consent/i);
    });
  });

  describe('8. Cross-Patient & Cross-Caregiver Security Isolation', () => {
    it('prevents Patient B from accessing or revoking Patient A consent', async () => {
      const res = await request(app)
        .delete(`/api/caregivers/${partialConsentId}`)
        .set('Authorization', `Bearer ${patientB.token}`);

      expect(res.status).toBe(404);
    });

    it('prevents Patient B from viewing Patient A caregiver action history', async () => {
      const res = await request(app)
        .get(`/api/caregivers/${partialConsentId}/actions`)
        .set('Authorization', `Bearer ${patientB.token}`);

      expect(res.status).toBe(404);
    });
  });
});
