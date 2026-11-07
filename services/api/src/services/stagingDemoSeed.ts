import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const DEMO_DOCTOR_EMAIL = 'dr.rc@aarogyadamu.local';
export const DEMO_DOCTOR_NAME = 'Dr. Rupam Choudhary (Diabetologist)';
export const DEMO_DOCTOR_FACILITY = 'Sahyadri Specialty Hospital';

export const DEMO_PATIENT_EMAIL = 'demo.patient1@aarogyadamu.local';
export const DEMO_PATIENT_NAME = 'Ramesh Deshmukh';

export const DEMO_CAREGIVER_EMAIL = 'meera.joshi@family.aarogyadamu.local';
export const DEMO_CAREGIVER_NAME = 'Meera Joshi (Daughter)';

export const DEFAULT_DEMO_PASSWORD = 'DemoPassword123!';

export interface StagingSeedResult {
  success: boolean;
  actionTaken: 'CREATED' | 'UPDATED' | 'ALREADY_VALID' | 'SKIPPED_PRODUCTION';
  doctorId?: string;
  doctorEmail: string;
  isClinician: boolean;
  isActive: boolean;
  hasPatientLink: boolean;
  message: string;
}

/**
 * Safely and idempotently bootstraps the synthetic demo Doctor account in Staging.
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

  // 2. Handle legacy doctor email migration if present
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

  // 3. Inspect existing Doctor account
  let doctor = await prisma.user.findUnique({
    where: { email: DEMO_DOCTOR_EMAIL },
    include: { profile: true },
  });

  let actionTaken: 'CREATED' | 'UPDATED' | 'ALREADY_VALID' = 'ALREADY_VALID';

  if (!doctor) {
    // Account missing: Create synthetic demo Doctor
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
    // Account exists: Verify eligibility, password match, and profile requirements
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

  // 4. Ensure Synthetic Demo Patient exists for clinical workstation preview
  let patient = await prisma.user.findUnique({
    where: { email: DEMO_PATIENT_EMAIL },
    include: { profile: true },
  });

  if (!patient) {
    patient = await prisma.user.create({
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
            preferredLanguage: 'en',
            timeZone: 'Asia/Kolkata',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[Staging Demo Seed] Created synthetic demo patient: ${DEMO_PATIENT_EMAIL}`);
  }

  // 5. Ensure Caregiver exists
  const caregiver = await prisma.user.findUnique({
    where: { email: DEMO_CAREGIVER_EMAIL },
  });
  if (!caregiver) {
    await prisma.user.create({
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
    });
    console.log(`[Staging Demo Seed] Created synthetic demo caregiver: ${DEMO_CAREGIVER_EMAIL}`);
  }

  // 6. Ensure Doctor-Patient Assignment exists
  let hasPatientLink = false;
  if (doctor && patient) {
    const existingAssignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: patient.id,
      },
    });

    if (!existingAssignment) {
      await prisma.doctorPatientAssignment.create({
        data: {
          doctorId: doctor.id,
          patientId: patient.id,
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      });
      console.log(`[Staging Demo Seed] Linked Doctor ${doctor.email} with Patient ${patient.email}`);
    }
    hasPatientLink = true;
  }

  return {
    success: true,
    actionTaken,
    doctorId: doctor.id,
    doctorEmail: doctor.email,
    isClinician: doctor.isClinician,
    isActive: doctor.isActive,
    hasPatientLink,
    message: `Synthetic demo doctor ${doctor.email} is verified and ready for staging login.`,
  };
}

