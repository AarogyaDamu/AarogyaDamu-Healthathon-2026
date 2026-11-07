import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const DEMO_DOCTOR_EMAIL = 'dr.rc@aarogyadamu.local';
export const DEMO_DOCTOR_NAME = 'Dr. Rupam Choudhary (Diabetologist)';
export const DEMO_DOCTOR_FACILITY = 'Sahyadri Specialty Hospital';

export const DEMO_PATIENT_EMAIL = 'demo.patient1@aarogyadamu.local';
export const DEMO_PATIENT_NAME = 'Ramesh Deshmukh';

export const DEMO_PATIENT2_EMAIL = 'demo.patient2@aarogyadamu.local';
export const DEMO_PATIENT2_NAME = 'Suresh Patel';

export const DEMO_PATIENT3_EMAIL = 'demo.patient3@aarogyadamu.local';
export const DEMO_PATIENT3_NAME = 'Sunita Sharma';

export const DEMO_CAREGIVER_EMAIL = 'meera.joshi@family.aarogyadamu.local';
export const DEMO_CAREGIVER_NAME = 'Meera Joshi (Daughter)';

export const DEFAULT_DEMO_PASSWORD = 'DemoPassword123!';

export interface StagingSeedStats {
  featureFlags: number;
  users: number;
  assignments: number;
  carePlans: number;
  observations: number;
  medicationSchedules: number;
  adherenceEvents: number;
  careTasks: number;
  healthDocuments: number;
  consultationPreps: number;
  consultationNotes: number;
  appointments: number;
  messages: number;
  notifications: number;
  lifestyleRecords: number;
  emergencyContacts: number;
  reminders: number;
  agentProposals: number;
}

export interface StagingSeedResult {
  success: boolean;
  actionTaken: 'CREATED' | 'UPDATED' | 'ALREADY_VALID' | 'SKIPPED_PRODUCTION';
  doctorId?: string;
  doctorEmail: string;
  isClinician: boolean;
  isActive: boolean;
  hasPatientLink: boolean;
  message: string;
  stats?: StagingSeedStats;
}

/**
 * Safely and idempotently bootstraps the synthetic demo clinical dataset in Staging.
 *
 * Invariant rules enforced:
 * - Strictly prohibited when APP_ENV === 'production' (real production with real patients).
 * - Safe and non-destructive: NEVER executes deleteMany() or resets the database.
 * - Touches ONLY synthetic demonstration accounts (isSyntheticDemo: true).
 * - Retains full bcrypt password verification and standard authentication requirements.
 */
export async function ensureStagingDemoDoctor(prisma: PrismaClient): Promise<StagingSeedResult> {
  // 1. Guard against real production environments
  if (env.APP_ENV === 'production') {
    return {
      success: false,
      actionTaken: 'SKIPPED_PRODUCTION',
      doctorEmail: DEMO_DOCTOR_EMAIL,
      isClinician: false,
      isActive: false,
      hasPatientLink: false,
      message: 'Synthetic demo seed is strictly disabled in production (APP_ENV=production).',
    };
  }

  const rawPassword = process.env.DEMO_DOCTOR_PASSWORD || process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats: StagingSeedStats = {
    featureFlags: 0,
    users: 0,
    assignments: 0,
    carePlans: 0,
    observations: 0,
    medicationSchedules: 0,
    adherenceEvents: 0,
    careTasks: 0,
    healthDocuments: 0,
    consultationPreps: 0,
    consultationNotes: 0,
    appointments: 0,
    messages: 0,
    notifications: 0,
    lifestyleRecords: 0,
    emergencyContacts: 0,
    reminders: 0,
    agentProposals: 0,
  };

  // -------------------------------------------------------------------------
  // 2. Ensure Core Feature Flags (P0.0 through P0.8) are Enabled in Staging
  // -------------------------------------------------------------------------
  const requiredFlags = [
    {
      id: 'P0_0_SAFETY_FOUNDATION',
      name: 'Clinical Safety & Data Foundation',
      description: 'ADA safety evaluation thresholds, medical audit logging, AI safety boundaries, and feature governance.',
    },
    {
      id: 'P0_1_HEALTH_JOURNAL',
      name: 'Unified Health Journal',
      description: 'Vital signs, continuous/discrete blood glucose, blood pressure, weight, and HbA1c tracking.',
    },
    {
      id: 'P0_2_MEDICATION_VAULT',
      name: 'Medication Vault & Adherence Management',
      description: 'Prescriptions, medication schedules, dispensing history, and adherence alerts.',
    },
    {
      id: 'P0_3_LIFESTYLE_TWIN',
      name: 'Lifestyle Tracking & Digital Health Twin',
      description: 'Nutrition logging, physical activity, sleep monitoring, and metabolic modeling.',
    },
    {
      id: 'P0_4_NOTIFICATIONS_SOS',
      name: 'Clinical Notifications & Emergency SOS',
      description: 'Critical hypoglycemia alerts, caregiver dispatch, and emergency contact escalations.',
    },
    {
      id: 'P0_6_GROQ_VOICE_ASSISTANT',
      name: 'Damu Multilingual Voice Assistant (Canonical)',
      description: 'Conversational diabetes companion, speech recognition, and regional voice synthesis.',
    },
    {
      id: 'P0_6_GROQ_DAMU_ASSISTANT',
      name: 'Damu Multilingual Voice Assistant (Alias)',
      description: 'Conversational diabetes companion, speech recognition, and regional voice synthesis.',
    },
    {
      id: 'P0_7_AGENTIC_EXECUTION',
      name: 'Governed Agentic Execution',
      description: 'Human-in-the-loop AI task planning, follow-up scheduling, and care proposal approval.',
    },
    {
      id: 'P0_8_EXTERNAL_INTEGRATIONS',
      name: 'Wearables & WhatsApp Integrations',
      description: 'Continuous glucose monitor sync, wearable step counters, and WhatsApp health digests.',
    },
  ];

  for (const flag of requiredFlags) {
    await prisma.featureFlag.upsert({
      where: { id: flag.id },
      create: {
        id: flag.id,
        name: flag.name,
        description: flag.description,
        isEnabled: true,
        rolloutTier: 'staging',
      },
      update: {
        isEnabled: true,
        rolloutTier: 'staging',
      },
    });
    stats.featureFlags++;
  }

  // -------------------------------------------------------------------------
  // 3. Handle Legacy Doctor Email Migration
  // -------------------------------------------------------------------------
  const legacyDoctor = await prisma.user.findUnique({
    where: { email: 'dr.kulkarni@aarogyadamu.local' },
  });
  if (legacyDoctor) {
    const existingTarget = await prisma.user.findUnique({
      where: { email: DEMO_DOCTOR_EMAIL },
    });
    if (!existingTarget) {
      await prisma.user.update({
        where: { id: legacyDoctor.id },
        data: { email: DEMO_DOCTOR_EMAIL },
      });
      console.log(`[Staging Demo Seed] Migrated legacy doctor email to ${DEMO_DOCTOR_EMAIL}`);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Ensure Doctor Account (Dr. Rupam Choudhary)
  // -------------------------------------------------------------------------
  let doctor = await prisma.user.findUnique({
    where: { email: DEMO_DOCTOR_EMAIL },
    include: { profile: true },
  });

  let actionTaken: 'CREATED' | 'UPDATED' | 'ALREADY_VALID' = 'ALREADY_VALID';

  if (!doctor) {
    doctor = await prisma.user.create({
      data: {
        email: DEMO_DOCTOR_EMAIL,
        passwordHash,
        isSyntheticDemo: true,
        isClinician: true,
        isActive: true,
        profile: {
          create: {
            fullName: DEMO_DOCTOR_NAME,
            diabetesType: 'UNKNOWN',
            primaryClinician: DEMO_DOCTOR_FACILITY,
          },
        },
      },
      include: { profile: true },
    });
    actionTaken = 'CREATED';
    console.log(`[Staging Demo Seed] Created synthetic demo doctor account: ${DEMO_DOCTOR_EMAIL}`);
  } else {
    const passwordMatches = await bcrypt.compare(rawPassword, doctor.passwordHash);
    const needsUpdate =
      !passwordMatches ||
      !doctor.isClinician ||
      !doctor.isSyntheticDemo ||
      !doctor.isActive;

    if (needsUpdate) {
      doctor = await prisma.user.update({
        where: { id: doctor.id },
        data: {
          passwordHash,
          isSyntheticDemo: true,
          isClinician: true,
          isActive: true,
          deactivatedAt: null,
        },
        include: { profile: true },
      });
      actionTaken = 'UPDATED';
      console.log(`[Staging Demo Seed] Synchronized credentials and active clinician status for: ${DEMO_DOCTOR_EMAIL}`);
    }

    if (!doctor.profile) {
      await prisma.patientProfile.create({
        data: {
          userId: doctor.id,
          fullName: DEMO_DOCTOR_NAME,
          diabetesType: 'UNKNOWN',
          primaryClinician: DEMO_DOCTOR_FACILITY,
        },
      });
      actionTaken = 'UPDATED';
    }
  }
  stats.users++;

  // -------------------------------------------------------------------------
  // 5. Ensure Primary Demo Patient (Ramesh Deshmukh)
  // -------------------------------------------------------------------------
  let patient1 = await prisma.user.findUnique({
    where: { email: DEMO_PATIENT_EMAIL },
    include: { profile: true },
  });

  if (!patient1) {
    patient1 = await prisma.user.create({
      data: {
        email: DEMO_PATIENT_EMAIL,
        passwordHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: true,
        profile: {
          create: {
            fullName: DEMO_PATIENT_NAME,
            dateOfBirth: new Date('1966-06-18'),
            diabetesType: 'TYPE_2_DIABETES',
            diagnosisYear: 2021,
            primaryClinician: DEMO_DOCTOR_NAME,
            knownAllergies: 'Sulfonamides (rash)',
            targetFastingMin: 80,
            targetFastingMax: 130,
            targetPostMealMax: 180,
            emergencyContactName: 'Meera Joshi (Daughter)',
            emergencyContactPhone: '+91-98765-43210',
            preferredLanguage: 'en',
            timeZone: 'Asia/Kolkata',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[Staging Demo Seed] Created primary demo patient: ${DEMO_PATIENT_EMAIL}`);
  } else {
    const passwordMatches = await bcrypt.compare(rawPassword, patient1.passwordHash);
    if (!passwordMatches || !patient1.isActive) {
      patient1 = await prisma.user.update({
        where: { id: patient1.id },
        data: { passwordHash, isActive: true },
        include: { profile: true },
      });
    }
  }
  stats.users++;

  // -------------------------------------------------------------------------
  // 6. Ensure Demo Patient 2 (Suresh Patel - Elevated Spikes & Missed Doses)
  // -------------------------------------------------------------------------
  let patient2 = await prisma.user.findUnique({
    where: { email: DEMO_PATIENT2_EMAIL },
    include: { profile: true },
  });

  if (!patient2) {
    patient2 = await prisma.user.create({
      data: {
        email: DEMO_PATIENT2_EMAIL,
        passwordHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: true,
        profile: {
          create: {
            fullName: DEMO_PATIENT2_NAME,
            dateOfBirth: new Date('1972-04-12'),
            diabetesType: 'TYPE_2_DIABETES',
            diagnosisYear: 2019,
            primaryClinician: DEMO_DOCTOR_NAME,
            targetFastingMin: 80,
            targetFastingMax: 130,
            targetPostMealMax: 180,
            preferredLanguage: 'en',
            timeZone: 'Asia/Kolkata',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[Staging Demo Seed] Created demo patient 2: ${DEMO_PATIENT2_EMAIL}`);
  } else {
    const passwordMatches = await bcrypt.compare(rawPassword, patient2.passwordHash);
    if (!passwordMatches || !patient2.isActive) {
      patient2 = await prisma.user.update({
        where: { id: patient2.id },
        data: { passwordHash, isActive: true },
        include: { profile: true },
      });
    }
  }
  stats.users++;

  // -------------------------------------------------------------------------
  // 7. Ensure Demo Patient 3 (Sunita Sharma - Low Fasting & AI Care Proposal)
  // -------------------------------------------------------------------------
  let patient3 = await prisma.user.findUnique({
    where: { email: DEMO_PATIENT3_EMAIL },
    include: { profile: true },
  });

  if (!patient3) {
    patient3 = await prisma.user.create({
      data: {
        email: DEMO_PATIENT3_EMAIL,
        passwordHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: true,
        profile: {
          create: {
            fullName: DEMO_PATIENT3_NAME,
            dateOfBirth: new Date('1961-09-22'),
            diabetesType: 'TYPE_2_DIABETES',
            diagnosisYear: 2017,
            primaryClinician: DEMO_DOCTOR_NAME,
            targetFastingMin: 80,
            targetFastingMax: 130,
            targetPostMealMax: 180,
            preferredLanguage: 'en',
            timeZone: 'Asia/Kolkata',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[Staging Demo Seed] Created demo patient 3: ${DEMO_PATIENT3_EMAIL}`);
  } else {
    const passwordMatches = await bcrypt.compare(rawPassword, patient3.passwordHash);
    if (!passwordMatches || !patient3.isActive) {
      patient3 = await prisma.user.update({
        where: { id: patient3.id },
        data: { passwordHash, isActive: true },
        include: { profile: true },
      });
    }
  }
  stats.users++;

  // -------------------------------------------------------------------------
  // 8. Ensure Caregiver Account (Meera Joshi)
  // -------------------------------------------------------------------------
  let caregiver = await prisma.user.findUnique({
    where: { email: DEMO_CAREGIVER_EMAIL },
    include: { profile: true },
  });

  if (!caregiver) {
    caregiver = await prisma.user.create({
      data: {
        email: DEMO_CAREGIVER_EMAIL,
        passwordHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: true,
        profile: {
          create: {
            fullName: DEMO_CAREGIVER_NAME,
            diabetesType: 'UNKNOWN',
            primaryClinician: 'Family Caregiver',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[Staging Demo Seed] Created demo caregiver: ${DEMO_CAREGIVER_EMAIL}`);
  } else {
    const passwordMatches = await bcrypt.compare(rawPassword, caregiver.passwordHash);
    if (!passwordMatches || !caregiver.isActive) {
      caregiver = await prisma.user.update({
        where: { id: caregiver.id },
        data: { passwordHash, isActive: true },
        include: { profile: true },
      });
    }
  }
  stats.users++;

  // -------------------------------------------------------------------------
  // 9. Ensure Doctor–Patient Assignments (Dr. Rupam -> Ramesh, Suresh, Sunita)
  // -------------------------------------------------------------------------
  const patients = [patient1, patient2, patient3];
  for (const p of patients) {
    if (doctor && p) {
      await prisma.doctorPatientAssignment.upsert({
        where: {
          doctorId_patientId: {
            doctorId: doctor.id,
            patientId: p.id,
          },
        },
        create: {
          doctorId: doctor.id,
          patientId: p.id,
          status: 'ACTIVE',
          activatedAt: new Date(now - 30 * dayMs),
        },
        update: {
          status: 'ACTIVE',
        },
      });
      stats.assignments++;
    }
  }

  // -------------------------------------------------------------------------
  // 10. Ensure Caregiver Consent (Ramesh Deshmukh -> Meera Joshi)
  // -------------------------------------------------------------------------
  const caregiverPermissions = JSON.stringify([
    'VIEW_OBSERVATIONS',
    'VIEW_HEALTH_SUMMARY',
    'VIEW_TASKS',
    'MANAGE_TASKS',
    'COMPLETE_TASKS_ON_BEHALF',
    'VIEW_CARE_PLAN',
    'VIEW_DOCUMENTS',
    'VIEW_REPORTS',
    'VIEW_CONSULTATIONS',
    'VIEW_APPOINTMENTS',
    'MANAGE_APPOINTMENTS',
    'VIEW_MEDICATIONS',
    'VIEW_MEDICATION_ADHERENCE',
    'VIEW_LIFESTYLE',
    'VIEW_HEALTH_TIMELINE',
  ]);

  const activeGrantKey = `${patient1.id}:${caregiver.email.toLowerCase()}`;
  await prisma.caregiverConsent.upsert({
    where: { activeGrantKey },
    create: {
      patientId: patient1.id,
      caregiverEmail: caregiver.email,
      caregiverName: 'Meera Joshi',
      relationship: 'DAUGHTER',
      status: 'ACTIVE',
      permissions: caregiverPermissions,
      activeGrantKey,
      expiresAt: new Date(now + 365 * dayMs),
      acceptedAt: new Date(now - 25 * dayMs),
    },
    update: {
      status: 'ACTIVE',
      permissions: caregiverPermissions,
      expiresAt: new Date(now + 365 * dayMs),
    },
  });

  // -------------------------------------------------------------------------
  // 11. Ensure Shared Diabetes Care Plan v1 for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  let carePlan = await prisma.carePlan.findFirst({
    where: {
      patientId: patient1.id,
      doctorId: doctor.id,
      version: 1,
    },
    include: { goals: true, activities: true },
  });

  if (!carePlan) {
    carePlan = await prisma.carePlan.create({
      data: {
        patientId: patient1.id,
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
            {
              category: 'HBA1C',
              title: 'Maintain quarterly HbA1c below 6.5%',
              targetValue: '< 6.5',
              unit: '%',
              timeframe: 'Quarterly',
              status: 'ACHIEVED',
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
      include: { goals: true, activities: true },
    });
  }
  stats.carePlans++;

  // -------------------------------------------------------------------------
  // 12. Ensure Health Observations for Ramesh Deshmukh (14-Day Timeline)
  // -------------------------------------------------------------------------
  const rameshObservations = [
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 116,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning routine fasting check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_13',
      observedAt: new Date(now - 13 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 120,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning check after 8h sleep',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_12',
      observedAt: new Date(now - 12 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 154,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'NORMAL',
      notes: '2 hours post-lunch (dal, roti, curd)',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_pm_12',
      observedAt: new Date(now - 12 * dayMs + 5 * 3600000),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 118,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning fasting glucose check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_11',
      observedAt: new Date(now - 11 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 122,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning fasting glucose',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_10',
      observedAt: new Date(now - 10 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 162,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'NORMAL',
      notes: '2 hours post-dinner check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_pm_10',
      observedAt: new Date(now - 10 * dayMs + 13 * 3600000),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 117,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Early morning fasting reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_9',
      observedAt: new Date(now - 9 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 125,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning routine reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_8',
      observedAt: new Date(now - 8 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 158,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'NORMAL',
      notes: '2 hours post-lunch reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_pm_8',
      observedAt: new Date(now - 8 * dayMs + 5 * 3600000),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 121,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning empty stomach reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_7',
      observedAt: new Date(now - 7 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 119,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning fasting',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_6',
      observedAt: new Date(now - 6 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 123,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning reading before tea',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_5',
      observedAt: new Date(now - 5 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 120,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning routine reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_4',
      observedAt: new Date(now - 4 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 118,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning empty stomach check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_3',
      observedAt: new Date(now - 3 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 162,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'NORMAL',
      notes: '2 hours post-lunch check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_pm_2',
      observedAt: new Date(now - 2 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 122,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Voice logged: "सकाळी उपाशीपोटी साखर 122 आहे"',
      provenance: 'VOICE_LOGGED',
      idempotencyKey: 'seed_obs_ramesh_f_1_voice',
      observedAt: new Date(now - 1 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 128,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning routine glucometer reading',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_f_0',
      observedAt: new Date(now),
    },
    {
      type: 'HBA1C',
      numericValue: 6.3,
      unit: '%',
      context: 'LAB_CONFIRMED',
      clinicalFlag: 'NORMAL',
      notes: 'Metropolis Healthcare laboratory report result',
      provenance: 'CLINICIAN_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_hba1c_quarterly',
      observedAt: new Date(now - 25 * dayMs),
    },
    {
      type: 'BLOOD_PRESSURE',
      numericValue: 124,
      secondaryValue: 82,
      unit: 'mmHg',
      context: 'RESTING',
      clinicalFlag: 'NORMAL',
      notes: 'Resting seated blood pressure check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_ramesh_bp_recent',
      observedAt: new Date(now - 1 * dayMs),
    },
  ];

  for (const obs of rameshObservations) {
    await prisma.healthObservation.upsert({
      where: { idempotencyKey: obs.idempotencyKey },
      create: {
        userId: patient1.id,
        type: obs.type,
        numericValue: obs.numericValue,
        secondaryValue: obs.secondaryValue || null,
        unit: obs.unit,
        context: obs.context,
        clinicalFlag: obs.clinicalFlag,
        notes: obs.notes,
        provenance: obs.provenance,
        idempotencyKey: obs.idempotencyKey,
        observedAt: obs.observedAt,
      },
      update: {
        numericValue: obs.numericValue,
        secondaryValue: obs.secondaryValue || null,
        clinicalFlag: obs.clinicalFlag,
      },
    });
    stats.observations++;
  }

  // -------------------------------------------------------------------------
  // 13. Ensure Medication Schedules for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  let metformin = await prisma.medicationSchedule.findFirst({
    where: {
      userId: patient1.id,
      medicineName: 'Tab Metformin SR',
    },
  });
  if (!metformin) {
    metformin = await prisma.medicationSchedule.create({
      data: {
        userId: patient1.id,
        medicineName: 'Tab Metformin SR',
        medicationName: 'Metformin Hydrochloride Extended-Release',
        genericName: 'Metformin Hydrochloride',
        dosage: '500mg',
        timing: 'NIGHT',
        foodInstructions: 'Take with dinner',
        instructions: '1 tablet once daily with evening meal',
        route: 'ORAL',
        frequency: 'DAILY',
        status: 'ACTIVE',
        reviewStatus: 'CLINICIAN_REVIEWED',
        reviewedByClinicianId: doctor.id,
        reviewedAt: new Date(now - 30 * dayMs),
        clinicalReviewNotes: 'Glycemic response stable. No GI intolerance noted.',
        isActive: true,
      },
    });
  }
  stats.medicationSchedules++;

  let telmisartan = await prisma.medicationSchedule.findFirst({
    where: {
      userId: patient1.id,
      medicineName: 'Tab Telmisartan',
    },
  });
  if (!telmisartan) {
    telmisartan = await prisma.medicationSchedule.create({
      data: {
        userId: patient1.id,
        medicineName: 'Tab Telmisartan',
        medicationName: 'Telmisartan Tablets IP',
        genericName: 'Telmisartan',
        dosage: '40mg',
        timing: 'MORNING',
        foodInstructions: 'Before breakfast',
        instructions: '1 tablet in the morning',
        route: 'ORAL',
        frequency: 'DAILY',
        status: 'ACTIVE',
        reviewStatus: 'CLINICIAN_REVIEWED',
        reviewedByClinicianId: doctor.id,
        reviewedAt: new Date(now - 30 * dayMs),
        clinicalReviewNotes: 'Blood pressure in target (124/82 mmHg). Renal profile normal.',
        isActive: true,
      },
    });
  }
  stats.medicationSchedules++;

  // -------------------------------------------------------------------------
  // 14. Ensure Medication Adherence Events for Ramesh Deshmukh (Past 7 Days)
  // -------------------------------------------------------------------------
  const adherencePlan = [
    { medId: metformin.id, day: 6, action: 'TAKEN', note: 'Taken with dinner' },
    { medId: telmisartan.id, day: 6, action: 'TAKEN', note: 'Taken before breakfast' },
    { medId: metformin.id, day: 5, action: 'TAKEN', note: 'Taken with dinner' },
    { medId: telmisartan.id, day: 5, action: 'TAKEN', note: 'Taken before breakfast' },
    { medId: metformin.id, day: 4, action: 'MISSED', note: 'Patient forgot dinner dose due to late meeting' },
    { medId: telmisartan.id, day: 4, action: 'TAKEN', note: 'Taken before breakfast' },
    { medId: metformin.id, day: 3, action: 'TAKEN', note: 'Taken with dinner' },
    { medId: telmisartan.id, day: 3, action: 'TAKEN', note: 'Taken before breakfast' },
    { medId: metformin.id, day: 2, action: 'TAKEN', note: 'Taken with dinner' },
    { medId: telmisartan.id, day: 2, action: 'TAKEN', note: 'Taken before breakfast' },
    { medId: metformin.id, day: 1, action: 'TAKEN', note: 'Taken with dinner' },
    { medId: telmisartan.id, day: 1, action: 'TAKEN', note: 'Taken before breakfast' },
  ];

  for (const item of adherencePlan) {
    const key = `seed_adh_ramesh_${item.medId.slice(0, 8)}_${item.day}`;
    await prisma.medicationAdherenceEvent.upsert({
      where: { idempotencyKey: key },
      create: {
        medicationId: item.medId,
        userId: patient1.id,
        action: item.action,
        scheduledTime: new Date(now - item.day * dayMs),
        recordedAt: new Date(now - item.day * dayMs + 1800000),
        recordedBy: patient1.id,
        sourceProvenance: 'MANUAL_PATIENT',
        notes: item.note,
        idempotencyKey: key,
      },
      update: {
        action: item.action,
        notes: item.note,
      },
    });
    stats.adherenceEvents++;
  }

  // -------------------------------------------------------------------------
  // 15. Ensure Care Tasks for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  const rameshTasks = [
    {
      key: 'seed_task_fasting_sugar_1',
      title: 'Check morning fasting blood glucose',
      category: 'MONITORING',
      status: 'PENDING',
      dueAt: new Date(now + 12 * 3600000),
      carePlanId: carePlan?.id,
    },
    {
      key: 'seed_task_metformin_dinner_1',
      title: 'Take Tab Metformin 500mg SR with dinner',
      category: 'MEDICATION',
      status: 'PENDING',
      dueAt: new Date(now + 6 * 3600000),
      carePlanId: carePlan?.id,
    },
    {
      key: 'seed_task_walk_1',
      title: '30-minute moderate post-lunch walk',
      category: 'LIFESTYLE',
      status: 'COMPLETED',
      dueAt: new Date(now - 4 * 3600000),
      completedAt: new Date(now - 3 * 3600000),
      completedById: caregiver.id,
      completedByRole: 'CAREGIVER',
      carePlanId: carePlan?.id,
    },
    {
      key: 'seed_task_pillbox_1',
      title: 'Weekly pill box replenishment & adherence review',
      category: 'MEDICATION',
      status: 'COMPLETED',
      dueAt: new Date(now - 2 * dayMs),
      completedAt: new Date(now - 2 * dayMs + 3600000),
      completedById: caregiver.id,
      completedByRole: 'CAREGIVER',
      carePlanId: carePlan?.id,
    },
  ];

  for (const t of rameshTasks) {
    await prisma.careTask.upsert({
      where: { idempotencyKey: t.key },
      create: {
        userId: patient1.id,
        carePlanId: t.carePlanId || null,
        title: t.title,
        category: t.category,
        status: t.status,
        dueAt: t.dueAt,
        completedAt: t.completedAt || null,
        completedById: t.completedById || null,
        completedByRole: t.completedByRole || null,
        idempotencyKey: t.key,
      },
      update: {
        status: t.status,
        dueAt: t.dueAt,
      },
    });
    stats.careTasks++;
  }

  // -------------------------------------------------------------------------
  // 16. Ensure Health Documents for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  const existingDocs = await prisma.healthDocument.findMany({
    where: { userId: patient1.id },
  });

  if (!existingDocs.some((d) => d.title.includes('Quarterly Glycemic Panel'))) {
    await prisma.healthDocument.create({
      data: {
        userId: patient1.id,
        title: 'Quarterly Glycemic Panel (HbA1c: 6.3%)',
        category: 'LAB_REPORT',
        issuingFacility: 'Metropolis Healthcare Pune',
        reportDate: new Date(now - 25 * dayMs),
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
    });
    stats.healthDocuments++;
  }

  if (!existingDocs.some((d) => d.title.includes('Prescription Slip'))) {
    await prisma.healthDocument.create({
      data: {
        userId: patient1.id,
        title: 'Endocrinology OPD Prescription Slip',
        category: 'PRESCRIPTION',
        issuingFacility: 'Sahyadri Specialty Hospital',
        reportDate: new Date(now - 30 * dayMs),
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
    });
    stats.healthDocuments++;
  }

  // -------------------------------------------------------------------------
  // 17. Ensure Consultation Prep & Appointments for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  const existingPrep = await prisma.consultationPrep.findFirst({
    where: { userId: patient1.id },
  });
  if (!existingPrep) {
    await prisma.consultationPrep.create({
      data: {
        userId: patient1.id,
        clinicianName: DEMO_DOCTOR_NAME,
        facilityName: DEMO_DOCTOR_FACILITY,
        scheduledAt: new Date(now + 4 * dayMs),
        concernsAndQuestions: 'Fasting blood sugar running stable (118–128 mg/dL). Occasional afternoon thirst after long walks.',
        personalNotes: 'Taking Metformin regularly with dinner. Morning walking routine maintained.',
      },
    });
    stats.consultationPreps++;
  }

  // Past Completed Appointment (30 Days Ago)
  await prisma.appointment.upsert({
    where: { idempotencyKey: 'seed_appt_ramesh_past_1' },
    create: {
      patientId: patient1.id,
      doctorId: doctor.id,
      bookedById: patient1.id,
      scheduledAt: new Date(now - 30 * dayMs),
      durationMinutes: 30,
      reason: 'Quarterly diabetes review and regimen optimization',
      visitType: 'DIABETES_REVIEW',
      status: 'COMPLETED',
      completedAt: new Date(now - 30 * dayMs + 1800000),
      notes: 'Initial clinical workup completed. Metformin SR 500mg and Telmisartan 40mg prescribed.',
      idempotencyKey: 'seed_appt_ramesh_past_1',
    },
    update: {
      status: 'COMPLETED',
    },
  });
  stats.appointments++;

  // Upcoming Confirmed Consultation (in 4 Days)
  await prisma.appointment.upsert({
    where: { idempotencyKey: 'seed_appt_ramesh_upcoming_1' },
    create: {
      patientId: patient1.id,
      doctorId: doctor.id,
      bookedById: patient1.id,
      scheduledAt: new Date(now + 4 * dayMs),
      durationMinutes: 30,
      reason: 'Routine quarterly diabetes review and glycemic variability assessment',
      visitType: 'DIABETES_REVIEW',
      status: 'CONFIRMED',
      notes: 'Patient requested review of morning glucose stability and walking adherence.',
      idempotencyKey: 'seed_appt_ramesh_upcoming_1',
    },
    update: {
      status: 'CONFIRMED',
      scheduledAt: new Date(now + 4 * dayMs),
    },
  });
  stats.appointments++;

  // Past Consultation Note from Dr. Rupam
  await prisma.consultationNote.upsert({
    where: { idempotencyKey: 'seed_cnote_ramesh_past_1' },
    create: {
      userId: patient1.id,
      clinicianId: doctor.id,
      clinicianName: DEMO_DOCTOR_NAME,
      status: 'APPROVED',
      structuredNote: JSON.stringify({
        subjective: 'Patient reports good compliance with evening walking. Fasting readings averaging 120 mg/dL.',
        objective: 'BP 124/82 mmHg, Weight 74 kg, HbA1c 6.3%. Foot exam clear.',
        assessment: 'Type 2 Diabetes Mellitus under good glycemic control.',
        plan: 'Continue Tab Metformin SR 500mg with dinner and Telmisartan 40mg morning. Recheck HbA1c in 3 months.',
      }),
      approvedNoteText: 'Type 2 Diabetes Mellitus under good glycemic control. Regimen reaffirmed. Return in 3 months with fasting profile.',
      approvedAt: new Date(now - 30 * dayMs),
      approvedBy: doctor.id,
      sharedWithPatient: true,
      sharedAt: new Date(now - 30 * dayMs + 600000),
      idempotencyKey: 'seed_cnote_ramesh_past_1',
    },
    update: {
      status: 'APPROVED',
      sharedWithPatient: true,
    },
  });
  stats.consultationNotes++;

  // -------------------------------------------------------------------------
  // 18. Ensure Care Team Messages (Ramesh, Dr. Rupam, Meera)
  // -------------------------------------------------------------------------
  const existingMessages = await prisma.careTeamMessage.findMany({
    where: { patientId: patient1.id },
  });

  if (existingMessages.length === 0) {
    await prisma.careTeamMessage.createMany({
      data: [
        {
          patientId: patient1.id,
          senderId: patient1.id,
          recipientId: doctor.id,
          senderRole: 'PATIENT',
          category: 'QUESTION',
          content: 'Namaste Dr. Choudhary, my fasting sugar was 122 this morning. Walking routine is going well.',
          createdAt: new Date(now - 2 * dayMs),
        },
        {
          patientId: patient1.id,
          senderId: doctor.id,
          recipientId: patient1.id,
          senderRole: 'DOCTOR',
          category: 'DOCTOR_RESPONSE',
          content: 'Very good, Ramesh-ji. 122 mg/dL is within our fasting target. Keep up the post-dinner walks.',
          createdAt: new Date(now - 1 * dayMs),
        },
        {
          patientId: patient1.id,
          senderId: caregiver.id,
          recipientId: doctor.id,
          senderRole: 'CAREGIVER',
          category: 'CAREGIVER_UPDATE',
          content: 'Father completed his 30-minute walk today and took his dinner on time.',
          createdAt: new Date(now - 6 * 3600000),
        },
      ],
    });
    stats.messages += 3;
  }

  // -------------------------------------------------------------------------
  // 19. Ensure Care Notifications
  // -------------------------------------------------------------------------
  const existingNotifications = await prisma.careNotification.findMany({
    where: { patientId: patient1.id },
  });

  if (existingNotifications.length === 0) {
    await prisma.careNotification.createMany({
      data: [
        {
          userId: patient1.id,
          patientId: patient1.id,
          actorId: doctor.id,
          type: 'FOLLOW_UP_DUE',
          category: 'CARE_PLAN',
          title: 'Care Plan Active',
          message: 'Your doctor has approved your diabetes care plan v1. Open AarogyaDamu to view details.',
          link: '/careplan',
          createdAt: new Date(now - 2 * dayMs),
        },
        {
          userId: patient1.id,
          patientId: patient1.id,
          actorId: doctor.id,
          type: 'DOCTOR_MESSAGE',
          category: 'GENERAL',
          title: 'Message from Doctor',
          message: 'Dr. Rupam Choudhary: "Very good, Ramesh-ji. 122 mg/dL is within our fasting target..."',
          link: '/messages',
          createdAt: new Date(now - 1 * dayMs),
        },
        {
          userId: doctor.id,
          patientId: patient1.id,
          actorId: caregiver.id,
          type: 'CAREGIVER_UPDATE',
          category: 'TASK',
          title: 'Care Team Update',
          message: 'Meera Joshi: "Father completed his 30-minute walk today and took his dinner on time."',
          link: '/messages',
          createdAt: new Date(now - 6 * 3600000),
        },
        {
          userId: caregiver.id,
          patientId: patient1.id,
          actorId: patient1.id,
          type: 'APPOINTMENT_UPDATE',
          category: 'APPOINTMENT',
          title: 'Confirmed Consultation',
          message: 'Ramesh Deshmukh has a confirmed consultation with Dr. Rupam Choudhary in 4 days.',
          link: '/appointments',
          createdAt: new Date(now - 12 * 3600000),
        },
      ],
    });
    stats.notifications += 4;
  }

  // -------------------------------------------------------------------------
  // 20. Ensure Digital Health Twin / Lifestyle Records for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  const lifestyleRecords = [
    {
      key: 'seed_life_ramesh_walk_1',
      category: 'PHYSICAL_ACTIVITY',
      numericValue: 30,
      unit: 'MINUTES',
      qualitativeValue: 'MODERATE',
      notes: 'Brisk evening walk in society garden',
      recordedAt: new Date(now - 4 * 3600000),
      source: 'CAREGIVER_INPUT',
      createdById: caregiver.id,
    },
    {
      key: 'seed_life_ramesh_sleep_1',
      category: 'SLEEP',
      numericValue: 7.5,
      unit: 'HOURS',
      qualitativeValue: 'RESTFUL',
      notes: 'Uninterrupted overnight restful sleep',
      recordedAt: new Date(now - 12 * 3600000),
      source: 'MANUAL_PATIENT',
      createdById: patient1.id,
    },
    {
      key: 'seed_life_ramesh_nutr_1',
      category: 'NUTRITION',
      numericValue: null,
      unit: null,
      qualitativeValue: 'BALANCED',
      notes: 'Bajra roti, moong dal, cooked methi, cucumber salad',
      recordedAt: new Date(now - 6 * 3600000),
      source: 'MANUAL_PATIENT',
      createdById: patient1.id,
    },
  ];

  for (const lr of lifestyleRecords) {
    await prisma.lifestyleRecord.upsert({
      where: { idempotencyKey: lr.key },
      create: {
        userId: patient1.id,
        category: lr.category,
        numericValue: lr.numericValue,
        unit: lr.unit,
        qualitativeValue: lr.qualitativeValue,
        notes: lr.notes,
        recordedAt: lr.recordedAt,
        source: lr.source,
        createdById: lr.createdById,
        idempotencyKey: lr.key,
      },
      update: {
        qualitativeValue: lr.qualitativeValue,
        notes: lr.notes,
      },
    });
    stats.lifestyleRecords++;
  }

  // -------------------------------------------------------------------------
  // 21. Ensure Emergency Contact for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  const existingContact = await prisma.emergencyContact.findFirst({
    where: { userId: patient1.id, name: 'Meera Joshi' },
  });
  if (!existingContact) {
    await prisma.emergencyContact.create({
      data: {
        userId: patient1.id,
        name: 'Meera Joshi',
        relationship: 'DAUGHTER',
        phoneNumber: '+91-98765-43210',
        email: DEMO_CAREGIVER_EMAIL,
        isPrimary: true,
        notifyOnSos: true,
      },
    });
    stats.emergencyContacts++;
  }

  // -------------------------------------------------------------------------
  // 22. Ensure Reminders for Ramesh Deshmukh
  // -------------------------------------------------------------------------
  await prisma.reminder.upsert({
    where: { idempotencyKey: 'seed_rem_ramesh_metformin_1' },
    create: {
      userId: patient1.id,
      createdById: patient1.id,
      title: 'Take Tab Metformin 500mg SR with dinner',
      category: 'MEDICATION',
      status: 'SCHEDULED',
      remindAt: new Date(now + 6 * 3600000),
      recurrence: 'DAILY',
      notes: 'Evening post-dinner dose reminder',
      idempotencyKey: 'seed_rem_ramesh_metformin_1',
    },
    update: {
      status: 'SCHEDULED',
    },
  });
  stats.reminders++;

  // -------------------------------------------------------------------------
  // 23. Ensure Data for Patient 2: Suresh Patel (Post-Meal Spikes & Missed Med)
  // -------------------------------------------------------------------------
  const sureshObservations = [
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 148,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning fasting slightly elevated',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_suresh_f_3',
      observedAt: new Date(now - 3 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 218,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'ELEVATED_POST_MEAL',
      notes: 'Post heavy lunch (rice and sweets)',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_suresh_pm_2',
      observedAt: new Date(now - 2 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 152,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning fasting check',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_suresh_f_1',
      observedAt: new Date(now - 1 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 242,
      unit: 'mg/dL',
      context: 'POST_MEAL_2HR',
      clinicalFlag: 'ELEVATED_POST_MEAL',
      notes: 'Post dinner family celebration (high glycemic spike)',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_suresh_pm_0',
      observedAt: new Date(now - 12 * 3600000),
    },
  ];

  for (const obs of sureshObservations) {
    await prisma.healthObservation.upsert({
      where: { idempotencyKey: obs.idempotencyKey },
      create: {
        userId: patient2.id,
        type: obs.type,
        numericValue: obs.numericValue,
        unit: obs.unit,
        context: obs.context,
        clinicalFlag: obs.clinicalFlag,
        notes: obs.notes,
        provenance: obs.provenance,
        idempotencyKey: obs.idempotencyKey,
        observedAt: obs.observedAt,
      },
      update: {
        numericValue: obs.numericValue,
        clinicalFlag: obs.clinicalFlag,
      },
    });
    stats.observations++;
  }

  let glimepiride = await prisma.medicationSchedule.findFirst({
    where: {
      userId: patient2.id,
      medicineName: 'Tab Glimepiride',
    },
  });
  if (!glimepiride) {
    glimepiride = await prisma.medicationSchedule.create({
      data: {
        userId: patient2.id,
        medicineName: 'Tab Glimepiride',
        dosage: '1mg',
        timing: 'MORNING',
        isActive: true,
      },
    });
  }
  stats.medicationSchedules++;

  await prisma.medicationAdherenceEvent.upsert({
    where: { idempotencyKey: 'seed_adh_suresh_missed_1' },
    create: {
      medicationId: glimepiride.id,
      userId: patient2.id,
      action: 'MISSED',
      scheduledTime: new Date(now - dayMs),
      recordedBy: patient2.id,
      sourceProvenance: 'MANUAL_PATIENT',
      notes: 'Patient forgot morning dose due to travel',
      idempotencyKey: 'seed_adh_suresh_missed_1',
    },
    update: {
      action: 'MISSED',
    },
  });
  stats.adherenceEvents++;

  await prisma.reminder.upsert({
    where: { idempotencyKey: 'seed_rem_suresh_glimepiride_1' },
    create: {
      userId: patient2.id,
      createdById: patient2.id,
      title: 'Take Tab Glimepiride 1mg with breakfast',
      category: 'MEDICATION',
      status: 'SCHEDULED',
      remindAt: new Date(now + 12 * 3600000),
      recurrence: 'DAILY',
      notes: 'Morning pre-breakfast reminder',
      idempotencyKey: 'seed_rem_suresh_glimepiride_1',
    },
    update: {
      status: 'SCHEDULED',
    },
  });
  stats.reminders++;

  // -------------------------------------------------------------------------
  // 24. Ensure Data for Patient 3: Sunita Sharma (Low Fasting & AI Proposal)
  // -------------------------------------------------------------------------
  const sunitaObservations = [
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 74,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning reading with mild shakiness',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_sunita_f_2',
      observedAt: new Date(now - 2 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 76,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning reading before tea',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_sunita_f_1',
      observedAt: new Date(now - 1 * dayMs),
    },
    {
      type: 'BLOOD_GLUCOSE',
      numericValue: 72,
      unit: 'mg/dL',
      context: 'FASTING',
      clinicalFlag: 'NORMAL',
      notes: 'Morning reading; felt mild lightheadedness',
      provenance: 'PATIENT_ENTERED',
      idempotencyKey: 'seed_obs_sunita_f_0',
      observedAt: new Date(now),
    },
  ];

  for (const obs of sunitaObservations) {
    await prisma.healthObservation.upsert({
      where: { idempotencyKey: obs.idempotencyKey },
      create: {
        userId: patient3.id,
        type: obs.type,
        numericValue: obs.numericValue,
        unit: obs.unit,
        context: obs.context,
        clinicalFlag: obs.clinicalFlag,
        notes: obs.notes,
        provenance: obs.provenance,
        idempotencyKey: obs.idempotencyKey,
        observedAt: obs.observedAt,
      },
      update: {
        numericValue: obs.numericValue,
        clinicalFlag: obs.clinicalFlag,
      },
    });
    stats.observations++;
  }

  // Pending Care Tasks for Sunita Sharma
  const sunitaTasks = [
    {
      key: 'seed_task_sunita_foot_exam_1',
      title: 'Annual Comprehensive Diabetic Foot Examination',
      category: 'FOOT_EXAM',
      status: 'PENDING',
      dueAt: new Date(now + 5 * dayMs),
    },
    {
      key: 'seed_task_sunita_hba1c_1',
      title: 'Schedule 3-Month Repeat HbA1c Lab Panel',
      category: 'LAB_TEST',
      status: 'PENDING',
      dueAt: new Date(now + 7 * dayMs),
    },
  ];

  for (const st of sunitaTasks) {
    await prisma.careTask.upsert({
      where: { idempotencyKey: st.key },
      create: {
        userId: patient3.id,
        title: st.title,
        category: st.category,
        status: st.status,
        dueAt: st.dueAt,
        idempotencyKey: st.key,
      },
      update: {
        status: st.status,
        dueAt: st.dueAt,
      },
    });
    stats.careTasks++;
  }

  // AI-Generated Advisory Proposal Awaiting Doctor Approval (PENDING_CLINICIAN_APPROVAL)
  const proposalPlanId = 'seed-plan-sunita-proposal-1';
  const proposalActionId = 'seed-act-sunita-proposal-1';
  const proposalAuditId = 'seed-audit-sunita-proposal-1';
  const proposalExpiresAt = new Date(now + 24 * 3600000);

  const existingAudit = await prisma.agentAuditRecord.findUnique({
    where: { id: proposalAuditId },
  });
  if (!existingAudit) {
    await prisma.agentAuditRecord.create({
      data: {
        id: proposalAuditId,
        userId: patient3.id,
        riskTier: 'HIGH_RISK',
        actionType: 'CLINICAL_CARE_PROPOSAL',
        summary: 'AI advisory proposal drafted: Review Target Fasting Glucose Range for Sunita Sharma',
        approvalStatus: 'PENDING',
        requiresClinicianApproval: true,
        payload: JSON.stringify({
          planId: proposalPlanId,
          actionId: proposalActionId,
          proposalType: 'TARGET_GLUCOSE_RANGE_REVISION',
        }),
      },
    });
  }

  const existingPlan = await prisma.agentPlan.findUnique({
    where: { id: proposalPlanId },
  });
  if (!existingPlan) {
    await prisma.agentPlan.create({
      data: {
        id: proposalPlanId,
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
              id: proposalActionId,
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
              auditRecordId: proposalAuditId,
            },
          ],
        },
      },
    });
    stats.agentProposals++;
  }

  return {
    success: true,
    actionTaken,
    doctorId: doctor.id,
    doctorEmail: doctor.email,
    isClinician: doctor.isClinician,
    isActive: doctor.isActive,
    hasPatientLink: true,
    message: `Synthetic demonstration dataset verified and ready for Health-a-thon evaluation.`,
    stats,
  };
}

export const ensureStagingDemonstrationData = ensureStagingDemoDoctor;
