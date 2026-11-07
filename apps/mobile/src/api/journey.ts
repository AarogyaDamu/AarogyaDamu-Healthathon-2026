import { mobileApiFetch } from './client';

export type JourneyStageStatus = 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'PENDING' | 'OVERDUE';

export interface MobileJourneyStage {
  id: string;
  order: number;
  title: string;
  description: string;
  status: JourneyStageStatus;
  completedAt?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  details?: Record<string, any> | null;
}

export interface MobileJourneyTimeline {
  patientId: string;
  currentStage: string;
  stages: MobileJourneyStage[];
  overallProgress: {
    completedCount: number;
    totalStages: number;
    completionPercentage: number;
  };
}

export interface MobileDailyJourney {
  patientId: string;
  date: string;
  carePlan: {
    id: string;
    title: string;
    version: number;
    doctorInstructions?: string | null;
    approvedBy: string;
  } | null;
  activities: Array<{
    id: string;
    title: string;
    category: string;
    frequency: string;
    timing?: string | null;
    instructions?: string | null;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    category: string;
    dueAt: string;
    isOverdue: boolean;
  }>;
  completedTasks: Array<{
    id: string;
    title: string;
    category: string;
    completedAt?: string | null;
  }>;
  medications: Array<{
    id: string;
    name: string;
    dosage: string;
    timing: string;
    notes?: string | null;
  }>;
  upcomingAppointments: Array<{
    id: string;
    doctorName: string;
    scheduledAt: string;
    reason: string;
    status: string;
    isServerConfirmed: boolean;
  }>;
  summary: {
    totalTasksToday: number;
    completedCount: number;
    pendingCount: number;
    adherencePercentage: number;
  };
}

export interface MobileJourneyFollowUp {
  patientId: string;
  nextReviewDate: string | null;
  daysUntilReview: number | null;
  isReviewOverdue: boolean;
  upcomingAppointments: Array<{
    id: string;
    doctorId: string;
    doctorName: string;
    scheduledAt: string;
    durationMinutes: number;
    reason: string;
    visitType: string;
    status: string;
    isServerConfirmed: boolean;
    statusLabel: string;
  }>;
  pendingClinicalReports: Array<{
    id: string;
    title: string;
    category: string;
    uploadedAt: string;
  }>;
  assignedClinician: {
    id: string;
    name: string;
    email: string;
    activatedAt: string | null;
  } | null;
}

export interface MobileHealthInsight {
  id: string;
  category: 'GLUCOSE' | 'MEDICATION' | 'CARE_PLAN' | 'APPOINTMENT' | 'MILESTONE' | 'LIFESTYLE';
  title: string;
  summary: string;
  periodLabel: string;
  readingCount: number;
  confidence: number;
  dataSufficiency: 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
  isActionable: boolean;
  suggestedDiscussion?: string;
  sourceReference: string;
  createdAt: string;
}

export interface MobileJourneyMilestone {
  id: string;
  userId: string;
  milestoneKey: string;
  title: string;
  description: string;
  achievedAt: string;
  eventRefType?: string | null;
  eventRefId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MobileJourneyProgressSummary {
  patientId: string;
  evaluationDate: string;
  overallProgress: {
    currentStageId: string;
    completedStagesCount: number;
    totalStagesCount: number;
    completionPercentage: number;
  };
  glucoseProgress: {
    totalReadings30Days: number;
    readings7Days: number;
    readingsPrior7Days: number;
    averageGlucose30Days: number | null;
    averageGlucose7Days: number | null;
    averageGlucosePrior7Days: number | null;
    trendDelta7Days: number | null;
    trendDirection: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    timeInRangePercentage: number;
    fastingAverage: number | null;
    postMealAverage: number | null;
    hypoCount: number;
    hyperCount: number;
    missingMeasurementAlert?: string | null;
    nonCausationDisclaimer: string;
  };
  medicationAdherence: {
    prescribedMedicinesCount: number;
    recordedDoses30Days: number;
    takenDosesCount: number;
    skippedDosesCount: number;
    unconfirmedDosesCount: number;
    adherenceRatePercentage: number;
    weeklyAdherenceRate: number;
  };
  carePlanProgress: {
    activePlanTitle: string | null;
    planVersion: number | null;
    totalTasksAssigned: number;
    completedTasksCount: number;
    pendingTasksCount: number;
    overdueTasksCount: number;
    completionRatePercentage: number;
  };
  consultationsAndAppointments: {
    upcomingAppointmentsCount: number;
    nextAppointment?: {
      id: string;
      scheduledAt: string;
      doctorName: string;
      reason: string;
      isServerConfirmed: boolean;
    } | null;
    recentApprovedConsultationsCount: number;
    latestApprovedConsultation?: {
      id: string;
      clinicianName: string;
      approvedAt: string;
      summarySnippet: string;
    } | null;
  };
  milestones: MobileJourneyMilestone[];
  insights: MobileHealthInsight[];
}

export const journeyApi = {
  async getTimeline(patientId?: string): Promise<MobileJourneyTimeline | null> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      return await mobileApiFetch<MobileJourneyTimeline>(`/journey/timeline${query}`);
    } catch {
      return null;
    }
  },

  async getDaily(patientId?: string): Promise<MobileDailyJourney | null> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      return await mobileApiFetch<MobileDailyJourney>(`/journey/daily${query}`);
    } catch {
      return null;
    }
  },

  async getFollowUp(patientId?: string): Promise<MobileJourneyFollowUp | null> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      return await mobileApiFetch<MobileJourneyFollowUp>(`/journey/follow-up${query}`);
    } catch {
      return null;
    }
  },

  async getSummary(patientId?: string): Promise<MobileJourneyProgressSummary | null> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      return await mobileApiFetch<MobileJourneyProgressSummary>(`/journey/summary${query}`);
    } catch {
      return null;
    }
  },

  async getInsights(patientId?: string): Promise<MobileHealthInsight[]> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      const res = await mobileApiFetch<{ insights: MobileHealthInsight[] }>(`/journey/insights${query}`);
      return res.insights || [];
    } catch {
      return [];
    }
  },

  async getMilestones(patientId?: string): Promise<MobileJourneyMilestone[]> {
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      const res = await mobileApiFetch<{ milestones: MobileJourneyMilestone[] }>(`/journey/milestones${query}`);
      return res.milestones || [];
    } catch {
      return [];
    }
  },
};
