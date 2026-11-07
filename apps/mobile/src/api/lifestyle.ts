import { mobileApiFetch } from './client';

export type LifestyleCategory =
  | 'PHYSICAL_ACTIVITY'
  | 'SLEEP'
  | 'NUTRITION'
  | 'HYDRATION'
  | 'WELLBEING';

export interface MobileLifestyleRecord {
  id: string;
  userId: string;
  category: LifestyleCategory;
  numericValue?: number | null;
  unit?: string | null;
  qualitativeValue?: string | null;
  notes?: string | null;
  recordedAt: string;
  timezone?: string | null;
  source: string;
  createdById: string;
  reasonForCorrection?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobileLifestyleStats {
  periodDays: number;
  totalRecords: number;
  physicalActivity: {
    totalMinutes: number;
    sessionsCount: number;
  };
  sleep: {
    averageHoursPerNight: number | null;
    nightsCount: number;
  };
  hydration: {
    dailyAverageMl: number | null;
    entriesCount: number;
  };
}

export interface MobileDigitalHealthTwin {
  patientId: string;
  generatedAt: string;
  governance: {
    approvalStatus: 'PENDING_CLINICIAN_APPROVAL';
    isReadOnly: boolean;
    prescribingAutonomous: boolean;
    disclaimer: string;
    causationNotice: string;
  };
  metrics: {
    vitals: {
      hasData: boolean;
      glucose: {
        readingsCount: number;
        meanMgDl: number | null;
        timeInRangePercent: number | null;
        lastReading: {
          value: number;
          unit: string;
          context: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
      bloodPressure: {
        lastReading: {
          systolic: number;
          diastolic: number;
          unit: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
      hba1c: {
        lastReading: {
          value: number;
          unit: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
    };
    lifestyle: {
      hasData: boolean;
      physicalActivity: {
        totalWeeklyMinutes: number;
        sessionsCount: number;
        lastLoggedAt: string | null;
      };
      sleep: {
        averageHoursPerNight: number | null;
        nightsRecorded: number;
        lastLoggedAt: string | null;
      };
      hydration: {
        dailyAverageMl: number | null;
        daysLogged: number;
      };
      wellbeing: {
        recentStatus: string | null;
        lastLoggedAt: string | null;
      };
    };
    medications: {
      activeCount: number;
      unreviewedCount: number;
      adherenceRate14d: number | null;
      trackedDosesCount: number;
    };
    carePlan: {
      hasActivePlan: boolean;
      planTitle: string | null;
      planVersion: number | null;
      completedTasksCount: number;
      totalTasksCount: number;
      progressPercent: number;
    };
  };
  dataQualityAlerts: Array<{
    code: string;
    message: string;
    severity: 'INFO' | 'WARNING';
  }>;
  dataFreshness: {
    lastObservationAt: string | null;
    lastLifestyleAt: string | null;
    lastMedicationAdherenceAt: string | null;
  };
}

export interface CreateLifestyleInput {
  category: LifestyleCategory;
  numericValue?: number;
  unit?: string;
  qualitativeValue?: string;
  notes?: string;
  recordedAt?: string;
  timezone?: string;
}

export interface UpdateLifestyleInput {
  numericValue?: number;
  unit?: string;
  qualitativeValue?: string;
  notes?: string;
  reasonForCorrection: string;
}

export const lifestyleApi = {
  async getRecords(options?: {
    category?: LifestyleCategory;
    limit?: number;
  }): Promise<MobileLifestyleRecord[]> {
    const params = new URLSearchParams();
    if (options?.category) params.append('category', options.category);
    if (options?.limit) params.append('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await mobileApiFetch<{ records: MobileLifestyleRecord[] }>(
      `/lifestyle${qs}`,
    );
    return response.records || [];
  },

  async getStats(days = 7): Promise<MobileLifestyleStats | null> {
    const response = await mobileApiFetch<MobileLifestyleStats>(
      `/lifestyle/stats?days=${days}`,
    );
    return response;
  },

  async createRecord(input: CreateLifestyleInput): Promise<MobileLifestyleRecord> {
    const idempotencyKey = `life-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const response = await mobileApiFetch<{ record: MobileLifestyleRecord }>(
      '/lifestyle',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, idempotencyKey }),
      },
    );
    return response.record;
  },

  async updateRecord(id: string, input: UpdateLifestyleInput): Promise<MobileLifestyleRecord> {
    const response = await mobileApiFetch<{ record: MobileLifestyleRecord }>(
      `/lifestyle/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return response.record;
  },

  async deleteRecord(id: string): Promise<boolean> {
    const response = await mobileApiFetch<{ success: boolean }>(
      `/lifestyle/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
    return response.success;
  },

  async getDigitalHealthTwin(): Promise<MobileDigitalHealthTwin | null> {
    const response = await mobileApiFetch<MobileDigitalHealthTwin>('/health-twin');
    return response;
  },
};
