import { z } from 'zod';

// ==========================================
// SARVAM DOCUMENT INTELLIGENCE OCR CONTRACTS
// ==========================================

export const OcrDocumentTypeEnum = z.enum([
  'LAB_REPORT',
  'PRESCRIPTION',
  'DISCHARGE_SUMMARY',
  'CGM_AGP_REPORT',
  'CONSULTATION_NOTE',
  'MEDICAL_CERTIFICATE',
  'OTHER',
]);
export type OcrDocumentType = z.infer<typeof OcrDocumentTypeEnum>;

export const OcrOperationEnum = z.enum([
  'PARSE',
  'EXTRACT',
  'CLASSIFY',
]);
export type OcrOperation = z.infer<typeof OcrOperationEnum>;

export const OcrJobStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);
export type OcrJobStatus = z.infer<typeof OcrJobStatusEnum>;

export const OcrApprovalStatusEnum = z.enum([
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'MODIFIED',
]);
export type OcrApprovalStatus = z.infer<typeof OcrApprovalStatusEnum>;

export const ExtractedClinicalFieldSchema = z.object({
  fieldKey: z.string(),
  displayName: z.string(),
  extractedValue: z.string(),
  standardizedValue: z.number().optional(),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  isAbnormal: z.boolean().default(false),
  confidenceScore: z.number().min(0).max(1),
  sourcePage: z.number().int().default(1),
  sourceBoundingBox: z.array(z.number()).optional(),
  status: z.enum(['CONFIRMED', 'NEEDS_VERIFICATION', 'CONFLICTING']).default('CONFIRMED'),
  correctedValue: z.string().optional(),
});
export type ExtractedClinicalField = z.infer<typeof ExtractedClinicalFieldSchema>;

export const ExtractedLabSchema = z.object({
  hba1c: ExtractedClinicalFieldSchema.optional(),
  fastingBloodGlucose: ExtractedClinicalFieldSchema.optional(),
  postPrandialGlucose: ExtractedClinicalFieldSchema.optional(),
  randomBloodSugar: ExtractedClinicalFieldSchema.optional(),
  serumCreatinine: ExtractedClinicalFieldSchema.optional(),
  estimatedGfr: ExtractedClinicalFieldSchema.optional(),
  urineMicroalbumin: ExtractedClinicalFieldSchema.optional(),
  totalCholesterol: ExtractedClinicalFieldSchema.optional(),
  triglycerides: ExtractedClinicalFieldSchema.optional(),
  hdlCholesterol: ExtractedClinicalFieldSchema.optional(),
  ldlCholesterol: ExtractedClinicalFieldSchema.optional(),
  additionalFields: z.array(ExtractedClinicalFieldSchema).default([]),
});
export type ExtractedLab = z.infer<typeof ExtractedLabSchema>;

export const OcrJobResponseSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  patientId: z.string().uuid(),
  provider: z.string().default('SARVAM_DOC_AI'),
  operation: OcrOperationEnum,
  status: OcrJobStatusEnum,
  documentType: OcrDocumentTypeEnum.nullable(),
  pageCount: z.number().int(),
  creditCostEstimated: z.number().int(),
  creditCostActual: z.number().int().nullable(),
  rawOcrText: z.string().nullable(),
  extractedData: ExtractedLabSchema.nullable(),
  approvalStatus: OcrApprovalStatusEnum,
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  reviewerNotes: z.string().nullable().optional(),
  processingDurationMs: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OcrJobResponse = z.infer<typeof OcrJobResponseSchema>;

export const ReviewOcrJobInputSchema = z.object({
  approvalStatus: z.enum(['APPROVED', 'REJECTED', 'MODIFIED']),
  reviewerNotes: z.string().trim().max(1000).optional(),
  fieldCorrections: z.record(z.string(), z.string()).optional(),
  commitToTimeline: z.boolean().default(true),
});
export type ReviewOcrJobInput = z.infer<typeof ReviewOcrJobInputSchema>;

export const OcrUsageSummarySchema = z.object({
  totalJobsProcessed: z.number().int(),
  totalPagesParsed: z.number().int(),
  totalCreditsUsed: z.number().int(),
  initialCreditsAllocated: z.number().int().default(25000),
  remainingCreditsEstimated: z.number().int(),
  lastUsageAt: z.string().datetime().nullable(),
});
export type OcrUsageSummary = z.infer<typeof OcrUsageSummarySchema>;

