import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobileApiFetch } from './client';

export interface CaregiverPatient {
  consentId: string;
  patientId: string;
  name: string;
  diabetesType: string;
  relationship: string;
  permissions: string[];
  lastAccessedAt: string | null;
}

export interface CaregiverTask {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  dueAt: string;
  instructions?: string;
  clinicalNotes?: string;
  assignedByDoctor?: string | null;
  canComplete: boolean;
  completedAt?: string | null;
  completedByRole?: string | null;
}

export interface CaregiverMedication {
  id: string;
  medicineName: string;
  genericName?: string;
  dosage: string;
  strength?: string;
  frequency?: string;
  timing: string;
  instructions?: string;
  foodInstructions?: string;
  status: string;
  prescribedAt: string;
}

export interface CaregiverHealthData {
  observations: Array<{
    id: string;
    type: string;
    numericValue: number;
    unit: string;
    context: string;
    observedAt: string;
    clinicalFlag?: string;
  }>;
  stats: {
    totalReadings: number;
    averageGlucose: number;
    timeInRangePercentage: number;
  };
}

export interface CaregiverDashboardData {
  patient: CaregiverPatient;
  tasks: {
    summary: {
      total: number;
      pendingCount: number;
      overdueCount: number;
      completedCount: number;
      canCompleteOnBehalf: boolean;
    };
    items: CaregiverTask[];
  } | null;
  medications: {
    activeCount: number;
    items: CaregiverMedication[];
  } | null;
  adherence: {
    periodDays: number;
    totalEvents: number;
    takenCount: number;
    skippedCount: number;
    adherenceRate: number;
  } | null;
  healthSummary: {
    latestReading: {
      numericValue: number;
      unit: string;
      context: string;
      observedAt: string;
    } | null;
    averageGlucose: number | null;
    totalReadings: number;
  } | null;
  appointments: Array<{
    id: string;
    doctorName: string;
    scheduledAt: string;
    status: string;
    reason: string;
    visitType: string;
  }> | null;
  recentActions: Array<{
    id: string;
    title: string;
    action: string;
    completedAt: string;
  }>;
}

export interface CaregiverConsentItem {
  id: string;
  caregiverEmail: string;
  caregiverName: string;
  relationship: string;
  status: string;
  permissions: string[];
  lastAccessedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CaregiverActionHistoryItem {
  id: string;
  type: 'TASK_COMPLETION' | 'MEDICATION_ADHERENCE' | 'AUDIT_ACTION';
  title: string;
  details: string;
  timestamp: string;
}

const ACTIVE_PATIENT_KEY = '@aarogyadamu/caregiver/active_patient_id';

export const caregiverApi = {
  async getActivePatientId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(ACTIVE_PATIENT_KEY);
    } catch {
      return null;
    }
  },

  async setActivePatientId(patientId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVE_PATIENT_KEY, patientId);
    } catch {
      // best-effort
    }
  },

  async clearActivePatientId(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ACTIVE_PATIENT_KEY);
    } catch {
      // best-effort
    }
  },

  getPatients() {
    return mobileApiFetch<{ patients: CaregiverPatient[] }>('/caregivers/patients');
  },

  getDashboard(patientId: string) {
    return mobileApiFetch<CaregiverDashboardData>(`/caregivers/patients/${encodeURIComponent(patientId)}/dashboard`);
  },

  getTasks(patientId: string) {
    return mobileApiFetch<{ tasks: CaregiverTask[] }>(`/caregivers/patients/${encodeURIComponent(patientId)}/tasks`);
  },

  completeTask(patientId: string, taskId: string, notes?: string) {
    return mobileApiFetch<{ success: boolean; task: CaregiverTask }>(
      `/caregivers/patients/${encodeURIComponent(patientId)}/tasks/${encodeURIComponent(taskId)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }
    );
  },

  getMedications(patientId: string) {
    return mobileApiFetch<{ medications: CaregiverMedication[] }>(
      `/caregivers/patients/${encodeURIComponent(patientId)}/medications`
    );
  },

  getHealth(patientId: string) {
    return mobileApiFetch<CaregiverHealthData>(
      `/caregivers/patients/${encodeURIComponent(patientId)}/health`
    );
  },

  // Patient-side consent management
  getConsents() {
    return mobileApiFetch<{ consents: CaregiverConsentItem[]; caregivingFor: any[] }>('/caregivers');
  },

  inviteCaregiver(payload: {
    caregiverEmail: string;
    caregiverName: string;
    relationship: string;
    permissions: string[];
  }) {
    return mobileApiFetch<{ consent: CaregiverConsentItem }>('/caregivers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updatePermissions(consentId: string, permissions: string[]) {
    return mobileApiFetch<{ success: boolean; consent: CaregiverConsentItem }>(
      `/caregivers/${encodeURIComponent(consentId)}/permissions`,
      {
        method: 'PATCH',
        body: JSON.stringify({ permissions }),
      }
    );
  },

  revokeConsent(consentId: string) {
    return mobileApiFetch<{ success: boolean; message: string }>(
      `/caregivers/${encodeURIComponent(consentId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  getCaregiverActions(consentId: string) {
    return mobileApiFetch<{
      caregiverName: string;
      caregiverEmail: string;
      relationship: string;
      lastAccessedAt: string | null;
      actions: CaregiverActionHistoryItem[];
    }>(`/caregivers/${encodeURIComponent(consentId)}/actions`);
  },
};
