import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { resolvePatientContext } from '../permissions/evaluator';

describe('Phase 3.1: Caregiver Security & Release Validation Suite', () => {
  let patient1: { id: string; email: string; token: string; fullName: string };
  let patient2: { id: string; email: string; token: string; fullName: string };
  let doctor: { id: string; email: string; token: string; fullName: string };
  let caregiverA: { id: string; email: string; token: string; fullName: string };
  let caregiverB: { id: string; email: string; token: string; fullName: string };
  let attacker: { id: string; email: string; token: string; fullName: string };

  let taskIdP1: string;
  let medIdP1: string;
  let apptIdP1: string;
  let reportIdP1: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('CaregiverSecure123!', 10);

    async function createUser(role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER', name: string, isClinician = false) {
      const email = `p31.${role.toLowerCase()}.${Date.now()}.${Math.random().toString(36).substring(7)}@aarogyadamu.test`;
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
        password: 'CaregiverSecure123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
        fullName: name,
      };
    }

    patient1 = await createUser('PATIENT', 'Patient One');
    patient2 = await createUser('PATIENT', 'Patient Two');
    doctor = await createUser('DOCTOR', 'Dr. Radhika Sharma, MD', true);
    caregiverA = await createUser('CAREGIVER', 'Caregiver Alpha (Assigned to P1)');
    caregiverB = await createUser('CAREGIVER', 'Caregiver Beta (Assigned to P2)');
    attacker = await createUser('CAREGIVER', 'Attacker (No Consents)');

    // Assign doctor to patient 1
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient1.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // 1. Task for Patient 1
    const task = await prisma.careTask.create({
      data: {
        userId: patient1.id,
        title: 'Check Pre-Dinner Glucose',
        instructions: 'Log capillary blood glucose reading before eating dinner',
        category: 'GLUCOSE_CHECK',
        priority: 'HIGH',
        status: 'PENDING',
        dueAt: new Date(Date.now() + 3600000),
        assignedById: doctor.id,
      },
    });
    taskIdP1 = task.id;

    // 2. Medication for Patient 1
    const med = await prisma.medicationSchedule.create({
      data: {
        userId: patient1.id,
        prescriber: doctor.fullName,
        medicineName: 'Glimepiride 1mg',
        genericName: 'Glimepiride',
        dosage: '1mg',
        timing: 'BEFORE_BREAKFAST',
        frequency: 'ONCE_DAILY',
        instructions: 'Take 1 tablet before breakfast',
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
      },
    });
    medIdP1 = med.id;

    // 3. Medication adherence event for Patient 1
    await prisma.medicationAdherenceEvent.create({
      data: {
        userId: patient1.id,
        medicationId: med.id,
        action: 'TAKEN',
        scheduledTime: new Date(Date.now() - 7200000),
        recordedAt: new Date(Date.now() - 7100000),
        recordedBy: patient1.id,
        notes: 'Taken on time with water',
      },
    });

    // 4. Health observation for Patient 1
    await prisma.healthObservation.create({
      data: {
        userId: patient1.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 135,
        unit: 'mg/dL',
        context: 'FASTING',
        observedAt: new Date(),
      },
    });

    // 5. Appointment for Patient 1
    const appt = await prisma.appointment.create({
      data: {
        patientId: patient1.id,
        doctorId: doctor.id,
        bookedById: patient1.id,
        scheduledAt: new Date(Date.now() + 86400000 * 3),
        durationMinutes: 30,
        reason: 'Quarterly HbA1c review',
        visitType: 'FOLLOW_UP',
        status: 'CONFIRMED',
      },
    });
    apptIdP1 = appt.id;

    // 6. Health document / report for Patient 1
    const doc = await prisma.healthDocument.create({
      data: {
        userId: patient1.id,
        title: 'Comprehensive Metabolic Panel (CMP)',
        category: 'LAB_REPORT',
        issuingFacility: 'Apex Diagnostic Labs',
        reportDate: new Date(),
        processingStatus: 'READY',
      },
    });
    reportIdP1 = doc.id;

    // Grant active consent from Patient 2 to Caregiver B
    await prisma.caregiverConsent.create({
      data: {
        patientId: patient2.id,
        caregiverEmail: caregiverB.email,
        caregiverName: 'Caregiver Beta',
        relationship: 'Sibling',
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
  });

  afterAll(async () => {
    const userIds = [
      patient1.id,
      patient2.id,
      doctor.id,
      caregiverA.id,
      caregiverB.id,
      attacker.id,
    ];
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careTask.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.healthObservation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.healthDocument.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.careNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // Helper to set specific permissions for Caregiver A on Patient 1
  async function setCaregiverAPermissions(permissions: string[], status: 'ACTIVE' | 'REVOKED' = 'ACTIVE') {
    await prisma.caregiverConsent.deleteMany({
      where: { patientId: patient1.id, caregiverEmail: caregiverA.email },
    });
    return prisma.caregiverConsent.create({
      data: {
        patientId: patient1.id,
        caregiverEmail: caregiverA.email,
        caregiverName: 'Caregiver Alpha',
        relationship: 'Daughter',
        status,
        acceptedAt: new Date(),
        permissions: JSON.stringify(permissions),
      },
    });
  }

  // =========================================================================
  // 1. INDEPENDENT VERIFICATION OF ALL 8 CANONICAL PERMISSIONS
  // =========================================================================
  describe('1. Independent Verification of All 8 Canonical Permissions', () => {

    // -----------------------------------------------------------------------
    // Permission 1: VIEW_HEALTH_SUMMARY
    // -----------------------------------------------------------------------
    describe('Permission 1: VIEW_HEALTH_SUMMARY', () => {
      it('allows access when VIEW_HEALTH_SUMMARY is granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/health`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.observations).toBeDefined();
        expect(Array.isArray(res.body.observations)).toBe(true);
        expect(res.body.stats).toBeDefined();
        expect(res.body.stats.totalReadings).toBeGreaterThan(0);
      });

      it('blocks access (403) when VIEW_HEALTH_SUMMARY is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATIONS', 'VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/health`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_HEALTH_SUMMARY/i);
      });

      it('blocks access (403) when VIEW_HEALTH_SUMMARY was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/health`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks access (403) when request is made for another patient ID', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/health`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks access (403) when unassigned caregiver B accesses patient 1', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/health`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 2: VIEW_MEDICATIONS
    // -----------------------------------------------------------------------
    describe('Permission 2: VIEW_MEDICATIONS', () => {
      it('allows access when VIEW_MEDICATIONS is granted', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATIONS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.medications).toBeDefined();
        expect(res.body.medications.length).toBeGreaterThan(0);
        expect(res.body.medications[0].medicineName).toBe('Glimepiride 1mg');
      });

      it('blocks access (403) when VIEW_MEDICATIONS is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_MEDICATIONS/i);
      });

      it('blocks access (403) when VIEW_MEDICATIONS was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATIONS'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient access for another patient ID', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATIONS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/medications`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver B from accessing patient 1 medications', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 3: VIEW_MEDICATION_ADHERENCE
    // -----------------------------------------------------------------------
    describe('Permission 3: VIEW_MEDICATION_ADHERENCE', () => {
      it('allows access when VIEW_MEDICATION_ADHERENCE is granted', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATION_ADHERENCE']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications/adherence`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.adherence).toBeDefined();
        expect(res.body.adherence.stats).toBeDefined();
        expect(res.body.adherence.stats.totalEvents).toBeGreaterThan(0);
        expect(res.body.adherence.events).toBeDefined();
      });

      it('blocks access (403) when VIEW_MEDICATION_ADHERENCE is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATIONS', 'VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications/adherence`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_MEDICATION_ADHERENCE/i);
      });

      it('blocks access (403) when VIEW_MEDICATION_ADHERENCE was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATION_ADHERENCE'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications/adherence`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient adherence requests', async () => {
        await setCaregiverAPermissions(['VIEW_MEDICATION_ADHERENCE']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/medications/adherence`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from patient 1 adherence events', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/medications/adherence`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 4: VIEW_TASKS
    // -----------------------------------------------------------------------
    describe('Permission 4: VIEW_TASKS', () => {
      it('allows access when VIEW_TASKS is granted', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/tasks`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.tasks).toBeDefined();
        expect(res.body.tasks.length).toBeGreaterThan(0);
        expect(res.body.tasks[0].title).toBe('Check Pre-Dinner Glucose');
        // canComplete must be false since COMPLETE_TASKS_ON_BEHALF is NOT granted
        expect(res.body.tasks[0].canComplete).toBe(false);
      });

      it('blocks access (403) when VIEW_TASKS is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY', 'VIEW_MEDICATIONS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/tasks`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_TASKS/i);
      });

      it('blocks access (403) when VIEW_TASKS was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/tasks`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient task inspection', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/tasks`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from patient 1 tasks', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/tasks`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 5: COMPLETE_TASKS_ON_BEHALF
    // -----------------------------------------------------------------------
    describe('Permission 5: COMPLETE_TASKS_ON_BEHALF', () => {
      it('allows task completion when COMPLETE_TASKS_ON_BEHALF is granted', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']);
        const res = await request(app)
          .post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`)
          .set('Authorization', `Bearer ${caregiverA.token}`)
          .send({ notes: 'Fasting glucose was 112 mg/dL. Verified by daughter.' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.task.status).toBe('COMPLETED');
        expect(res.body.task.completedById).toBe(caregiverA.id);
        expect(res.body.task.completedByRole).toBe('CAREGIVER');
      });

      it('blocks completion (403) when only VIEW_TASKS is granted without COMPLETE_TASKS_ON_BEHALF', async () => {
        // Reset task to pending
        await prisma.careTask.update({
          where: { id: taskIdP1 },
          data: { status: 'PENDING', completedAt: null, completedById: null, completedByRole: null },
        });

        await setCaregiverAPermissions(['VIEW_TASKS']); // NO complete permission
        const res = await request(app)
          .post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`)
          .set('Authorization', `Bearer ${caregiverA.token}`)
          .send({ notes: 'Attempting without permission' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/COMPLETE_TASKS_ON_BEHALF/i);
      });

      it('blocks completion (403) when consent was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF'], 'REVOKED');
        const res = await request(app)
          .post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`)
          .set('Authorization', `Bearer ${caregiverA.token}`)
          .send({ notes: 'Attempting on revoked grant' });

        expect(res.status).toBe(403);
      });

      it('blocks completion across different patient IDs', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']);
        const res = await request(app)
          .post(`/api/caregivers/patients/${patient2.id}/tasks/${taskIdP1}/complete`)
          .set('Authorization', `Bearer ${caregiverA.token}`)
          .send({ notes: 'Wrong patient ID' });

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from completing patient 1 tasks', async () => {
        const res = await request(app)
          .post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`)
          .set('Authorization', `Bearer ${caregiverB.token}`)
          .send({ notes: 'Caregiver B attempting on Patient 1' });

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 6: VIEW_APPOINTMENTS
    // -----------------------------------------------------------------------
    describe('Permission 6: VIEW_APPOINTMENTS', () => {
      it('allows access when VIEW_APPOINTMENTS is granted', async () => {
        await setCaregiverAPermissions(['VIEW_APPOINTMENTS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/appointments`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.appointments).toBeDefined();
        expect(res.body.appointments.length).toBeGreaterThan(0);
        expect(res.body.appointments[0].doctorName).toBe('Dr. Radhika Sharma, MD');
        expect(res.body.appointments[0].reason).toBe('Quarterly HbA1c review');
      });

      it('blocks access (403) when VIEW_APPOINTMENTS is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/appointments`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_APPOINTMENTS/i);
      });

      it('blocks access (403) when VIEW_APPOINTMENTS was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_APPOINTMENTS'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/appointments`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient appointment inspection', async () => {
        await setCaregiverAPermissions(['VIEW_APPOINTMENTS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/appointments`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from patient 1 appointments', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/appointments`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 7: VIEW_REPORTS
    // -----------------------------------------------------------------------
    describe('Permission 7: VIEW_REPORTS', () => {
      it('allows access when VIEW_REPORTS is granted', async () => {
        await setCaregiverAPermissions(['VIEW_REPORTS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/reports`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.reports).toBeDefined();
        expect(res.body.reports.length).toBeGreaterThan(0);
        expect(res.body.reports[0].title).toBe('Comprehensive Metabolic Panel (CMP)');
        expect(res.body.reports[0].category).toBe('LAB_REPORT');
      });

      it('blocks access (403) when VIEW_REPORTS is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_SUMMARY', 'VIEW_MEDICATIONS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/reports`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_REPORTS/i);
      });

      it('blocks access (403) when VIEW_REPORTS was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_REPORTS'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/reports`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient report inspection', async () => {
        await setCaregiverAPermissions(['VIEW_REPORTS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/reports`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from patient 1 clinical reports', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/reports`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });

    // -----------------------------------------------------------------------
    // Permission 8: VIEW_HEALTH_TIMELINE
    // -----------------------------------------------------------------------
    describe('Permission 8: VIEW_HEALTH_TIMELINE', () => {
      it('allows access when VIEW_HEALTH_TIMELINE is granted', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_TIMELINE']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/timeline`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.timeline).toBeDefined();
        expect(Array.isArray(res.body.timeline)).toBe(true);
        expect(res.body.timeline.length).toBeGreaterThan(0);
      });

      it('blocks access (403) when VIEW_HEALTH_TIMELINE is not granted', async () => {
        await setCaregiverAPermissions(['VIEW_TASKS', 'VIEW_MEDICATIONS']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/timeline`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/VIEW_HEALTH_TIMELINE/i);
      });

      it('blocks access (403) when VIEW_HEALTH_TIMELINE was revoked', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_TIMELINE'], 'REVOKED');
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/timeline`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks cross-patient timeline inspection', async () => {
        await setCaregiverAPermissions(['VIEW_HEALTH_TIMELINE']);
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient2.id}/timeline`)
          .set('Authorization', `Bearer ${caregiverA.token}`);

        expect(res.status).toBe(403);
      });

      it('blocks unassigned caregiver from patient 1 timeline', async () => {
        const res = await request(app)
          .get(`/api/caregivers/patients/${patient1.id}/timeline`)
          .set('Authorization', `Bearer ${caregiverB.token}`);

        expect(res.status).toBe(403);
      });
    });
  });

  // =========================================================================
  // 2. INVITATION SECURITY HARDENING VERIFICATION
  // =========================================================================
  describe('2. Invitation Security Hardening Verification', () => {
    let testInvitationId: string;
    let testRawToken: string;
    const testInvitedEmail = `intended.invitee.${Date.now()}@aarogyadamu.test`;

    it('generates SHA-256 token hash in database and never exposes raw token or hash in GET requests', async () => {
      const createRes = await request(app)
        .post('/api/caregivers')
        .set('Authorization', `Bearer ${patient1.token}`)
        .send({
          caregiverEmail: testInvitedEmail,
          caregiverName: 'Intended Invitee',
          relationship: 'Spouse',
          status: 'PENDING',
          permissions: ['VIEW_HEALTH_SUMMARY', 'VIEW_TASKS'],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.consent).toBeDefined();
      expect(createRes.body.consent.invitationToken).toBeDefined();

      testInvitationId = createRes.body.consent.id;
      testRawToken = createRes.body.consent.invitationToken;

      // 1. Verify in database: raw token is NOT stored; SHA-256 hash IS stored
      const dbRecord = await prisma.caregiverConsent.findUnique({
        where: { id: testInvitationId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.invitationToken).not.toBe(testRawToken);

      const expectedHash = crypto.createHash('sha256').update(testRawToken).digest('hex');
      expect(dbRecord!.invitationToken).toBe(expectedHash);
      expect(dbRecord!.invitationToken!.length).toBe(64);

      // 2. Verify GET /api/caregivers strips invitationToken from payload
      const listRes = await request(app)
        .get('/api/caregivers')
        .set('Authorization', `Bearer ${patient1.token}`);

      expect(listRes.status).toBe(200);
      const listed = listRes.body.consents.find((c: any) => c.id === testInvitationId);
      expect(listed).toBeDefined();
      expect(listed.invitationToken).toBeUndefined();
    });

    it('rejects invitation acceptance when user is logged in with unauthorized email (403)', async () => {
      // Attacker has the raw token, but is logged in with attacker's email (not testInvitedEmail)
      const res = await request(app)
        .post(`/api/caregivers/invitations/${testInvitationId}/accept`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({ token: testRawToken });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Invitation not addressed to your email/i);
    });

    it('rejects invitation acceptance with invalid token (400)', async () => {
      // Create a user with the matching email
      const passwordHash = await bcrypt.hash('InviteePass123!', 10);
      const inviteeUser = await prisma.user.create({
        data: {
          email: testInvitedEmail,
          passwordHash,
          isClinician: false,
          profile: { create: { fullName: 'Intended Invitee' } },
        },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email: testInvitedEmail,
        password: 'InviteePass123!',
      });
      const inviteeToken = loginRes.body.token;

      // Try with wrong token
      const wrongTokenRes = await request(app)
        .post(`/api/caregivers/invitations/${testInvitationId}/accept`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ token: 'wrong-token-9999' });

      expect(wrongTokenRes.status).toBe(400);
      expect(wrongTokenRes.body.error).toMatch(/Invalid invitation token/i);

      // Successfully accept with valid token
      const acceptRes = await request(app)
        .post(`/api/caregivers/invitations/${testInvitationId}/accept`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ token: testRawToken });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.consent.status).toBe('ACTIVE');

      // 3. Single-use enforcement: cannot re-use token once accepted
      const reAcceptRes = await request(app)
        .post(`/api/caregivers/invitations/${testInvitationId}/accept`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ token: testRawToken });

      expect(reAcceptRes.status).toBe(400);
      expect(reAcceptRes.body.error).toMatch(/already been accepted/i);

      // Verify token in DB was nullified
      const updatedDb = await prisma.caregiverConsent.findUnique({
        where: { id: testInvitationId },
      });
      expect(updatedDb!.invitationToken).toBeNull();

      // Clean up invitee
      await prisma.caregiverConsent.delete({ where: { id: testInvitationId } });
      await prisma.patientProfile.deleteMany({ where: { userId: inviteeUser.id } });
      await prisma.user.delete({ where: { id: inviteeUser.id } });
    });

    it('rejects expired invitations with 400', async () => {
      const expiredEmail = `expired.caregiver.${Date.now()}@aarogyadamu.test`;
      const expiredRawToken = crypto.randomUUID();
      const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

      const expiredConsent = await prisma.caregiverConsent.create({
        data: {
          patientId: patient1.id,
          caregiverEmail: expiredEmail,
          caregiverName: 'Expired Caregiver',
          relationship: 'Friend',
          status: 'PENDING',
          invitationToken: expiredHash,
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
          permissions: JSON.stringify(['VIEW_TASKS']),
        },
      });

      // Create matching user
      const passwordHash = await bcrypt.hash('ExpiredPass123!', 10);
      const expiredUser = await prisma.user.create({
        data: {
          email: expiredEmail,
          passwordHash,
          isClinician: false,
          profile: { create: { fullName: 'Expired Caregiver' } },
        },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email: expiredEmail,
        password: 'ExpiredPass123!',
      });

      const res = await request(app)
        .post(`/api/caregivers/invitations/${expiredConsent.id}/accept`)
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ token: expiredRawToken });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/expired/i);

      // Clean up
      await prisma.caregiverConsent.delete({ where: { id: expiredConsent.id } });
      await prisma.patientProfile.deleteMany({ where: { userId: expiredUser.id } });
      await prisma.user.delete({ where: { id: expiredUser.id } });
    });

    it('rejects duplicate active invitations with 409 Conflict', async () => {
      // Caregiver A already has an active consent created in previous tests
      await setCaregiverAPermissions(['VIEW_TASKS']);

      const res = await request(app)
        .post('/api/caregivers')
        .set('Authorization', `Bearer ${patient1.token}`)
        .send({
          caregiverEmail: caregiverA.email,
          caregiverName: 'Caregiver Alpha',
          relationship: 'Daughter',
          status: 'ACTIVE',
          permissions: ['VIEW_HEALTH_SUMMARY'],
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/active grant already exists/i);
    });
  });

  // =========================================================================
  // 3. FAIL-CLOSED PERMISSION EVALUATION & ISOLATION (evaluator.ts)
  // =========================================================================
  describe('3. Fail-Closed Permission Evaluation & Boundary Enforcement', () => {
    it('fails closed (403) when permissions JSON is malformed without crashing 500', async () => {
      const malformedConsent = await prisma.caregiverConsent.create({
        data: {
          patientId: patient1.id,
          caregiverEmail: attacker.email,
          caregiverName: 'Attacker Malformed',
          relationship: 'None',
          status: 'ACTIVE',
          permissions: '{not-valid-json!',
        },
      });

      const fakeReq = {
        user: { id: attacker.id, email: attacker.email, isClinician: false },
        headers: { 'x-target-patient-id': patient1.id },
      } as any;

      await expect(
        resolvePatientContext(fakeReq, 'VIEW_OBSERVATIONS')
      ).rejects.toThrow(/Forbidden: Caregiver grant does not include permission/i);

      await prisma.caregiverConsent.delete({ where: { id: malformedConsent.id } });
    });

    it('enforces strict boundary: VIEW_TASKS does NOT grant VIEW_HEALTH_TIMELINE', async () => {
      await setCaregiverAPermissions(['VIEW_TASKS']);
      const res = await request(app)
        .get(`/api/caregivers/patients/${patient1.id}/timeline`)
        .set('Authorization', `Bearer ${caregiverA.token}`);

      expect(res.status).toBe(403);
    });

    it('enforces strict boundary: VIEW_MEDICATIONS does NOT grant VIEW_MEDICATION_ADHERENCE', async () => {
      await setCaregiverAPermissions(['VIEW_MEDICATIONS']);
      const res = await request(app)
        .get(`/api/caregivers/patients/${patient1.id}/medications/adherence`)
        .set('Authorization', `Bearer ${caregiverA.token}`);

      expect(res.status).toBe(403);
    });

    it('enforces strict clinical boundary: caregiver cannot prescribe medications', async () => {
      const res = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${caregiverA.token}`)
        .send({
          patientId: patient1.id,
          medicineName: 'Illegal Rx by Caregiver',
          dosage: '500mg',
        });

      // Must be 403 Forbidden
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. IMMEDIATE REVOCATION VERIFICATION
  // =========================================================================
  describe('4. Immediate Revocation & Cutoff Verification', () => {
    it('immediately cuts off caregiver from all 8 permissions upon revocation', async () => {
      // 1. Grant all permissions
      const consent = await setCaregiverAPermissions([
        'VIEW_HEALTH_SUMMARY',
        'VIEW_MEDICATIONS',
        'VIEW_MEDICATION_ADHERENCE',
        'VIEW_TASKS',
        'COMPLETE_TASKS_ON_BEHALF',
        'VIEW_APPOINTMENTS',
        'VIEW_REPORTS',
        'VIEW_HEALTH_TIMELINE',
      ]);

      // Verify healthy access
      const preCheck = await request(app)
        .get(`/api/caregivers/patients/${patient1.id}/health`)
        .set('Authorization', `Bearer ${caregiverA.token}`);
      expect(preCheck.status).toBe(200);

      // 2. Patient revokes consent via DELETE /api/caregivers/:id
      const revokeRes = await request(app)
        .delete(`/api/caregivers/${consent.id}`)
        .set('Authorization', `Bearer ${patient1.token}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // 3. Immediately test all 8 endpoints — every single one must fail with 403
      const checks = await Promise.all([
        request(app).get(`/api/caregivers/patients/${patient1.id}/health`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).get(`/api/caregivers/patients/${patient1.id}/medications`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).get(`/api/caregivers/patients/${patient1.id}/medications/adherence`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).get(`/api/caregivers/patients/${patient1.id}/tasks`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`).set('Authorization', `Bearer ${caregiverA.token}`).send({ notes: 'After revoke' }),
        request(app).get(`/api/caregivers/patients/${patient1.id}/appointments`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).get(`/api/caregivers/patients/${patient1.id}/reports`).set('Authorization', `Bearer ${caregiverA.token}`),
        request(app).get(`/api/caregivers/patients/${patient1.id}/timeline`).set('Authorization', `Bearer ${caregiverA.token}`),
      ]);

      for (const res of checks) {
        expect(res.status).toBe(403);
      }
    });
  });

  // =========================================================================
  // 5. AUDIT ATTRIBUTION VERIFICATION
  // =========================================================================
  describe('5. Audit Attribution Completeness (TASK_COMPLETED_BY_CAREGIVER)', () => {
    it('records complete audit log with actor ID, consent ID, timestamp, and notes', async () => {
      // Reset task and grant permissions
      await prisma.careTask.update({
        where: { id: taskIdP1 },
        data: { status: 'PENDING', completedAt: null, completedById: null, completedByRole: null },
      });
      const consent = await setCaregiverAPermissions(['VIEW_TASKS', 'COMPLETE_TASKS_ON_BEHALF']);

      const testNote = 'Verified blood glucose reading with contour plus meter';
      const completeRes = await request(app)
        .post(`/api/caregivers/patients/${patient1.id}/tasks/${taskIdP1}/complete`)
        .set('Authorization', `Bearer ${caregiverA.token}`)
        .send({ notes: testNote });

      expect(completeRes.status).toBe(200);

      // Verify audit log
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          userId: patient1.id,
          actorId: caregiverA.id,
          action: 'TASK_COMPLETED_BY_CAREGIVER',
          entityId: taskIdP1,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry!.entityType).toBe('CareTask');
      expect(auditEntry!.actorId).toBe(caregiverA.id);
      expect(auditEntry!.userId).toBe(patient1.id);

      const metadata = JSON.parse(auditEntry!.metadata || '{}');
      expect(metadata.taskId).toBe(taskIdP1);
      expect(metadata.caregiverEmail).toBe(caregiverA.email);
      expect(metadata.permissionUsed).toBe('COMPLETE_TASKS_ON_BEHALF');
      expect(metadata.notes).toBe(testNote);
    });
  });
});

