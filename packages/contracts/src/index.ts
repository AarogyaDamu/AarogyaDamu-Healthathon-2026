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
  unit: z.enum(['mg/dL', 'mmol/L', 'mmHg', 'kg', 'lbs', '%', 'mmol/mol']),
  context: z.enum(['FASTING', 'PRE_MEAL', 'POST_MEAL_2HR', 'BEDTIME', 'RANDOM', 'GENERAL', 'RESTING', 'MORNING', 'EVENING', 'POST_DIALYSIS', 'LAB_CONFIRMED']),
  observedAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
  provenance: z.string().optional(),
  sourceProvenance: z.string().optional(),
  deviceModel: z.string().max(100).optional(),
  idempotencyKey: z.string().max(128).optional(),
  hasSevereSymptoms: z.boolean().optional(),
  requiresAssistance: z.boolean().optional(),
  isRepeatMeasurement: z.boolean().optional(),
  symptoms: z.array(z.string()).optional(),
}).strict();

export const HealthObservationAmendSchema = z.object({
  numericValue: z.number().positive().optional(),
  secondaryValue: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
  reasonForCorrection: z.string().trim().min(2, "Reason for correction is required").max(300),
}).strict();

export const HealthObservationQuerySchema = z.object({
  type: z.enum(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C']).optional(),
  context: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export const VitalStatsQuerySchema = z.object({
  type: z.enum(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C']).default('BLOOD_GLUCOSE'),
  days: z.coerce.number().int().min(1).max(365).default(14),
});

export const CareTaskSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().max(500).optional(),
  instructions: z.string().trim().max(2000).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'AS_NEEDED']).default('ONCE'),
  recurrence: z.string().trim().max(100).optional(),
  category: z.string().default('FOLLOW_UP'),
  dueAt: z.string().datetime(),
  appointmentId: z.string().uuid().optional(),
  sourceInstruction: z.string().max(250).optional(),
  clinicalNotes: z.string().trim().max(2000).optional(),
});

export const DoctorTaskCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  category: z.string().default('FOLLOW_UP'),
  instructions: z.string().trim().max(2000).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'AS_NEEDED']).default('ONCE'),
  recurrence: z.string().trim().max(100).optional(),
  dueAt: z.string().datetime(),
  clinicalNotes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().max(200).optional(),
});
export type DoctorTaskCreateInput = z.infer<typeof DoctorTaskCreateSchema>;

export const TaskCompleteSchema = z.object({
  idempotencyKey: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type TaskCompleteInput = z.infer<typeof TaskCompleteSchema>;

export const TaskCancelSchema = z.object({
  cancellationReason: z.string().trim().min(3).max(500),
});
export type TaskCancelInput = z.infer<typeof TaskCancelSchema>;

export const TaskUpdateStatusSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SNOOZED', 'CANCELLED']),
  dueAt: z.string().datetime().optional(),
  instructions: z.string().trim().max(2000).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  clinicalNotes: z.string().trim().max(2000).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
});

export const MedicationScheduleSchema = z.object({
  medicationName: z.string().min(2),
  dosageInstruction: z.string().min(2),
  frequency: z.string().min(2),
  timingDetails: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  instructionSource: z.string().min(2),
}).strict();

// P0.2 Medication Vault & Management Schemas
export const MedicationCreateSchema = z.object({
  medicineName: z.string().trim().min(1, 'Medication name is required').max(150),
  medicationName: z.string().trim().max(150).optional(),
  genericName: z.string().trim().max(150).optional(),
  brandName: z.string().trim().max(150).optional(),
  dosage: z.string().trim().min(1, 'Dosage is required').max(100),
  strength: z.string().trim().max(50).optional(),
  dosageForm: z.string().trim().max(50).optional(),
  route: z.string().trim().max(50).default('ORAL'),
  frequency: z.string().trim().min(1).default('ONCE_DAILY'),
  timing: z.string().trim().min(1).default('MORNING'),
  foodInstructions: z.string().trim().max(150).optional(),
  instructions: z.string().trim().max(500).optional(),
  isPrn: z.boolean().optional().default(false),
  prnInstructions: z.string().trim().max(250).optional(),
  prescriber: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).strict();
export type MedicationCreateInput = z.infer<typeof MedicationCreateSchema>;

export const MedicationUpdateSchema = z.object({
  dosage: z.string().trim().max(100).optional(),
  strength: z.string().trim().max(50).optional(),
  dosageForm: z.string().trim().max(50).optional(),
  route: z.string().trim().max(50).optional(),
  frequency: z.string().trim().optional(),
  timing: z.string().trim().optional(),
  foodInstructions: z.string().trim().max(150).optional(),
  instructions: z.string().trim().max(500).optional(),
  isPrn: z.boolean().optional(),
  prnInstructions: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(500).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONTINUED', 'COMPLETED']).optional(),
  reasonForChange: z.string().trim().max(300).optional(),
  endDate: z.string().datetime().optional(),
}).strict();
export type MedicationUpdateInput = z.infer<typeof MedicationUpdateSchema>;

export const MedicationReviewSchema = z.object({
  clinicalReviewNotes: z.string().trim().min(2, 'Clinical review notes are required').max(1000),
  instructions: z.string().trim().max(500).optional(),
  dosage: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONTINUED']).optional(),
}).strict();
export type MedicationReviewInput = z.infer<typeof MedicationReviewSchema>;

export const MedicationAdherenceEventSchema = z.object({
  action: z.enum(['TAKEN', 'SKIPPED', 'MISSED']),
  scheduledTime: z.string().datetime(),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().max(128).optional(),
}).strict();
export type MedicationAdherenceEventInput = z.infer<typeof MedicationAdherenceEventSchema>;

export const MedicationQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONTINUED', 'COMPLETED', 'ALL']).optional(),
  reviewStatus: z.enum(['UNREVIEWED', 'CLINICIAN_REVIEWED', 'ALL']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

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
  'VIEW_HEALTH_SUMMARY',
  'VIEW_TASKS',
  'MANAGE_TASKS',
  'COMPLETE_TASKS_ON_BEHALF',
  'VIEW_DOCUMENTS',
  'VIEW_REPORTS',
  'VIEW_CONSULTATIONS',
  'VIEW_APPOINTMENTS',
  'MANAGE_CONSULTATIONS',
  'VIEW_CARE_PLAN',
  'VIEW_HEALTH_TIMELINE',
  'VIEW_MEDICATIONS',
  'VIEW_MEDICATION_ADHERENCE',
  'MANAGE_MEDICATIONS',
  'LOG_ADHERENCE',
  'VIEW_LIFESTYLE',
  'MANAGE_LIFESTYLE',
  'VIEW_NOTIFICATIONS',
  'VIEW_REMINDERS',
  'MANAGE_REMINDERS',
  'VIEW_EMERGENCY',
  'MANAGE_EMERGENCY',
  'RECEIVE_ALERTS',
  'LOG_ON_BEHALF',
]);
export type CaregiverPermission = z.infer<typeof CaregiverPermissionEnum>;

export const CaregiverGrantSchema = z.object({
  caregiverEmail: z.string().email(),
  caregiverName: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  permissions: z.array(CaregiverPermissionEnum).min(1, 'Select at least one permission'),
}).strict();

export const CaregiverUpdatePermissionsSchema = z.object({
  permissions: z.array(CaregiverPermissionEnum).min(1, 'Select at least one permission'),
}).strict();

export const CaregiverInvitationResponseSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
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

// ==========================================
// P0.0 SAFETY AND DATA FOUNDATION CONTRACTS
// ==========================================

export const SourceProvenanceEnum = z.enum([
  'MANUAL_PATIENT',
  'CAREGIVER_INPUT',
  'BLUETOOTH_DEVICE',
  'DOCTOR_CLINICAL',
  'LAB_REPORT',
  'AI_EXTRACTED',
]);
export type SourceProvenance = z.infer<typeof SourceProvenanceEnum>;

export const ClinicalFlagEnum = z.enum([
  'CRITICAL_LOW',
  'LOW',
  'IN_TARGET',
  'HIGH',
  'CRITICAL_HIGH',
  'NORMAL',
  'ELEVATED',
  'STAGE_1_HYPERTENSION',
  'STAGE_2_HYPERTENSION',
  'HYPERTENSIVE_CRISIS',
]);
export type ClinicalFlag = z.infer<typeof ClinicalFlagEnum>;

export const ClinicalSafetyThresholds = {
  GLUCOSE: {
    CRITICAL_LOW: 54,    // Severe hypoglycemia (ADA Level 2)
    ALERT_LOW: 70,       // Hypoglycemia alert (ADA Level 1)
    TARGET_FASTING_MIN: 80,
    TARGET_FASTING_MAX: 130, // ADA Fasting target (80-130 mg/dL)
    TARGET_POST_MEAL_MAX: 180, // ADA 2h Post-prandial target (<180 mg/dL)
    ALERT_HIGH: 250,     // Hyperglycemia alert
    CRITICAL_HIGH: 300,  // Hyperglycemic emergency
  },
  BLOOD_PRESSURE: {
    NORMAL_SYS_MAX: 119,
    NORMAL_DIA_MAX: 79,
    ELEVATED_SYS_MAX: 129,
    STAGE_1_SYS_MAX: 139,
    STAGE_1_DIA_MAX: 89,
    STAGE_2_SYS_MIN: 140,
    STAGE_2_DIA_MIN: 90,
    CRISIS_SYS_MIN: 180,
    CRISIS_DIA_MIN: 120,
  },
  HBA1C: {
    NORMAL_MAX: 5.6,
    PREDIABETES_MIN: 5.7,
    PREDIABETES_MAX: 6.4,
    DIABETES_MIN: 6.5,
    ADA_STANDARD_TARGET: 7.0,
    HIGH_RISK_THRESHOLD: 8.5,
  },
} as const;

export const FeatureFlagKeyEnum = z.enum([
  'P0_0_SAFETY_FOUNDATION',
  'P0_1_HEALTH_JOURNAL',
  'P0_2_MEDICATION_VAULT',
  'P0_3_LIFESTYLE_TWIN',
  'P0_4_NOTIFICATIONS_SOS',
  'P0_6_GROQ_DAMU_ASSISTANT',
  'P0_6_GROQ_VOICE_ASSISTANT',
  'P0_7_AGENTIC_EXECUTION',
  'P0_8_EXTERNAL_INTEGRATIONS',
]);
export type FeatureFlagKey = z.infer<typeof FeatureFlagKeyEnum>;

export const RolloutTierEnum = z.enum([
  'development',
  'internal_testing',
  'staging',
  'pilot_restricted',
  'pilot_full',
]);
export type RolloutTier = z.infer<typeof RolloutTierEnum>;

export const FeatureFlagSchema = z.object({
  id: FeatureFlagKeyEnum,
  name: z.string().min(2),
  description: z.string().optional(),
  isEnabled: z.boolean().default(false),
  rolloutTier: RolloutTierEnum.default('development'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string().datetime().optional(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const AgentRiskTierEnum = z.enum([
  'LOW_RISK',       // Informational queries, logging reminders, education
  'MEDIUM_RISK',    // Follow-up appointment scheduling, activity drafting
  'HIGH_RISK',      // Prescription, medication dosage changes, clinical note creation
  'PROHIBITED',     // Independent diagnosis, off-label prescribing, bypassing consent
]);
export type AgentRiskTier = z.infer<typeof AgentRiskTierEnum>;

export const AgentActionProposalSchema = z.object({
  id: z.string().uuid().optional(),
  agentName: z.string().default('Damu'),
  riskTier: AgentRiskTierEnum,
  requiresClinicianApproval: z.boolean().default(false),
  requiresPatientConsent: z.boolean().default(false),
  actionType: z.string().min(2),
  summary: z.string().min(2),
  payload: z.record(z.string(), z.unknown()),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
  auditLogId: z.string().optional(),
});
export type AgentActionProposal = z.infer<typeof AgentActionProposalSchema>;

export const HealthcareErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    incidentId: z.string(),
    timestamp: z.string().datetime(),
    details: z.unknown().optional(),
  }),
});
export type HealthcareErrorResponse = z.infer<typeof HealthcareErrorResponseSchema>;

// ==========================================
// P0.3 LIFESTYLE TRACKING & DIGITAL HEALTH TWIN
// ==========================================
export const LifestyleCategoryEnum = z.enum([
  'PHYSICAL_ACTIVITY',
  'SLEEP',
  'NUTRITION',
  'HYDRATION',
  'WELLBEING',
]);
export type LifestyleCategory = z.infer<typeof LifestyleCategoryEnum>;

export const LifestyleSourceEnum = z.enum([
  'MANUAL_PATIENT',
  'CAREGIVER_INPUT',
  'DOCTOR_CLINICAL',
]);
export type LifestyleSource = z.infer<typeof LifestyleSourceEnum>;

export const LifestyleCreateSchema = z.object({
  patientId: z.string().uuid().optional(),
  category: LifestyleCategoryEnum,
  numericValue: z.number().nonnegative().optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  qualitativeValue: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  recordedAt: z.string().datetime().optional(),
  timezone: z.string().trim().max(100).optional().nullable(),
  idempotencyKey: z.string().trim().max(200).optional().nullable(),
}).strict();
export type LifestyleCreateInput = z.infer<typeof LifestyleCreateSchema>;

export const LifestyleUpdateSchema = z.object({
  numericValue: z.number().nonnegative().optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  qualitativeValue: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  reasonForCorrection: z.string().trim().min(3, 'Reason for correction is required').max(500),
}).strict();
export type LifestyleUpdateInput = z.infer<typeof LifestyleUpdateSchema>;

export const LifestyleQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  category: LifestyleCategoryEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type LifestyleQueryParams = z.infer<typeof LifestyleQuerySchema>;

// ==========================================
// P0.4 NOTIFICATIONS, REMINDERS & EMERGENCY SOS
// ==========================================

export const NotificationPreferenceSchema = z.object({
  carePlanUpdates: z.boolean().default(true),
  medicationReminders: z.boolean().default(true),
  sugarCheckReminders: z.boolean().default(true),
  appointmentReminders: z.boolean().default(true),
  taskReminders: z.boolean().default(true),
  journeyMilestones: z.boolean().default(true),
  consultationUpdates: z.boolean().default(true),
  healthLoggingReminders: z.boolean().default(true),
  emergencyAlerts: z.boolean().default(true),
  pushEnabled: z.boolean().default(false),
  emailEnabled: z.boolean().default(false),
  smsEnabled: z.boolean().default(false),
  quietHoursEnabled: z.boolean().default(false),
  quietHoursStart: z.string().default('22:00'),
  quietHoursEnd: z.string().default('07:00'),
  timezone: z.string().default('Asia/Kolkata'),
}).strict();
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const NotificationPreferenceUpdateSchema = NotificationPreferenceSchema.partial();
export type NotificationPreferenceUpdateInput = z.infer<typeof NotificationPreferenceUpdateSchema>;

export const ReminderCategoryEnum = z.enum([
  'MEDICATION',
  'CARE_TASK',
  'APPOINTMENT',
  'GLUCOSE_CHECK',
  'LIFESTYLE',
  'GENERAL',
]);
export type ReminderCategory = z.infer<typeof ReminderCategoryEnum>;

export const ReminderStatusEnum = z.enum([
  'SCHEDULED',
  'DELIVERED',
  'ACKNOWLEDGED',
  'CANCELLED',
  'FAILED',
]);
export type ReminderStatus = z.infer<typeof ReminderStatusEnum>;

export const ReminderRecurrenceEnum = z.enum([
  'ONCE',
  'DAILY',
  'WEEKLY',
]);
export type ReminderRecurrence = z.infer<typeof ReminderRecurrenceEnum>;

export const ReminderCreateSchema = z.object({
  patientId: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Title is required').max(150),
  category: ReminderCategoryEnum.default('GENERAL'),
  remindAt: z.string().datetime(),
  timezone: z.string().trim().max(100).optional().nullable(),
  recurrence: ReminderRecurrenceEnum.default('ONCE'),
  entityType: z.enum(['MEDICATION', 'CARE_TASK', 'APPOINTMENT']).optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  acknowledgeUnreviewedSource: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().max(200).optional().nullable(),
}).strict();
export type ReminderCreateInput = z.infer<typeof ReminderCreateSchema>;

export const ReminderUpdateSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  remindAt: z.string().datetime().optional(),
  timezone: z.string().trim().max(100).optional().nullable(),
  recurrence: ReminderRecurrenceEnum.optional(),
  status: z.enum(['SCHEDULED', 'ACKNOWLEDGED', 'CANCELLED']).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
export type ReminderUpdateInput = z.infer<typeof ReminderUpdateSchema>;

export const EmergencyContactCreateSchema = z.object({
  patientId: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Name is required').max(120),
  relationship: z.string().trim().min(2, 'Relationship is required').max(60),
  phoneNumber: z.string().trim().min(8, 'Valid phone number is required (min 8 digits)').max(20),
  email: z.string().email().optional().nullable(),
  isPrimary: z.boolean().default(false),
  notifyOnSos: z.boolean().default(true),
}).strict();
export type EmergencyContactCreateInput = z.infer<typeof EmergencyContactCreateSchema>;

export const EmergencyContactUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  relationship: z.string().trim().min(2).max(60).optional(),
  phoneNumber: z.string().trim().min(8).max(20).optional(),
  email: z.string().email().optional().nullable(),
  isPrimary: z.boolean().optional(),
  notifyOnSos: z.boolean().optional(),
}).strict();
export type EmergencyContactUpdateInput = z.infer<typeof EmergencyContactUpdateSchema>;

export const SosActivationSchema = z.object({
  patientId: z.string().uuid().optional(),
  confirmEmergency: z.literal(true, {
    message: 'Explicit emergency confirmation is required to activate SOS.',
  }),
  triggerReason: z.string().trim().max(200).optional().nullable(),
  symptoms: z.array(z.string().trim().max(100)).optional(),
  locationConsent: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  accuracyMeters: z.number().nonnegative().optional().nullable(),
  locationAddress: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: z.string().trim().max(200).optional().nullable(),
}).strict();
export type SosActivationInput = z.infer<typeof SosActivationSchema>;

export const SosCancellationSchema = z.object({
  reason: z.string().trim().min(3, 'Cancellation reason is required (minimum 3 characters)').max(500),
}).strict();
export type SosCancellationInput = z.infer<typeof SosCancellationSchema>;

// ==========================================
// 19. DAMU MULTILINGUAL VOICE ASSISTANT & HEALTH INTELLIGENCE (P0.6 & PHASE 6)
// ==========================================
export * from './damu';

export * from './theme';

// ==========================================
// 20. GOVERNED AGENTIC EXECUTION (P0.7)
// ==========================================

// 1. Plan & Action State Definitions
export const AgentPlanStatusEnum = z.enum([
  'PLANNING',
  'AWAITING_CONFIRMATION',
  'PENDING_CLINICIAN_APPROVAL',
  'PARTIALLY_EXECUTED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PROHIBITED_REFUSED',
  'EMERGENCY_ABORTED',
]);
export type AgentPlanStatus = z.infer<typeof AgentPlanStatusEnum>;

export const AgentActionStatusEnum = z.enum([
  'DRAFT',
  'AWAITING_CONFIRMATION',
  'PENDING_CLINICIAN_APPROVAL',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'PROHIBITED_REFUSED',
]);
export type AgentActionStatus = z.infer<typeof AgentActionStatusEnum>;

// 2. Allowlisted Tool Definitions & Risk Mapping
export const AgentToolNameEnum = z.enum([
  'tool_schedule_care_task',
  'tool_schedule_reminder',
  'tool_request_appointment',
  'tool_log_lifestyle_record',
  'tool_draft_care_proposal',
  'tool_query_health_summary',
]);
export type AgentToolName = z.infer<typeof AgentToolNameEnum>;

export const DETERMINISTIC_TOOL_RISK_TIERS: Record<AgentToolName, AgentRiskTier> = {
  tool_query_health_summary: 'LOW_RISK',
  tool_schedule_care_task: 'MEDIUM_RISK',
  tool_schedule_reminder: 'MEDIUM_RISK',
  tool_request_appointment: 'MEDIUM_RISK',
  tool_log_lifestyle_record: 'MEDIUM_RISK',
  tool_draft_care_proposal: 'HIGH_RISK',
};

/**
 * Returns the deterministic risk tier for an allowlisted agent tool.
 */
export function getDeterministicToolRiskTier(toolName: AgentToolName): AgentRiskTier {
  const tier = DETERMINISTIC_TOOL_RISK_TIERS[toolName];
  if (!tier) {
    throw new Error(`Unrecognized agent tool name: ${toolName}`);
  }
  return tier;
}

// 3. Allowlisted Tool Parameter Schemas (Strict)
export const ToolScheduleCareTaskParamsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  category: z.enum([
    'MEDICATION_REVIEW',
    'GLUCOSE_CHECK',
    'EXERCISE',
    'DIET',
    'DOCTOR_APPOINTMENT',
    'FOOT_EXAM',
    'LAB_TEST',
    'GENERAL',
    'FOLLOW_UP',
  ]).default('FOLLOW_UP'),
  dueAt: z.string().datetime(),
  carePlanId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
export type ToolScheduleCareTaskParams = z.infer<typeof ToolScheduleCareTaskParamsSchema>;

export const ToolScheduleReminderParamsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  category: ReminderCategoryEnum.default('GENERAL'),
  remindAt: z.string().datetime(),
  timezone: z.string().trim().max(100).optional().nullable(),
  recurrence: ReminderRecurrenceEnum.default('ONCE'),
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
export type ToolScheduleReminderParams = z.infer<typeof ToolScheduleReminderParamsSchema>;

export const ToolRequestAppointmentParamsSchema = z.object({
  doctorId: z.string().uuid('doctorId must be a valid UUID'),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(120).default(30),
  reason: z.string().trim().min(3, 'Appointment reason must be at least 3 characters').max(300),
  visitType: z.enum(['IN_PERSON', 'TELECONSULT', 'CHECKUP', 'FOLLOW_UP', 'EMERGENCY_REVIEW']).default('CHECKUP'),
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
export type ToolRequestAppointmentParams = z.infer<typeof ToolRequestAppointmentParamsSchema>;

export const ToolLogLifestyleRecordParamsSchema = z.object({
  category: LifestyleCategoryEnum,
  numericValue: z.number().nonnegative().optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  qualitativeValue: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  recordedAt: z.string().datetime().optional(),
  timezone: z.string().trim().max(100).optional().nullable(),
}).strict();
export type ToolLogLifestyleRecordParams = z.infer<typeof ToolLogLifestyleRecordParamsSchema>;

export const ToolDraftCareProposalParamsSchema = z.object({
  proposalType: z.enum([
    'MEDICATION_ADJUSTMENT_REQUEST',
    'TARGET_GLUCOSE_RANGE_REVISION',
    'LIFESTYLE_GOAL_ADJUSTMENT',
    'LAB_WORK_ORDER',
  ]),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  rationale: z.string().trim().min(10, 'Clinical rationale must be at least 10 characters').max(1000),
  proposedDetails: z.record(z.string(), z.unknown()),
}).strict();
export type ToolDraftCareProposalParams = z.infer<typeof ToolDraftCareProposalParamsSchema>;

export const ToolQueryHealthSummaryParamsSchema = z.object({
  metric: z.enum(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C', 'ALL']).default('ALL'),
  timeRangeDays: z.number().int().min(1).max(90).default(7),
}).strict();
export type ToolQueryHealthSummaryParams = z.infer<typeof ToolQueryHealthSummaryParamsSchema>;

/**
 * Validates tool parameters against its strict schema.
 */
export function validateToolParameters(toolName: AgentToolName, params: unknown): Record<string, unknown> {
  switch (toolName) {
    case 'tool_schedule_care_task':
      return ToolScheduleCareTaskParamsSchema.parse(params);
    case 'tool_schedule_reminder':
      return ToolScheduleReminderParamsSchema.parse(params);
    case 'tool_request_appointment':
      return ToolRequestAppointmentParamsSchema.parse(params);
    case 'tool_log_lifestyle_record':
      return ToolLogLifestyleRecordParamsSchema.parse(params);
    case 'tool_draft_care_proposal':
      return ToolDraftCareProposalParamsSchema.parse(params);
    case 'tool_query_health_summary':
      return ToolQueryHealthSummaryParamsSchema.parse(params);
    default:
      throw new Error(`Unsupported tool: ${toolName}`);
  }
}

// 4. Plan & Action Schemas (Max 3 Actions Per Plan)
export const MAX_ACTIONS_PER_PLAN = 3;

export const AgentActionItemSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  planVersion: z.number().int().positive().default(1),
  toolName: AgentToolNameEnum,
  parameters: z.record(z.string(), z.unknown()),
  riskTier: AgentRiskTierEnum,
  status: AgentActionStatusEnum,
  summary: z.string().min(2),
  requiresPatientConfirmation: z.boolean(),
  requiresClinicianApproval: z.boolean(),
  idempotencyKey: z.string().uuid(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
}).strict();
export type AgentActionItem = z.infer<typeof AgentActionItemSchema>;

export const AgentPlanRequestSchema = z.object({
  targetPatientId: z.string().uuid().optional(),
  userQuery: z.string().trim().min(2, 'Query must be at least 2 characters').max(1000, 'Query cannot exceed 1000 characters'),
  language: z.string().default('hi-IN'),
  conversationId: z.string().optional(),
  consentObtained: z.literal(true, {
    message: 'Explicit informed consent is required for agent planning.',
  }),
  consentVersion: z.string().min(1).max(64),
  clientTimestamp: z.string().datetime().optional(),
  detectedGlucose: z.number().positive().optional(),
  defaultDoctorId: z.string().uuid().optional(),
}).strict();
export type AgentPlanRequest = z.infer<typeof AgentPlanRequestSchema>;

export const AgentPlanResponseSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  planId: z.string().uuid(),
  planVersion: z.number().int().positive().default(1),
  userId: z.string().uuid(),
  targetPatientId: z.string().uuid(),
  status: AgentPlanStatusEnum,
  userIntent: z.string(),
  explanation: z.string(),
  conversationId: z.string().optional().nullable(),
  actionCount: z.number().int().optional(),
  actions: z.array(AgentActionItemSchema).min(0).max(
    MAX_ACTIONS_PER_PLAN,
    `A single agent plan cannot exceed ${MAX_ACTIONS_PER_PLAN} actions`,
  ),
  requiresConfirmation: z.boolean(),
  requiresClinicianApproval: z.boolean(),
  highestRiskTier: AgentRiskTierEnum,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
}).strict();
export type AgentPlanResponse = z.infer<typeof AgentPlanResponseSchema>;

/**
 * Validates that an actions array adheres to the bounded limit of maximum 3 actions per plan.
 */
export function validatePlanActionCount(actions: unknown[]): { valid: boolean; count: number; error?: string } {
  if (!Array.isArray(actions)) {
    return { valid: false, count: 0, error: 'Actions must be an array.' };
  }
  if (actions.length > MAX_ACTIONS_PER_PLAN) {
    return {
      valid: false,
      count: actions.length,
      error: `Action limit exceeded: A single plan may contain at most ${MAX_ACTIONS_PER_PLAN} actions, but received ${actions.length}.`,
    };
  }
  return { valid: true, count: actions.length };
}

// 5. Confirmation, Binding & Expiration Contracts
export const AgentActionConfirmRequestSchema = z.object({
  actionId: z.string().uuid('actionId must be a valid UUID').optional(),
  planId: z.string().uuid('planId must be a valid UUID').optional(),
  planVersion: z.number().int().positive('planVersion must be a positive integer').optional().default(1),
  confirm: z.literal(true, {
    message: 'Explicit confirmation flag true is required to execute an action.',
  }),
  idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID'),
  spokenOrTextInput: z.string().max(500).optional(),
}).strict();
export type AgentActionConfirmRequest = z.infer<typeof AgentActionConfirmRequestSchema>;

export const AgentProposalReviewRequestSchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
  planVersion: z.number().int().positive('planVersion must be a positive integer').default(1),
  decision: z.enum(['APPROVE', 'REJECT']),
  clinicalReviewNotes: z.string().trim().min(2, 'Clinical review notes must be at least 2 characters').max(1000).optional(),
  rejectionReason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters').max(500).optional(),
}).strict();
export type AgentProposalReviewRequest = z.infer<typeof AgentProposalReviewRequestSchema>;

export const AgentActionCancelRequestSchema = z.object({
  actionId: z.string().uuid('actionId must be a valid UUID').optional(),
  planId: z.string().uuid('planId must be a valid UUID'),
  planVersion: z.number().int().positive().optional(),
  reason: z.string().trim().min(3, 'Cancellation reason must be at least 3 characters').max(500),
}).strict();
export type AgentActionCancelRequest = z.infer<typeof AgentActionCancelRequestSchema>;

export const AgentProposalsQuerySchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID').optional(),
  status: z.enum([
    'DRAFT',
    'AWAITING_CONFIRMATION',
    'PENDING_CLINICIAN_APPROVAL',
    'EXECUTING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REJECTED',
    'PROHIBITED_REFUSED',
    'ALL',
  ]).default('PENDING_CLINICIAN_APPROVAL'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export type AgentProposalsQuery = z.infer<typeof AgentProposalsQuerySchema>;

/**
 * Verifies that an execution confirmation is strictly bound to the exact action ID, plan ID, plan version,
 * and optionally validates the authenticated plan owner user ID.
 */
export function verifyConfirmationBinding(
  expected: {
    actionId: string;
    planId: string;
    planVersion: number;
    planOwnerUserId?: string;
  },
  actual: {
    actionId: string;
    planId?: string;
    planVersion?: number;
    confirmedByUserId?: string;
  },
): { bound: boolean; mismatchReason?: string } {
  if (expected.actionId !== actual.actionId) {
    return {
      bound: false,
      mismatchReason: `Action ID mismatch: expected ${expected.actionId}, received ${actual.actionId}.`,
    };
  }
  if (actual.planId && expected.planId !== actual.planId) {
    return {
      bound: false,
      mismatchReason: `Plan ID mismatch: expected ${expected.planId}, received ${actual.planId}.`,
    };
  }
  if (actual.planVersion !== undefined && expected.planVersion !== actual.planVersion) {
    return {
      bound: false,
      mismatchReason: `Plan version mismatch: expected version ${expected.planVersion}, received version ${actual.planVersion}. Stale confirmation rejected.`,
    };
  }
  if (
    expected.planOwnerUserId &&
    actual.confirmedByUserId &&
    expected.planOwnerUserId !== actual.confirmedByUserId
  ) {
    return {
      bound: false,
      mismatchReason: `Confirmation actor mismatch: plan owner is ${expected.planOwnerUserId}, but confirmation was submitted by ${actual.confirmedByUserId}.`,
    };
  }
  return { bound: true };
}

export type ExecutionPathway = 'PATIENT_CONFIRMATION' | 'CLINICIAN_APPROVAL';

export type ActionExecutionCheckResult = {
  executable: boolean;
  code?:
    | 'ACTION_EXPIRED'
    | 'ACTION_ALREADY_EXECUTED'
    | 'ACTION_CANCELLED'
    | 'ACTION_REJECTED'
    | 'ACTION_IN_PROGRESS'
    | 'ACTION_PROHIBITED'
    | 'ACTION_NOT_IN_EXECUTABLE_STATE'
    | 'ACTION_REQUIRES_CLINICIAN_APPROVAL'
    | 'ACTION_AWAITING_PATIENT_CONFIRMATION'
    | 'PARENT_PLAN_CANCELLED'
    | 'PARENT_PLAN_EXPIRED'
    | 'PARENT_PLAN_EMERGENCY_ABORTED'
    | 'PARENT_PLAN_FAILED'
    | 'PARENT_PLAN_PROHIBITED'
    | 'PARENT_PLAN_COMPLETED'
    | 'PARENT_PLAN_NOT_ACTIVE';
  reason?: string;
};

export interface ActionExecutionCheckParams {
  action: {
    status: AgentActionStatus;
    expiresAt?: string | Date | null;
  };
  parentPlan?: {
    status: AgentPlanStatus;
    expiresAt?: string | Date | null;
  } | null;
  pathway?: ExecutionPathway;
  referenceTime?: Date;
}

/**
 * Validates whether an action is executable.
 * Enforces explicit allowlists of executable states, execution pathway separation,
 * and parent plan lifecycle integrity.
 * DRAFT, CANCELLED, EXPIRED, COMPLETED, REJECTED, and PROHIBITED_REFUSED actions can NEVER execute.
 */
export function isActionExecutable(
  paramsOrAction:
    | ActionExecutionCheckParams
    | { status: AgentActionStatus; expiresAt?: string | Date | null },
  maybeReferenceTime?: Date,
): ActionExecutionCheckResult {
  const params: ActionExecutionCheckParams =
    'action' in paramsOrAction
      ? paramsOrAction
      : {
          action: paramsOrAction,
          pathway: 'PATIENT_CONFIRMATION',
          referenceTime: maybeReferenceTime || new Date(),
        };

  const {
    action,
    parentPlan,
    pathway = 'PATIENT_CONFIRMATION',
    referenceTime = maybeReferenceTime || new Date(),
  } = params;

  const { status, expiresAt } = action;

  // 1. Terminal or non-executable action statuses
  if (status === 'COMPLETED') {
    return {
      executable: false,
      code: 'ACTION_ALREADY_EXECUTED',
      reason: 'This action has already been executed and cannot be re-executed.',
    };
  }
  if (status === 'CANCELLED') {
    return {
      executable: false,
      code: 'ACTION_CANCELLED',
      reason: 'This action has been cancelled by the user.',
    };
  }
  if (status === 'EXPIRED') {
    return {
      executable: false,
      code: 'ACTION_EXPIRED',
      reason: 'This action has expired and is no longer valid for execution.',
    };
  }
  if (status === 'REJECTED') {
    return {
      executable: false,
      code: 'ACTION_REJECTED',
      reason: 'This action was rejected during clinician review.',
    };
  }
  if (status === 'EXECUTING') {
    return {
      executable: false,
      code: 'ACTION_IN_PROGRESS',
      reason: 'This action is currently being executed in an active transaction.',
    };
  }
  if (status === 'PROHIBITED_REFUSED') {
    return {
      executable: false,
      code: 'ACTION_PROHIBITED',
      reason: 'This action contains prohibited clinical intent and cannot be executed.',
    };
  }

  // Explicit check: DRAFT status must NEVER execute (SEC-P0.7-01)
  if (status === 'DRAFT') {
    return {
      executable: false,
      code: 'ACTION_NOT_IN_EXECUTABLE_STATE',
      reason: 'Actions in DRAFT status are unproposed and cannot be executed.',
    };
  }

  // 2. Parent Plan State Integrity (SEC-P0.7-05)
  if (parentPlan) {
    if (parentPlan.status === 'CANCELLED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_CANCELLED',
        reason: 'Parent plan has been cancelled; child action execution is aborted.',
      };
    }
    if (parentPlan.status === 'EXPIRED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_EXPIRED',
        reason: 'Parent plan has expired; child action execution is aborted.',
      };
    }
    if (parentPlan.status === 'EMERGENCY_ABORTED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_EMERGENCY_ABORTED',
        reason: 'Parent plan was aborted due to an emergency condition; child action execution is halted.',
      };
    }
    if (parentPlan.status === 'FAILED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_FAILED',
        reason: 'Parent plan has failed; child action execution is aborted.',
      };
    }
    if (parentPlan.status === 'PROHIBITED_REFUSED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_PROHIBITED',
        reason: 'Parent plan contains prohibited clinical actions and cannot be executed.',
      };
    }
    if (parentPlan.status === 'COMPLETED') {
      return {
        executable: false,
        code: 'PARENT_PLAN_COMPLETED',
        reason: 'Parent plan is already completed.',
      };
    }

    if (parentPlan.expiresAt) {
      const planExpDate =
        typeof parentPlan.expiresAt === 'string'
          ? new Date(parentPlan.expiresAt)
          : parentPlan.expiresAt;
      if (planExpDate.getTime() <= referenceTime.getTime()) {
        return {
          executable: false,
          code: 'PARENT_PLAN_EXPIRED',
          reason: `Parent plan expired at ${planExpDate.toISOString()}.`,
        };
      }
    }
  }

  // 3. Execution Pathway Separation (SEC-P0.7-02)
  if (pathway === 'PATIENT_CONFIRMATION') {
    if (status === 'PENDING_CLINICIAN_APPROVAL') {
      return {
        executable: false,
        code: 'ACTION_REQUIRES_CLINICIAN_APPROVAL',
        reason: 'This action is held pending licensed clinician approval and cannot be executed through patient confirmation.',
      };
    }
    if (status !== 'AWAITING_CONFIRMATION') {
      return {
        executable: false,
        code: 'ACTION_NOT_IN_EXECUTABLE_STATE',
        reason: `Action status '${status}' is not executable via patient confirmation.`,
      };
    }
  } else if (pathway === 'CLINICIAN_APPROVAL') {
    if (status === 'AWAITING_CONFIRMATION') {
      return {
        executable: false,
        code: 'ACTION_AWAITING_PATIENT_CONFIRMATION',
        reason: 'This action is a patient task awaiting patient confirmation, not clinician approval.',
      };
    }
    if (status !== 'PENDING_CLINICIAN_APPROVAL') {
      return {
        executable: false,
        code: 'ACTION_NOT_IN_EXECUTABLE_STATE',
        reason: `Action status '${status}' is not in PENDING_CLINICIAN_APPROVAL state.`,
      };
    }
  }

  // 4. Temporal Action Expiration Check
  if (expiresAt) {
    const expirationDate =
      typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    if (expirationDate.getTime() <= referenceTime.getTime()) {
      return {
        executable: false,
        code: 'ACTION_EXPIRED',
        reason: `Action expired at ${expirationDate.toISOString()} (current reference time: ${referenceTime.toISOString()}).`,
      };
    }
  }

  return { executable: true };
}

// 6. Patient Ownership & Caregiver Permissions (SEC-P0.7-04: Granular Scopes)
export const AGENT_TOOL_REQUIRED_PERMISSIONS: Record<AgentToolName, CaregiverPermission> = {
  tool_query_health_summary: 'VIEW_OBSERVATIONS',
  tool_schedule_care_task: 'MANAGE_TASKS',
  tool_schedule_reminder: 'MANAGE_REMINDERS',
  tool_request_appointment: 'MANAGE_CONSULTATIONS',
  tool_log_lifestyle_record: 'MANAGE_LIFESTYLE',
  tool_draft_care_proposal: 'VIEW_CARE_PLAN',
};

export type AgentActorRole = 'PATIENT' | 'CAREGIVER' | 'CLINICIAN' | 'ADMIN';

export interface AgentOwnershipPermissionCheckParams {
  actorId: string;
  targetPatientId: string;
  actorRole: AgentActorRole;
  toolName: AgentToolName;
  caregiverPermissions?: CaregiverPermission[];
  consentActive?: boolean;
  consentExpiresAt?: string | Date | null;
  hasActiveDoctorAssignment?: boolean;
  referenceTime?: Date;
}

export interface AgentOwnershipPermissionResult {
  authorized: boolean;
  errorCode?:
    | 'PATIENT_MISMATCH'
    | 'CAREGIVER_CONSENT_INACTIVE'
    | 'CAREGIVER_CONSENT_EXPIRED'
    | 'MISSING_REQUIRED_CAREGIVER_PERMISSION'
    | 'UNASSIGNED_CLINICIAN'
    | 'ADMIN_CLINICAL_ACTION_NOT_PERMITTED'
    | 'UNAUTHORIZED_ACTOR_ROLE';
  reason?: string;
  requiredPermission?: CaregiverPermission;
}

/**
 * Validates patient ownership and caregiver permission requirements for an agent action.
 * Enforces active DoctorPatientAssignment for clinician access (SEC-P0.7-03)
 * and disallows ADMIN role from bypassing clinical assignments.
 */
export function evaluateAgentOwnershipAndPermission(
  params: AgentOwnershipPermissionCheckParams,
): AgentOwnershipPermissionResult {
  const {
    actorId,
    targetPatientId,
    actorRole,
    toolName,
    caregiverPermissions = [],
    consentActive = true,
    consentExpiresAt,
    hasActiveDoctorAssignment = false,
    referenceTime = new Date(),
  } = params;

  // 1. Direct Patient Self-Access (Ownership verified)
  if (actorId === targetPatientId) {
    return { authorized: true };
  }

  // If role is PATIENT but actorId !== targetPatientId, reject cross-patient access immediately
  if (actorRole === 'PATIENT') {
    return {
      authorized: false,
      errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
      reason: `Patient ${actorId} is not authorized to act on behalf of patient ${targetPatientId}.`,
    };
  }

  // 2. Clinician Access (SEC-P0.7-03: Must have active DoctorPatientAssignment)
  if (actorRole === 'CLINICIAN') {
    if (!hasActiveDoctorAssignment) {
      return {
        authorized: false,
        errorCode: 'UNASSIGNED_CLINICIAN',
        reason: `Clinician ${actorId} does not have an active DoctorPatientAssignment for patient ${targetPatientId}.`,
      };
    }
    return { authorized: true };
  }

  // 3. Admin Access (SEC-P0.7-03: Admin cannot bypass clinician doctor-patient boundary)
  if (actorRole === 'ADMIN') {
    return {
      authorized: false,
      errorCode: 'ADMIN_CLINICAL_ACTION_NOT_PERMITTED',
      reason: 'Administrative roles cannot perform clinical agent actions or bypass doctor-patient assignment boundaries.',
    };
  }

  // 4. Caregiver Access (SEC-P0.7-04: Granular permission scopes)
  if (actorRole === 'CAREGIVER') {
    if (!consentActive) {
      return {
        authorized: false,
        errorCode: 'CAREGIVER_CONSENT_INACTIVE',
        reason: `Caregiver consent for patient ${targetPatientId} is inactive or revoked.`,
      };
    }

    if (consentExpiresAt) {
      const expDate =
        typeof consentExpiresAt === 'string'
          ? new Date(consentExpiresAt)
          : consentExpiresAt;
      if (expDate.getTime() <= referenceTime.getTime()) {
        return {
          authorized: false,
          errorCode: 'CAREGIVER_CONSENT_EXPIRED',
          reason: `Caregiver consent expired on ${expDate.toISOString()}.`,
        };
      }
    }

    const requiredPermission = AGENT_TOOL_REQUIRED_PERMISSIONS[toolName];
    if (requiredPermission && !caregiverPermissions.includes(requiredPermission)) {
      return {
        authorized: false,
        errorCode: 'MISSING_REQUIRED_CAREGIVER_PERMISSION',
        requiredPermission,
        reason: `Caregiver lacks required permission '${requiredPermission}' to execute tool '${toolName}'.`,
      };
    }

    return { authorized: true, requiredPermission };
  }

  return {
    authorized: false,
    errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
    reason: `Actor role '${actorRole}' is not authorized to execute agent actions for patient ${targetPatientId}.`,
  };
}

// 7. Emergency Precedence Interface
export const AgentEmergencyPrecedenceEnum = z.enum([
  'EMERGENCY_HALT',
  'STANDARD_EXECUTION',
]);
export type AgentEmergencyPrecedence = z.infer<typeof AgentEmergencyPrecedenceEnum>;

export const AgentEmergencyEvaluationSchema = z.object({
  hasEmergency: z.boolean(),
  decision: AgentEmergencyPrecedenceEnum,
  emergencyNotice: z.string().optional(),
  haltReason: z.string().optional(),
  detectedGlucose: z.number().optional().nullable(),
  detectedSymptoms: z.array(z.string()).default([]),
}).strict();
export type AgentEmergencyEvaluation = z.infer<typeof AgentEmergencyEvaluationSchema>;

/**
 * Evaluates whether an emergency notice or acute symptom halts agent execution.
 * When an emergency condition is detected, agent planning and tool execution must immediately halt.
 */
export function evaluateEmergencyPrecedence(
  emergencyNotice?: string | null,
  detectedGlucose?: number | null,
  detectedSymptoms: string[] = [],
): AgentEmergencyEvaluation {
  if (emergencyNotice && emergencyNotice.trim().length > 0) {
    return {
      hasEmergency: true,
      decision: 'EMERGENCY_HALT',
      emergencyNotice: emergencyNotice.trim(),
      haltReason: 'Emergency condition detected: Agent planning and execution halted immediately to prioritize clinical safety.',
      detectedGlucose: detectedGlucose ?? null,
      detectedSymptoms,
    };
  }

  // Also check direct glucose critical threshold (< 54 mg/dL)
  if (typeof detectedGlucose === 'number' && detectedGlucose > 0 && detectedGlucose < 54) {
    return {
      hasEmergency: true,
      decision: 'EMERGENCY_HALT',
      emergencyNotice: `Severe hypoglycemia detected (${detectedGlucose} mg/dL). Immediate medical intervention required.`,
      haltReason: 'Acute hypoglycemia (< 54 mg/dL): Agent execution halted immediately.',
      detectedGlucose,
      detectedSymptoms,
    };
  }

  return {
    hasEmergency: false,
    decision: 'STANDARD_EXECUTION',
    detectedGlucose: detectedGlucose ?? null,
    detectedSymptoms,
  };
}

/**
 * Re-evaluates emergency precedence at confirmation or execution time (Section 3).
 * If severe hypoglycemia, impaired consciousness, seizures, choking, or red-flag emergency symptoms
 * are detected either via recent vitals or active confirmation text, immediately triggers EMERGENCY_HALT.
 */
export function evaluateConfirmationEmergencyPrecedence(params: {
  emergencyNotice?: string | null;
  currentGlucose?: number | null;
  spokenOrTextInput?: string | null;
  symptoms?: string[];
}): AgentEmergencyEvaluation {
  const { emergencyNotice, currentGlucose, spokenOrTextInput, symptoms = [] } = params;

  // 1. Direct emergency notice passed from caller or P0.6 evaluator
  if (emergencyNotice && emergencyNotice.trim().length > 0) {
    return {
      hasEmergency: true,
      decision: 'EMERGENCY_HALT',
      emergencyNotice: emergencyNotice.trim(),
      haltReason: 'Emergency condition detected at confirmation time: Action execution halted immediately to prioritize clinical safety.',
      detectedGlucose: currentGlucose ?? null,
      detectedSymptoms: symptoms,
    };
  }

  // 2. Direct glucose critical threshold (< 54 mg/dL)
  if (typeof currentGlucose === 'number' && currentGlucose > 0 && currentGlucose < 54) {
    return {
      hasEmergency: true,
      decision: 'EMERGENCY_HALT',
      emergencyNotice: `Severe hypoglycemia detected (${currentGlucose} mg/dL). Immediate medical intervention required.`,
      haltReason: 'Acute hypoglycemia (< 54 mg/dL) detected at confirmation time: Action execution halted immediately.',
      detectedGlucose: currentGlucose,
      detectedSymptoms: symptoms,
    };
  }

  // 3. Spoken or text input accompanying confirmation
  if (spokenOrTextInput && spokenOrTextInput.trim().length > 0) {
    const lower = spokenOrTextInput.toLowerCase();
    const criticalKeywords = [
      'chest pain',
      'fainted',
      'fainting',
      'unconscious',
      'passed out',
      'passing out',
      'seizure',
      'fitting',
      'convulsion',
      'cannot breathe',
      'shortness of breath',
      'can\'t breathe',
      'unable to swallow',
      'cannot swallow',
      'choking',
    ];

    for (const kw of criticalKeywords) {
      if (lower.includes(kw)) {
        return {
          hasEmergency: true,
          decision: 'EMERGENCY_HALT',
          emergencyNotice: `Critical symptom '${kw}' detected during confirmation. Immediate 112/108 medical response required.`,
          haltReason: `Critical symptom '${kw}' detected at confirmation time: Action execution aborted.`,
          detectedGlucose: currentGlucose ?? null,
          detectedSymptoms: [...symptoms, kw],
        };
      }
    }
  }

  return {
    hasEmergency: false,
    decision: 'STANDARD_EXECUTION',
    detectedGlucose: currentGlucose ?? null,
    detectedSymptoms: symptoms,
  };
}

// 8. Prohibited Clinical-Action Refusal Contracts
export const ProhibitedClinicalActionCategoryEnum = z.enum([
  'PRESCRIBE_MEDICATION',
  'ADJUST_INSULIN_DOSE',
  'MODIFY_MEDICATION_DOSE',
  'INDEPENDENT_DIAGNOSIS',
  'CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR',
  'DELETE_OBSERVATION_HISTORY',
  'BYPASS_CAREGIVER_CONSENT',
]);
export type ProhibitedClinicalActionCategory = z.infer<typeof ProhibitedClinicalActionCategoryEnum>;

export const AgentProhibitedRefusalSchema = z.object({
  isProhibited: z.literal(true),
  refusalCode: z.literal('PROHIBITED_ACTION_REFUSAL'),
  category: ProhibitedClinicalActionCategoryEnum,
  refusalReason: z.string(),
  educationalAlternative: z.string(),
  suggestedAction: z.enum([
    'CONSULT_TREATING_PHYSICIAN',
    'CONTACT_DIABETES_EDUCATOR',
    'VISIT_EMERGENCY_CARE',
  ]).default('CONSULT_TREATING_PHYSICIAN'),
}).strict();
export type AgentProhibitedRefusal = z.infer<typeof AgentProhibitedRefusalSchema>;

const PROHIBITED_REFUSAL_MESSAGES: Record<
  ProhibitedClinicalActionCategory,
  { reason: string; educational: string }
> = {
  PRESCRIBE_MEDICATION: {
    reason: 'Damu is an AI health companion, not a licensed physician. Prescribing medications is strictly prohibited.',
    educational: 'You can request an appointment with your treating physician to review new medication options.',
  },
  ADJUST_INSULIN_DOSE: {
    reason: 'Adjusting insulin units or regimens carries acute hypoglycemia risk and is strictly prohibited for AI agents.',
    educational: 'Please contact your endocrinologist or diabetes care team for personalized insulin adjustments.',
  },
  MODIFY_MEDICATION_DOSE: {
    reason: 'Changing prescription dosages without direct physician supervision is strictly prohibited.',
    educational: 'You can draft a care proposal for your doctor to review during your next consultation.',
  },
  INDEPENDENT_DIAGNOSIS: {
    reason: 'Damu cannot provide diagnostic conclusions or interpret symptoms as formal medical diagnoses.',
    educational: 'You can log your symptoms in the health journal and share them with your clinician.',
  },
  CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR: {
    reason: 'Modifying clinical glycemic target ranges requires licensed clinician approval.',
    educational: 'You can propose target revisions to your doctor using the AI care proposal workflow.',
  },
  DELETE_OBSERVATION_HISTORY: {
    reason: 'Clinical observation history must maintain permanent audit integrity and cannot be deleted.',
    educational: 'You can submit an amendment or correction with a documented clinical reason.',
  },
  BYPASS_CAREGIVER_CONSENT: {
    reason: 'Accessing or modifying patient records without active, verified caregiver consent is strictly prohibited.',
    educational: 'Please request active caregiver authorization from the patient in the AarogyaDamu app.',
  },
};

/**
 * Creates a deterministic clinical refusal response for prohibited actions.
 */
export function createProhibitedRefusal(
  category: ProhibitedClinicalActionCategory,
  customReason?: string,
): AgentProhibitedRefusal {
  const defaults = PROHIBITED_REFUSAL_MESSAGES[category];
  return {
    isProhibited: true,
    refusalCode: 'PROHIBITED_ACTION_REFUSAL',
    category,
    refusalReason: customReason || defaults.reason,
    educationalAlternative: defaults.educational,
    suggestedAction: 'CONSULT_TREATING_PHYSICIAN',
  };
}

export * from './appointments';
export * from './journeyInsights';
export * from './terminology';
export * from './loinc';
