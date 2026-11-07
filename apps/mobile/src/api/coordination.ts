
import { mobileApiFetch } from './client';
import type { QuestionnaireQuestion } from '@aarogyadamu/contracts';

export type WorkspaceRole = 'PATIENT' | 'CAREGIVER' | 'DOCTOR';

export interface WorkspaceContext {
  userId: string;
  isClinician: boolean;
  defaultRole: WorkspaceRole;
  availableRoles: WorkspaceRole[];
  caregiverPatients: {
    patientId: string;
    name: string;
    permissions: string[];
  }[];
}

export interface DoctorOption {
  id: string;
  name: string;
  email: string;
  clinicName?: string;
  availableDays?: number[];
}

export interface LinkedPatient {
  patientId: string;
  name: string;
  permissions?: string[];
  diabetesType?: string;
  dateOfBirth?: string | null;
  observations?: {
    id: string;
    type: string;
    numericValue: number;
    unit: string;
    context: string;
    observedAt: string;
  }[];
}

export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'MISSED';

export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
  visitType: string;
  status: AppointmentStatus;
  clinicName?: string;
  clinicFacilityId?: string | null;
  questionnaireResponse?: Record<string, any> | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  rescheduledFromId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlotOption {
  startTime: string;
  endTime: string;
  scheduledAt: string;
  available: boolean;
  reason?: string;
}

export interface DoctorAvailabilityResponse {
  date: string;
  doctorId: string;
  doctorName: string;
  clinicName: string;
  slotDurationMinutes?: number;
  isWorkingDay: boolean;
  message?: string;
  slots: SlotOption[];
}

export interface QuestionnaireResponse {
  protocol: string;
  version: string;
  alignment: string;
  disclaimer: string;
  totalQuestions: number;
  questions: QuestionnaireQuestion[];
}

export const coordinationApi = {
  getContext() {
    return mobileApiFetch<WorkspaceContext>('/coordination/context');
  },

  getDoctors() {
    return mobileApiFetch<{ doctors: DoctorOption[] }>(
      '/coordination/doctors',
    );
  },

  getDoctorAvailability(doctorId: string, date: string) {
    return mobileApiFetch<DoctorAvailabilityResponse>(
      `/coordination/doctors/${encodeURIComponent(doctorId)}/availability?date=${encodeURIComponent(date)}`,
    );
  },

  getQuestionnaire() {
    return mobileApiFetch<QuestionnaireResponse>('/coordination/questionnaire');
  },

  getDoctorPatients() {
    return mobileApiFetch<{ patients: LinkedPatient[] }>(
      '/coordination/doctor/patients',
    );
  },

  getCaregiverPatients() {
    return mobileApiFetch<{ patients: LinkedPatient[] }>(
      '/coordination/caregiver/patients',
    );
  },

  getAppointments(patientId?: string) {
    const query = patientId
      ? `?patientId=${encodeURIComponent(patientId)}`
      : '';

    return mobileApiFetch<{ appointments: AppointmentRecord[] }>(
      `/coordination/appointments${query}`,
    );
  },

  createAppointment(input: {
    patientId?: string;
    doctorId?: string;
    scheduledAt: string;
    durationMinutes: number;
    reason: string;
    visitType: 'CHECKUP' | 'FOLLOW_UP' | 'DIABETES_REVIEW' | 'OTHER' | 'EMERGENCY' | string;
    clinicName?: string;
    questionnaireResponse?: Record<string, any>;
    idempotencyKey: string;
  }) {
    return mobileApiFetch<{
      appointment: AppointmentRecord;
      duplicate?: boolean;
    }>('/coordination/appointments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus | {
      status: AppointmentStatus;
      rejectionReason?: string;
      cancellationReason?: string;
      newScheduledAt?: string;
      newDurationMinutes?: number;
    },
  ) {
    const body = typeof status === 'string' ? { status } : status;
    return mobileApiFetch<{ appointment: AppointmentRecord }>(
      `/coordination/appointments/${encodeURIComponent(appointmentId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
  },
};
