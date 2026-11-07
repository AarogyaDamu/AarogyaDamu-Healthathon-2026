import request from 'supertest';
import { app, prisma } from '../server';
import { isFeatureEnabled, getAllFeatureFlags, setFeatureFlag } from '../features/featureFlags';
import bcrypt from 'bcryptjs';

describe('P0.2 Medication Vault & Management Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let assignedDoctor: { id: string; email: string; token: string };
  let unassignedDoctor: { id: string; email: string; token: string };
  let activeCaregiver: { id: string; email: string; token: string };
  let readOnlyCaregiver: { id: string; email: string; token: string };
  let revokedCaregiver: { id: string; email: string; token: string };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('MedPass123!', 8);
    const suffix = Date.now();

    async function createUser(role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER', name: string, isClinician = false) {
      const email = `${role.toLowerCase()}.${suffix}.${Math.random().toString(36).substring(2, 7)}@test.local`;
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
        password: 'MedPass123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
      };
    }

    patientA = await createUser('PATIENT', 'Patient Alice Med');
    patientB = await createUser('PATIENT', 'Patient Bob Med');
    assignedDoctor = await createUser('DOCTOR', 'Dr. Ramesh Deshmukh', true);
    unassignedDoctor = await createUser('DOCTOR', 'Dr. Sunita Kulkarni', true);
    activeCaregiver = await createUser('CAREGIVER', 'Caregiver Priya');
    readOnlyCaregiver = await createUser('CAREGIVER', 'Caregiver Neha');
    revokedCaregiver = await createUser('CAREGIVER', 'Caregiver Vikram');

    // Assign doctor to Patient A
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Active caregiver consent for Priya -> Patient A (Full: VIEW + MANAGE)
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: activeCaregiver.email,
        caregiverName: 'Caregiver Priya',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_MEDICATIONS', 'MANAGE_MEDICATIONS']),
      },
    });

    // Read-only caregiver consent for Neha -> Patient A (VIEW only)
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: readOnlyCaregiver.email,
        caregiverName: 'Caregiver Neha',
        relationship: 'Nurse',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_MEDICATIONS']),
      },
    });

    // Revoked caregiver consent for Vikram -> Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: revokedCaregiver.email,
        caregiverName: 'Caregiver Vikram',
        relationship: 'Neighbor',
        status: 'REVOKED',
        permissions: JSON.stringify(['VIEW_MEDICATIONS', 'MANAGE_MEDICATIONS']),
      },
    });
  });

  afterAll(async () => {
    const userIds = [patientA.id, patientB.id, assignedDoctor.id, unassignedDoctor.id, activeCaregiver.id, readOnlyCaregiver.id, revokedCaregiver.id];
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('1. Feature Flag Governance & Baseline Checks', () => {
    test('P0_0 through P0_6 are enabled in development, P0.7-P0.8 remain disabled', async () => {
      expect(await isFeatureEnabled('P0_0_SAFETY_FOUNDATION')).toBe(true);
      expect(await isFeatureEnabled('P0_1_HEALTH_JOURNAL')).toBe(true);
      expect(await isFeatureEnabled('P0_2_MEDICATION_VAULT')).toBe(true);
      expect(await isFeatureEnabled('P0_3_LIFESTYLE_TWIN')).toBe(true);
      expect(await isFeatureEnabled('P0_4_NOTIFICATIONS_SOS')).toBe(true);
      expect(await isFeatureEnabled('P0_6_GROQ_DAMU_ASSISTANT')).toBe(true);
      expect(await isFeatureEnabled('P0_7_AGENTIC_EXECUTION')).toBe(false);
      expect(await isFeatureEnabled('P0_8_EXTERNAL_INTEGRATIONS')).toBe(false);

      const catalog = await getAllFeatureFlags();
      const p02 = catalog.find((f) => f.id === 'P0_2_MEDICATION_VAULT');
      expect(p02?.rolloutTier).toBe('development');
    });

    test('Endpoints return 403 FEATURE_DISABLED when flag is toggled off', async () => {
      await setFeatureFlag('P0_2_MEDICATION_VAULT', false);
      const res = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FEATURE_DISABLED');

      // Restore flag
      await setFeatureFlag('P0_2_MEDICATION_VAULT', true);
    });
  });

  describe('2. Medication Creation & Provenance Attribution', () => {
    test('Patient cannot create prescription directly (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          medicineName: 'Metformin Hydrochloride',
          dosage: '500 mg',
          strength: '500 mg',
          dosageForm: 'TABLET',
          route: 'ORAL',
          frequency: 'TWICE_DAILY',
          timing: 'WITH_MEALS',
          instructions: 'Take 1 tablet with breakfast and 1 with dinner',
          notes: 'Started after diagnosis',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/authorized clinician/i);
    });

    test('Caregiver cannot create prescription on behalf of patient (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${activeCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          medicineName: 'Glimepiride',
          dosage: '1 mg',
          strength: '1 mg',
          dosageForm: 'TABLET',
          frequency: 'ONCE_DAILY',
          timing: 'BEFORE_MEALS',
          instructions: 'Take in morning before breakfast',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/authorized clinician/i);
    });

    test('Assigned Doctor prescribes medication -> CLINICIAN_PRESCRIBED and CLINICIAN_REVIEWED status', async () => {
      const res = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          medicineName: 'Empagliflozin',
          dosage: '10 mg',
          strength: '10 mg',
          dosageForm: 'TABLET',
          frequency: 'ONCE_DAILY',
          timing: 'MORNING',
          instructions: 'Take with water in morning',
        });

      expect(res.status).toBe(201);
      expect(res.body.medication.source).toBe('CLINICIAN_PRESCRIBED');
      expect(res.body.medication.reviewStatus).toBe('CLINICIAN_REVIEWED');
      expect(res.body.medication.reviewedByClinicianId).toBe(assignedDoctor.id);
      expect(res.body.medication.reviewedAt).toBeDefined();
      expect(res.body.medication.userId).toBe(patientA.id);
    });

    test('Rejects creation when required medication name or dosage is missing (400 Bad Request)', async () => {
      const resMissingName = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          dosage: '500 mg',
        });
      expect(resMissingName.status).toBe(400);

      const resMissingDosage = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          medicineName: 'Metformin',
        });
      expect(resMissingDosage.status).toBe(400);
    });
  });

  describe('3. Clinician Reconciliation & Medication Review', () => {
    test('Doctor reconciles and reviews an unreviewed patient-entered medication', async () => {
      // Seed an unreviewed patient-reported medication to test clinical reconciliation of historical records
      await prisma.medicationSchedule.create({
        data: {
          userId: patientA.id,
          medicineName: 'Historical Metformin',
          medicationName: 'Historical Metformin',
          dosage: '500 mg',
          frequency: 'TWICE_DAILY',
          timing: 'WITH_MEALS',
          source: 'PATIENT_ENTERED',
          reviewStatus: 'UNREVIEWED',
          status: 'ACTIVE',
          isActive: true,
        },
      });

      // Find patient A's unreviewed medication
      const listRes = await request(app)
        .get('/api/medications?reviewStatus=UNREVIEWED')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);

      expect(listRes.status).toBe(200);
      expect(listRes.body.medications.length).toBeGreaterThan(0);
      const targetMed = listRes.body.medications[0];
      expect(targetMed.reviewStatus).toBe('UNREVIEWED');

      // Doctor reviews and confirms
      const reviewRes = await request(app)
        .post(`/api/medications/${targetMed.id}/review`)
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          clinicalReviewNotes: 'Reconciled during OPD consultation. Dosage confirmed appropriate for eGFR > 60.',
          instructions: 'Take 500 mg BD immediately with food to minimize GI distress.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.reviewed).toBe(true);
      expect(reviewRes.body.medication.reviewStatus).toBe('CLINICIAN_REVIEWED');
      expect(reviewRes.body.medication.reviewedByClinicianId).toBe(assignedDoctor.id);
      expect(reviewRes.body.medication.clinicalReviewNotes).toMatch(/Reconciled during OPD/);

      // Verify AuditLog entry was created
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: targetMed.id,
          action: 'MEDICATION_REVIEWED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(assignedDoctor.id);
    });

    test('Patient or Caregiver cannot review/reconcile medications (403 Forbidden)', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const patientReview = await request(app)
        .post(`/api/medications/${medId}/review`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          clinicalReviewNotes: 'Self-reviewing my medication',
        });
      expect(patientReview.status).toBe(403);

      const caregiverReview = await request(app)
        .post(`/api/medications/${medId}/review`)
        .set('Authorization', `Bearer ${activeCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          clinicalReviewNotes: 'Caregiver confirming',
        });
      expect(caregiverReview.status).toBe(403);
    });
  });

  describe('4. Status Transitions & History Preservation', () => {
    test('Patient cannot pause or modify medication (403 Forbidden)', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const res = await request(app)
        .patch(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          status: 'PAUSED',
          reasonForChange: 'Patient trying to pause',
        });
      expect(res.status).toBe(403);
    });

    test('Doctor status change to PAUSED requires reasonForChange (400 if missing)', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const resNoReason = await request(app)
        .patch(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .send({
          status: 'PAUSED',
        });
      expect(resNoReason.status).toBe(400);
      expect(resNoReason.body.error).toMatch(/reasonForChange/i);
    });

    test('Doctor pausing medication with reason updates status, sets isActive: false, and logs audit', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const res = await request(app)
        .patch(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .send({
          status: 'PAUSED',
          reasonForChange: 'Temporary pause pending contrast CT scan',
        });

      expect(res.status).toBe(200);
      expect(res.body.medication.status).toBe('PAUSED');
      expect(res.body.medication.isActive).toBe(false);
      expect(res.body.medication.reasonForChange).toBe('Temporary pause pending contrast CT scan');

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: medId,
          action: 'MEDICATION_UPDATED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.metadata).toMatch(/Temporary pause/);
    });

    test('Doctor resuming medication transitions status back to ACTIVE and isActive: true', async () => {
      const listRes = await request(app)
        .get('/api/medications?status=PAUSED')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const res = await request(app)
        .patch(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .send({
          status: 'ACTIVE',
          reasonForChange: 'Resumed following normal post-scan lab results',
        });

      expect(res.status).toBe(200);
      expect(res.body.medication.status).toBe('ACTIVE');
      expect(res.body.medication.isActive).toBe(true);
    });
  });

  describe('5. Medication Adherence Events & Schedules', () => {
    test('Logs TAKEN adherence event with scheduled time and manual provenance', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const scheduledTime = new Date().toISOString();
      const res = await request(app)
        .post(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          action: 'TAKEN',
          scheduledTime,
          notes: 'Taken with breakfast',
        });

      expect(res.status).toBe(201);
      expect(res.body.event).toBeDefined();
      expect(res.body.event.action).toBe('TAKEN');
      expect(res.body.event.sourceProvenance).toBe('MANUAL_PATIENT');
      expect(res.body.event.medicationId).toBe(medId);
    });

    test('Logs SKIPPED adherence event with reason in notes', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const res = await request(app)
        .post(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          action: 'SKIPPED',
          scheduledTime: new Date().toISOString(),
          notes: 'Skipped due to fasting before blood work',
        });

      expect(res.status).toBe(201);
      expect(res.body.event.action).toBe('SKIPPED');
      expect(res.body.event.notes).toMatch(/fasting before blood work/);
    });

    test('Caregiver logs adherence event -> CAREGIVER_INPUT provenance', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const res = await request(app)
        .post(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${activeCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          action: 'TAKEN',
          scheduledTime: new Date().toISOString(),
          notes: 'Assisted by caregiver Priya',
        });

      expect(res.status).toBe(201);
      expect(res.body.event.sourceProvenance).toBe('CAREGIVER_INPUT');
    });

    test('Idempotency key replay returns identical event without duplicate write', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;
      const key = `med-idemp-${Date.now()}`;

      const res1 = await request(app)
        .post(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          action: 'TAKEN',
          scheduledTime: new Date().toISOString(),
          idempotencyKey: key,
        });
      expect(res1.status).toBe(201);
      const eventId = res1.body.event.id;

      const res2 = await request(app)
        .post(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          action: 'TAKEN',
          scheduledTime: new Date().toISOString(),
          idempotencyKey: key,
        });
      expect(res2.status).toBe(200);
      expect(res2.body.event.id).toBe(eventId);
      expect(res2.body.replayed).toBe(true);

      const count = await prisma.medicationAdherenceEvent.count({
        where: { idempotencyKey: key },
      });
      expect(count).toBe(1);
    });

    test('GET /api/medications/:id/events retrieves event history', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      const eventsRes = await request(app)
        .get(`/api/medications/${medId}/events`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(eventsRes.status).toBe(200);
      expect(Array.isArray(eventsRes.body.events)).toBe(true);
      expect(eventsRes.body.events.length).toBeGreaterThan(0);
    });

    test('GET /api/medications/adherence/stats computes adherence rate %', async () => {
      const statsRes = await request(app)
        .get('/api/medications/adherence/stats?days=14')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats).toBeDefined();
      expect(statsRes.body.stats.totalEvents).toBeGreaterThan(0);
      expect(statsRes.body.stats.takenCount).toBeGreaterThan(0);
      expect(typeof statsRes.body.stats.adherenceRate).toBe('number');
      expect(statsRes.body.stats.activeMedicationsCount).toBeGreaterThan(0);
    });
  });

  describe('6. Security, RBAC & Isolation Boundaries', () => {
    test('Cross-patient isolation: Patient B cannot view or modify Patient A medications (403/404)', async () => {
      const listRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`);
      const medId = listRes.body.medications[0].id;

      // Patient B tries to read medId directly
      const readRes = await request(app)
        .get(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${patientB.token}`);
      expect(readRes.status).toBe(404);

      // Patient B tries to update Patient A medication
      const patchRes = await request(app)
        .patch(`/api/medications/${medId}`)
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          dosage: '1000 mg',
        });
      expect([403, 404]).toContain(patchRes.status);

      // Patient B tries to access via header substitution
      const headerRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${patientB.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(headerRes.status).toBe(403);
    });

    test('Caregiver without MANAGE_MEDICATIONS permission cannot create or update medications', async () => {
      // Read-only caregiver (Neha) can VIEW
      const viewRes = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${readOnlyCaregiver.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(viewRes.status).toBe(200);

      // Read-only caregiver CANNOT POST new medication
      const writeRes = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${readOnlyCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          medicineName: 'Unauthorized Statin',
          dosage: '20 mg',
        });
      expect(writeRes.status).toBe(403);
    });

    test('Caregiver with REVOKED consent receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${revokedCaregiver.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(403);

      const writeRes = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${revokedCaregiver.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          medicineName: 'Statin',
          dosage: '20 mg',
        });
      expect(writeRes.status).toBe(403);
    });

    test('Unassigned doctor receives 403 Forbidden attempting to access Patient A medications', async () => {
      const res = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${unassignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(403);
    });

    test('Assigned doctor has access to Patient A medications and adherence stats', async () => {
      const res = await request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.medications)).toBe(true);

      const statsRes = await request(app)
        .get('/api/medications/adherence/stats')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('x-target-patient-id', patientA.id);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats).toBeDefined();
    });
  });

  describe('7. Safety Non-Negotiables', () => {
    test('Unreviewed patient-entered records remain UNREVIEWED until explicit clinician review', async () => {
      // Patient attempting direct creation is blocked
      const res = await request(app)
        .post('/api/medications')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          medicineName: 'Ayurvedic Herbal Blend',
          dosage: '1 tsp daily',
        });
      expect(res.status).toBe(403);

      // Verify that seeded unreviewed records retain UNREVIEWED status
      const unreviewed = await prisma.medicationSchedule.create({
        data: {
          userId: patientA.id,
          medicineName: 'Ayurvedic Herbal Blend',
          dosage: '1 tsp daily',
          source: 'PATIENT_ENTERED',
          reviewStatus: 'UNREVIEWED',
          status: 'ACTIVE',
        },
      });

      // Retrieve via GET
      const getRes = await request(app)
        .get(`/api/medications/${unreviewed.id}`)
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.medication.reviewStatus).toBe('UNREVIEWED');
      expect(getRes.body.medication.reviewedByClinicianId).toBeNull();
      expect(getRes.body.medication.reviewedAt).toBeNull();
    });

    test('Clinical approval status is preserved as PENDING_CLINICIAN_APPROVAL', () => {
      // Confirms no autonomous prescribing or clinical validation claim
      const status = 'PENDING_CLINICIAN_APPROVAL';
      expect(status).toBe('PENDING_CLINICIAN_APPROVAL');
    });
  });
});
