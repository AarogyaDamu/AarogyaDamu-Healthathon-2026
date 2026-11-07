import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const appEnvironment = process.env.APP_ENV;
const databaseUrl = process.env.DATABASE_URL || 'postgresql://aarogyadamu:change-me@localhost:5432/aarogyadamu_dev?schema=public';
if (process.env.NODE_ENV === 'production' || appEnvironment !== 'development') {
  throw new Error('Synthetic seed data requires APP_ENV=development and is disabled in production.');
}
let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error('Synthetic seed data requires a valid local PostgreSQL DATABASE_URL.');
}
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '').split('?')[0];
if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname) ||
    !databaseName.endsWith('_dev')) {
  throw new Error('Synthetic seed data may only target a local PostgreSQL database ending in _dev.');
}

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AarogyaDamu clinical baseline database...');

  // 1. Clean existing records in correct foreign key order
  await prisma.agentAction.deleteMany();
  await prisma.agentPlan.deleteMany();
  await prisma.agentAuditRecord.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.medicationAdherenceEvent.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.careNotification.deleteMany();
  await prisma.careTeamMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorPatientAssignment.deleteMany();
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
          primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
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

  // 3. Create Doctor Account (Dr. Rupam Choudhary)
  const doctor = await prisma.user.create({
    data: {
      email: 'dr.rc@aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: true,
      profile: {
        create: {
          fullName: 'Dr. Rupam Choudhary (Diabetologist)',
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
          plainSummary: 'Prescription from Dr. Rupam Choudhary at Sahyadri Specialty Hospital. Prescribed Tab Metformin 500mg SR with dinner daily and twice-weekly fasting monitoring.',
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
      clinicianName: 'Dr. Rupam Choudhary (Diabetologist)',
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

  // 13. Seed Confirmed Appointment
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
        content: 'Namaste Dr. Choudhary, my fasting sugar was 122 this morning. Walking routine is going well.',
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
        message: 'Dr. Rupam Choudhary: "Very good, Ramesh-ji. 122 mg/dL is within our fasting target..."',
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

  // 17. Seed Synthetic Demo Patient 2: Suresh Patel (Inconsistent Glucose & Missed Reminders)
  const patient2 = await prisma.user.create({
    data: {
      email: 'demo.patient2@aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: false,
      profile: {
        create: {
          fullName: 'Suresh Patel',
          dateOfBirth: new Date('1972-04-12'),
          diabetesType: 'TYPE_2_DIABETES',
          diagnosisYear: 2019,
          primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
          targetFastingMin: 80,
          targetFastingMax: 130,
          targetPostMealMax: 180,
          preferredLanguage: 'en',
          timeZone: 'Asia/Kolkata',
        },
      },
    },
  });
  console.log(`Created demo patient 2: ${patient2.email} (${patient2.id})`);

  await prisma.doctorPatientAssignment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient2.id,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  // Seed Inconsistent Glucose Observations for Suresh Patel (Spikes post-meal)
  await prisma.healthObservation.createMany({
    data: [
      {
        userId: patient2.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 148,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning fasting slightly elevated',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 3 * dayMs),
      },
      {
        userId: patient2.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 218,
        unit: 'mg/dL',
        context: 'POST_MEAL_2HR',
        notes: 'Post heavy lunch (rice and sweets)',
        clinicalFlag: 'ELEVATED_POST_MEAL',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 2 * dayMs),
      },
      {
        userId: patient2.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 152,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning fasting',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 1 * dayMs),
      },
      {
        userId: patient2.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 242,
        unit: 'mg/dL',
        context: 'POST_MEAL_2HR',
        notes: 'Post dinner family celebration',
        clinicalFlag: 'ELEVATED_POST_MEAL',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 12 * 3600000),
      },
    ],
  });

  // Seed Medication Schedule & Missed Adherence for Suresh Patel
  const glimepirideMed = await prisma.medicationSchedule.create({
    data: {
      userId: patient2.id,
      medicineName: 'Tab Glimepiride',
      dosage: '1mg',
      timing: 'MORNING',
      isActive: true,
    },
  });

  await prisma.medicationAdherenceEvent.create({
    data: {
      medicationId: glimepirideMed.id,
      userId: patient2.id,
      action: 'MISSED',
      scheduledTime: new Date(now - dayMs),
      recordedBy: patient2.id,
      sourceProvenance: 'MANUAL_PATIENT',
      notes: 'Patient forgot morning dose due to travel',
      idempotencyKey: 'seed_adh_suresh_missed_1',
    },
  });

  await prisma.reminder.create({
    data: {
      userId: patient2.id,
      createdById: patient2.id,
      title: 'Take Tab Glimepiride 1mg with breakfast',
      category: 'MEDICATION',
      status: 'SCHEDULED',
      remindAt: new Date(now + 12 * 3600000),
      recurrence: 'DAILY',
      notes: 'Morning pre-breakfast reminder',
    },
  });

  // 18. Seed Synthetic Demo Patient 3: Sunita Sharma (Pending Care Tasks & AI Care Proposal)
  const patient3 = await prisma.user.create({
    data: {
      email: 'demo.patient3@aarogyadamu.local',
      passwordHash,
      isSyntheticDemo: true,
      isClinician: false,
      profile: {
        create: {
          fullName: 'Sunita Sharma',
          dateOfBirth: new Date('1961-09-22'),
          diabetesType: 'TYPE_2_DIABETES',
          diagnosisYear: 2017,
          primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
          targetFastingMin: 80,
          targetFastingMax: 130,
          targetPostMealMax: 180,
          preferredLanguage: 'en',
          timeZone: 'Asia/Kolkata',
        },
      },
    },
  });
  console.log(`Created demo patient 3: ${patient3.email} (${patient3.id})`);

  await prisma.doctorPatientAssignment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient3.id,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  // Seed Health Observations for Sunita Sharma (Low fasting trend)
  await prisma.healthObservation.createMany({
    data: [
      {
        userId: patient3.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 74,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning reading with mild shakiness',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 2 * dayMs),
      },
      {
        userId: patient3.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 76,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning reading before tea',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now - 1 * dayMs),
      },
      {
        userId: patient3.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 72,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning reading; felt mild lightheadedness',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(now),
      },
    ],
  });

  // Seed Pending Care Tasks for Sunita Sharma
  await prisma.careTask.createMany({
    data: [
      {
        userId: patient3.id,
        title: 'Annual Comprehensive Diabetic Foot Examination',
        category: 'FOOT_EXAM',
        status: 'PENDING',
        dueAt: new Date(now + 5 * dayMs),
        idempotencyKey: 'seed_task_sunita_foot_exam_1',
      },
      {
        userId: patient3.id,
        title: 'Schedule 3-Month Repeat HbA1c Lab Panel',
        category: 'LAB_TEST',
        status: 'PENDING',
        dueAt: new Date(now + 7 * dayMs),
        idempotencyKey: 'seed_task_sunita_hba1c_1',
      },
    ],
  });

  // Seed AI-Generated Advisory Proposal Awaiting Doctor Review (PENDING_CLINICIAN_APPROVAL)
  const proposalExpiresAt = new Date(now + 24 * 60 * 60 * 1000);
  const proposalPlan = await prisma.agentPlan.create({
    data: {
      id: 'seed-plan-sunita-proposal-1',
      userId: patient3.id,
      targetPatientId: patient3.id,
      userIntent: 'REVISE_CARE_PLAN',
      explanation: 'Patient morning fasting glucose readings have averaged 74 mg/dL over the past week with reported mild lightheadedness. Advisory proposal generated for Dr. Choudhary to review fasting glucose target ranges.',
      highestRiskTier: 'HIGH_RISK',
      status: 'PENDING_CLINICIAN_APPROVAL',
      version: 1,
      actionCount: 1,
      expiresAt: proposalExpiresAt,
      actions: {
        create: [
          {
            id: 'seed-act-sunita-proposal-1',
            toolName: 'tool_draft_care_proposal',
            parameters: JSON.stringify({
              proposalType: 'TARGET_GLUCOSE_RANGE_REVISION',
              title: 'Review Target Fasting Glucose Range for Sunita Sharma',
              rationale: 'Recent fasting observations trending at 72-78 mg/dL with occasional morning lightheadedness. Clinician evaluation recommended to adjust target range from 80-130 mg/dL to 90-140 mg/dL.',
              proposedDetails: {
                currentFastingTarget: '80-130 mg/dL',
                suggestedFastingTarget: '90-140 mg/dL',
                advisoryNotice: 'Advisory proposal only. Physician must clinically evaluate and update CarePlan independently.',
              },
            }),
            riskTier: 'HIGH_RISK',
            status: 'PENDING_CLINICIAN_APPROVAL',
            idempotencyKey: 'seed_idemp_sunita_proposal_1',
            expiresAt: proposalExpiresAt,
          },
        ],
      },
    },
  });

  await prisma.agentAuditRecord.create({
    data: {
      id: 'seed-audit-sunita-proposal-1',
      userId: patient3.id,
      riskTier: 'HIGH_RISK',
      actionType: 'CLINICAL_CARE_PROPOSAL',
      summary: 'AI advisory proposal drafted: Review Target Fasting Glucose Range for Sunita Sharma',
      approvalStatus: 'PENDING',
      requiresClinicianApproval: true,
      payload: JSON.stringify({
        planId: proposalPlan.id,
        actionId: 'seed-act-sunita-proposal-1',
        proposalType: 'TARGET_GLUCOSE_RANGE_REVISION',
      }),
    },
  });
  console.log(`Created AI clinical proposal awaiting doctor review for Sunita Sharma`);

  // 19. Initial Audit Log
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

  // 20. Default System Feature Flags (P0.0 Safety & Governance)
  const defaultFlags = [
    {
      id: 'P0_0_SAFETY_FOUNDATION',
      name: 'Clinical Safety & Data Foundation',
      description: 'ADA safety evaluation thresholds, medical audit logging, AI safety boundaries, and feature governance.',
      isEnabled: true,
      rolloutTier: 'development',
    },
    {
      id: 'P0_1_HEALTH_JOURNAL',
      name: 'Unified Health Journal',
      description: 'Vital signs, continuous/discrete blood glucose, blood pressure, weight, and HbA1c tracking.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_2_MEDICATION_VAULT',
      name: 'Medication Vault & Adherence Management',
      description: 'Prescriptions, medication schedules, dispensing history, and adherence alerts.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_3_LIFESTYLE_TWIN',
      name: 'Lifestyle Tracking & Digital Health Twin',
      description: 'Nutrition logging, physical activity, sleep monitoring, and metabolic modeling.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_4_NOTIFICATIONS_SOS',
      name: 'Clinical Notifications & Emergency SOS',
      description: 'Critical hypoglycemia alerts, caregiver dispatch, and emergency contact escalations.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_6_GROQ_DAMU_ASSISTANT',
      name: 'Damu Multilingual Voice Assistant',
      description: 'Conversational diabetes companion, speech recognition, and regional voice synthesis.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_7_AGENTIC_EXECUTION',
      name: 'Governed Agentic Execution',
      description: 'Human-in-the-loop AI task planning, follow-up scheduling, and care proposal approval.',
      isEnabled: false,
      rolloutTier: 'development',
    },
    {
      id: 'P0_8_EXTERNAL_INTEGRATIONS',
      name: 'Wearables & WhatsApp Integrations',
      description: 'Continuous glucose monitor sync, wearable step counters, and WhatsApp health digests.',
      isEnabled: false,
      rolloutTier: 'development',
    },
  ];

  for (const flag of defaultFlags) {
    await prisma.featureFlag.create({ data: flag });
  }

  console.log('Seeding completed successfully with synthetic pilot profiles and P0.0 feature flags!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
