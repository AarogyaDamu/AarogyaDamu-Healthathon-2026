import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';
import { withTenantTransaction } from '../db/tenantContext';

describe('AarogyaDamu: End-to-End Clinical Consultation & Patient Prescription Delivery Suite', () => {
  let patientA: { id: string; email: string; token: string; fullName: string };
  let patientB: { id: string; email: string; token: string; fullName: string };
  let doctor: { id: string; email: string; token: string; fullName: string };
  let practice: { id: string };
  let appointment: { id: string };
  let finalizedPrescriptionNoteId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecureClinPass123!', 8);
    const suffix = Date.now();

    async function createUser(role: 'PATIENT' | 'DOCTOR', name: string, isClinician = false) {
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

    patientA = await createUser('PATIENT', 'Ramesh Deshmukh');
    patientB = await createUser('PATIENT', 'Sunita Sharma');
    doctor = await createUser('DOCTOR', 'Dr. Rupam Choudhary, MD', true);

    // Create practice & membership for doctor
    practice = await prisma.practice.create({
      data: {
        name: 'Apollo Sugar Clinic Pune',
        slug: `apollo-sugar-${suffix}`,
        registrationNumber: `REG-PUN-${suffix}`,
        phone: '+919876543210',
        address: 'Shivajinagar, Pune',
      },
    });

    await prisma.practiceMembership.create({
      data: {
        practiceId: practice.id,
        userId: doctor.id,
        role: 'DOCTOR',
        isActive: true,
      },
    });

    // Create doctor-patient assignment
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Create an appointment for patientA
    appointment = await prisma.appointment.create({
      data: {
        patientId: patientA.id,
        doctorId: doctor.id,
        bookedById: patientA.id,
        scheduledAt: new Date(),
        reason: 'Quarterly glycemic evaluation',
        status: 'CONFIRMED',
        visitType: 'ROUTINE_FOLLOW_UP',
        clinicName: 'Apollo Sugar Clinic Pune',
      },
    });
  });

  afterAll(async () => {
    try {
      const userIds = [patientA?.id, patientB?.id, doctor?.id].filter((id): id is string => Boolean(id));
      if (userIds.length > 0) {
        await prisma.appointment.deleteMany({ where: { patientId: { in: userIds } } });
        await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
        await prisma.practiceMembership.deleteMany({ where: { userId: { in: userIds } } });
        if (practice?.id) {
          await prisma.practice.deleteMany({ where: { id: practice.id } });
        }
        await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch {
      // Database reset before each run handles cleanup cleanly
    }
  });

  // Scenario 1: Doctor finalizes consultation workspace with prescriptions
  test('1. Clinician finalizes consultation workspace and issues digital prescription', async () => {
    const res = await request(app)
      .post('/api/consultations/workspace/finalize')
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('x-practice-id', practice.id)
      .send({
        patientId: patientA.id,
        appointmentId: appointment.id,
        chiefComplaint: 'Quarterly glycemic evaluation and metabolic medication review',
        historyOfPresentIllness:
          'Patient adheres to regular walking. Fasting blood sugar fluctuating between 135-145 mg/dL. No hypoglycemia.',
        examination: {
          bpSystolic: 126,
          bpDiastolic: 82,
          pulseRate: 74,
          weightKg: 71.5,
          randomBloodSugar: 142,
          generalExam: 'Conscious, oriented, afebrile.',
          footExam: 'Bilateral monofilament sensation intact.',
        },
        diagnoses: [
          {
            code: 'E11.9',
            display: 'Type 2 diabetes mellitus without complications',
            category: 'CONFIRMED',
          },
          {
            code: 'E78.5',
            display: 'Hyperlipidemia, unspecified',
            category: 'CONFIRMED',
          },
        ],
        prescriptions: [
          {
            medicationName: 'Metformin Hydrochloride (Glucophage SR)',
            dosage: '500 mg',
            frequency: '1-0-1',
            timing: 'AFTER_FOOD',
            durationDays: 60,
            instructions: 'Take 1 tablet after breakfast and dinner with water.',
          },
          {
            medicationName: 'Telmisartan Tablets',
            dosage: '40 mg',
            frequency: '1-0-0',
            timing: 'BEFORE_FOOD',
            durationDays: 60,
            instructions: 'Take 1 tablet in morning before breakfast.',
          },
        ],
        labOrders: ['HbA1c', 'Lipid Profile', 'Serum Creatinine'],
        lifestyleAdvice:
          '30 minutes brisk walking 5 days/week. Follow Diabetes Plate method. Monitor fasting glucose twice weekly.',
        followUpDays: 60,
        doctorConfirmed: true,
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.consultationNote).toBeDefined();
    expect(res.body.consultationNote.status).toBe('APPROVED');
    expect(res.body.consultationNote.sharedWithPatient).toBe(true);
    finalizedPrescriptionNoteId = res.body.consultationNote.id;

    // Verify appointment was marked COMPLETED
    const updatedAppt = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updatedAppt?.status).toBe('COMPLETED');
  });

  // Scenario 2: Patient retrieves issued prescriptions
  test('2. Patient retrieves newly issued prescription via GET /api/consultations/prescriptions', async () => {
    const res = await request(app)
      .get('/api/consultations/prescriptions')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.prescriptions)).toBe(true);
    expect(res.body.prescriptions.length).toBeGreaterThanOrEqual(1);

    const rx = res.body.prescriptions.find((p: any) => p.id === finalizedPrescriptionNoteId);
    expect(rx).toBeDefined();
    expect(rx.prescriptionReference).toMatch(/^RX-[A-Z0-9]{8}$/);
    expect(rx.status).toBe('ISSUED');
    expect(rx.doctor.name).toBe(doctor.fullName);
    expect(rx.medications.length).toBe(2);

    // Verify first medication
    const metformin = rx.medications.find((m: any) => m.medicationName.includes('Metformin'));
    expect(metformin).toBeDefined();
    expect(metformin.dosage).toBe('500 mg');
    expect(metformin.frequency).toBe('1-0-1');
    expect(metformin.timing).toBe('AFTER_FOOD');
    expect(metformin.durationDays).toBe(60);
    expect(metformin.instructions).toContain('breakfast');

    // Verify lab orders and advice
    expect(rx.labOrders).toContain('HbA1c');
    expect(rx.labOrders).toContain('Lipid Profile');
    expect(rx.lifestyleAdvice).toContain('Diabetes Plate');
    expect(rx.diagnoses.some((d: any) => d.code === 'E11.9')).toBe(true);
  });

  // Scenario 3: Single prescription detail endpoint
  test('3. Patient retrieves single prescription detail by ID', async () => {
    const res = await request(app)
      .get(`/api/consultations/prescriptions/${finalizedPrescriptionNoteId}`)
      .set('Authorization', `Bearer ${patientA.token}`);

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.prescription).toBeDefined();
    expect(res.body.prescription.id).toBe(finalizedPrescriptionNoteId);
    expect(res.body.prescription.doctor.name).toBe(doctor.fullName);
    expect(res.body.prescription.medications.length).toBe(2);
  });

  // Scenario 4: BOLA / IDOR Protection - Patient B cannot access Patient A's prescription
  test('4. IDOR Protection: Patient B cannot access Patient A prescriptions', async () => {
    // List check: Patient B does not see Patient A's prescription
    const listRes = await request(app)
      .get('/api/consultations/prescriptions')
      .set('Authorization', `Bearer ${patientB.token}`);

    expect(listRes.status).toBe(200);
    const hasPatientAPrescription = (listRes.body.prescriptions || []).some(
      (p: any) => p.id === finalizedPrescriptionNoteId
    );
    expect(hasPatientAPrescription).toBe(false);

    // Detail check: Patient B attempting to load Patient A's prescription by ID is rejected
    const detailRes = await request(app)
      .get(`/api/consultations/prescriptions/${finalizedPrescriptionNoteId}`)
      .set('Authorization', `Bearer ${patientB.token}`);

    expect([403, 404]).toContain(detailRes.status);
  });

  // Scenario 5: Draft consultations and unapproved notes are omitted from patient view
  test('5. Drafts and unapproved notes are strictly omitted from patient prescription feed', async () => {
    // Create an unapproved DRAFT note within clinician tenant transaction
    const draftNote = await withTenantTransaction(
      prisma,
      { patientId: patientA.id, practiceId: practice.id, userId: doctor.id, role: 'CLINICIAN' },
      async (tx) => {
        return tx.consultationNote.create({
          data: {
            userId: patientA.id,
            clinicianId: doctor.id,
            clinicianName: doctor.fullName,
            status: 'DRAFT',
            sharedWithPatient: false,
            structuredNote: 'Provisional draft note',
          },
        });
      }
    );

    const res = await request(app)
      .get('/api/consultations/prescriptions')
      .set('Authorization', `Bearer ${patientA.token}`);

    expect([200, 201]).toContain(res.status);
    const containsDraft = res.body.prescriptions.some((p: any) => p.id === draftNote.id);
    expect(containsDraft).toBe(false);

    // Cleanup draft
    await withTenantTransaction(
      prisma,
      { patientId: patientA.id, practiceId: practice.id, userId: doctor.id, role: 'CLINICIAN' },
      async (tx) => {
        await tx.consultationNote.delete({ where: { id: draftNote.id } });
      }
    );
  });
});

