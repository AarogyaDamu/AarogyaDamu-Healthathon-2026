import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { withTenantTransaction, TenantDatabaseContext } from '../db/tenantContext';
import { DEFAULT_FEATURE_FLAGS } from '../features/featureFlags';
import {
  generateValidSyntheticPdfBuffer,
  isCloudStorageEnabled,
  isDurableStorageAvailable,
  savePrivateFile,
} from './storageService';

export const DEMO_DOCTOR_EMAIL = 'dr.rc@aarogyadamu.local';
export const DEMO_DOCTOR_NAME = 'Dr. Rupam Choudhary (Diabetologist)';
export const DEMO_DOCTOR_FACILITY = 'Sahyadri Specialty Hospital';

export const DEMO_PATIENT_EMAIL = 'demo.patient1@aarogyadamu.local';
export const DEMO_PATIENT_NAME = 'Ramesh Deshmukh [Synthetic Demo A]';

export const DEMO_PATIENT2_EMAIL = 'demo.patient2@aarogyadamu.local';
export const DEMO_PATIENT2_NAME = 'Suresh Patel [Synthetic Demo B]';

export const DEMO_PATIENT3_EMAIL = 'demo.patient3@aarogyadamu.local';
export const DEMO_PATIENT3_NAME = 'Sunita Sharma [Synthetic Demo C]';

export const DEMO_CAREGIVER_EMAIL = 'meera.joshi@family.aarogyadamu.local';
export const DEMO_CAREGIVER_NAME = 'Meera Joshi [Synthetic Caregiver]';

export const SYNTHETIC_DEMO_BANNER = 'SYNTHETIC DEMO DATA — NOT A REAL PATIENT RECORD';

/**
 * Local development/test-only fallback password.
 * Explicitly rejected whenever NODE_ENV === 'production' (including hosted staging).
 */
export const DEFAULT_DEMO_PASSWORD = 'DemoPassword123!';

export interface StagingDemoSeedOptions {
  doctorPassword?: string;
  patientPassword?: string;
  patient2Password?: string;
  patient3Password?: string;
  caregiverPassword?: string;
  rotatePasswords?: boolean;
}

export interface StagingSeedStats {
  featureFlags: number;
  featureFlagsMutated: number;
  users: number;
  assignments: number;
  carePlans: number;
  observations: number;
  medicationSchedules: number;
  adherenceEvents: number;
  careTasks: number;
  journeyMilestones: number;
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
  auditEvents: number;
}

export interface SyntheticPatientSummary {
  id: string;
  email: string;
  name: string;
  clinicalFocus: string;
  isSyntheticDemo: true;
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
  syntheticPatients?: SyntheticPatientSummary[];
  featureFlagsSummary?: {
    readOnlyVerified: number;
    agenticFlagsDisabled: boolean;
  };
  stats?: StagingSeedStats;
}

const APPROVED_SYNTHETIC_EMAIL_PATTERNS = [
  /@aarogyadamu\.local$/i,
  /@family\.aarogyadamu\.local$/i,
  /@staging\.aarogyadamu\.local$/i,
  /^demo\..+@/i,
];

function isApprovedSyntheticEmail(email: string): boolean {
  return APPROVED_SYNTHETIC_EMAIL_PATTERNS.some((re) => re.test(email));
}

function assertApprovedSyntheticEmail(email: string): void {
  if (!isApprovedSyntheticEmail(email)) {
    throw new Error(
      `Security refusal: email '${email}' is not an approved synthetic demonstration account pattern.`,
    );
  }
}

function isStrongNonDefaultPassword(raw?: string): raw is string {
  return typeof raw === 'string' && raw.length >= 12 && raw !== DEFAULT_DEMO_PASSWORD;
}

async function resolveAccountPasswordHash(params: {
  roleLabel: string;
  email: string;
  existingHash?: string | null;
  explicitPassword?: string;
  disallowedMatches?: Array<string | undefined>;
  rotatePasswords: boolean;
  requireExplicitIfMissingInProd: boolean;
  isProdRuntime: boolean;
}): Promise<string | null> {
  const {
    roleLabel,
    existingHash,
    explicitPassword,
    disallowedMatches = [],
    rotatePasswords,
    requireExplicitIfMissingInProd,
    isProdRuntime,
  } = params;

  if (explicitPassword !== undefined && explicitPassword !== '') {
    if (isProdRuntime) {
      if (!isStrongNonDefaultPassword(explicitPassword)) {
        throw new Error(
          `Deployed staging requires a strong, non-default password (min 12 chars) for ${roleLabel}.`,
        );
      }
      if (disallowedMatches.some((other) => other && other === explicitPassword)) {
        throw new Error(
          `Security policy refusal: ${roleLabel} password must not be shared with the clinician or another demo account.`,
        );
      }
    }
    if (!existingHash || rotatePasswords || !isProdRuntime) {
      return bcrypt.hash(explicitPassword, 10);
    }
    return null;
  }

  // Existing account without rotation request: preserve existing password hash safely.
  if (existingHash && (!rotatePasswords || isProdRuntime)) {
    return null;
  }

  if (isProdRuntime) {
    if (requireExplicitIfMissingInProd) {
      throw new Error(
        `Staging synthetic provisioning requires an explicit strong password (min 12 chars, non-default) for ${roleLabel}.`,
      );
    }
    // Non-companion synthetic accounts receive a unique per-account high-entropy secret when omitted.
    const generatedSecret = crypto.randomBytes(32).toString('base64url');
    return bcrypt.hash(generatedSecret, 10);
  }

  return bcrypt.hash(DEFAULT_DEMO_PASSWORD, 10);
}

/**
 * Verifies the database session matches safe staging/test expectations before writes.
 * Fails closed against real production, old development databases, or RLS-bypassing roles in staging.
 */
async function assertSafeSeedEnvironment(prisma: PrismaClient): Promise<void> {
  const isProdNode = process.env.NODE_ENV === 'production';

  if (isProdNode && env.APP_ENV !== 'staging') {
    throw new Error(
      'Staging demo seed refused: NODE_ENV=production requires APP_ENV=staging.',
    );
  }

  if (env.APP_ENV === 'staging' && !env.EXPECTED_NEON_ENDPOINT) {
    throw new Error(
      'Staging demo seed refused: EXPECTED_NEON_ENDPOINT must be configured in staging.',
    );
  }

  if (typeof (prisma as any).$queryRawUnsafe !== 'function') {
    return;
  }

  try {
    const identityRows = await prisma.$queryRawUnsafe<Array<{ db?: string; role?: string }>>(
      'SELECT current_database() AS db, current_user AS role',
    );
    const dbName = String(identityRows?.[0]?.db || '').toLowerCase();
    const roleName = String(identityRows?.[0]?.role || '').toLowerCase();

    if (
      dbName.includes('healthathon') ||
      dbName === 'aarogyadamu_prod' ||
      dbName === 'production' ||
      (isProdNode && dbName.includes('dev'))
    ) {
      throw new Error(
        `Staging demo seed refused: connected database '${dbName}' is not an isolated staging/test target.`,
      );
    }

    if (roleName && (isProdNode || roleName === 'aarogyadamu_app')) {
      const roleRows = await prisma.$queryRawUnsafe<
        Array<{ rolsuper?: boolean; rolbypassrls?: boolean }>
      >('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      const roleFlags = roleRows?.[0];
      if (roleFlags && (roleFlags.rolsuper || roleFlags.rolbypassrls)) {
        throw new Error(
          `Staging demo seed refused: database role '${roleName}' holds superuser or BYPASSRLS privilege.`,
        );
      }
    }
  } catch (err: any) {
    if (String(err?.message || '').includes('Staging demo seed refused')) {
      throw err;
    }
    // Mock Prisma objects in unit tests may return non-SQL placeholders; allow only in non-prod test.
    if (isProdNode) {
      throw err;
    }
  }
}

async function runScoped<T>(
  prisma: PrismaClient,
  context: TenantDatabaseContext,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return withTenantTransaction(prisma, context, async (tx) => fn(tx));
}

async function verifyFeatureFlagsReadOnly(prisma: PrismaClient): Promise<{
  enabledCoreCount: number;
  agenticFlagsDisabled: boolean;
}> {
  let dbFlags: Array<{ id: string; isEnabled: boolean }> = [];
  if (typeof (prisma as any).featureFlag?.findMany === 'function') {
    dbFlags = await prisma.featureFlag.findMany({
      select: { id: true, isEnabled: true },
    });
  }

  const effective = new Map<string, boolean>();
  for (const [key, def] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    effective.set(key, Boolean(def.isEnabled));
  }
  for (const row of dbFlags) {
    effective.set(row.id, Boolean(row.isEnabled));
  }

  let enabledCoreCount = 0;
  for (const enabled of effective.values()) {
    if (enabled) enabledCoreCount++;
  }

  const agenticFlagsDisabled =
    !effective.get('P0_7_AGENTIC_EXECUTION') && !effective.get('P0_8_EXTERNAL_INTEGRATIONS');

  return { enabledCoreCount, agenticFlagsDisabled };
}

interface PatientProfileSpec {
  fullName: string;
  dateOfBirth: Date;
  diabetesType: string;
  diagnosisYear: number;
  knownAllergies?: string;
  targetFastingMin: number;
  targetFastingMax: number;
  targetPostMealMax: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

interface SyntheticPatientDatasetSpec {
  key: 'patient1' | 'patient2' | 'patient3';
  email: string;
  clinicalFocus: string;
  profile: PatientProfileSpec;
  carePlan: {
    version: number;
    title: string;
    summary: string;
    reviewOffsetDays: number;
    approvedOffsetDays: number;
    goals: Array<{
      category: string;
      title: string;
      targetValue: string;
      unit: string;
      timeframe: string;
      status: string;
    }>;
    activities: Array<{
      category: string;
      title: string;
      frequency: string;
      timing: string;
      instructions: string;
      isCaregiverEligible: boolean;
    }>;
  };
  observations: Array<{
    type: string;
    numericValue: number;
    secondaryValue?: number;
    unit: string;
    context: string;
    clinicalFlag: string;
    notes: string;
    provenance: string;
    idempotencyKey: string;
    offsetMs: number;
  }>;
  medications: Array<{
    medicineName: string;
    medicationName: string;
    genericName: string;
    dosage: string;
    timing: string;
    foodInstructions: string;
    instructions: string;
    route: string;
    frequency: string;
    source: string;
    reviewStatus: 'CLINICIAN_REVIEWED' | 'UNREVIEWED';
    clinicalReviewNotes: string | null;
  }>;
  adherenceEvents: Array<{
    medIndex: number;
    idempotencyKey: string;
    offsetMs: number;
    action: 'TAKEN' | 'MISSED' | 'SKIPPED';
    note: string;
  }>;
  tasks: Array<{
    idempotencyKey: string;
    title: string;
    category: string;
    status: 'PENDING' | 'COMPLETED';
    dueOffsetMs: number;
    completedOffsetMs?: number;
    completedByCaregiver?: boolean;
  }>;
  documents: Array<{
    title: string;
    category: string;
    issuingFacility: string;
    reportOffsetDays: number;
    doctorReviewStatus: 'PENDING' | 'REVIEWED';
    plainSummary: string;
    pdfLines?: string[];
    structuredLabs?: Record<string, any>;
    medicines?: Array<{ name: string; timing: string; purpose: string }>;
    doctorAdvice: string[];
  }>;
  consultationPrep: {
    scheduledOffsetDays: number;
    concernsAndQuestions: string;
    personalNotes: string;
  };
  appointments: Array<{
    idempotencyKey: string;
    scheduledOffsetDays: number;
    durationMinutes: number;
    reason: string;
    visitType: string;
    status: 'COMPLETED' | 'CONFIRMED' | 'REQUESTED';
    notes: string;
  }>;
  consultationNote: {
    idempotencyKey: string;
    offsetDays: number;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    approvedNoteText: string;
  };
  messages: Array<{
    sender: 'PATIENT' | 'DOCTOR' | 'CAREGIVER';
    category: string;
    content: string;
    offsetMs: number;
  }>;
  notifications: Array<{
    recipient: 'PATIENT' | 'DOCTOR' | 'CAREGIVER';
    type: string;
    category: string;
    title: string;
    message: string;
    link: string;
    offsetMs: number;
  }>;
  lifestyleRecords: Array<{
    idempotencyKey: string;
    category: string;
    numericValue: number | null;
    unit: string | null;
    qualitativeValue: string;
    notes: string;
    offsetMs: number;
    source: string;
    byCaregiver?: boolean;
  }>;
  emergencyContact: {
    name: string;
    relationship: string;
    phoneNumber: string;
    email?: string;
  };
  reminder: {
    idempotencyKey: string;
    title: string;
    category: string;
    remindOffsetMs: number;
    recurrence: string;
    notes: string;
  };
}

function buildSyntheticDatasetSpecs(dayMs: number): SyntheticPatientDatasetSpec[] {
  const hrMs = 60 * 60 * 1000;
  return [
    {
      key: 'patient1',
      email: DEMO_PATIENT_EMAIL,
      clinicalFocus: 'Diabetes follow-up & caregiver-coordinated daily care',
      profile: {
        fullName: DEMO_PATIENT_NAME,
        dateOfBirth: new Date('1966-06-18'),
        diabetesType: 'TYPE_2_DIABETES',
        diagnosisYear: 2021,
        knownAllergies: 'Sulfonamides (rash) — SYNTHETIC DEMO DATA',
        targetFastingMin: 80,
        targetFastingMax: 130,
        targetPostMealMax: 180,
        emergencyContactName: DEMO_CAREGIVER_NAME,
        emergencyContactPhone: '+91-98765-43210',
      },
      carePlan: {
        version: 1,
        title: 'Type 2 Diabetes Glycemic Follow-Up Plan v1 [Synthetic Demo A]',
        summary: `${SYNTHETIC_DEMO_BANNER}. Target fasting glucose 80-130 mg/dL, 2h post-meal <180 mg/dL, evening walking routine, and scheduled regimen review.`,
        reviewOffsetDays: 30,
        approvedOffsetDays: -2,
        goals: [
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
        activities: [
          {
            category: 'BLOOD_SUGAR_CHECK',
            title: 'Morning fasting blood glucose check',
            frequency: 'DAILY',
            timing: 'MORNING',
            instructions: 'Record fasting glucose upon waking before breakfast.',
            isCaregiverEligible: true,
          },
          {
            category: 'EXERCISE',
            title: 'Brisk evening post-dinner walk (30 mins)',
            frequency: 'DAILY',
            timing: 'EVENING',
            instructions: 'Brisk walking for 30 minutes after dinner.',
            isCaregiverEligible: true,
          },
          {
            category: 'MEDICATION',
            title: 'Evening Metformin SR schedule adherence check',
            frequency: 'DAILY',
            timing: 'WITH_MEALS',
            instructions: 'Follow clinician-reviewed evening medication schedule.',
            isCaregiverEligible: false,
          },
          {
            category: 'MEDICATION',
            title: 'Weekly pill box replenishment & adherence review',
            frequency: 'WEEKLY',
            timing: 'MORNING',
            instructions: 'Organize weekly doses with daughter caregiver support.',
            isCaregiverEligible: true,
          },
        ],
      },
      observations: [
        { type: 'BLOOD_GLUCOSE', numericValue: 116, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_13', offsetMs: -13 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 120, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning check after 8h sleep (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_12', offsetMs: -12 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 154, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-lunch check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_pm_12', offsetMs: -12 * dayMs + 5 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 118, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_11', offsetMs: -11 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 122, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting glucose (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_10', offsetMs: -10 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 162, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-dinner check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_pm_10', offsetMs: -10 * dayMs + 13 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 117, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Early morning fasting (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_9', offsetMs: -9 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 125, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning routine reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_8', offsetMs: -8 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 158, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-lunch reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_pm_8', offsetMs: -8 * dayMs + 5 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 121, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning empty stomach reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_7', offsetMs: -7 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 119, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_6', offsetMs: -6 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 123, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning reading before tea (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_5', offsetMs: -5 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 120, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning routine reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_4', offsetMs: -4 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 118, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning empty stomach check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_3', offsetMs: -3 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 162, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-lunch check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_pm_2', offsetMs: -2 * dayMs },
        { type: 'HBA1C', numericValue: 6.3, unit: '%', context: 'LAB_CONFIRMED', clinicalFlag: 'NORMAL', notes: `Synthetic lab panel baseline (${SYNTHETIC_DEMO_BANNER})`, provenance: 'CLINICIAN_ENTERED', idempotencyKey: 'seed_obs_ramesh_hba1c_quarterly', offsetMs: -25 * dayMs },
        { type: 'BLOOD_PRESSURE', numericValue: 124, secondaryValue: 82, unit: 'mmHg', context: 'RESTING', clinicalFlag: 'NORMAL', notes: `Resting seated BP check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_bp_recent', offsetMs: -1 * dayMs - 3 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 122, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Voice-assisted synthetic check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'VOICE_LOGGED', idempotencyKey: 'seed_obs_ramesh_f_1_voice', offsetMs: -1 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 128, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Latest morning glucometer reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_ramesh_f_0', offsetMs: -1 * hrMs },
      ],
      medications: [
        {
          medicineName: 'Tab Metformin SR',
          medicationName: 'Metformin Hydrochloride Extended-Release (Synthetic Demo)',
          genericName: 'Metformin Hydrochloride',
          dosage: '500mg',
          timing: 'NIGHT',
          foodInstructions: 'Take with dinner',
          instructions: '1 tablet once daily with evening meal (Synthetic Demo)',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'CLINICIAN_PRESCRIBED',
          reviewStatus: 'CLINICIAN_REVIEWED',
          clinicalReviewNotes: `${SYNTHETIC_DEMO_BANNER}. Simulated maintenance schedule reviewed by Dr. Choudhary.`,
        },
        {
          medicineName: 'Tab Telmisartan',
          medicationName: 'Telmisartan Tablets IP (Synthetic Demo)',
          genericName: 'Telmisartan',
          dosage: '40mg',
          timing: 'MORNING',
          foodInstructions: 'Before breakfast',
          instructions: '1 tablet in the morning (Synthetic Demo)',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'CLINICIAN_PRESCRIBED',
          reviewStatus: 'CLINICIAN_REVIEWED',
          clinicalReviewNotes: `${SYNTHETIC_DEMO_BANNER}. BP stable in target in demonstration profile.`,
        },
      ],
      adherenceEvents: [
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d6', offsetMs: -6 * dayMs, action: 'TAKEN', note: `Taken with dinner (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d6', offsetMs: -6 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d5', offsetMs: -5 * dayMs, action: 'TAKEN', note: `Taken with dinner (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d5', offsetMs: -5 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d4', offsetMs: -4 * dayMs, action: 'MISSED', note: `Late evening schedule missed (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d4', offsetMs: -4 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d3', offsetMs: -3 * dayMs, action: 'TAKEN', note: `Taken with dinner (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d3', offsetMs: -3 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d2', offsetMs: -2 * dayMs, action: 'TAKEN', note: `Taken with dinner (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d2', offsetMs: -2 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_p1_m0_d1', offsetMs: -1 * dayMs, action: 'TAKEN', note: `Taken with dinner (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_p1_m1_d1', offsetMs: -1 * dayMs + 2 * hrMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
      ],
      tasks: [
        { idempotencyKey: 'seed_task_fasting_sugar_1', title: 'Check morning fasting blood glucose', category: 'MONITORING', status: 'PENDING', dueOffsetMs: 12 * hrMs },
        { idempotencyKey: 'seed_task_metformin_dinner_1', title: 'Log evening Metformin SR 500mg schedule', category: 'MEDICATION', status: 'PENDING', dueOffsetMs: 6 * hrMs },
        { idempotencyKey: 'seed_task_walk_1', title: '30-minute moderate post-lunch walk', category: 'LIFESTYLE', status: 'COMPLETED', dueOffsetMs: -4 * hrMs, completedOffsetMs: -3 * hrMs, completedByCaregiver: true },
        { idempotencyKey: 'seed_task_pillbox_1', title: 'Weekly pill box replenishment & adherence review', category: 'MEDICATION', status: 'COMPLETED', dueOffsetMs: -2 * dayMs, completedOffsetMs: -2 * dayMs + hrMs, completedByCaregiver: true },
      ],
      documents: [
        {
          title: 'Quarterly Glycemic Panel (HbA1c: 6.3%) [Synthetic Demo A]',
          category: 'LAB_REPORT',
          issuingFacility: 'Synthetic Demo Diagnostics Pune',
          reportOffsetDays: -25,
          doctorReviewStatus: 'REVIEWED',
          plainSummary: `${SYNTHETIC_DEMO_BANNER}. Simulated HbA1c 6.3% and Fasting Blood Sugar 118 mg/dL.`,
          pdfLines: [
            SYNTHETIC_DEMO_BANNER,
            'HbA1c (Simulated): 6.3% (Reference target <7.0%)',
            'Fasting Blood Sugar (Simulated): 118 mg/dL',
          ],
          structuredLabs: {
            hba1c: { displayName: 'HbA1c (Simulated)', extractedValue: '6.3 %', referenceRange: '< 7.0 %', flag: 'IN_TARGET' },
            fastingGlucose: { displayName: 'Fasting Blood Sugar (Simulated)', extractedValue: '118 mg/dL', referenceRange: '80-130 mg/dL', flag: 'IN_TARGET' },
          },
          doctorAdvice: ['Synthetic demonstration report metadata — durable file storage is disabled on free staging tier.'],
        },
        {
          title: 'Pre-Visit Metabolic Summary Sheet [Synthetic Demo A]',
          category: 'LAB_REPORT',
          issuingFacility: 'Sahyadri Specialty Hospital (Synthetic Demo)',
          reportOffsetDays: -3,
          doctorReviewStatus: 'PENDING',
          plainSummary: `${SYNTHETIC_DEMO_BANNER}. Pending clinician review summary for follow-up evaluation.`,
          structuredLabs: {
            serumCreatinine: { displayName: 'Serum Creatinine (Simulated)', extractedValue: '0.94 mg/dL', referenceRange: '0.7-1.3 mg/dL', flag: 'NORMAL' },
            ldlCholesterol: { displayName: 'LDL Cholesterol (Simulated)', extractedValue: '92 mg/dL', referenceRange: '< 100 mg/dL', flag: 'IN_TARGET' },
          },
          doctorAdvice: ['Click Save Clinical Review in Doctor Workstation to verify PostgreSQL persistence.'],
        },
      ],
      consultationPrep: {
        scheduledOffsetDays: 4,
        concernsAndQuestions: `${SYNTHETIC_DEMO_BANNER}: Fasting values hovering around 118–128 mg/dL. Occasional mild afternoon thirst after evening walks.`,
        personalNotes: 'Evening walking schedule consistently maintained.',
      },
      appointments: [
        {
          idempotencyKey: 'seed_appt_ramesh_past_1',
          scheduledOffsetDays: -30,
          durationMinutes: 30,
          reason: 'Synthetic follow-up evaluation and monitoring target setup',
          visitType: 'DIABETES_REVIEW',
          status: 'COMPLETED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Completed simulated follow-up consultation.`,
        },
        {
          idempotencyKey: 'seed_appt_ramesh_upcoming_1',
          scheduledOffsetDays: 4,
          durationMinutes: 30,
          reason: 'Routine synthetic diabetes follow-up & glycemic variability check',
          visitType: 'DIABETES_REVIEW',
          status: 'CONFIRMED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Scheduled evaluation visit.`,
        },
      ],
      consultationNote: {
        idempotencyKey: 'seed_cnote_ramesh_past_1',
        offsetDays: -30,
        subjective: `${SYNTHETIC_DEMO_BANNER}. Simulated patient reports steady walking compliance and fasting averaging ~120 mg/dL.`,
        objective: 'Simulated BP 124/82 mmHg, HbA1c 6.3%. Foot inspection unremarkable.',
        assessment: `${SYNTHETIC_DEMO_BANNER}. Simulated diabetes follow-up vignette (not a clinical diagnosis).`,
        plan: 'Continue daily glucose tracking, walking routine, and scheduled follow-up review.',
        approvedNoteText: `${SYNTHETIC_DEMO_BANNER}. Synthetic vignette approved for cross-app doctor/patient verification.`,
      },
      messages: [
        {
          sender: 'PATIENT',
          category: 'QUESTION',
          content: `[Synthetic Demo A] Namaste Dr. Choudhary, my fasting reading was 122 mg/dL today and post-dinner walking is on track.`,
          offsetMs: -2 * dayMs,
        },
        {
          sender: 'DOCTOR',
          category: 'DOCTOR_RESPONSE',
          content: `[Synthetic Demo Reply] Very good — 122 mg/dL stays nicely within the 80–130 mg/dL synthetic monitoring target.`,
          offsetMs: -1 * dayMs,
        },
        {
          sender: 'CAREGIVER',
          category: 'CAREGIVER_UPDATE',
          content: `[Synthetic Caregiver Note] Completed today's evening walk check-in and meal schedule.`,
          offsetMs: -6 * hrMs,
        },
      ],
      notifications: [
        {
          recipient: 'PATIENT',
          type: 'FOLLOW_UP_DUE',
          category: 'CARE_PLAN',
          title: 'Care Plan Active [Synthetic Demo]',
          message: 'Your clinician updated your synthetic diabetes follow-up care plan v1.',
          link: '/careplan',
          offsetMs: -2 * dayMs,
        },
        {
          recipient: 'DOCTOR',
          type: 'CAREGIVER_UPDATE',
          category: 'TASK',
          title: 'Synthetic Demo A — Caregiver Check-In',
          message: `${DEMO_CAREGIVER_NAME} logged walk completion for ${DEMO_PATIENT_NAME}.`,
          link: '/messages',
          offsetMs: -6 * hrMs,
        },
        {
          recipient: 'CAREGIVER',
          type: 'APPOINTMENT_UPDATE',
          category: 'APPOINTMENT',
          title: 'Confirmed Follow-Up [Synthetic Demo]',
          message: `${DEMO_PATIENT_NAME} has a confirmed synthetic consultation in 4 days.`,
          link: '/appointments',
          offsetMs: -12 * hrMs,
        },
      ],
      lifestyleRecords: [
        { idempotencyKey: 'seed_life_ramesh_walk_1', category: 'PHYSICAL_ACTIVITY', numericValue: 30, unit: 'MINUTES', qualitativeValue: 'MODERATE', notes: `Evening society walk (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -4 * hrMs, source: 'CAREGIVER_INPUT', byCaregiver: true },
        { idempotencyKey: 'seed_life_ramesh_sleep_1', category: 'SLEEP', numericValue: 7.5, unit: 'HOURS', qualitativeValue: 'RESTFUL', notes: `Overnight restful sleep (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -12 * hrMs, source: 'MANUAL_PATIENT' },
        { idempotencyKey: 'seed_life_ramesh_nutr_1', category: 'NUTRITION', numericValue: 2200, unit: 'ML', qualitativeValue: 'BALANCED', notes: `Balanced meal log (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -6 * hrMs, source: 'MANUAL_PATIENT' },
      ],
      emergencyContact: {
        name: DEMO_CAREGIVER_NAME,
        relationship: 'DAUGHTER',
        phoneNumber: '+91-98765-43210',
        email: DEMO_CAREGIVER_EMAIL,
      },
      reminder: {
        idempotencyKey: 'seed_rem_ramesh_metformin_1',
        title: 'Evening glucose & medication check [Synthetic Demo]',
        category: 'MEDICATION',
        remindOffsetMs: 6 * hrMs,
        recurrence: 'DAILY',
        notes: `${SYNTHETIC_DEMO_BANNER}`,
      },
    },
    {
      key: 'patient2',
      email: DEMO_PATIENT2_EMAIL,
      clinicalFocus: 'Glucose trend monitoring & post-meal excursions',
      profile: {
        fullName: DEMO_PATIENT2_NAME,
        dateOfBirth: new Date('1972-04-12'),
        diabetesType: 'TYPE_2_DIABETES',
        diagnosisYear: 2019,
        knownAllergies: 'No known allergies recorded — SYNTHETIC DEMO DATA',
        targetFastingMin: 80,
        targetFastingMax: 130,
        targetPostMealMax: 180,
        emergencyContactName: 'Anita Patel [Synthetic Contact]',
        emergencyContactPhone: '+91-98220-11223',
      },
      carePlan: {
        version: 1,
        title: 'Post-Meal Glucose Trend Monitoring Plan v1 [Synthetic Demo B]',
        summary: `${SYNTHETIC_DEMO_BANNER}. Focus on paired fasting and 2-hour post-meal glucose checks plus carbohydrate portion balance.`,
        reviewOffsetDays: 14,
        approvedOffsetDays: -5,
        goals: [
          {
            category: 'GLUCOSE',
            title: 'Bring 2h post-meal excursions below 180 mg/dL',
            targetValue: '< 180',
            unit: 'mg/dL',
            timeframe: 'Daily',
            status: 'IN_PROGRESS',
          },
          {
            category: 'GLUCOSE',
            title: 'Stabilize fasting glucose trend toward 80-130 mg/dL',
            targetValue: '80 - 130',
            unit: 'mg/dL',
            timeframe: 'Daily',
            status: 'IN_PROGRESS',
          },
          {
            category: 'LIFESTYLE',
            title: '20-minute post-meal walking after lunch & dinner',
            targetValue: '280',
            unit: 'mins/week',
            timeframe: 'Weekly',
            status: 'IN_PROGRESS',
          },
        ],
        activities: [
          {
            category: 'BLOOD_SUGAR_CHECK',
            title: 'Log paired fasting and 2-hour post-dinner glucose',
            frequency: 'DAILY',
            timing: 'EVENING',
            instructions: 'Record fasting and post-meal trends to evaluate excursion peaks.',
            isCaregiverEligible: false,
          },
          {
            category: 'NUTRITION',
            title: 'High-fiber plate sequencing log',
            frequency: 'DAILY',
            timing: 'WITH_MEALS',
            instructions: 'Note meal composition alongside post-prandial reading.',
            isCaregiverEligible: false,
          },
        ],
      },
      observations: [
        { type: 'BLOOD_GLUCOSE', numericValue: 142, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Fasting baseline trend (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_12', offsetMs: -12 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 198, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `Post-lunch excursion (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_12', offsetMs: -12 * dayMs + 6 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 146, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_10', offsetMs: -10 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 212, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `Post-dinner excursion (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_10', offsetMs: -10 * dayMs + 13 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 139, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_8', offsetMs: -8 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 194, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `2h post-lunch (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_8', offsetMs: -8 * dayMs + 5 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 144, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_6', offsetMs: -6 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 205, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `Post-dinner monitoring (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_6', offsetMs: -6 * dayMs + 13 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 148, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting slightly elevated (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_3', offsetMs: -3 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 218, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `Post-lunch excursion (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_2', offsetMs: -2 * dayMs },
        { type: 'HBA1C', numericValue: 7.4, unit: '%', context: 'LAB_CONFIRMED', clinicalFlag: 'ELEVATED', notes: `Quarterly synthetic lab baseline (${SYNTHETIC_DEMO_BANNER})`, provenance: 'CLINICIAN_ENTERED', idempotencyKey: 'seed_obs_suresh_hba1c_q', offsetMs: -20 * dayMs },
        { type: 'BLOOD_PRESSURE', numericValue: 134, secondaryValue: 86, unit: 'mmHg', context: 'RESTING', clinicalFlag: 'NORMAL', notes: `Resting BP check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_bp_1', offsetMs: -2 * dayMs + 3 * hrMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 152, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_f_1', offsetMs: -1 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 242, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'ELEVATED_POST_MEAL', notes: `High post-dinner spike (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_suresh_pm_0', offsetMs: -1 * hrMs },
      ],
      medications: [
        {
          medicineName: 'Tab Glimepiride',
          medicationName: 'Glimepiride Tablets IP (Synthetic Demo)',
          genericName: 'Glimepiride',
          dosage: '1mg',
          timing: 'MORNING',
          foodInstructions: 'Just before breakfast',
          instructions: '1 tablet in the morning (Synthetic Demo)',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'CLINICIAN_PRESCRIBED',
          reviewStatus: 'CLINICIAN_REVIEWED',
          clinicalReviewNotes: `${SYNTHETIC_DEMO_BANNER}. Monitor alongside post-prandial readings.`,
        },
        {
          medicineName: 'Tab Atorvastatin',
          medicationName: 'Atorvastatin 10mg (Synthetic Self-Reported)',
          genericName: 'Atorvastatin',
          dosage: '10mg',
          timing: 'NIGHT',
          foodInstructions: 'At bedtime',
          instructions: '1 tablet nightly — pending clinician reconciliation in demo',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'PATIENT_REPORTED',
          reviewStatus: 'UNREVIEWED',
          clinicalReviewNotes: null,
        },
      ],
      adherenceEvents: [
        { medIndex: 0, idempotencyKey: 'seed_adh_suresh_taken_5', offsetMs: -5 * dayMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_suresh_taken_4', offsetMs: -4 * dayMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_suresh_taken_3', offsetMs: -3 * dayMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_suresh_taken_2', offsetMs: -2 * dayMs, action: 'TAKEN', note: `Taken before breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_suresh_missed_1', offsetMs: -1 * dayMs, action: 'MISSED', note: `Morning travel missed dose (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_suresh_atorva_1', offsetMs: -1 * dayMs + 8 * hrMs, action: 'TAKEN', note: `Night dose logged (${SYNTHETIC_DEMO_BANNER})` },
      ],
      tasks: [
        { idempotencyKey: 'seed_task_suresh_paired_1', title: 'Log paired fasting + 2h post-meal readings for 3 days', category: 'MONITORING', status: 'PENDING', dueOffsetMs: 18 * hrMs },
        { idempotencyKey: 'seed_task_suresh_reconcile_1', title: 'Review self-reported evening medication entry at next visit', category: 'MEDICATION', status: 'PENDING', dueOffsetMs: 2 * dayMs },
        { idempotencyKey: 'seed_task_suresh_walk_done', title: 'Evening 25-min post-dinner walk session', category: 'LIFESTYLE', status: 'COMPLETED', dueOffsetMs: -2 * dayMs, completedOffsetMs: -2 * dayMs + 2 * hrMs },
      ],
      documents: [
        {
          title: 'Post-Prandial Glucose & Lipid Trend Panel [Synthetic Demo B]',
          category: 'LAB_REPORT',
          issuingFacility: 'Synthetic Demo Diagnostics Ahmedabad',
          reportOffsetDays: -20,
          doctorReviewStatus: 'PENDING',
          plainSummary: `${SYNTHETIC_DEMO_BANNER}. Simulated HbA1c 7.4%, PPBS 218 mg/dL requiring clinician review.`,
          structuredLabs: {
            hba1c: { displayName: 'HbA1c (Simulated)', extractedValue: '7.4 %', referenceRange: '< 7.0 %', flag: 'ELEVATED' },
            postPrandialGlucose: { displayName: 'Post-Prandial Glucose (Simulated)', extractedValue: '218 mg/dL', referenceRange: '< 180 mg/dL', flag: 'HIGH' },
          },
          doctorAdvice: ['Synthetic demonstration lab report metadata awaiting clinician review action.'],
        },
      ],
      consultationPrep: {
        scheduledOffsetDays: 6,
        concernsAndQuestions: `${SYNTHETIC_DEMO_BANNER}: Post-meal spikes above 200 mg/dL after heavier dinners.`,
        personalNotes: 'Need dietary portion guidance for evening meals.',
      },
      appointments: [
        {
          idempotencyKey: 'seed_appt_suresh_past_1',
          scheduledOffsetDays: -18,
          durationMinutes: 30,
          reason: 'Post-prandial glycemic trend review [Synthetic Demo B]',
          visitType: 'DIABETES_REVIEW',
          status: 'COMPLETED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Completed simulated baseline visit.`,
        },
        {
          idempotencyKey: 'seed_appt_suresh_upcoming_1',
          scheduledOffsetDays: 6,
          durationMinutes: 30,
          reason: 'Follow-up on elevated post-meal glucose variability [Synthetic Demo B]',
          visitType: 'DIABETES_REVIEW',
          status: 'CONFIRMED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Upcoming clinic review.`,
        },
      ],
      consultationNote: {
        idempotencyKey: 'seed_cnote_suresh_past_1',
        offsetDays: -18,
        subjective: `${SYNTHETIC_DEMO_BANNER}. Simulated patient reports occasional post-dinner elevation and busy travel days.`,
        objective: 'Simulated BP 134/86 mmHg, HbA1c 7.4%.',
        assessment: `${SYNTHETIC_DEMO_BANNER}. Simulated post-meal trend monitoring vignette (not a real diagnosis).`,
        plan: 'Track paired pre/post meal sugars and review dietary fiber sequencing at next visit.',
        approvedNoteText: `${SYNTHETIC_DEMO_BANNER}. Approved synthetic note for trend monitoring demonstration.`,
      },
      messages: [
        {
          sender: 'PATIENT',
          category: 'QUESTION',
          content: `[Synthetic Demo B] Hello Dr. Choudhary, my post-dinner reading reached 242 mg/dL yesterday after a family meal.`,
          offsetMs: -10 * hrMs,
        },
        {
          sender: 'DOCTOR',
          category: 'DOCTOR_RESPONSE',
          content: `[Synthetic Demo Reply] Thank you for logging it promptly. Keep logging paired pre- and post-meal values before our upcoming check-in.`,
          offsetMs: -4 * hrMs,
        },
      ],
      notifications: [
        {
          recipient: 'DOCTOR',
          type: 'HIGH_GLUCOSE_ALERT',
          category: 'OBSERVATION',
          title: 'High Post-Meal Trend [Synthetic Demo B]',
          message: `${DEMO_PATIENT2_NAME} recorded 242 mg/dL (POST_MEAL_2HR) in synthetic demonstration data.`,
          link: '/patients',
          offsetMs: -1 * hrMs,
        },
        {
          recipient: 'PATIENT',
          type: 'FOLLOW_UP_DUE',
          category: 'APPOINTMENT',
          title: 'Upcoming Glucose Trend Review [Synthetic Demo]',
          message: 'Your confirmed synthetic trend review appointment with Dr. Choudhary is in 6 days.',
          link: '/appointments',
          offsetMs: -1 * hrMs,
        },
      ],
      lifestyleRecords: [
        { idempotencyKey: 'seed_life_suresh_walk_1', category: 'PHYSICAL_ACTIVITY', numericValue: 20, unit: 'MINUTES', qualitativeValue: 'LIGHT', notes: `Short evening walk (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -16 * hrMs, source: 'MANUAL_PATIENT' },
        { idempotencyKey: 'seed_life_suresh_sleep_1', category: 'SLEEP', numericValue: 6.2, unit: 'HOURS', qualitativeValue: 'FAIR', notes: `Late workday sleep (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -12 * hrMs, source: 'MANUAL_PATIENT' },
      ],
      emergencyContact: {
        name: 'Anita Patel [Synthetic Contact]',
        relationship: 'SPOUSE',
        phoneNumber: '+91-98220-11223',
      },
      reminder: {
        idempotencyKey: 'seed_rem_suresh_glimepiride_1',
        title: 'Pre-breakfast dose & fasting log [Synthetic Demo]',
        category: 'MEDICATION',
        remindOffsetMs: 10 * hrMs,
        recurrence: 'DAILY',
        notes: `${SYNTHETIC_DEMO_BANNER}`,
      },
    },
    {
      key: 'patient3',
      email: DEMO_PATIENT3_EMAIL,
      clinicalFocus: 'Medication adherence, hypoglycemia watch & care journey progress',
      profile: {
        fullName: DEMO_PATIENT3_NAME,
        dateOfBirth: new Date('1961-09-22'),
        diabetesType: 'TYPE_2_DIABETES',
        diagnosisYear: 2017,
        knownAllergies: 'Penicillin (hives) — SYNTHETIC DEMO DATA',
        targetFastingMin: 80,
        targetFastingMax: 130,
        targetPostMealMax: 180,
        emergencyContactName: 'Rohan Sharma [Synthetic Contact]',
        emergencyContactPhone: '+91-98111-44556',
      },
      carePlan: {
        version: 1,
        title: 'Medication Adherence & Low-Sugar Safety Plan v1 [Synthetic Demo C]',
        summary: `${SYNTHETIC_DEMO_BANNER}. Monitor early-morning fasting lows (<75 mg/dL), reinforce consistent dose logging, and complete preventive journey checks.`,
        reviewOffsetDays: 7,
        approvedOffsetDays: -10,
        goals: [
          {
            category: 'GLUCOSE',
            title: 'Prevent early-morning fasting lows (<70 mg/dL)',
            targetValue: '80 - 130',
            unit: 'mg/dL',
            timeframe: 'Daily',
            status: 'IN_PROGRESS',
          },
          {
            category: 'MEDICATION',
            title: 'Maintain >=90% verified dose adherence log',
            targetValue: '>= 90',
            unit: '%',
            timeframe: 'Weekly',
            status: 'ACHIEVED',
          },
          {
            category: 'PREVENTIVE',
            title: 'Complete annual preventive screenings',
            targetValue: '2',
            unit: 'checks',
            timeframe: 'Annual',
            status: 'IN_PROGRESS',
          },
        ],
        activities: [
          {
            category: 'MEDICATION',
            title: 'Confirm morning dose timing with breakfast',
            frequency: 'DAILY',
            timing: 'MORNING',
            instructions: 'Never take morning sulfonylurea on an empty stomach.',
            isCaregiverEligible: false,
          },
          {
            category: 'BLOOD_SUGAR_CHECK',
            title: 'Check fasting glucose upon waking before walking',
            frequency: 'DAILY',
            timing: 'MORNING',
            instructions: 'Follow clinic hypoglycemia rule-of-15 guidance if <70 mg/dL.',
            isCaregiverEligible: false,
          },
        ],
      },
      observations: [
        { type: 'BLOOD_GLUCOSE', numericValue: 88, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Fasting trend baseline (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_10', offsetMs: -10 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 138, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-lunch (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_pm_9', offsetMs: -9 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 82, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning fasting (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_8', offsetMs: -8 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 146, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-dinner (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_pm_7', offsetMs: -7 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 79, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Borderline low morning reading (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_6', offsetMs: -6 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 134, unit: 'mg/dL', context: 'POST_MEAL_2HR', clinicalFlag: 'NORMAL', notes: `2h post-lunch (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_pm_5', offsetMs: -5 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 76, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Mild low morning trend (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_4', offsetMs: -4 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 74, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning reading with mild shakiness (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_2', offsetMs: -2 * dayMs },
        { type: 'HBA1C', numericValue: 6.6, unit: '%', context: 'LAB_CONFIRMED', clinicalFlag: 'NORMAL', notes: `Synthetic lab panel baseline (${SYNTHETIC_DEMO_BANNER})`, provenance: 'CLINICIAN_ENTERED', idempotencyKey: 'seed_obs_sunita_hba1c_q', offsetMs: -22 * dayMs },
        { type: 'BLOOD_PRESSURE', numericValue: 118, secondaryValue: 76, unit: 'mmHg', context: 'RESTING', clinicalFlag: 'NORMAL', notes: `Resting BP check (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_bp_1', offsetMs: -3 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 76, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', notes: `Morning reading before tea (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_1', offsetMs: -1 * dayMs },
        { type: 'BLOOD_GLUCOSE', numericValue: 68, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'LOW_HYPOGLYCEMIA_RISK', notes: `Mild lightheadedness morning alert (${SYNTHETIC_DEMO_BANNER})`, provenance: 'PATIENT_ENTERED', idempotencyKey: 'seed_obs_sunita_f_0', offsetMs: -1 * hrMs },
      ],
      medications: [
        {
          medicineName: 'Tab Metformin + Sitagliptin',
          medicationName: 'Metformin + Sitagliptin 500/50mg (Synthetic Demo)',
          genericName: 'Metformin / Sitagliptin',
          dosage: '500/50mg',
          timing: 'MORNING',
          foodInstructions: 'With breakfast',
          instructions: '1 tablet after morning meal (Synthetic Demo)',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'CLINICIAN_PRESCRIBED',
          reviewStatus: 'CLINICIAN_REVIEWED',
          clinicalReviewNotes: `${SYNTHETIC_DEMO_BANNER}. Consistent adherence documented.`,
        },
        {
          medicineName: 'Tab Glimepiride (Low-Dose)',
          medicationName: 'Glimepiride 0.5mg (Synthetic Demo)',
          genericName: 'Glimepiride',
          dosage: '0.5mg',
          timing: 'MORNING',
          foodInstructions: 'With breakfast',
          instructions: 'Watch morning fasting values <75 mg/dL (Synthetic Demo)',
          route: 'ORAL',
          frequency: 'DAILY',
          source: 'CLINICIAN_PRESCRIBED',
          reviewStatus: 'CLINICIAN_REVIEWED',
          clinicalReviewNotes: `${SYNTHETIC_DEMO_BANNER}. Reviewing morning dose margin during low fasting trend.`,
        },
      ],
      adherenceEvents: [
        { medIndex: 0, idempotencyKey: 'seed_adh_sunita_m0_d5', offsetMs: -5 * dayMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_sunita_m1_d5', offsetMs: -5 * dayMs + hrMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_sunita_m0_d4', offsetMs: -4 * dayMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_sunita_m1_d4', offsetMs: -4 * dayMs + hrMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_sunita_m0_d3', offsetMs: -3 * dayMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_sunita_m0_d2', offsetMs: -2 * dayMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 0, idempotencyKey: 'seed_adh_sunita_m0_d1', offsetMs: -1 * dayMs, action: 'TAKEN', note: `Taken with breakfast (${SYNTHETIC_DEMO_BANNER})` },
        { medIndex: 1, idempotencyKey: 'seed_adh_sunita_m1_d0', offsetMs: -2 * hrMs, action: 'SKIPPED', note: `Held morning low-dose sulfonylurea due to 68 mg/dL fasting reading (${SYNTHETIC_DEMO_BANNER})` },
      ],
      tasks: [
        { idempotencyKey: 'seed_task_sunita_foot_exam_1', title: 'Annual Comprehensive Diabetic Foot Examination', category: 'FOOT_EXAM', status: 'PENDING', dueOffsetMs: 5 * dayMs },
        { idempotencyKey: 'seed_task_sunita_hba1c_1', title: 'Schedule 3-Month Repeat HbA1c Lab Panel', category: 'LAB_TEST', status: 'PENDING', dueOffsetMs: 7 * dayMs },
        { idempotencyKey: 'seed_task_sunita_hypo_prep', title: 'Verify bedside fast-acting glucose snack kit', category: 'LIFESTYLE', status: 'COMPLETED', dueOffsetMs: -4 * dayMs, completedOffsetMs: -4 * dayMs + hrMs },
        { idempotencyKey: 'seed_task_sunita_med_log', title: 'Complete 5-day morning medication timing log', category: 'MEDICATION', status: 'COMPLETED', dueOffsetMs: -1 * dayMs, completedOffsetMs: -20 * hrMs },
      ],
      documents: [
        {
          title: 'Quarterly HbA1c & Renal Baseline Panel [Synthetic Demo C]',
          category: 'LAB_REPORT',
          issuingFacility: 'Synthetic Demo Clinical Lab Delhi',
          reportOffsetDays: -22,
          doctorReviewStatus: 'PENDING',
          plainSummary: `${SYNTHETIC_DEMO_BANNER}. Simulated HbA1c 6.6%, eGFR 78 mL/min/1.73m2 for care journey evaluation.`,
          structuredLabs: {
            hba1c: { displayName: 'HbA1c (Simulated)', extractedValue: '6.6 %', referenceRange: '< 7.0 %', flag: 'IN_TARGET' },
            egfr: { displayName: 'eGFR (Simulated)', extractedValue: '78 mL/min', referenceRange: '>= 60', flag: 'NORMAL' },
          },
          doctorAdvice: ['Pending synthetic report review for Patient C.'],
        },
      ],
      consultationPrep: {
        scheduledOffsetDays: 9,
        concernsAndQuestions: `${SYNTHETIC_DEMO_BANNER}: Morning sugar dropped to 68 mg/dL today before breakfast.`,
        personalNotes: 'Held morning low-dose tablet and had a balanced breakfast snack.',
      },
      appointments: [
        {
          idempotencyKey: 'seed_appt_sunita_past_1',
          scheduledOffsetDays: -14,
          durationMinutes: 30,
          reason: 'Medication adherence & care journey review [Synthetic Demo C]',
          visitType: 'DIABETES_REVIEW',
          status: 'COMPLETED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Completed simulated follow-up consultation.`,
        },
        {
          idempotencyKey: 'seed_appt_sunita_upcoming_1',
          scheduledOffsetDays: 9,
          durationMinutes: 30,
          reason: 'Evaluate morning fasting lows & confirm medication timing [Synthetic Demo C]',
          visitType: 'DIABETES_REVIEW',
          status: 'REQUESTED',
          notes: `${SYNTHETIC_DEMO_BANNER}. Pending doctor confirmation in demo.`,
        },
      ],
      consultationNote: {
        idempotencyKey: 'seed_cnote_sunita_past_1',
        offsetDays: -14,
        subjective: `${SYNTHETIC_DEMO_BANNER}. High adherence to daily medication schedule; occasional mild early-morning low feeling.`,
        objective: 'Simulated BP 118/76 mmHg, HbA1c 6.6%.',
        assessment: `${SYNTHETIC_DEMO_BANNER}. Simulated medication adherence & hypoglycemia safety vignette (not a real diagnosis).`,
        plan: 'Reinforce pre-meal glucose check and prompt physician outreach if fasting <70 mg/dL.',
        approvedNoteText: `${SYNTHETIC_DEMO_BANNER}. Approved synthetic consultation summary.`,
      },
      messages: [
        {
          sender: 'PATIENT',
          category: 'QUESTION',
          content: `[Synthetic Demo C] Good morning Dr. Choudhary, my fasting reading was 68 mg/dL today so I noted it and ate breakfast promptly.`,
          offsetMs: -1 * hrMs,
        },
        {
          sender: 'DOCTOR',
          category: 'DOCTOR_RESPONSE',
          content: `[Synthetic Demo Reply] Well handled logging that promptly. Let us confirm your upcoming visit slot and review morning dosing safely.`,
          offsetMs: -30 * 60 * 1000,
        },
      ],
      notifications: [
        {
          recipient: 'DOCTOR',
          type: 'LOW_GLUCOSE_ALERT',
          category: 'OBSERVATION',
          title: 'Low Fasting Alert [Synthetic Demo C]',
          message: `${DEMO_PATIENT3_NAME} logged 68 mg/dL (FASTING) in synthetic demonstration data.`,
          link: '/patients',
          offsetMs: -1 * hrMs,
        },
        {
          recipient: 'PATIENT',
          type: 'TASK_ASSIGNED',
          category: 'TASK',
          title: 'Preventive Journey Tasks Pending [Synthetic Demo]',
          message: '2 annual preventive care tasks are scheduled on your care journey.',
          link: '/journey',
          offsetMs: -2 * dayMs,
        },
      ],
      lifestyleRecords: [
        { idempotencyKey: 'seed_life_sunita_yoga_1', category: 'PHYSICAL_ACTIVITY', numericValue: 25, unit: 'MINUTES', qualitativeValue: 'LIGHT', notes: `Gentle morning pranayama & stretch (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -10 * hrMs, source: 'MANUAL_PATIENT' },
        { idempotencyKey: 'seed_life_sunita_sleep_1', category: 'SLEEP', numericValue: 7.0, unit: 'HOURS', qualitativeValue: 'RESTFUL', notes: `Overnight sleep (${SYNTHETIC_DEMO_BANNER})`, offsetMs: -12 * hrMs, source: 'MANUAL_PATIENT' },
      ],
      emergencyContact: {
        name: 'Rohan Sharma [Synthetic Contact]',
        relationship: 'SON',
        phoneNumber: '+91-98111-44556',
      },
      reminder: {
        idempotencyKey: 'seed_rem_sunita_fasting_1',
        title: 'Check fasting sugar before morning walk [Synthetic Demo]',
        category: 'MONITORING',
        remindOffsetMs: 14 * hrMs,
        recurrence: 'DAILY',
        notes: `${SYNTHETIC_DEMO_BANNER}`,
      },
    },
  ];
}

async function ensureSyntheticAccount(
  prisma: PrismaClient,
  params: {
    email: string;
    passwordHash: string | null;
    isClinician: boolean;
    profile: {
      fullName: string;
      primaryClinician: string;
      diabetesType: string;
      dateOfBirth?: Date;
      diagnosisYear?: number;
      knownAllergies?: string;
      targetFastingMin?: number;
      targetFastingMax?: number;
      targetPostMealMax?: number;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    };
  },
): Promise<{ user: any; created: boolean; updated: boolean }> {
  assertApprovedSyntheticEmail(params.email);

  let created = false;
  let updated = false;

  const user = await runScoped(
    prisma,
    { isSystemWorker: true, workerScope: 'STAGING_BOOTSTRAP_WORKER' },
    async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: params.email },
        include: { profile: true },
      });

      if (!existing) {
        if (!params.passwordHash) {
          throw new Error(`Cannot create account ${params.email} without passwordHash.`);
        }
        created = true;
        return tx.user.create({
          data: {
            email: params.email,
            passwordHash: params.passwordHash,
            isSyntheticDemo: true,
            isClinician: params.isClinician,
            isActive: true,
          },
        });
      }

      const updateData: Record<string, any> = {};
      if (params.passwordHash) {
        updateData.passwordHash = params.passwordHash;
      }
      if (existing.isClinician !== params.isClinician) {
        updateData.isClinician = params.isClinician;
      }
      if (!existing.isSyntheticDemo) {
        updateData.isSyntheticDemo = true;
      }
      if (!existing.isActive) {
        updateData.isActive = true;
        updateData.deactivatedAt = null;
      }

      if (Object.keys(updateData).length > 0) {
        updated = true;
        return tx.user.update({
          where: { id: existing.id },
          data: updateData,
        });
      }

      return existing;
    },
  );

  // PatientProfile RLS permits owner userId or REGISTRATION_WORKER/INVITATION_WORKER/DEMO_WORKER (not STAGING_BOOTSTRAP_WORKER).
  const profile = await runScoped(
    prisma,
    { userId: user.id, role: params.isClinician ? 'DOCTOR' : 'PATIENT' },
    async (tx) => {
      const existingProfile = await tx.patientProfile.findUnique({
        where: { userId: user.id },
      });
      if (existingProfile) {
        return existingProfile;
      }
      updated = updated || !created;
      return tx.patientProfile.create({
        data: {
          userId: user.id,
          fullName: params.profile.fullName,
          dateOfBirth: params.profile.dateOfBirth,
          diabetesType: params.profile.diabetesType,
          diagnosisYear: params.profile.diagnosisYear,
          primaryClinician: params.profile.primaryClinician,
          knownAllergies: params.profile.knownAllergies,
          targetFastingMin: params.profile.targetFastingMin ?? 80,
          targetFastingMax: params.profile.targetFastingMax ?? 130,
          targetPostMealMax: params.profile.targetPostMealMax ?? 180,
          emergencyContactName: params.profile.emergencyContactName,
          emergencyContactPhone: params.profile.emergencyContactPhone,
          preferredLanguage: 'en',
          timeZone: 'Asia/Kolkata',
        },
      });
    },
  );

  return {
    user: { ...user, profile },
    created,
    updated,
  };
}

async function seedSinglePatientClinicalData(
  prisma: PrismaClient,
  spec: SyntheticPatientDatasetSpec,
  patient: any,
  doctor: any,
  practice: any,
  caregiver: any,
  stats: StagingSeedStats,
  now: number,
  dayMs: number,
): Promise<void> {
  const doctorCtx: TenantDatabaseContext = {
    userId: doctor.id,
    practiceId: practice.id,
    patientId: patient.id,
    role: 'DOCTOR',
  };
  const patientCtx: TenantDatabaseContext = {
    userId: patient.id,
    patientId: patient.id,
    role: 'PATIENT',
  };

  // 1. DoctorPatientAssignment (requires doctor userId matching doctorId + PracticeMembership)
  await runScoped(prisma, doctorCtx, async (tx) => {
    await tx.doctorPatientAssignment.upsert({
      where: {
        doctorId_patientId: {
          doctorId: doctor.id,
          patientId: patient.id,
        },
      },
      create: {
        doctorId: doctor.id,
        patientId: patient.id,
        status: 'ACTIVE',
        activatedAt: new Date(now - 30 * dayMs),
      },
      update: {
        status: 'ACTIVE',
      },
    });
  });
  stats.assignments++;

  // 2. Optional CaregiverConsent for Patient 1 -> Caregiver (INSERT requires patient userId)
  if (spec.key === 'patient1' && caregiver) {
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
    const activeGrantKey = `${patient.id}:${caregiver.email.toLowerCase()}`;
    await runScoped(prisma, patientCtx, async (tx) => {
      await tx.caregiverConsent.upsert({
        where: { activeGrantKey },
        create: {
          patientId: patient.id,
          caregiverEmail: caregiver.email,
          caregiverName: DEMO_CAREGIVER_NAME,
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
    });
  }

  // 3. CarePlan (requires assigned doctor context)
  const carePlan = await runScoped(prisma, doctorCtx, async (tx) => {
    const existingPlan = await tx.carePlan.findFirst({
      where: {
        patientId: patient.id,
        doctorId: doctor.id,
        version: spec.carePlan.version,
      },
      include: { goals: true, activities: true },
    });
    if (existingPlan) return existingPlan;
    return tx.carePlan.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        version: spec.carePlan.version,
        status: 'ACTIVE',
        title: spec.carePlan.title,
        summary: spec.carePlan.summary,
        reviewDate: new Date(now + spec.carePlan.reviewOffsetDays * dayMs),
        approvedAt: new Date(now + spec.carePlan.approvedOffsetDays * dayMs),
        goals: { create: spec.carePlan.goals },
        activities: { create: spec.carePlan.activities },
      },
      include: { goals: true, activities: true },
    });
  });
  stats.carePlans++;

  // 4. HealthObservations (idempotent non-destructive create under patient owner context)
  let firstObs: any = null;
  await runScoped(prisma, patientCtx, async (tx) => {
    for (const obs of spec.observations) {
      let row = await tx.healthObservation.findUnique({
        where: { idempotencyKey: obs.idempotencyKey },
      });
      if (!row) {
        row = await tx.healthObservation.create({
          data: {
            userId: patient.id,
            type: obs.type,
            numericValue: obs.numericValue,
            secondaryValue: obs.secondaryValue ?? null,
            unit: obs.unit,
            context: obs.context,
            clinicalFlag: obs.clinicalFlag,
            notes: obs.notes,
            provenance: obs.provenance,
            idempotencyKey: obs.idempotencyKey,
            observedAt: new Date(now + obs.offsetMs),
          },
        });
      }
      if (!firstObs && row.type === 'BLOOD_GLUCOSE') {
        firstObs = row;
      }
      stats.observations++;
    }
  });

  // 5. MedicationSchedules (assigned doctor context)
  const medRecords: any[] = [];
  await runScoped(prisma, doctorCtx, async (tx) => {
    for (const med of spec.medications) {
      let existingMed = await tx.medicationSchedule.findFirst({
        where: { userId: patient.id, medicineName: med.medicineName },
      });
      if (!existingMed) {
        existingMed = await tx.medicationSchedule.create({
          data: {
            userId: patient.id,
            medicineName: med.medicineName,
            medicationName: med.medicationName,
            genericName: med.genericName,
            dosage: med.dosage,
            timing: med.timing,
            foodInstructions: med.foodInstructions,
            instructions: med.instructions,
            route: med.route,
            frequency: med.frequency,
            source: med.source,
            status: 'ACTIVE',
            reviewStatus: med.reviewStatus,
            reviewedByClinicianId: med.reviewStatus === 'CLINICIAN_REVIEWED' ? doctor.id : null,
            reviewedAt: med.reviewStatus === 'CLINICIAN_REVIEWED' ? new Date(now - 28 * dayMs) : null,
            clinicalReviewNotes: med.clinicalReviewNotes,
            isActive: true,
          },
        });
      }
      medRecords.push(existingMed);
      stats.medicationSchedules++;
    }
  });

  // 6. MedicationAdherenceEvents (RLS INSERT requires patient userId; DELETE forbidden by trigger)
  let firstTakenDose: any = null;
  await runScoped(prisma, patientCtx, async (tx) => {
    for (const item of spec.adherenceEvents) {
      const targetMed = medRecords[item.medIndex] || medRecords[0];
      if (!targetMed) continue;
      let ev = await tx.medicationAdherenceEvent.findUnique({
        where: { idempotencyKey: item.idempotencyKey },
      });
      if (!ev) {
        ev = await tx.medicationAdherenceEvent.create({
          data: {
            medicationId: targetMed.id,
            userId: patient.id,
            action: item.action,
            scheduledTime: new Date(now + item.offsetMs),
            recordedAt: new Date(now + item.offsetMs + 1800000),
            recordedBy: patient.id,
            sourceProvenance: 'MANUAL_PATIENT',
            notes: item.note,
            idempotencyKey: item.idempotencyKey,
          },
        });
      }
      if (!firstTakenDose && ev.action === 'TAKEN') {
        firstTakenDose = ev;
      }
      stats.adherenceEvents++;
    }
  });

  // 7. CareTasks (assigned doctor context)
  let firstCompletedTask: any = null;
  await runScoped(prisma, doctorCtx, async (tx) => {
    for (const task of spec.tasks) {
      let existingTask = await tx.careTask.findUnique({
        where: { idempotencyKey: task.idempotencyKey },
      });
      if (!existingTask) {
        const completedById =
          task.status === 'COMPLETED'
            ? task.completedByCaregiver && caregiver
              ? caregiver.id
              : patient.id
            : null;
        existingTask = await tx.careTask.create({
          data: {
            userId: patient.id,
            carePlanId: carePlan?.id || null,
            title: task.title,
            category: task.category,
            status: task.status,
            dueAt: new Date(now + task.dueOffsetMs),
            completedAt:
              task.status === 'COMPLETED' && task.completedOffsetMs !== undefined
                ? new Date(now + task.completedOffsetMs)
                : null,
            completedById,
            completedByRole:
              task.status === 'COMPLETED'
                ? task.completedByCaregiver && caregiver
                  ? 'CAREGIVER'
                  : 'PATIENT'
                : null,
            idempotencyKey: task.idempotencyKey,
          },
        });
      }
      if (!firstCompletedTask && existingTask.status === 'COMPLETED') {
        firstCompletedTask = existingTask;
      }
      stats.careTasks++;
    }
  });

  // 8. HealthDocuments (respect disabled durable storage in staging/production; metadata-only when disabled)
  const durableAvailable = isDurableStorageAvailable();
  let primaryDocRelativePath: string | null = null;
  if (durableAvailable && spec.key === 'patient1') {
    const validPdfBuf = generateValidSyntheticPdfBuffer(
      spec.documents[0].title,
      spec.profile.fullName,
      spec.documents[0].pdfLines || [SYNTHETIC_DEMO_BANNER],
    );
    if (isCloudStorageEnabled()) {
      const saved = await savePrivateFile(
        patient.id,
        'quarterly_glycemic_panel.pdf',
        validPdfBuf,
        'application/pdf',
      );
      primaryDocRelativePath = saved.storagePath;
    } else {
      const uploadDir = path.resolve(env.STORAGE_DIR, patient.id);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const pdfFilePath = path.join(uploadDir, 'quarterly_glycemic_panel.pdf');
      fs.writeFileSync(pdfFilePath, validPdfBuf);
      primaryDocRelativePath = `uploads/private/${patient.id}/quarterly_glycemic_panel.pdf`;
    }
  }

  await runScoped(prisma, patientCtx, async (tx) => {
    const existingDocs = await tx.healthDocument.findMany({
      where: { userId: patient.id },
    });

    for (let i = 0; i < spec.documents.length; i++) {
      const docSpec = spec.documents[i];
      const existingDoc = existingDocs.find((d: any) => d.title === docSpec.title);
      if (!existingDoc) {
        const storagePath = i === 0 ? primaryDocRelativePath : null;
        await tx.healthDocument.create({
          data: {
            userId: patient.id,
            title: docSpec.title,
            category: docSpec.category,
            issuingFacility: docSpec.issuingFacility,
            reportDate: new Date(now + docSpec.reportOffsetDays * dayMs),
            processingStatus: 'READY',
            mimeType: storagePath ? 'application/pdf' : null,
            storagePath,
            notes: `${SYNTHETIC_DEMO_BANNER}. ${durableAvailable ? 'Synthetic document ready.' : 'Metadata-only synthetic preview (durable storage disabled in free staging).'}`,
            extractedData: JSON.stringify({
              isSynthetic: true,
              provider: 'SYNTHETIC_DEMO_METADATA',
              syntheticLabel: SYNTHETIC_DEMO_BANNER,
              status: 'READY',
              doctorReviewStatus: docSpec.doctorReviewStatus,
              reviewedBy: docSpec.doctorReviewStatus === 'REVIEWED' ? doctor.id : null,
              reviewedByName: docSpec.doctorReviewStatus === 'REVIEWED' ? DEMO_DOCTOR_NAME : null,
              reviewedAt:
                docSpec.doctorReviewStatus === 'REVIEWED'
                  ? new Date(now - 20 * dayMs).toISOString()
                  : null,
              plainSummary: docSpec.plainSummary,
              structuredLabs: docSpec.structuredLabs || undefined,
              medicines: docSpec.medicines || undefined,
              doctorAdvice: docSpec.doctorAdvice,
            }),
          },
        });
        stats.healthDocuments++;
      } else {
        stats.healthDocuments++;
      }
    }
  });

  // 9. ConsultationPrep (patient owner context)
  await runScoped(prisma, patientCtx, async (tx) => {
    const existingPrep = await tx.consultationPrep.findFirst({
      where: { userId: patient.id },
    });
    if (!existingPrep) {
      await tx.consultationPrep.create({
        data: {
          userId: patient.id,
          clinicianName: DEMO_DOCTOR_NAME,
          facilityName: DEMO_DOCTOR_FACILITY,
          scheduledAt: new Date(now + spec.consultationPrep.scheduledOffsetDays * dayMs),
          concernsAndQuestions: spec.consultationPrep.concernsAndQuestions,
          personalNotes: spec.consultationPrep.personalNotes,
        },
      });
    }
    stats.consultationPreps++;
  });

  // 10. Appointments & ConsultationNote (assigned doctor + practice context)
  let firstApprovedNote: any = null;
  await runScoped(prisma, doctorCtx, async (tx) => {
    for (const appt of spec.appointments) {
      const existingAppt = await tx.appointment.findUnique({
        where: { idempotencyKey: appt.idempotencyKey },
      });
      if (!existingAppt) {
        await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            bookedById: patient.id,
            scheduledAt: new Date(now + appt.scheduledOffsetDays * dayMs),
            durationMinutes: appt.durationMinutes,
            reason: appt.reason,
            visitType: appt.visitType,
            status: appt.status,
            completedAt:
              appt.status === 'COMPLETED'
                ? new Date(now + appt.scheduledOffsetDays * dayMs + 1800000)
                : null,
            notes: appt.notes,
            idempotencyKey: appt.idempotencyKey,
          },
        });
      }
      stats.appointments++;
    }

    // Approved ConsultationNotes are strictly immutable under note_update_policy / trg_consultation_note_lifecycle_guard.
    let existingNote = await tx.consultationNote.findUnique({
      where: { idempotencyKey: spec.consultationNote.idempotencyKey },
    });
    if (!existingNote) {
      const approvedAt = new Date(now + spec.consultationNote.offsetDays * dayMs);
      existingNote = await tx.consultationNote.create({
        data: {
          userId: patient.id,
          clinicianId: doctor.id,
          clinicianName: DEMO_DOCTOR_NAME,
          status: 'APPROVED',
          structuredNote: JSON.stringify({
            subjective: spec.consultationNote.subjective,
            objective: spec.consultationNote.objective,
            assessment: spec.consultationNote.assessment,
            plan: spec.consultationNote.plan,
          }),
          approvedNoteText: spec.consultationNote.approvedNoteText,
          approvedAt,
          approvedBy: doctor.id,
          sharedWithPatient: true,
          sharedAt: new Date(approvedAt.getTime() + 600000),
          idempotencyKey: spec.consultationNote.idempotencyKey,
        },
      });
    }
    firstApprovedNote = existingNote;
    stats.consultationNotes++;
  });

  // 11. JourneyMilestones (idempotent, patient owner context)
  await runScoped(prisma, patientCtx, async (tx) => {
    if (typeof (tx as any).journeyMilestone?.findUnique !== 'function') {
      return;
    }
    const milestones: Array<{
      milestoneKey: string;
      title: string;
      description: string;
      achievedAt: Date;
      eventRefType: string;
      eventRefId: string;
      actorId?: string;
    }> = [];

    if (firstObs) {
      milestones.push({
        milestoneKey: 'FIRST_GLUCOSE_READING',
        title: 'First Blood Glucose Logged',
        description: `First synthetic observation recorded (${firstObs.numericValue} ${firstObs.unit}).`,
        achievedAt: firstObs.observedAt,
        eventRefType: 'HealthObservation',
        eventRefId: firstObs.id,
      });
    }
    if (firstCompletedTask?.completedAt) {
      milestones.push({
        milestoneKey: 'FIRST_TASK_COMPLETED',
        title: 'First Care Task Completed',
        description: `Completed task: ${firstCompletedTask.title}`,
        achievedAt: firstCompletedTask.completedAt,
        eventRefType: 'CareTask',
        eventRefId: firstCompletedTask.id,
        actorId: firstCompletedTask.completedById || patient.id,
      });
    }
    if (carePlan) {
      milestones.push({
        milestoneKey: 'CARE_PLAN_INITIATED',
        title: 'Doctor Care Plan Established',
        description: `Active clinical care plan version ${carePlan.version} established.`,
        achievedAt: carePlan.approvedAt || carePlan.createdAt || new Date(now - 2 * dayMs),
        eventRefType: 'CarePlan',
        eventRefId: carePlan.id,
      });
    }
    if (firstApprovedNote?.approvedAt) {
      milestones.push({
        milestoneKey: 'FIRST_CONSULTATION',
        title: 'First Doctor Consultation Completed',
        description: `Consultation documented with ${DEMO_DOCTOR_NAME}.`,
        achievedAt: firstApprovedNote.approvedAt,
        eventRefType: 'ConsultationNote',
        eventRefId: firstApprovedNote.id,
        actorId: doctor.id,
      });
    }
    if (firstTakenDose) {
      milestones.push({
        milestoneKey: 'FIRST_MEDICATION_TAKEN',
        title: 'Medication Adherence Initiated',
        description: 'First scheduled medication log recorded.',
        achievedAt: firstTakenDose.recordedAt,
        eventRefType: 'MedicationAdherenceEvent',
        eventRefId: firstTakenDose.id,
        actorId: patient.id,
      });
    }

    for (const m of milestones) {
      const existing = await tx.journeyMilestone.findUnique({
        where: { userId_milestoneKey: { userId: patient.id, milestoneKey: m.milestoneKey } },
      });
      if (!existing) {
        await tx.journeyMilestone.create({
          data: {
            userId: patient.id,
            milestoneKey: m.milestoneKey,
            title: m.title,
            description: m.description,
            achievedAt: m.achievedAt,
            eventRefType: m.eventRefType,
            eventRefId: m.eventRefId,
            actorId: m.actorId,
            metadata: JSON.stringify({ synthetic: true, banner: SYNTHETIC_DEMO_BANNER }),
          },
        });
      }
      stats.journeyMilestones++;
    }
  });

  // 12. CareTeamMessages (RLS msg_insert_policy enforces senderId = current_app_user_id())
  const existingMessages = await runScoped(prisma, patientCtx, async (tx) =>
    tx.careTeamMessage.findMany({ where: { patientId: patient.id } }),
  );
  if (existingMessages.length === 0) {
    for (const msg of spec.messages) {
      let senderCtx: TenantDatabaseContext = patientCtx;
      let senderId = patient.id;
      let recipientId = doctor.id;
      if (msg.sender === 'DOCTOR') {
        senderCtx = doctorCtx;
        senderId = doctor.id;
        recipientId = patient.id;
      } else if (msg.sender === 'CAREGIVER' && caregiver) {
        senderCtx = { userId: caregiver.id, patientId: patient.id, role: 'CAREGIVER' };
        senderId = caregiver.id;
        recipientId = doctor.id;
      }

      await runScoped(prisma, senderCtx, async (tx) => {
        await tx.careTeamMessage.create({
          data: {
            patientId: patient.id,
            senderId,
            recipientId,
            senderRole: msg.sender,
            category: msg.category,
            content: msg.content,
            createdAt: new Date(now + msg.offsetMs),
          },
        });
      });
      stats.messages++;
    }
  } else {
    stats.messages += existingMessages.length;
  }

  // 13. CareNotifications (run under recipient userId so INSERT + RETURNING SELECT pass RLS cleanly)
  for (const notif of spec.notifications) {
    let recipientId = patient.id;
    let actorId = doctor.id;
    let role: TenantDatabaseContext['role'] = 'PATIENT';
    if (notif.recipient === 'DOCTOR') {
      recipientId = doctor.id;
      actorId = spec.key === 'patient1' && caregiver ? caregiver.id : patient.id;
      role = 'DOCTOR';
    } else if (notif.recipient === 'CAREGIVER' && caregiver) {
      recipientId = caregiver.id;
      actorId = patient.id;
      role = 'CAREGIVER';
    }

    await runScoped(
      prisma,
      { userId: recipientId, patientId: patient.id, role },
      async (tx) => {
        const existingNotifs = await tx.careNotification.findMany({
          where: { userId: recipientId, patientId: patient.id },
        });
        const duplicate = existingNotifs.some((n: any) => n.title === notif.title);
        if (!duplicate) {
          await tx.careNotification.create({
            data: {
              userId: recipientId,
              patientId: patient.id,
              actorId,
              type: notif.type,
              category: notif.category,
              title: notif.title,
              message: notif.message,
              link: notif.link,
              createdAt: new Date(now + notif.offsetMs),
            },
          });
        }
        stats.notifications++;
      },
    );
  }

  // 14. LifestyleRecords, EmergencyContact & Reminder (patient owner context)
  await runScoped(prisma, patientCtx, async (tx) => {
    for (const lr of spec.lifestyleRecords) {
      const existingLr = await tx.lifestyleRecord.findUnique({
        where: { idempotencyKey: lr.idempotencyKey },
      });
      if (!existingLr) {
        await tx.lifestyleRecord.create({
          data: {
            userId: patient.id,
            category: lr.category,
            numericValue: lr.numericValue,
            unit: lr.unit,
            qualitativeValue: lr.qualitativeValue,
            notes: lr.notes,
            recordedAt: new Date(now + lr.offsetMs),
            source: lr.source,
            createdById: lr.byCaregiver && caregiver ? caregiver.id : patient.id,
            idempotencyKey: lr.idempotencyKey,
          },
        });
      }
      stats.lifestyleRecords++;
    }

    const existingContact = await tx.emergencyContact.findFirst({
      where: { userId: patient.id, name: spec.emergencyContact.name },
    });
    if (!existingContact) {
      await tx.emergencyContact.create({
        data: {
          userId: patient.id,
          name: spec.emergencyContact.name,
          relationship: spec.emergencyContact.relationship,
          phoneNumber: spec.emergencyContact.phoneNumber,
          email: spec.emergencyContact.email || null,
          isPrimary: true,
          notifyOnSos: true,
        },
      });
    }
    stats.emergencyContacts++;

    const existingRem = await tx.reminder.findUnique({
      where: { idempotencyKey: spec.reminder.idempotencyKey },
    });
    if (!existingRem) {
      await tx.reminder.create({
        data: {
          userId: patient.id,
          createdById: patient.id,
          title: spec.reminder.title,
          category: spec.reminder.category,
          status: 'SCHEDULED',
          remindAt: new Date(now + spec.reminder.remindOffsetMs),
          recurrence: spec.reminder.recurrence,
          notes: spec.reminder.notes,
          idempotencyKey: spec.reminder.idempotencyKey,
        },
      });
    }
    stats.reminders++;
  });

  // 15. Record governed AuditLog entry for pilot dataset seeding using AUDIT_RECORDER + auditEventId claim
  if (typeof (prisma as any).auditLog?.create === 'function') {
    const auditEventId = crypto.randomUUID();
    await runScoped(
      prisma,
      {
        isSystemWorker: true,
        workerScope: 'AUDIT_RECORDER',
        patientId: patient.id,
        auditEventId,
      },
      async (tx) => {
        await tx.auditLog.create({
          data: {
            id: auditEventId,
            userId: patient.id,
            actorId: 'SYSTEM_AUDIT_RECORDER',
            action: 'STAGING_SYNTHETIC_PILOT_SEEDED',
            entityType: 'SyntheticPilotDataset',
            entityId: patient.id,
            metadata: JSON.stringify({
              email: patient.email,
              clinicalFocus: spec.clinicalFocus,
              syntheticBanner: SYNTHETIC_DEMO_BANNER,
              doctorEmail: doctor.email,
            }),
          },
        });
      },
    );
    stats.auditEvents++;
  }
}

/**
 * Safely and idempotently bootstraps the synthetic demo clinical dataset in Staging/Test.
 *
 * Invariants enforced:
 * - Prohibited when APP_ENV === 'production' or non-staging production runtime.
 * - Preserves FeatureFlag read-only contract (never writes to FeatureFlag).
 * - Wraps every PostgreSQL operation in least-privilege signed worker/actor RLS context.
 * - Never overwrites an already-provisioned doctor password unless rotatePasswords is explicit.
 * - Never writes secrets, JWTs, refresh tokens, passwords, or database URLs in logs or output.
 */
export async function ensureStagingDemoDoctor(
  prisma: PrismaClient,
  options: StagingDemoSeedOptions = {},
): Promise<StagingSeedResult> {
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

  await assertSafeSeedEnvironment(prisma);

  const isProdRuntime = process.env.NODE_ENV === 'production';
  const rotatePasswords = Boolean(
    options.rotatePasswords ?? (process.env.ROTATE_DEMO_PASSWORDS === 'true'),
  );
  const rawDoctorPassword = options.doctorPassword || process.env.DEMO_DOCTOR_PASSWORD;
  const rawPatientPassword =
    options.patientPassword ||
    process.env.DEMO_PATIENT_PASSWORD ||
    process.env.DEMO_PATIENT1_PASSWORD;
  const rawPatient2Password =
    options.patient2Password || process.env.DEMO_PATIENT2_PASSWORD;
  const rawPatient3Password =
    options.patient3Password || process.env.DEMO_PATIENT3_PASSWORD;
  const rawCaregiverPassword =
    options.caregiverPassword || process.env.DEMO_CAREGIVER_PASSWORD;

  if (isProdRuntime) {
    const explicitCandidates: Array<[string, string | undefined]> = [
      [`clinician (${DEMO_DOCTOR_EMAIL})`, rawDoctorPassword],
      [`primary synthetic patient (${DEMO_PATIENT_EMAIL})`, rawPatientPassword],
      [`synthetic patient 2 (${DEMO_PATIENT2_EMAIL})`, rawPatient2Password],
      [`synthetic patient 3 (${DEMO_PATIENT3_EMAIL})`, rawPatient3Password],
      [`synthetic caregiver (${DEMO_CAREGIVER_EMAIL})`, rawCaregiverPassword],
    ];
    for (const [label, pwd] of explicitCandidates) {
      if (pwd !== undefined && pwd !== '' && !isStrongNonDefaultPassword(pwd)) {
        throw new Error(
          `Deployed staging requires a strong, non-default password (min 12 chars) for ${label}.`,
        );
      }
    }
    if (
      rawDoctorPassword &&
      [rawPatientPassword, rawPatient2Password, rawPatient3Password, rawCaregiverPassword].some(
        (p) => p && p === rawDoctorPassword,
      )
    ) {
      throw new Error(
        'Security policy refusal: patient/caregiver password must not be shared with the clinician account.',
      );
    }
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats: StagingSeedStats = {
    featureFlags: 0,
    featureFlagsMutated: 0,
    users: 0,
    assignments: 0,
    carePlans: 0,
    observations: 0,
    medicationSchedules: 0,
    adherenceEvents: 0,
    careTasks: 0,
    journeyMilestones: 0,
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
    auditEvents: 0,
  };

  // 1. Read-only FeatureFlag check (runtime role cannot write to FeatureFlag)
  const flagSummary = await verifyFeatureFlagsReadOnly(prisma);
  stats.featureFlags = flagSummary.enabledCoreCount;
  stats.featureFlagsMutated = 0;

  // 2. Migrate legacy synthetic doctor email if present and target does not exist
  await runScoped(
    prisma,
    { isSystemWorker: true, workerScope: 'STAGING_BOOTSTRAP_WORKER' },
    async (tx) => {
      const legacyDoctor = await tx.user.findUnique({
        where: { email: 'dr.kulkarni@aarogyadamu.local' },
      });
      if (legacyDoctor) {
        const existingTarget = await tx.user.findUnique({
          where: { email: DEMO_DOCTOR_EMAIL },
        });
        if (!existingTarget) {
          await tx.user.update({
            where: { id: legacyDoctor.id },
            data: { email: DEMO_DOCTOR_EMAIL },
          });
        }
      }
    },
  );

  // 3. Look up existing accounts read-only to decide safe password provisioning
  const [existingDoctor, existingP1, existingP2, existingP3, existingCaregiver] =
    await runScoped(
      prisma,
      { isSystemWorker: true, workerScope: 'STAGING_BOOTSTRAP_WORKER' },
      async (tx) =>
        Promise.all([
          tx.user.findUnique({ where: { email: DEMO_DOCTOR_EMAIL } }),
          tx.user.findUnique({ where: { email: DEMO_PATIENT_EMAIL } }),
          tx.user.findUnique({ where: { email: DEMO_PATIENT2_EMAIL } }),
          tx.user.findUnique({ where: { email: DEMO_PATIENT3_EMAIL } }),
          tx.user.findUnique({ where: { email: DEMO_CAREGIVER_EMAIL } }),
        ]),
    );

  const doctorPasswordHash = await resolveAccountPasswordHash({
    roleLabel: `clinician (${DEMO_DOCTOR_EMAIL})`,
    email: DEMO_DOCTOR_EMAIL,
    existingHash: existingDoctor?.passwordHash,
    explicitPassword: rawDoctorPassword,
    rotatePasswords,
    requireExplicitIfMissingInProd: true,
    isProdRuntime,
  });

  const patient1PasswordHash = await resolveAccountPasswordHash({
    roleLabel: `primary synthetic patient (${DEMO_PATIENT_EMAIL})`,
    email: DEMO_PATIENT_EMAIL,
    existingHash: existingP1?.passwordHash,
    explicitPassword: rawPatientPassword,
    disallowedMatches: [rawDoctorPassword],
    rotatePasswords,
    requireExplicitIfMissingInProd: true,
    isProdRuntime,
  });

  const patient2PasswordHash = await resolveAccountPasswordHash({
    roleLabel: `synthetic patient 2 (${DEMO_PATIENT2_EMAIL})`,
    email: DEMO_PATIENT2_EMAIL,
    existingHash: existingP2?.passwordHash,
    explicitPassword: rawPatient2Password,
    disallowedMatches: [rawDoctorPassword],
    rotatePasswords,
    requireExplicitIfMissingInProd: false,
    isProdRuntime,
  });

  const patient3PasswordHash = await resolveAccountPasswordHash({
    roleLabel: `synthetic patient 3 (${DEMO_PATIENT3_EMAIL})`,
    email: DEMO_PATIENT3_EMAIL,
    existingHash: existingP3?.passwordHash,
    explicitPassword: rawPatient3Password,
    disallowedMatches: [rawDoctorPassword],
    rotatePasswords,
    requireExplicitIfMissingInProd: false,
    isProdRuntime,
  });

  const caregiverPasswordHash = await resolveAccountPasswordHash({
    roleLabel: `synthetic caregiver (${DEMO_CAREGIVER_EMAIL})`,
    email: DEMO_CAREGIVER_EMAIL,
    existingHash: existingCaregiver?.passwordHash,
    explicitPassword: rawCaregiverPassword,
    disallowedMatches: [rawDoctorPassword],
    rotatePasswords,
    requireExplicitIfMissingInProd: false,
    isProdRuntime,
  });

  // 4. Provision/verify Doctor account + Practice + Membership
  const docRes = await ensureSyntheticAccount(prisma, {
    email: DEMO_DOCTOR_EMAIL,
    passwordHash: doctorPasswordHash,
    isClinician: true,
    profile: {
      fullName: DEMO_DOCTOR_NAME,
      primaryClinician: DEMO_DOCTOR_FACILITY,
      diabetesType: 'UNKNOWN',
    },
  });
  const doctor = docRes.user;
  stats.users++;

  let actionTaken: 'CREATED' | 'UPDATED' | 'ALREADY_VALID' = docRes.created
    ? 'CREATED'
    : docRes.updated
      ? 'UPDATED'
      : 'ALREADY_VALID';

  const practice = await runScoped(
    prisma,
    { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
    async (tx) => {
      let existingPractice = await tx.practice.findFirst({
        where: { name: 'AarogyaDamu Diabetes Care & Research Center' },
      });
      if (!existingPractice) {
        existingPractice = await tx.practice.create({
          data: {
            name: 'AarogyaDamu Diabetes Care & Research Center',
            slug: 'aarogyadamu-diabetes-care-center',
            registrationNumber: 'KMC-2016-78219',
            council: 'Karnataka Medical Council',
            specialty: 'Diabetology & Endocrinology',
            qualifications: 'MBBS, MD (Medicine), DM (Endocrinology)',
            consultationFeeInr: 700,
            phone: '9845012345',
            address: 'Suite 302, Richmond Circle',
            city: 'Bengaluru',
            state: 'Karnataka',
            postalCode: '560025',
            workingDays: 'MON,TUE,WED,THU,FRI,SAT',
          },
        });
      }

      await tx.practiceMembership.upsert({
        where: {
          practiceId_userId: {
            practiceId: existingPractice.id,
            userId: doctor.id,
          },
        },
        create: {
          practiceId: existingPractice.id,
          userId: doctor.id,
          role: 'DOCTOR',
          isActive: true,
        },
        update: {
          role: 'DOCTOR',
          isActive: true,
        },
      });

      return existingPractice;
    },
  );

  // 5. Provision/verify Caregiver account
  const caregiverRes = await ensureSyntheticAccount(prisma, {
    email: DEMO_CAREGIVER_EMAIL,
    passwordHash: caregiverPasswordHash,
    isClinician: false,
    profile: {
      fullName: DEMO_CAREGIVER_NAME,
      primaryClinician: 'Family Caregiver (Synthetic)',
      diabetesType: 'UNKNOWN',
    },
  });
  const caregiver = caregiverRes.user;
  stats.users++;
  if (caregiverRes.created && actionTaken === 'ALREADY_VALID') actionTaken = 'CREATED';
  else if (caregiverRes.updated && actionTaken === 'ALREADY_VALID') actionTaken = 'UPDATED';

  // 6. Provision/verify all 3 distinct Synthetic Pilot Patients & complete clinical datasets
  const datasetSpecs = buildSyntheticDatasetSpecs(dayMs);
  const hashByKey: Record<SyntheticPatientDatasetSpec['key'], string | null> = {
    patient1: patient1PasswordHash,
    patient2: patient2PasswordHash,
    patient3: patient3PasswordHash,
  };

  const syntheticPatients: SyntheticPatientSummary[] = [];

  for (const spec of datasetSpecs) {
    const pRes = await ensureSyntheticAccount(prisma, {
      email: spec.email,
      passwordHash: hashByKey[spec.key],
      isClinician: false,
      profile: {
        ...spec.profile,
        primaryClinician: DEMO_DOCTOR_NAME,
      },
    });
    const patient = pRes.user;
    stats.users++;
    if (pRes.created && actionTaken === 'ALREADY_VALID') actionTaken = 'CREATED';
    else if (pRes.updated && actionTaken === 'ALREADY_VALID') actionTaken = 'UPDATED';

    await seedSinglePatientClinicalData(
      prisma,
      spec,
      patient,
      doctor,
      practice,
      caregiver,
      stats,
      now,
      dayMs,
    );

    syntheticPatients.push({
      id: patient.id,
      email: patient.email,
      name: spec.profile.fullName,
      clinicalFocus: spec.clinicalFocus,
      isSyntheticDemo: true,
    });
  }

  return {
    success: true,
    actionTaken,
    doctorId: doctor.id,
    doctorEmail: doctor.email,
    isClinician: Boolean(doctor.isClinician),
    isActive: Boolean(doctor.isActive),
    hasPatientLink: stats.assignments >= 3,
    syntheticPatients,
    featureFlagsSummary: {
      readOnlyVerified: flagSummary.enabledCoreCount,
      agenticFlagsDisabled: flagSummary.agenticFlagsDisabled,
    },
    message: 'Synthetic staging pilot dataset verified under PostgreSQL RLS without altering runtime permissions or FeatureFlag.',
    stats,
  };
}

export const ensureStagingDemonstrationData = ensureStagingDemoDoctor;
