import { z } from 'zod';

export const HealthInsightCategoryEnum = z.enum([
  'GLUCOSE',
  'MEDICATION',
  'CARE_PLAN',
  'APPOINTMENT',
  'MILESTONE',
  'LIFESTYLE',
]);
export type HealthInsightCategory = z.infer<typeof HealthInsightCategoryEnum>;

export const HealthInsightSchema = z.object({
  id: z.string(),
  category: HealthInsightCategoryEnum,
  title: z.string(),
  summary: z.string(),
  periodLabel: z.string(), // e.g. "Last 7 Days vs Prior 7 Days", "30-Day Evaluation"
  readingCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  dataSufficiency: z.enum(['SUFFICIENT', 'LIMITED', 'INSUFFICIENT']),
  isActionable: z.boolean().default(false),
  suggestedDiscussion: z.string().optional(),
  sourceReference: z.string(), // e.g. "HealthObservation: 14 readings", "CareTask: 5 tasks"
  createdAt: z.string(),
});
export type HealthInsight = z.infer<typeof HealthInsightSchema>;

export const JourneyMilestoneSchema = z.object({
  id: z.string(),
  userId: z.string(),
  milestoneKey: z.string(),
  title: z.string(),
  description: z.string(),
  achievedAt: z.string(),
  eventRefType: z.string().nullable().optional(),
  eventRefId: z.string().nullable().optional(),
  actorId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type JourneyMilestoneItem = z.infer<typeof JourneyMilestoneSchema>;

export const DevicePushTokenRegisterSchema = z.object({
  token: z.string().min(10, 'Device token must be at least 10 characters').max(500),
  platform: z.enum(['EXPO', 'ANDROID', 'IOS', 'WEB']).default('EXPO'),
  deviceInfo: z.string().max(250).optional(),
});
export type DevicePushTokenRegisterInput = z.infer<typeof DevicePushTokenRegisterSchema>;

export const CareNotificationCategoryEnum = z.enum([
  'MEDICATION',
  'TASK',
  'APPOINTMENT',
  'CARE_PLAN',
  'HEALTH_LOGGING',
  'CONSULTATION',
  'MILESTONE',
  'ACCOUNT',
  'GENERAL',
]);
export type CareNotificationCategory = z.infer<typeof CareNotificationCategoryEnum>;

export const CareNotificationDeliveryStatusEnum = z.enum([
  'CREATED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'CANCELLED',
]);
export type CareNotificationDeliveryStatus = z.infer<typeof CareNotificationDeliveryStatusEnum>;

export const CareNotificationResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  patientId: z.string().nullable().optional(),
  actorId: z.string().nullable().optional(),
  type: z.string(),
  category: CareNotificationCategoryEnum.default('GENERAL'),
  title: z.string(),
  message: z.string(),
  link: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  deliveryStatus: CareNotificationDeliveryStatusEnum.default('DELIVERED'),
  channel: z.enum(['IN_APP', 'PUSH', 'EMAIL']).default('IN_APP'),
  scheduledFor: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  isRead: z.boolean(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CareNotificationResponse = z.infer<typeof CareNotificationResponseSchema>;

export const JourneyProgressSummarySchema = z.object({
  patientId: z.string(),
  evaluationDate: z.string(),
  overallProgress: z.object({
    currentStageId: z.string(),
    completedStagesCount: z.number().int().nonnegative(),
    totalStagesCount: z.number().int().positive(),
    completionPercentage: z.number().min(0).max(100),
  }),
  glucoseProgress: z.object({
    totalReadings30Days: z.number().int().nonnegative(),
    readings7Days: z.number().int().nonnegative(),
    readingsPrior7Days: z.number().int().nonnegative(),
    averageGlucose30Days: z.number().nullable(),
    averageGlucose7Days: z.number().nullable(),
    averageGlucosePrior7Days: z.number().nullable(),
    trendDelta7Days: z.number().nullable(),
    trendDirection: z.enum(['INCREASING', 'DECREASING', 'STABLE', 'INSUFFICIENT_DATA']),
    timeInRangePercentage: z.number().min(0).max(100),
    fastingAverage: z.number().nullable(),
    postMealAverage: z.number().nullable(),
    hypoCount: z.number().int().nonnegative(),
    hyperCount: z.number().int().nonnegative(),
    missingMeasurementAlert: z.string().nullable().optional(),
    nonCausationDisclaimer: z.string(),
  }),
  medicationAdherence: z.object({
    prescribedMedicinesCount: z.number().int().nonnegative(),
    recordedDoses30Days: z.number().int().nonnegative(),
    takenDosesCount: z.number().int().nonnegative(),
    skippedDosesCount: z.number().int().nonnegative(),
    unconfirmedDosesCount: z.number().int().nonnegative(),
    adherenceRatePercentage: z.number().min(0).max(100),
    weeklyAdherenceRate: z.number().min(0).max(100),
  }),
  carePlanProgress: z.object({
    activePlanTitle: z.string().nullable(),
    planVersion: z.number().int().nullable(),
    totalTasksAssigned: z.number().int().nonnegative(),
    completedTasksCount: z.number().int().nonnegative(),
    pendingTasksCount: z.number().int().nonnegative(),
    overdueTasksCount: z.number().int().nonnegative(),
    completionRatePercentage: z.number().min(0).max(100),
  }),
  consultationsAndAppointments: z.object({
    upcomingAppointmentsCount: z.number().int().nonnegative(),
    nextAppointment: z.object({
      id: z.string(),
      scheduledAt: z.string(),
      doctorName: z.string(),
      reason: z.string(),
      isServerConfirmed: z.boolean(),
    }).nullable().optional(),
    recentApprovedConsultationsCount: z.number().int().nonnegative(),
    latestApprovedConsultation: z.object({
      id: z.string(),
      clinicianName: z.string(),
      approvedAt: z.string(),
      summarySnippet: z.string(),
    }).nullable().optional(),
  }),
  milestones: z.array(JourneyMilestoneSchema),
  insights: z.array(HealthInsightSchema),
});
export type JourneyProgressSummary = z.infer<typeof JourneyProgressSummarySchema>;
