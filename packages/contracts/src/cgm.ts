import { z } from 'zod';

// ==========================================
// CGM & WEARABLE ECOSYSTEM CONTRACTS
// ==========================================

export const CgmProviderEnum = z.enum([
  'ABBOTT_LIBRE',
  'DEXCOM',
  'MEDTRONIC',
  'OMNIPOD',
  'MANUAL_CSV',
  'AGP_PDF',
  'GENERIC_BLUETOOTH',
]);
export type CgmProvider = z.infer<typeof CgmProviderEnum>;

export const CgmConnectionStatusEnum = z.enum([
  'AVAILABLE',
  'REQUIRES_AUTH',
  'CONNECTED',
  'CONNECTION_EXPIRED',
  'SYNC_ERROR',
  'REVOKED',
]);
export type CgmConnectionStatus = z.infer<typeof CgmConnectionStatusEnum>;

export const CgmTrendArrowEnum = z.enum([
  'DOUBLE_UP',       // > 3 mg/dL/min
  'SINGLE_UP',       // 2 to 3 mg/dL/min
  'FORTY_FIVE_UP',   // 1 to 2 mg/dL/min
  'FLAT',            // -1 to 1 mg/dL/min
  'FORTY_FIVE_DOWN', // -1 to -2 mg/dL/min
  'SINGLE_DOWN',     // -2 to -3 mg/dL/min
  'DOUBLE_DOWN',     // < -3 mg/dL/min
  'NOT_COMPUTABLE',
]);
export type CgmTrendArrow = z.infer<typeof CgmTrendArrowEnum>;

export const CgmReadingTypeEnum = z.enum([
  'INTERSTITIAL_CGM',
  'CALIBRATION_BLOOD_GLUCOSE',
]);
export type CgmReadingType = z.infer<typeof CgmReadingTypeEnum>;

export const CgmDataQualityStatusEnum = z.enum([
  'VALID',
  'SUSPICIOUS',
  'SENSOR_WARMUP',
  'CALIBRATION_REQUIRED',
  'MISSING',
]);
export type CgmDataQualityStatus = z.infer<typeof CgmDataQualityStatusEnum>;

// LOINC verified codes:
// 99504-3: Glucose [Mass/volume] in Interstitial fluid
// 97507-8: Average glucose [Mass/volume] in Interstitial fluid during Reporting Period
// 97506-0: Glucose Management Indicator (GMI)
// 97510-2: Glucose measurements in range during Reporting Period
export const LOINC_CGM_CODES = {
  INTERSTITIAL_GLUCOSE: '99504-3',
  AVERAGE_GLUCOSE: '97507-8',
  GMI: '97506-0',
  MEASUREMENTS_IN_RANGE: '97510-2',
} as const;

export const CgmDeviceConnectionSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  provider: CgmProviderEnum,
  connectionStatus: CgmConnectionStatusEnum,
  deviceName: z.string(),
  deviceModel: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  lastSyncAt: z.string().datetime().nullable().optional(),
  authExpiresAt: z.string().datetime().nullable().optional(),
  metadataJson: z.string().nullable().optional(),
  sharingConsentRevokedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CgmDeviceConnection = z.infer<typeof CgmDeviceConnectionSchema>;

export const ConnectCgmDeviceInputSchema = z.object({
  provider: CgmProviderEnum,
  deviceName: z.string().trim().min(2).max(120),
  deviceModel: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  mockAuthToken: z.string().optional(),
});
export type ConnectCgmDeviceInput = z.infer<typeof ConnectCgmDeviceInputSchema>;

export const CgmGlucoseReadingSchema = z.object({
  id: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  deviceConnectionId: z.string().uuid().optional(),
  glucoseValueMgDl: z.number().min(20).max(600),
  glucoseValueMmolL: z.number().min(1.1).max(33.3),
  unit: z.enum(['mg/dL', 'mmol/L']).default('mg/dL'),
  trendArrow: CgmTrendArrowEnum.default('FLAT'),
  readingType: CgmReadingTypeEnum.default('INTERSTITIAL_CGM'),
  loincCode: z.string().default(LOINC_CGM_CODES.INTERSTITIAL_GLUCOSE),
  observedAt: z.string().datetime(),
  sourceTimezone: z.string().default('Asia/Kolkata'),
  isOutlier: z.boolean().default(false),
  dataQualityStatus: CgmDataQualityStatusEnum.default('VALID'),
  idempotencyKey: z.string().max(128).optional(),
});
export type CgmGlucoseReading = z.infer<typeof CgmGlucoseReadingSchema>;

export const CgmTargetRangeTypeEnum = z.enum([
  'STANDARD_T2D',       // 70–180 mg/dL
  'TIGHT_T1D_T2D',      // 70–140 mg/dL
  'PREGNANCY_GDM',      // 63–140 mg/dL
  'HIGH_RISK_ELDERLY',  // 80–200 mg/dL
  'CUSTOM',
]);
export type CgmTargetRangeType = z.infer<typeof CgmTargetRangeTypeEnum>;

export const CgmTargetSettingsSchema = z.object({
  targetType: CgmTargetRangeTypeEnum.default('STANDARD_T2D'),
  targetLowMgDl: z.number().default(70),
  targetHighMgDl: z.number().default(180),
  urgentLowMgDl: z.number().default(54),
  urgentHighMgDl: z.number().default(250),
});
export type CgmTargetSettings = z.infer<typeof CgmTargetSettingsSchema>;

export const CgmMetricsSummarySchema = z.object({
  patientId: z.string().uuid(),
  timeframe: z.enum(['24h', '7d', '14d', '30d', '90d', 'custom']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  totalReadingsCount: z.number().int(),
  expectedReadingsCount: z.number().int(),
  dataCoveragePercent: z.number().min(0).max(100),
  meanGlucoseMgDl: z.number(),
  gmiPercent: z.number(), // Glucose Management Indicator
  cvPercent: z.number(),  // Coefficient of Variation (target <= 36%)
  standardDeviation: z.number(),
  timeInRangePercent: z.number().min(0).max(100),     // Target: > 70%
  timeBelowRangePercent: z.number().min(0).max(100),  // Target: < 4%
  veryLowRangePercent: z.number().min(0).max(100),    // Target: < 1% (< 54 mg/dL)
  timeAboveRangePercent: z.number().min(0).max(100),  // Target: < 25% (> 180 mg/dL)
  veryHighRangePercent: z.number().min(0).max(100),   // Target: < 5% (> 250 mg/dL)
  hypoEventsCount: z.number().int(),
  hyperEventsCount: z.number().int(),
  targetSettings: CgmTargetSettingsSchema,
  latestReading: z.object({
    glucoseValueMgDl: z.number(),
    trendArrow: CgmTrendArrowEnum,
    observedAt: z.string().datetime(),
    statusLabel: z.string(), // "In Range", "High", "Low"
  }).nullable(),
  deviceInfo: z.object({
    provider: CgmProviderEnum,
    deviceName: z.string(),
    connectionStatus: CgmConnectionStatusEnum,
    lastSyncAt: z.string().datetime().nullable(),
  }).nullable(),
});
export type CgmMetricsSummary = z.infer<typeof CgmMetricsSummarySchema>;

