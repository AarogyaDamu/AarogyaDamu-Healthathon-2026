import { z } from 'zod';

// ==========================================
// CLINICAL REVIEW & APPROVAL WORKSPACE
// ==========================================

export const ClinicalReviewStatusEnum = z.enum([
  'DRAFT',
  'CLINICIAN_REVIEW',
  'CLINICIAN_REVIEWED',
  'DOCTOR_REVIEW',
  'APPROVED',
  'RETURNED_FOR_CORRECTION',
]);
export type ClinicalReviewStatus = z.infer<typeof ClinicalReviewStatusEnum>;

export const ChecklistItemStatusEnum = z.enum([
  'NOT_REVIEWED',
  'REVIEWED',
  'NEEDS_ATTENTION',
  'NOT_AVAILABLE',
  'REQUIRES_CLARIFICATION',
]);
export type ChecklistItemStatus = z.infer<typeof ChecklistItemStatusEnum>;

export const ClinicalChecklistItemKeyEnum = z.enum([
  'PATIENT_DETAILS_HISTORY',
  'DIABETES_HISTORY_DURATION',
  'CURRENT_SYMPTOMS_CONCERNS',
  'ALLERGIES_SENSITIVITIES',
  'VITALS_BP_WEIGHT_BMI',
  'CGM_WEARABLE_READINGS',
  'TIME_IN_RANGE_VARIABILITY',
  'LAB_REPORTS_OCR_STATUS',
  'HBA1C_LIPID_RENAL_PANEL',
  'CURRENT_MEDICATIONS',
  'MEDICATION_ADHERENCE',
  'PREVIOUS_CONSULTATIONS',
  'CARE_PLAN_LIFESTYLE_GOALS',
  'PENDING_DIAGNOSTIC_TESTS',
  'FOLLOW_UP_NEXT_VISIT',
  'EMERGENCY_SOS_READINESS',
  'DATA_CONFLICT_ALERTS',
]);
export type ClinicalChecklistItemKey = z.infer<typeof ClinicalChecklistItemKeyEnum>;

export const ClinicalChecklistItemSchema = z.object({
  key: ClinicalChecklistItemKeyEnum,
  title: z.string(),
  category: z.string(),
  description: z.string(),
  status: ChecklistItemStatusEnum.default('NOT_REVIEWED'),
  summary: z.string().default(''),
  sourceDataPreview: z.any().optional(),
  reviewedByUserId: z.string().uuid().nullable().optional(),
  reviewedByRole: z.string().nullable().optional(),
  reviewedByName: z.string().nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  clinicalNotes: z.string().max(1000).optional(),
  needsAttentionReason: z.string().max(500).optional(),
  isFlaggedForReReview: z.boolean().default(false),
});
export type ClinicalChecklistItem = z.infer<typeof ClinicalChecklistItemSchema>;

export const ClinicalReviewEncounterSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  practiceId: z.string().uuid(),
  status: ClinicalReviewStatusEnum,
  initialReviewerId: z.string().uuid().nullable().optional(),
  initialReviewerName: z.string().nullable().optional(),
  initialReviewedAt: z.string().datetime().nullable().optional(),
  doctorReviewerId: z.string().uuid().nullable().optional(),
  doctorReviewerName: z.string().nullable().optional(),
  doctorReviewedAt: z.string().datetime().nullable().optional(),
  doctorSignature: z.string().nullable().optional(),
  correctionNotes: z.string().nullable().optional(),
  clinicalSummaryNote: z.string().nullable().optional(),
  checklist: z.array(ClinicalChecklistItemSchema),
  dataSnapshotHash: z.string().nullable().optional(),
  completedItemsCount: z.number().int().default(0),
  totalItemsCount: z.number().int().default(17),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClinicalReviewEncounter = z.infer<typeof ClinicalReviewEncounterSchema>;

export const UpdateChecklistItemInputSchema = z.object({
  itemKey: ClinicalChecklistItemKeyEnum,
  status: ChecklistItemStatusEnum,
  clinicalNotes: z.string().trim().max(1000).optional(),
  needsAttentionReason: z.string().trim().max(500).optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemInputSchema>;

export const FinalizeDoctorApprovalInputSchema = z.object({
  clinicalSummaryNote: z.string().trim().min(5, 'Summary note must be at least 5 characters').max(2000),
  doctorConfirmed: z.boolean().refine((val) => val === true, 'Doctor must confirm clinical approval'),
  signatureText: z.string().trim().min(3).max(120),
});
export type FinalizeDoctorApprovalInput = z.infer<typeof FinalizeDoctorApprovalInputSchema>;

