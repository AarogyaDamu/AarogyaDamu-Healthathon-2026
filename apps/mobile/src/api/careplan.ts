import { mobileApiFetch } from './client';

export interface MobileCarePlanGoal {
  id: string;
  category: string;
  targetMetric: string;
  targetValue: string;
  timeframe: string;
  notes?: string | null;
}

export interface MobileCarePlanActivity {
  id: string;
  title: string;
  category: string;
  frequency: string;
  timeOfDay: string;
  instructions?: string | null;
}

export interface MobileCarePlan {
  id: string;
  patientId: string;
  creatorId: string;
  title: string;
  diagnosis: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
  version: number;
  approvedAt?: string | null;
  approvedById?: string | null;
  reviewDate?: string | null;
  doctorInstructions?: string | null;
  goals: MobileCarePlanGoal[];
  activities: MobileCarePlanActivity[];
  tasks?: Array<{
    id: string;
    userId: string;
    title: string;
    category: string;
    time: string;
    recurrence: string;
    completed: boolean;
    completedAt?: string | null;
    completedById?: string | null;
    completionNotes?: string | null;
    dueStatus: string;
  }>;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobileCarePlanProgress {
  totalTasks: number;
  completedTasks: number;
  adherencePercentage: number;
  goalCount: number;
  activityCount: number;
  nextReviewDate: string | null;
  activePlanId: string | null;
  version: number | null;
}

export const carePlanApi = {
  async getActivePlan(patientId: string): Promise<MobileCarePlan | null> {
    try {
      const response = await mobileApiFetch<{ carePlan: MobileCarePlan | null }>(
        `/care-plans/patient/${encodeURIComponent(patientId)}/active`,
      );
      return response.carePlan;
    } catch {
      return null;
    }
  },

  async getProgress(patientId: string): Promise<MobileCarePlanProgress | null> {
    try {
      const response = await mobileApiFetch<MobileCarePlanProgress>(
        `/care-plans/patient/${encodeURIComponent(patientId)}/progress`,
      );
      return response;
    } catch {
      return null;
    }
  },

  async completeTask(
    taskId: string,
    notes?: string,
  ): Promise<{ task: unknown; completedBy: string }> {
    return mobileApiFetch<{ task: unknown; completedBy: string }>(
      `/care-plans/tasks/${encodeURIComponent(taskId)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      },
    );
  },

  async approvePlan(planId: string): Promise<{ carePlan: MobileCarePlan }> {
    return mobileApiFetch<{ carePlan: MobileCarePlan }>(
      `/care-plans/${encodeURIComponent(planId)}/approve`,
      {
        method: 'POST',
      },
    );
  },
};
