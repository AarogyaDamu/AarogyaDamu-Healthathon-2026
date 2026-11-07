import { mobileApiFetch } from './client';

export interface MobileMedication {
  id: string;
  userId: string;
  name: string;
  medicineName?: string;
  genericName?: string | null;
  brandName?: string | null;
  dosage: string;
  strength?: string | null;
  dosageForm?: string | null;
  route?: string | null;
  frequency: string;
  timing?: string | null;
  timeOfDay?: string | null;
  foodInstructions?: string | null;
  instructions?: string | null;
  isPrn?: boolean;
  prnInstructions?: string | null;
  prescriber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'DISCONTINUED' | 'COMPLETED';
  source: 'PATIENT_ENTERED' | 'CAREGIVER_ENTERED' | 'CLINICIAN_PRESCRIBED';
  reviewStatus: 'UNREVIEWED' | 'CLINICIAN_REVIEWED';
  reviewedByClinicianId?: string | null;
  reviewedAt?: string | null;
  clinicalReviewNotes?: string | null;
  reasonForChange?: string | null;
  createdAt: string;
  updatedAt: string;
  events?: MobileAdherenceEvent[];
}

export interface MobileAdherenceEvent {
  id: string;
  medicationId: string;
  userId: string;
  action: 'TAKEN' | 'SKIPPED' | 'MISSED';
  scheduledTime?: string | null;
  recordedAt: string;
  recordedBy: string;
  sourceProvenance: string;
  notes?: string | null;
}

export interface MobileAdherenceStats {
  periodDays: number;
  totalEvents: number;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  adherenceRate: number;
}

export interface CreateMedicationInput {
  patientId?: string;
  name: string;
  dosage: string;
  strength?: string;
  dosageForm?: string;
  route?: string;
  frequency: string;
  timeOfDay?: string;
  instructions?: string;
  prescriber?: string;
  startDate?: string;
  endDate?: string;
}

export const medicationApi = {
  async getMedications(options?: {
    patientId?: string;
    status?: string;
    reviewStatus?: string;
  }): Promise<MobileMedication[]> {
    const params = new URLSearchParams();
    if (options?.patientId) params.append('patientId', options.patientId);
    if (options?.status) params.append('status', options.status);
    if (options?.reviewStatus) params.append('reviewStatus', options.reviewStatus);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await mobileApiFetch<{ medications: Array<MobileMedication & { adherenceEvents?: MobileAdherenceEvent[] }> }>(
      `/medications${qs}`,
    );
    return (response.medications || []).map((medication) => ({
      ...medication,
      name: medication.medicineName || medication.name || 'Prescribed Medication',
      timing: medication.timing || medication.timeOfDay || 'MORNING',
      events: medication.events || medication.adherenceEvents || [],
    }));
  },

  async getAdherenceStats(options?: {
    patientId?: string;
    days?: number;
  }): Promise<MobileAdherenceStats | null> {
    const params = new URLSearchParams();
    if (options?.patientId) params.append('patientId', options.patientId);
    if (options?.days) params.append('days', String(options.days));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await mobileApiFetch<{ stats: MobileAdherenceStats }>(
      `/medications/adherence/stats${qs}`,
    );
    return response.stats;
  },

  async createMedication(input: CreateMedicationInput): Promise<MobileMedication> {
    const response = await mobileApiFetch<{ medication: MobileMedication }>(
      '/medications',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return response.medication;
  },

  async updateMedicationStatus(
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'DISCONTINUED' | 'COMPLETED',
    reasonForChange?: string,
  ): Promise<MobileMedication> {
    const response = await mobileApiFetch<{ medication: MobileMedication }>(
      `/medications/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reasonForChange }),
      },
    );
    return response.medication;
  },

  async recordAdherenceEvent(
    medicationId: string,
    action: 'TAKEN' | 'SKIPPED' | 'MISSED',
    notes?: string,
    scheduledTime?: string,
  ): Promise<MobileAdherenceEvent> {
    const idempotencyKey = `adh-${medicationId}-${action}-${Date.now()}`;
    const response = await mobileApiFetch<{ event: MobileAdherenceEvent }>(
      `/medications/${encodeURIComponent(medicationId)}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes,
          scheduledTime: scheduledTime || new Date().toISOString(),
          idempotencyKey,
        }),
      },
    );
    return response.event;
  },

  async getAdherenceEvents(medicationId: string): Promise<MobileAdherenceEvent[]> {
    try {
      const response = await mobileApiFetch<{ events: MobileAdherenceEvent[] }>(
        `/medications/${encodeURIComponent(medicationId)}/events`,
      );
      return response.events || [];
    } catch {
      return [];
    }
  },
};
