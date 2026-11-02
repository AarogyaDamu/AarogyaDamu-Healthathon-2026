import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AarogyaDamu clinical baseline database...');

  // 1. Clean existing records in correct foreign key order
  await prisma.careNotification.deleteMany();
  await prisma.careTeamMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorPatientAssignment.deleteMany();
  await prisma.consultationNote.deleteMany();
  await prisma.assistantProposal.deleteMany();
  await prisma.caregiverConsent.deleteMany();
  await prisma.medicationSchedule.deleteMany();
  await prisma.healthDocument.deleteMany();
  await prisma.careTask.deleteMany();
  await prisma.carePlanGoal.deleteMany();
  await prisma.carePlanActivity.deleteMany();
  await prisma.carePlan.deleteMany();
  await prisma.healthObservation.deleteMany();
  await prisma.consultationPrep.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('DemoPassword123!', 10);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 2. Create Primary Demo Patient (Ramesh Deshmukh)
  const patient = await prisma.user.create({
    data: {
      email: 'demo.patient1@aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: false,
      profile: {
        create: {
          fullName: 'Ramesh Deshmukh',
          dateOfBirth: new Date('1966-06-18'),
          diabetesType: 'TYPE_2_DIABETES',
          diagnosisYear: 2021,
          primaryClinician: 'Dr. Anjali Kulkarni (Endocrinologist)',
          knownAllergies: 'Sulfonamides (rash)',
          targetFastingMin: 80,
          targetFastingMax: 130,
          targetPostMealMax: 180,
          preferredLanguage: 'en',
          timeZone: 'Asia/Kolkata',
        },
      },
    },
  });
  console.log(`Created demo patient: ${patient.email} (${patient.id})`);

  // 3. Create Doctor Account (Dr. Anjali Kulkarni)
  const doctor = await prisma.user.create({
    data: {
      email: 'dr.kulkarni@aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: true,
      profile: {
        create: {
          fullName: 'Dr. Anjali Kulkarni (Endocrinologist)',
          diabetesType: 'UNKNOWN',
          primaryClinician: 'Sahyadri Specialty Hospital',
        },
      },
    },
  });
  console.log(`Created clinician account: ${doctor.email} (${doctor.id})`);

  // 4. Create Authorized Caregiver Account (Meera Joshi)
  const caregiver = await prisma.user.create({
    data: {
      email: 'meera.joshi@family.aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: false,
      profile: {
        create: {
          fullName: 'Meera Joshi (Daughter)',
          diabetesType: 'UNKNOWN',
          primaryClinician: 'Family Caregiver',
        },
      },
    },
  });
  console.log(`Created caregiver account: ${caregiver.email} (${caregiver.id})`);

  // 5. Seed Care Coordination: Doctor-Patient Link
  await prisma.doctorPatientAssignment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  // 6. Seed Active Shared Diabetes Care Plan (v1)
  const carePlan = await prisma.carePlan.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      version: 1,
      status: 'ACTIVE',
      title: 'Type 2 Diabetes Glycemic Control Plan v1',
      summary: 'Target fasting glucose 80-130 mg/dL, post-meal <180 mg/dL. Evening Metformin SR 500mg, twice-weekly glucose monitoring, and 30-minute daily walking.',
      reviewDate: new Date(now + 30 * dayMs),
      approvedAt: new Date(now - 2 * dayMs),
      goals: {
        create: [
          {
            category: 'GLUCOSE',
            title: 'Maintain fasting blood sugar in target',
            targetValue: '80 - 130',
            unit: 'mg/dL',
            timeframe: 'Daily',
            status: 'IN_PROGRESS',
          },
          {
            category: 'GLUCOSE',
            title: 'Keep post-meal blood sugar under threshold',
            targetValue: '< 180',
            unit: 'mg/dL',
            timeframe: 'Daily',
            status: 'IN_PROGRESS',
          },
          {
            category: 'LIFESTYLE',
            title: 'Regular moderate exercise',
            targetValue: '150',
            unit: 'mins/week',
            timeframe: 'Weekly',
            status: 'IN_PROGRESS',
          },
        ],
      },
      activities: {
        create: [
          {
            category: 'BLOOD_SUGAR_CHECK',
            title: 'Morning fasting blood glucose check',
            frequency: 'DAILY',
            timing: 'MORNING',
            instructions: 'Record fasting glucose immediately upon waking before tea/breakfast.',
            isCaregiverEligible: true,
          },
          {
            category: 'EXERCISE',
            title: 'Brisk evening post-dinner walk (30 mins)',
            frequency: 'DAILY',
            timing: 'EVENING',
            instructions: 'Brisk walking for 30 minutes 45 minutes after dinner.',
            isCaregiverEligible: true,
          },
          {
            category: 'MEDICATION',
            title: 'Take Tab Metformin 500mg SR with dinner',
            frequency: 'DAILY',
            timing: 'WITH_MEALS',
            instructions: 'Take 1 tablet with the evening meal.',
            isCaregiverEligible: false,
          },
          {
            category: 'MEDICATION',
            title: 'Weekly pill box replenishment & adherence review',
            frequency: 'WEEKLY',
            timing: 'MORNING',
            instructions: 'Fill the 7-day pill organizer and check expiry dates.',
            isCaregiverEligible: true,
          },
        ],
      },
    },
  });
  console.log(`Created active CarePlan v1: ${carePlan.id}`);

  // 7. Seed Health Observations (Glucose Readings)
  await prisma.healthObservation.createMany({
    data: [
      {
        userId: patient.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 118,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning empty stomach check',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 3 * dayMs),
      },
      {
        userId: patient.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 162,
        unit: 'mg/dL',
        context: 'POST_MEAL_2HR',
        notes: '2 hours post-lunch',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 2 * dayMs),
      },
      {
        userId: patient.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 122,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Voice logged: "सकाळी उपाशीपोटी साखर 122 आहे"',
        provenance: 'VOICE_LOGGED',
        observedAt: new Date(now - 1 * dayMs),
      },
      {
        userId: patient.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 128,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning routine glucometer reading',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now),
      },
    ],
  });

  // 8. Seed Medication Schedules
  await prisma.medicationSchedule.createMany({
    data: [
      {
        userId: patient.id,
        medicineName: 'Tab Metformin SR',
        dosage: '500mg',
        timing: 'NIGHT',
        isActive: true,
      },
      {
        userId: patient.id,
        medicineName: 'Tab Telmisartan',
        dosage: '40mg',
        timing: 'MORNING',
        isActive: true,
      },
    ],
  });

  // 9. Seed Care Tasks (Linked to Care Plan)
  await prisma.careTask.createMany({
    data: [
      {
        userId: patient.id,
        carePlanId: carePlan.id,
        title: 'Check morning fasting blood glucose',
        category: 'MONITORING',
        status: 'PENDING',
        dueAt: new Date(now + 12 * 60 * 60 * 1000),
        idempotencyKey: 'seed_task_fasting_sugar_1',
      },
      {
        userId: patient.id,
        carePlanId: carePlan.id,
        title: 'Take Tab Metformin 500mg SR with dinner',
        category: 'MEDICATION',
        status: 'PENDING',
        dueAt: new Date(now + 6 * 60 * 60 * 1000),
        idempotencyKey: 'seed_task_metformin_dinner_1',
      },
      {
        userId: patient.id,
        carePlanId: carePlan.id,
        title: '30-minute moderate post-lunch walk',
        category: 'LIFESTYLE',
        status: 'COMPLETED',
        dueAt: new Date(now - 4 * 60 * 60 * 1000),
        completedAt: new Date(now - 3 * 60 * 60 * 1000),
        completedById: caregiver.id,
        completedByRole: 'CAREGIVER',
        idempotencyKey: 'seed_task_walk_1',
      },
    ],
  });

  // 10. Seed Stored Health Documents with Smart Medical Summaries
  await prisma.healthDocument.createMany({
    data: [
      {
        userId: patient.id,
        title: 'Quarterly Glycemic Panel (HbA1c: 6.3%)',
        category: 'LAB_REPORT',
        issuingFacility: 'Metropolis Healthcare Pune',
        reportDate: new Date('2026-10-11'),
        processingStatus: 'READY',
        extractedData: JSON.stringify({
          plainSummary: 'Laboratory report from Metropolis Healthcare Pune. Fasting Blood Sugar: 118 mg/dL (In Target), HbA1c: 6.3% (In Target).',
          biomarkers: [
            {
              testName: 'HbA1c (3-Month Sugar Average)',
              value: 6.3,
              unit: '%',
              referenceRange: '< 5.7% (Normal), < 7.0% (Diabetes Target)',
              status: 'In Target',
              meaning: 'Shows your average blood sugar over the last 90 days.',
            },
            {
              testName: 'Fasting Blood Sugar (FBS)',
              value: 118,
              unit: 'mg/dL',
              referenceRange: '70 - 99 mg/dL (Normal), 80 - 130 mg/dL (Target)',
              status: 'In Target',
              meaning: 'Your sugar level in the morning before eating breakfast.',
            },
          ],
        }),
      },
      {
        userId: patient.id,
        title: 'Endocrinology OPD Prescription Slip',
        category: 'PRESCRIPTION',
        issuingFacility: 'Sahyadri Specialty Hospital',
        reportDate: new Date('2026-09-25'),
        processingStatus: 'READY',
        extractedData: JSON.stringify({
          plainSummary: 'Prescription from Dr. Anjali Kulkarni at Sahyadri Specialty Hospital. Prescribed Tab Metformin 500mg SR with dinner daily and twice-weekly fasting monitoring.',
          medicines: [
            {
              name: 'Tab Metformin 500mg SR',
              timing: '1 tablet with dinner daily',
              purpose: 'Lowers and controls blood sugar (Diabetes)',
            },
            {
              name: 'Tab Telmisartan 40mg',
              timing: '1 tab in morning before breakfast',
              purpose: 'Protects heart and controls blood pressure',
            },
          ],
          doctorAdvice: [
            'Fasting glucose monitoring twice weekly.',
            'Follow up in 3 months with repeat HbA1c test.',
          ],
        }),
      },
    ],
  });

  // 11. Seed Upcoming Consultation Prep
  await prisma.consultationPrep.create({
    data: {
      userId: patient.id,
      clinicianName: 'Dr. Anjali Kulkarni (Endocrinologist)',
      facilityName: 'Sahyadri Specialty Hospital',
      scheduledAt: new Date(now + 4 * dayMs),
      concernsAndQuestions: 'Fasting blood sugar running stable (118–128 mg/dL). Occasional afternoon thirst after long walks.',
      personalNotes: 'Taking Metformin regularly with dinner. Morning walking routine maintained.',
    },
  });

  // 12. Seed Caregiver Delegation Consent (Linked to Caregiver Account)
  await prisma.caregiverConsent.create({
    data: {
      patientId: patient.id,
      caregiverEmail: caregiver.email,
      caregiverName: 'Meera Joshi',
      relationship: 'DAUGHTER',
      status: 'ACTIVE',
      permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_TASKS', 'VIEW_CARE_PLAN', 'VIEW_DOCUMENTS']),
      expiresAt: new Date(now + 365 * dayMs),
    },
  });

  // 13. Seed AI Medical Scribe Approved Consultation Note
  await prisma.consultationNote.create({
    data: {
      userId: patient.id,
      clinicianId: doctor.id,
      clinicianName: 'Dr. Anjali Kulkarni (Endocrinologist)',
      facilityName: 'Sahyadri Specialty Hospital',
      status: 'APPROVED',
      audioConsentObtained: true,
      rawTranscript: 'Doctor: Namaste Ramesh-ji. How have your sugars been running? Patient: Fasting is averaging around 120-128. Doctor: That is well within our 80-130 target. Continue Metformin 500mg SR with dinner and we will review again next month.',
      speakerSegments: JSON.stringify([
        { speaker: 'Doctor', text: 'Namaste Ramesh-ji. How have your sugars been running?' },
        { speaker: 'Patient', text: 'Fasting is averaging around 120-128.' },
        { speaker: 'Doctor', text: 'That is well within our 80-130 target. Continue Metformin 500mg SR with dinner and we will review again next month.' },
      ]),
      structuredNote: JSON.stringify({
        chiefComplaint: 'Routine glycemic control review',
        symptoms: ['Mild afternoon thirst'],
        historyOfPresentIllness: 'Patient with known Type 2 Diabetes reports stable morning glucose under current regimen.',
        relevantMedicalHistory: ['Type 2 Diabetes Mellitus', 'Essential Hypertension'],
        currentMedications: [{ name: 'Tab Metformin SR', dose: '500mg', frequency: 'Once daily with dinner' }],
        allergies: ['Sulfonamides'],
        examinationFindings: ['Alert and oriented', 'Cardiovascular S1/S2 normal', 'Chest clear'],
        clinicalAssessment: 'Type 2 Diabetes Mellitus with satisfactory glycemic control',
        investigationsOrdered: ['Repeat HbA1c panel in 3 months'],
        treatmentPlan: ['Continue Tab Metformin 500mg SR with dinner', '2.5L daily hydration', '30-minute daily walk'],
        followUpInstructions: 'Review in 30 days',
        uncertainOrMissingInformation: ['None documented'],
      }),
      approvedNoteText: 'Doctor: Dr. Anjali Kulkarni | Assessment: Type 2 Diabetes Mellitus with satisfactory glycemic control | Plan: Continue Tab Metformin 500mg SR with dinner; 30-minute daily walk; review in 30 days.',
      approvedAt: new Date(now - 1 * dayMs),
      approvedBy: doctor.id,
    },
  });

  // 14. Seed Confirmed Appointment
  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      bookedById: patient.id,
      scheduledAt: new Date(now + 4 * dayMs),
      durationMinutes: 30,
      reason: 'Routine quarterly diabetes review and glycemic variability assessment',
      visitType: 'DIABETES_REVIEW',
      status: 'CONFIRMED',
      notes: 'Patient requested review of morning glucose stability and walking adherence.',
    },
  });

  // 15. Seed Care Team Messaging
  await prisma.careTeamMessage.createMany({
    data: [
      {
        patientId: patient.id,
        senderId: patient.id,
        senderRole: 'PATIENT',
        category: 'QUESTION',
        content: 'Namaste Dr. Kulkarni, my fasting sugar was 122 this morning. Walking routine is going well.',
        createdAt: new Date(now - 2 * dayMs),
      },
      {
        patientId: patient.id,
        senderId: doctor.id,
        senderRole: 'DOCTOR',
        category: 'DOCTOR_RESPONSE',
        content: 'Very good, Ramesh-ji. 122 mg/dL is within our fasting target. Keep up the post-dinner walks.',
        createdAt: new Date(now - 1 * dayMs),
      },
      {
        patientId: patient.id,
        senderId: caregiver.id,
        senderRole: 'CAREGIVER',
        category: 'CAREGIVER_UPDATE',
        content: 'Father completed his 30-minute walk today and took his dinner on time.',
        createdAt: new Date(now - 6 * 3600000),
      },
    ],
  });

  // 16. Seed Care Notifications
  await prisma.careNotification.createMany({
    data: [
      {
        userId: patient.id,
        patientId: patient.id,
        actorId: doctor.id,
        type: 'FOLLOW_UP_DUE',
        title: 'Care Plan Active',
        message: 'Your doctor has approved your diabetes care plan v1. Open AarogyaDamu to view details.',
        link: '/careplan',
        createdAt: new Date(now - 2 * dayMs),
      },
      {
        userId: patient.id,
        patientId: patient.id,
        actorId: doctor.id,
        type: 'DOCTOR_MESSAGE',
        title: 'Message from Doctor',
        message: 'Dr. Anjali Kulkarni: "Very good, Ramesh-ji. 122 mg/dL is within our fasting target..."',
        link: '/messages',
        createdAt: new Date(now - 1 * dayMs),
      },
      {
        userId: doctor.id,
        patientId: patient.id,
        actorId: caregiver.id,
        type: 'CAREGIVER_UPDATE',
        title: 'Care Team Update',
        message: 'Meera Joshi: "Father completed his 30-minute walk today and took his dinner on time."',
        link: '/messages',
        createdAt: new Date(now - 6 * 3600000),
      },
    ],
  });

  // 17. Initial Audit Log
  await prisma.auditLog.create({
    data: {
      userId: patient.id,
      actorId: patient.id,
      action: 'BASELINE_DATABASE_SEEDED',
      entityType: 'User',
      entityId: patient.id,
      metadata: JSON.stringify({ environment: 'pilot_synthetic', version: '5.0.0' }),
    },
  });

  console.log('Seeding completed successfully with synthetic pilot profiles for Patient, Doctor, and Caregiver!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });