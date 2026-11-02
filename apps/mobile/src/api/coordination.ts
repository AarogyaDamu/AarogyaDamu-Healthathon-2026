
import { mobileApiFetch } from './client';

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
  | 'CANCELLED'
  | 'COMPLETED';

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
  createdAt: string;
  updatedAt: string;
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
    visitType: 'CHECKUP' | 'FOLLOW_UP' | 'DIABETES_REVIEW' | 'OTHER';
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
    status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED',
  ) {
    return mobileApiFetch<{ appointment: AppointmentRecord }>(
      `/coordination/appointments/${encodeURIComponent(appointmentId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    );
  },
};
