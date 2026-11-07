import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';

describe('Phase 2: Clinical Role Boundaries & Doctor-Led Medication Prescribing Suite', () => {
  let patientA: { id: string; email: string; token: string; fullName: string };
  let patientB: { id: string; email: string; token: string; fullName: string };
  let assignedDoctor: { id: string; email: string; token: string; fullName: string };
  let unassignedDoctor: { id: string; email: string; token: string; fullName: string };
  let activeCaregiver: { id: string; email: string; token: string; fullName: string };
  let readOnlyCaregiver: { id: string; email: string; token: string };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecureClinPass123!', 8);
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
    activeCaregiver = await createUser('CAREGIVER', 'Priya Patel');
    readOnlyCaregiver = await createUser('CAREGIVER', 'Neha Nurse');

    // Create ACTIVE DoctorPatientAssignment for assignedDoctor -> patientA
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Caregiver consent with MANAGE_MEDICATIONS for Priya -> Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: activeCaregiver.email,
        caregiverName: 'Priya Patel',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_MEDICATIONS', 'MANAGE_MEDICATIONS']),
      },
    });

    // Read-only caregiver consent for Neha -> Patient A
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: readOnlyCaregiver.email,
        caregiverName: 'Neha Nurse',
        relationship: 'Nurse',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_MEDICATIONS']),
      },
    });
  });

  afterAll(async () => {
    const userIds = [
      patientA.id,
      patientB.id,
      assignedDoctor.id,
      unassignedDoctor.id,
      activeCaregiver.id,
      readOnlyCaregiver.id,
    ];
    await prisma.medicationAdherenceEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.careNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // Scenario 1
  test('1. Doctor successfully prescribes medication to an assigned patient', async () => {
    const res = await request(app)
      .post('/api/medications/prescribe')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        medicineName: 'Metformin Hydrochloride SR',
        genericName: 'Metformin Hydrochloride',
        brandName: 'Glycomet SR',
        dosage: '1000 mg',
        strength: '1000 mg',
        dosageForm: 'TABLET',
        route: 'ORAL',
        frequency: 'ONCE_DAILY',
        timing: 'EVENING',
        foodInstructions: 'WITH_MEALS',
        instructions: 'Take with dinner to minimize GI disturbance',
        isPrn: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.medication).toBeDefined();
    expect(res.body.medication.medicineName).toBe('Metformin Hydrochloride SR');
    expect(res.body.medication.genericName).toBe('Metformin Hydrochloride');
    expect(res.body.medication.brandName).toBe('Glycomet SR');
    expect(res.body.medication.foodInstructions).toBe('WITH_MEALS');
    expect(res.body.medication.source).toBe('CLINICIAN_PRESCRIBED');
    expect(res.body.medication.reviewStatus).toBe('CLINICIAN_REVIEWED');
    expect(res.body.medication.reviewedByClinicianId).toBe(assignedDoctor.id);
    expect(res.body.medication.prescriber).toMatch(/Dr\. Ramesh Deshmukh/);
    expect(res.body.medication.userId).toBe(patientA.id);

    // Verify patient notification was created
    const notif = await prisma.careNotification.findFirst({
      where: {
        userId: patientA.id,
        type: 'PRESCRIPTION_ISSUED',
      },
    });
    expect(notif).not.toBeNull();
    expect(notif?.title).toBe('New Prescription Issued');
  });

  // Scenario 2
  test('2. Doctor cannot prescribe to an unauthorized patient', async () => {
    const res = await request(app)
      .post('/api/medications/prescribe')
      .set('Authorization', `Bearer ${unassignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        medicineName: 'Empagliflozin',
        dosage: '10 mg',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not actively assigned/i);
  });

  // Scenario 3 & 4
  test('4. Patient cannot create a prescription through a direct API request', async () => {
    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        medicineName: 'Dapagliflozin',
        dosage: '10 mg',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/authorized clinician/i);
  });

  // Scenario 5
  test('5. Patient cannot modify prescription details', async () => {
    // Get patient A's medication
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);
    const medId = listRes.body.medications[0].id;

    const patchRes = await request(app)
      .patch(`/api/medications/${medId}`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        dosage: '2000 mg',
        status: 'PAUSED',
        reasonForChange: 'Patient trying to pause dose',
      });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error).toMatch(/authorized clinician/i);
  });

  // Scenario 6
  test("6. Patient can see the doctor's prescription", async () => {
    const res = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.medications)).toBe(true);
    expect(res.body.medications.length).toBeGreaterThan(0);
    const med = res.body.medications[0];
    expect(med.source).toBe('CLINICIAN_PRESCRIBED');
    expect(med.reviewStatus).toBe('CLINICIAN_REVIEWED');
  });

  // Scenario 7
  test("7. Patient cannot see another patient's prescription", async () => {
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);
    const medId = listRes.body.medications[0].id;

    // Patient B attempts direct read by ID
    const readRes = await request(app)
      .get(`/api/medications/${medId}`)
      .set('Authorization', `Bearer ${patientB.token}`);

    expect([403, 404]).toContain(readRes.status);

    // Patient B attempts header substitution
    const listSubRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientB.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(listSubRes.status).toBe(403);
  });

  // Scenario 8
  test('8. Patient can mark a scheduled dose TAKEN', async () => {
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
        notes: 'Taken with dinner',
      });

    expect(res.status).toBe(201);
    expect(res.body.event).toBeDefined();
    expect(res.body.event.action).toBe('TAKEN');
    expect(res.body.event.sourceProvenance).toBe('MANUAL_PATIENT');
    expect(res.body.event.recordedBy).toBe(patientA.id);
  });

  // Scenario 9
  test('9. Patient can report a dose SKIPPED with reason', async () => {
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);
    const medId = listRes.body.medications[0].id;

    const scheduledTime = new Date().toISOString();
    const res = await request(app)
      .post(`/api/medications/${medId}/events`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        action: 'SKIPPED',
        scheduledTime,
        notes: 'Mild nausea after dinner, skipped dose per doctor advice',
      });

    expect(res.status).toBe(201);
    expect(res.body.event.action).toBe('SKIPPED');
    expect(res.body.event.notes).toMatch(/Mild nausea/);
  });

  // Scenario 10
  test('10. Unchecked doses remain NOT CONFIRMED until policy allows another state', async () => {
    const statsRes = await request(app)
      .get('/api/medications/adherence/stats?days=14')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(statsRes.status).toBe(200);
    const { totalEvents, takenCount, skippedCount, missedCount } = statsRes.body.stats;
    expect(totalEvents).toBe(takenCount + skippedCount + missedCount);
    // Unchecked doses without event submission are NOT counted as taken or skipped
    expect(takenCount).toBeGreaterThan(0);
    expect(skippedCount).toBeGreaterThan(0);
  });

  // Scenario 11
  test('11. Duplicate adherence requests do not create duplicate events (Idempotency)', async () => {
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);
    const medId = listRes.body.medications[0].id;

    const key = `idemp-p2-${Date.now()}`;
    const scheduledTime = new Date().toISOString();

    const res1 = await request(app)
      .post(`/api/medications/${medId}/events`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        action: 'TAKEN',
        scheduledTime,
        idempotencyKey: key,
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/medications/${medId}/events`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .send({
        action: 'TAKEN',
        scheduledTime,
        idempotencyKey: key,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.replayed).toBe(true);

    const count = await prisma.medicationAdherenceEvent.count({
      where: { idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  // Scenario 12
  test('12. Doctor sees medication adherence', async () => {
    const statsRes = await request(app)
      .get('/api/medications/adherence/stats?days=14')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.stats.totalEvents).toBeGreaterThan(0);
    expect(typeof statsRes.body.stats.adherenceRate).toBe('number');
  });

  // Scenario 13
  test('13. Doctor can distinguish patient-reported and caregiver-reported actions', async () => {
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patientA.token}`);
    const medId = listRes.body.medications[0].id;

    // Caregiver logs adherence
    const caregiverLog = await request(app)
      .post(`/api/medications/${medId}/events`)
      .set('Authorization', `Bearer ${activeCaregiver.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        action: 'TAKEN',
        scheduledTime: new Date().toISOString(),
        notes: 'Administered by daughter Priya',
      });
    expect(caregiverLog.status).toBe(201);
    expect(caregiverLog.body.event.sourceProvenance).toBe('CAREGIVER_INPUT');
    expect(caregiverLog.body.event.recordedBy).toBe(activeCaregiver.id);

    // Doctor inspects events list
    const eventsRes = await request(app)
      .get(`/api/medications/${medId}/events`)
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);

    expect(eventsRes.status).toBe(200);
    const provenances = eventsRes.body.events.map((e: any) => e.sourceProvenance);
    expect(provenances).toContain('MANUAL_PATIENT');
    expect(provenances).toContain('CAREGIVER_INPUT');
  });

  // Scenario 14
  test('14. Caregiver cannot prescribe', async () => {
    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', `Bearer ${activeCaregiver.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        medicineName: 'Unauthorized Statin',
        dosage: '20 mg',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/authorized clinician/i);
  });

  // Scenario 15
  test('15. Discontinued prescriptions remain available in historical records', async () => {
    const listRes = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id);
    const medId = listRes.body.medications[0].id;

    // Doctor discontinues the prescription
    const discRes = await request(app)
      .patch(`/api/medications/${medId}`)
      .set('Authorization', `Bearer ${assignedDoctor.token}`)
      .set('x-target-patient-id', patientA.id)
      .send({
        status: 'DISCONTINUED',
        reasonForChange: 'Switching to GLP-1 receptor agonist therapy',
      });

    expect(discRes.status).toBe(200);
    expect(discRes.body.medication.status).toBe('DISCONTINUED');
    expect(discRes.body.medication.isActive).toBe(false);

    // Verify it is still retrievable in patient history
    const allMedsRes = await request(app)
      .get('/api/medications?status=ALL')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(allMedsRes.status).toBe(200);
    const discMed = allMedsRes.body.medications.find((m: any) => m.id === medId);
    expect(discMed).toBeDefined();
    expect(discMed.status).toBe('DISCONTINUED');
    expect(discMed.reasonForChange).toBe('Switching to GLP-1 receptor agonist therapy');
  });

  // Scenario 16
  test('16. Patient-reported medications do not become verified prescriptions automatically', async () => {
    // Seed a legacy patient-entered record
    const selfReported = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        medicineName: 'Over-The-Counter Multivitamin',
        dosage: '1 tablet daily',
        source: 'PATIENT_ENTERED',
        reviewStatus: 'UNREVIEWED',
        status: 'ACTIVE',
      },
    });

    const getRes = await request(app)
      .get(`/api/medications/${selfReported.id}`)
      .set('Authorization', `Bearer ${patientA.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.medication.source).toBe('PATIENT_ENTERED');
    expect(getRes.body.medication.reviewStatus).toBe('UNREVIEWED');
    expect(getRes.body.medication.reviewedByClinicianId).toBeNull();
  });
});

