import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AppointmentRecord,
  coordinationApi,
  DoctorOption,
  LinkedPatient,
} from '../../api/coordination';

type Mode = 'PATIENT' | 'DOCTOR' | 'CAREGIVER';

interface Props {
  mode: Mode;
}

function defaultAppointmentTime(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(10, 0, 0, 0);

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toISODate(value: string): string {
  const normalized = value.trim().replace(/\s+/, 'T');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Enter the date and time as YYYY-MM-DD HH:mm.');
  }

  return parsed.toISOString();
}

function displayDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export default function AppointmentCenter({ mode }: Props) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [scheduledAt, setScheduledAt] = useState(defaultAppointmentTime);
  const [reason, setReason] = useState('');
  const [visitType, setVisitType] =
    useState<'CHECKUP' | 'FOLLOW_UP' | 'DIABETES_REVIEW' | 'OTHER'>(
      'CHECKUP',
    );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOptions = useCallback(async () => {
    setError('');

    try {
      if (mode !== 'DOCTOR') {
        const response = await coordinationApi.getDoctors();
        setDoctors(response.doctors);
        setSelectedDoctorId((current) =>
          response.doctors.some((doctor) => doctor.id === current)
            ? current
            : '',
        );
      }

      if (mode === 'DOCTOR') {
        const response = await coordinationApi.getDoctorPatients();
        setPatients(response.patients);
        setSelectedPatientId((current) =>
          response.patients.some((patient) => patient.patientId === current)
            ? current
            : '',
        );
      } else if (mode === 'CAREGIVER') {
        const response = await coordinationApi.getCaregiverPatients();
        const authorizedPatients = response.patients.filter((patient) =>
          patient.permissions?.includes('MANAGE_CONSULTATIONS'),
        );
        setPatients(authorizedPatients);
        setSelectedPatientId((current) =>
          authorizedPatients.some((patient) => patient.patientId === current)
            ? current
            : authorizedPatients[0]?.patientId ?? '',
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load appointment options.',
      );
    }
  }, [mode]);

  const loadAppointments = useCallback(async () => {
    if (mode === 'CAREGIVER' && !selectedPatientId) {
      setAppointments([]);
      return;
    }
    try {
      setAppointments([]);
      const patientId =
        mode === 'CAREGIVER' ? selectedPatientId || undefined : undefined;

      const response = await coordinationApi.getAppointments(patientId);
      setAppointments(response.appointments);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load appointments.',
      );
    }
  }, [mode, selectedPatientId]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      setLoading(true);

      try {
        await loadOptions();

        if (mounted) {
          await loadAppointments();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadOptions, loadAppointments]);

  async function refresh() {
    setRefreshing(true);

    try {
      await loadOptions();
      await loadAppointments();
    } finally {
      setRefreshing(false);
    }
  }

  async function bookAppointment() {
    setError('');
    setNotice('');

    if (mode !== 'DOCTOR' && !selectedDoctorId) {
      setError('Select a doctor first.');
      return;
    }

    if (mode !== 'PATIENT' && !selectedPatientId) {
      setError(
        mode === 'DOCTOR'
          ? 'Select one of your assigned patients.'
          : 'Select a dependent first.',
      );
      return;
    }

    if (reason.trim().length < 3) {
      setError('Enter a short reason for the appointment.');
      return;
    }

    setSubmitting(true);

    try {
      const input = {
        ...(mode === 'DOCTOR'
          ? { patientId: selectedPatientId }
          : { doctorId: selectedDoctorId }),
        ...(mode === 'CAREGIVER'
          ? { patientId: selectedPatientId }
          : {}),
        scheduledAt: toISODate(scheduledAt),
        durationMinutes: 30,
        reason: reason.trim(),
        visitType,
        idempotencyKey: `appointment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };

      const response = await coordinationApi.createAppointment(input);

      setNotice(
        response.appointment.status === 'CONFIRMED'
          ? 'Appointment scheduled and confirmed.'
          : 'Appointment request sent. Check its status for confirmation.',
      );

      setReason('');
      await loadAppointments();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not book the appointment.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(
    appointment: AppointmentRecord,
    status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED',
  ) {
    setError('');
    setNotice('');
    setBusyAppointmentId(appointment.id);

    try {
      await coordinationApi.updateAppointmentStatus(appointment.id, status);
      setNotice(`Appointment ${status.toLowerCase()}.`);
      await loadAppointments();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not update appointment.',
      );
    } finally {
      setBusyAppointmentId('');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#EA580C" />
        <Text style={styles.muted}>Loading appointments…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>
        {mode === 'DOCTOR'
          ? 'CLINICAL WORKSPACE'
          : mode === 'CAREGIVER'
            ? 'FAMILY CARE'
            : 'YOUR HEALTH'}
      </Text>

      <Text style={styles.heading}>Appointments</Text>
      <Text style={styles.muted}>
        {mode === 'DOCTOR'
          ? 'Manage requests and schedule visits for your assigned patients.'
          : mode === 'CAREGIVER'
            ? 'Manage appointments only for dependents who have authorized you.'
            : 'Book a visit and follow its status from your own account.'}
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Book a visit</Text>

        {mode !== 'DOCTOR' && (
          <>
            <Text style={styles.fieldLabel}>Choose doctor</Text>
            {doctors.length === 0 ? (
              <Text style={styles.muted}>No approved doctor accounts found.</Text>
            ) : (
              doctors.map((doctor) => (
                <TouchableOpacity
                  key={doctor.id}
                  style={[
                    styles.choice,
                    selectedDoctorId === doctor.id && styles.choiceSelected,
                  ]}
                  onPress={() => setSelectedDoctorId(doctor.id)}
                >
                  <Text style={styles.choiceTitle}>{doctor.name}</Text>
                  <Text style={styles.choiceSub}>{doctor.email}</Text>
                  {selectedDoctorId === doctor.id && (
                    <Text style={styles.selectedText}>Selected</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {mode !== 'PATIENT' && (
          <>
            <Text style={styles.fieldLabel}>
              {mode === 'DOCTOR' ? 'Choose assigned patient' : 'Choose dependent'}
            </Text>

            {patients.length === 0 ? (
              <Text style={styles.muted}>
                {mode === 'DOCTOR'
                  ? 'No active assigned patients yet.'
                  : 'No dependents have granted appointment management access.'}
              </Text>
            ) : (
              patients.map((patient) => (
                <TouchableOpacity
                  key={patient.patientId}
                  style={[
                    styles.choice,
                    selectedPatientId === patient.patientId &&
                      styles.choiceSelected,
                  ]}
                  onPress={() => setSelectedPatientId(patient.patientId)}
                >
                  <Text style={styles.choiceTitle}>{patient.name}</Text>
                  {patient.diabetesType ? (
                    <Text style={styles.choiceSub}>
                      Diabetes type: {patient.diabetesType}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <Text style={styles.fieldLabel}>Date and time</Text>
        <TextInput
          accessibilityLabel="Appointment date and time"
          value={scheduledAt}
          onChangeText={setScheduledAt}
          placeholder="YYYY-MM-DD HH:mm"
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Visit type</Text>
        <View style={styles.typeRow}>
          {(
            ['CHECKUP', 'FOLLOW_UP', 'DIABETES_REVIEW', 'OTHER'] as const
          ).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                visitType === type && styles.typeSelected,
              ]}
              onPress={() => setVisitType(type)}
            >
              <Text
                style={[
                  styles.typeText,
                  visitType === type && styles.selectedText,
                ]}
              >
                {type.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Reason for visit</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="For example, diabetes follow-up"
          style={[styles.input, styles.reasonInput]}
          multiline
          maxLength={2000}
        />

        <TouchableOpacity
          accessibilityRole="button"
          disabled={submitting}
          onPress={bookAppointment}
          style={[styles.primaryButton, submitting && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>
            {submitting
              ? 'Saving…'
              : mode === 'DOCTOR'
                ? 'Schedule and confirm'
                : 'Request appointment'}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>
          {mode === 'DOCTOR' ? 'My appointment queue' : 'Your appointments'}
        </Text>

        <TouchableOpacity onPress={refresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {appointments.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>No appointments to show yet.</Text>
        </View>
      ) : (
        appointments.map((appointment) => (
          <View key={appointment.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.appointmentTitle}>
                {mode === 'DOCTOR'
                  ? appointment.patientName
                  : appointment.doctorName}
              </Text>

              <View
                style={[
                  styles.status,
                  appointment.status === 'CONFIRMED' && styles.statusConfirmed,
                  appointment.status === 'DECLINED' && styles.statusDeclined,
                ]}
              >
                <Text style={styles.statusText}>{appointment.status}</Text>
              </View>
            </View>

            <Text style={styles.muted}>
              {displayDate(appointment.scheduledAt)}
            </Text>
            <Text style={styles.bodyText}>{appointment.reason}</Text>
            <Text style={styles.smallText}>
              {appointment.visitType.replace('_', ' ')} ·{' '}
              {appointment.durationMinutes} minutes
            </Text>

            {mode === 'DOCTOR' && appointment.status === 'REQUESTED' && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  disabled={busyAppointmentId === appointment.id}
                  style={styles.primaryButton}
                  onPress={() => changeStatus(appointment, 'CONFIRMED')}
                >
                  <Text style={styles.primaryButtonText}>Confirm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={busyAppointmentId === appointment.id}
                  style={styles.secondaryButton}
                  onPress={() => changeStatus(appointment, 'DECLINED')}
                >
                  <Text style={styles.secondaryButtonText}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'DOCTOR' && appointment.status === 'CONFIRMED' && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  disabled={busyAppointmentId === appointment.id}
                  style={styles.primaryButton}
                  onPress={() => changeStatus(appointment, 'COMPLETED')}
                >
                  <Text style={styles.primaryButtonText}>Mark completed</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode !== 'DOCTOR' &&
              ['REQUESTED', 'CONFIRMED'].includes(appointment.status) && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    disabled={busyAppointmentId === appointment.id}
                    style={styles.secondaryButton}
                    onPress={() => changeStatus(appointment, 'CANCELLED')}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 18, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  eyebrow: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  heading: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 7,
  },
  muted: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    gap: 9,
  },
  sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#0F172A',
  },
  reasonInput: { minHeight: 78, textAlignVertical: 'top' },
  choice: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  choiceSelected: { borderColor: '#EA580C', backgroundColor: '#FFF7ED' },
  choiceTitle: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  choiceSub: { color: '#64748B', fontSize: 12 },
  selectedText: { color: '#C2410C', fontWeight: '800' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeButton: {
    padding: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  typeSelected: { borderColor: '#EA580C', backgroundColor: '#FFF7ED' },
  typeText: { fontSize: 11, color: '#475569', fontWeight: '700' },
  primaryButton: {
    flex: 1,
    minHeight: 42,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#EA580C',
    marginTop: 5,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
  },
  secondaryButtonText: { color: '#334155', fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.6 },
  error: { color: '#B91C1C', fontSize: 13 },
  success: { color: '#15803D', fontSize: 13 },
  listHeader: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshText: { color: '#C2410C', fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  appointmentTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0F172A' },
  status: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#F1F5F9' },
  statusConfirmed: { backgroundColor: '#DCFCE7' },
  statusDeclined: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '800', color: '#334155' },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  smallText: { fontSize: 11, color: '#64748B' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
