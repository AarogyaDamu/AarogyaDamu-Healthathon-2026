import { z } from 'zod';

// ==========================================
// 1. PRACTICE & CLINIC ROLES
// ==========================================

export const PracticeRoleEnum = z.enum(['OWNER', 'DOCTOR', 'RECEPTIONIST']);
export type PracticeRole = z.infer<typeof PracticeRoleEnum>;

export const WorkingHourDaySchema = z.object({
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:mm'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:mm'),
  isOpen: z.boolean(),
});
export type WorkingHourDay = z.infer<typeof WorkingHourDaySchema>;

export const DoctorOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  registrationNumber: z.string().trim().min(3, 'Registration number required').max(64),
  council: z.string().trim().min(2, 'Medical council required').max(120),
  specialty: z.string().trim().min(2, 'Specialty is required').max(120).default('Diabetology & General Medicine'),
  qualifications: z.string().trim().min(2).max(180).default('MBBS, MD'),
  practiceName: z.string().trim().min(2, 'Practice name is required').max(180),
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Enter valid 6-digit Indian PIN code').default('560001'),
  phone: z.string().trim().regex(/^(\+91[\-\s]?)?[6789]\d{9}$/, 'Enter valid 10-digit Indian mobile number').default('9876543210'),
  consultationFeeInr: z.number().int().min(0, 'Fee cannot be negative').max(50000).default(500),
  workingDays: z.array(z.string()).default(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  workingHours: z.array(WorkingHourDaySchema).optional(),
}).strict();
export type DoctorOnboardingInput = z.infer<typeof DoctorOnboardingSchema>;

export const PracticeProfileSchema = DoctorOnboardingSchema.extend({
  id: z.string().uuid(),
  slug: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type PracticeProfile = z.infer<typeof PracticeProfileSchema>;

// ==========================================
// 2. CONSULTATION WORKSPACE & SOAP Rx BUILDER
// ==========================================

export const PrescriptionItemSchema = z.object({
  id: z.string().uuid().optional(),
  medicationName: z.string().trim().min(2, 'Medication name required').max(150),
  dosage: z.string().trim().min(1, 'Dosage required (e.g. 500mg)').max(60),
  frequency: z.enum(['1-0-0', '1-0-1', '1-1-1', '0-0-1', '0-1-0', 'AS_NEEDED']),
  timing: z.enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'EMPTY_STOMACH', 'BEDTIME']),
  durationDays: z.number().int().positive().max(365).default(30),
  instructions: z.string().trim().max(300).optional(),
});
export type PrescriptionItem = z.infer<typeof PrescriptionItemSchema>;

export const ClinicalDiagnosisItemSchema = z.object({
  code: z.string().max(30).optional(), // ICD-10 or SNOMED-CT code if applicable (e.g. E11.9)
  display: z.string().trim().min(2).max(200),
  category: z.enum(['CONFIRMED', 'PROVISIONAL', 'DIFFERENTIAL']).default('CONFIRMED'),
});
export type ClinicalDiagnosisItem = z.infer<typeof ClinicalDiagnosisItemSchema>;

export const ConsultationExaminationFindingsSchema = z.object({
  bpSystolic: z.number().positive().max(300).optional(),
  bpDiastolic: z.number().positive().max(200).optional(),
  pulseRate: z.number().positive().max(250).optional(),
  weightKg: z.number().positive().max(400).optional(),
  randomBloodSugar: z.number().positive().max(900).optional(),
  generalExam: z.string().max(1000).optional(),
  systemicExam: z.string().max(1500).optional(),
  footExam: z.string().max(1000).optional(),
});
export type ConsultationExaminationFindings = z.infer<typeof ConsultationExaminationFindingsSchema>;

export const ConsultationWorkspaceRecordSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  chiefComplaint: z.string().trim().min(2, 'Chief complaint is required').max(1000),
  historyOfPresentIllness: z.string().trim().max(2500).optional(),
  examination: ConsultationExaminationFindingsSchema.optional(),
  diagnoses: z.array(ClinicalDiagnosisItemSchema).min(1, 'At least one clinical diagnosis or impression is required'),
  prescriptions: z.array(PrescriptionItemSchema).default([]),
  labOrders: z.array(z.string().trim().max(120)).default([]),
  lifestyleAdvice: z.string().trim().max(2000).optional(),
  followUpDays: z.number().int().min(1).max(365).optional(),
  doctorConfirmed: z.boolean().default(true),
  doctorNotes: z.string().trim().max(3000).optional(),
});
export type ConsultationWorkspaceRecordInput = z.infer<typeof ConsultationWorkspaceRecordSchema>;

export const ConsultationTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  specialty: z.string().trim().max(100).default('Diabetology'),
  chiefComplaint: z.string().max(1000).optional(),
  defaultDiagnoses: z.array(ClinicalDiagnosisItemSchema).default([]),
  defaultPrescriptions: z.array(PrescriptionItemSchema).default([]),
  defaultLabOrders: z.array(z.string()).default([]),
  defaultLifestyleAdvice: z.string().max(1500).optional(),
});
export type ConsultationTemplate = z.infer<typeof ConsultationTemplateSchema>;

// ==========================================
// 4. PRACTICE BILLING & DAILY COLLECTIONS
// ==========================================

export const PaymentMethodEnum = z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentStatusEnum = z.enum(['PAID', 'PENDING', 'CANCELLED', 'REFUNDED']);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const EncounterBillingStatusUpdateSchema = z.object({
  paymentStatus: z.enum(['PAID', 'CANCELLED', 'REFUNDED']),
  paymentMethod: PaymentMethodEnum.optional(),
  transactionReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type EncounterBillingStatusUpdateInput = z.infer<typeof EncounterBillingStatusUpdateSchema>;

export const PatientEncounterBillingSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  consultationFeeInr: z.number().int().min(0).max(50000),
  discountInr: z.number().int().min(0).max(50000).default(0),
  totalAmountInr: z.number().int().min(0).max(50000),
  paymentStatus: PaymentStatusEnum.default('PAID'),
  paymentMethod: PaymentMethodEnum.default('UPI'),
  transactionReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type PatientEncounterBillingInput = z.infer<typeof PatientEncounterBillingSchema>;

export const PracticeDailyCollectionsQuerySchema = z.object({
  date: z.string().date().optional(), // YYYY-MM-DD
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export interface PracticeCollectionsSummary {
  date: string;
  totalConsultationsCount: number;
  paidConsultationsCount: number;
  pendingConsultationsCount: number;
  totalRevenueInr: number;
  totalCollectedInr: number;
  totalPendingInr: number;
  collectionsByMethod: {
    CASH: number;
    UPI: number;
    CARD: number;
    NET_BANKING: number;
  };
}

// ==========================================
// 5. CLINICIAN DAMU AI TOOLS CONTRACTS
// ==========================================

export const ClinicianSummarizeHistoryInputSchema = z.object({
  patientId: z.string().uuid(),
  timeframeDays: z.number().int().min(7).max(730).default(90),
});
export type ClinicianSummarizeHistoryInput = z.infer<typeof ClinicianSummarizeHistoryInputSchema>;

export const ClinicianDraftConsultationNoteInputSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  chiefComplaint: z.string().trim().min(2).max(1000),
  patientReportedSymptoms: z.array(z.string()).default([]),
});
export type ClinicianDraftConsultationNoteInput = z.infer<typeof ClinicianDraftConsultationNoteInputSchema>;

export const ClinicianTrendComparisonInputSchema = z.object({
  patientId: z.string().uuid(),
  metric: z.enum(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C']),
  periodDays: z.number().int().min(7).max(365).default(30),
});
export type ClinicianTrendComparisonInput = z.infer<typeof ClinicianTrendComparisonInputSchema>;

export const ClinicianMissingDocumentationQuerySchema = z.object({
  practiceId: z.string().uuid().optional(),
  overdueDays: z.number().int().min(1).max(90).default(14),
});

