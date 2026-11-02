import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().date().optional(),
  isClinician: z.boolean().optional(),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
}).strict();

export const HealthObservationSchema = z.object({
  type: z.enum(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C']),
  numericValue: z.number().positive("Reading must be a positive number"),
  secondaryValue: z.number().positive().optional(),
  unit: z.enum(['mg/dL', 'mmol/L', 'mmHg', 'kg', '%']),
  context: z.enum(['FASTING', 'PRE_MEAL', 'POST_MEAL_2HR', 'BEDTIME', 'RANDOM', 'GENERAL']),
  observedAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
}).strict();

export const CareTaskSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().max(500).optional(),
  category: z.enum(['MEDICATION_REMINDER', 'LAB_TEST', 'FOLLOW_UP', 'LIFESTYLE', 'DOCUMENT_PREP']),
  dueAt: z.string().datetime(),
  appointmentId: z.string().uuid().optional(),
  sourceInstruction: z.string().max(250).optional(),
}).strict();

export const TaskUpdateStatusSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SNOOZED']),
  dueAt: z.string().datetime().optional(),
}).strict();

export const MedicationScheduleSchema = z.object({
  medicationName: z.string().min(2),
  dosageInstruction: z.string().min(2),
  frequency: z.string().min(2),
  timingDetails: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  instructionSource: z.string().min(2),
}).strict();

export const AppointmentSchema = z.object({
  clinicianName: z.string().min(2),
  facilityName: z.string().min(2),
  scheduledAt: z.string().datetime(),
  purpose: z.string().min(3),
  prepNotes: z.string().max(1000).optional(),
}).strict();

export const ConsultationNoteSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  concernsAndQuestions: z.string().trim().min(3).max(4000),
  personalNotes: z.string().trim().max(4000).optional(),
}).strict();

export const AskDamuQuerySchema = z.object({
  prompt: z.string().min(2).max(500),
}).strict();

export const ProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().date().nullable().optional(),
  diagnosisYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  knownAllergies: z.string().trim().max(2000).nullable().optional(),
  baselineNotes: z.string().trim().max(4000).nullable().optional(),
  primaryClinician: z.string().trim().max(200).nullable().optional(),
}).strict();

export const DocumentCreateSchema = z.object({
  title: z.string().trim().min(2).max(140),
  category: z.enum(['LAB_REPORT', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'IMAGING']),
  issuingFacility: z.string().trim().max(120).optional(),
  reportDate: z.string().datetime(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const CreateTaskProposalPayloadSchema = z.object({
  title: z.string().trim().min(2).max(140),
  category: z.enum(['MEDICATION_REMINDER', 'LAB_TEST', 'FOLLOW_UP', 'LIFESTYLE', 'DOCUMENT_PREP']),
  dueAt: z.string().datetime(),
  sourceInstruction: z.string().trim().min(2).max(250),
}).strict();

export const CaregiverPermissionEnum = z.enum([
  'VIEW_OBSERVATIONS',
  'VIEW_TASKS',
  'MANAGE_TASKS',
  'VIEW_DOCUMENTS',
  'VIEW_CONSULTATIONS',
  'MANAGE_CONSULTATIONS',
  'VIEW_CARE_PLAN',
]);

export const CaregiverGrantSchema = z.object({
  caregiverEmail: z.string().email(),
  caregiverName: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  permissions: z.array(CaregiverPermissionEnum).min(1, 'Select at least one permission'),
}).strict();

export const EmergencyContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  phoneNumber: z.string().trim().min(8).max(20),
  isPrimary: z.boolean().default(false),
}).strict();

export const LogHypoIncidentSchema = z.object({
  glucoseValue: z.number().positive().max(70, "Hypoglycemia readings are typically 70 mg/dL or below"),
  symptoms: z.array(z.string()).min(1, "Select at least one symptom"),
  actionTaken: z.string().trim().min(3).max(500),
  resolvedAfterMinutes: z.number().int().positive().optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const PostConsultationSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  clinicianName: z.string().trim().min(2).max(120),
  doctorAdviceSummary: z.string().trim().min(5).max(3000),
  medicationChangesNotes: z.string().trim().max(2000).optional(),
  lifestyleGoals: z.string().trim().max(2000).optional(),
  nextFollowUpWeeks: z.number().int().positive().max(52).optional(),
}).strict();

export const CompleteMilestoneSchema = z.object({
  milestoneType: z.enum(['FOOT_EXAM', 'RETINAL_EYE_EXAM', 'KIDNEY_MICROALBUMIN', 'DENTAL_EXAM']),
  title: z.string().trim().min(3).max(140),
  facilityOrClinician: z.string().trim().min(2).max(120).optional(),
  completedAt: z.string().datetime().optional(),
  findingsSummary: z.string().trim().max(1000).optional(),
}).strict();

// ==========================================
// SHARED DIABETES CARE PLAN CONTRACTS
// ==========================================
export const CarePlanGoalCategoryEnum = z.enum([
  'GLUCOSE',
  'HBA1C',
  'BLOOD_PRESSURE',
  'WEIGHT',
  'LIFESTYLE',
  'MEDICATION',
]);

export const CarePlanGoalSchema = z.object({
  id: z.string().uuid().optional(),
  category: CarePlanGoalCategoryEnum.default('GLUCOSE'),
  title: z.string().trim().min(2).max(180),
  targetValue: z.string().trim().min(1).max(100),
  unit: z.string().trim().max(30).optional().nullable(),
  timeframe: z.string().trim().max(50).default('Daily'),
  status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'NEEDS_ATTENTION']).default('IN_PROGRESS'),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const CarePlanActivityCategoryEnum = z.enum([
  'BLOOD_SUGAR_CHECK',
  'MEDICATION',
  'EXERCISE',
  'DIET',
  'FOOT_CARE',
  'CLINICAL_REVIEW',
]);

export const CarePlanActivitySchema = z.object({
  id: z.string().uuid().optional(),
  category: CarePlanActivityCategoryEnum.default('BLOOD_SUGAR_CHECK'),
  title: z.string().trim().min(2).max(180),
  frequency: z.enum(['DAILY', 'TWICE_DAILY', 'WEEKLY', 'AS_NEEDED']).default('DAILY'),
  timing: z.string().trim().max(50).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  isCaregiverEligible: z.boolean().default(true),
});

export const CreateCarePlanSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  diagnosis: z.string().trim().max(200).default('Type 2 Diabetes Mellitus'),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).default([]),
  activities: z.array(CarePlanActivitySchema).default([]),
}).strict();

export const UpdateCarePlanSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  diagnosis: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).optional(),
  activities: z.array(CarePlanActivitySchema).optional(),
}).strict();

export const ReviseCarePlanSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  diagnosis: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).optional(),
  activities: z.array(CarePlanActivitySchema).optional(),
  reasonForRevision: z.string().trim().max(500).optional().nullable(),
}).strict();

export const CarePlanApprovalSchema = z.object({
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();

export * from './theme';