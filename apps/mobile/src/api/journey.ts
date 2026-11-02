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
};
