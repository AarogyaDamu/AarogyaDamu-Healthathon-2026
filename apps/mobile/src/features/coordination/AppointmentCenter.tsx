import React, { useCallback, useEffect, useState } from 'react';
import { PRE_VISIT_QUESTIONNAIRE_QUESTIONS, type QuestionnaireQuestion } from '@aarogyadamu/contracts';
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
  SlotOption,
} from '../../api/coordination';

type Mode = 'PATIENT' | 'DOCTOR' | 'CAREGIVER';

interface Props {
  mode: Mode;
}

function toQuestionnaireView(questions: QuestionnaireQuestion[]) {
  return questions.map((question) => ({
    ...question,
    section: question.sectionNumber,
    type: question.inputType,
    options: question.options?.map((option: { label?: string } | string) =>
      typeof option === 'string' ? option : option.label || ''
    ),
  }));
}

const FALLBACK_QUESTIONNAIRE = toQuestionnaireView(PRE_VISIT_QUESTIONNAIRE_QUESTIONS);

function defaultDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  // Navigation / Tab state
  const [mainTab, setMainTab] = useState<'LIST' | 'BOOK'>('LIST');
  const [listFilter, setListFilter] = useState<'UPCOMING' | 'REQUESTS' | 'HISTORY'>('UPCOMING');

  // Booking Flow State
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [bookingDate, setBookingDate] = useState(defaultDate);
  const [availableSlots, setAvailableSlots] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [visitType, setVisitType] = useState<string>('CHECKUP');
  const [reason, setReason] = useState('');
  const [clinicName, setClinicName] = useState('Apollo Sugar Clinic, Pune');

  // 18-Question Pre-Consultation State
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<Record<string, any>>({});
  const [questionnaire, setQuestionnaire] = useState(FALLBACK_QUESTIONNAIRE);
  const [activeQuestionnaireSection, setActiveQuestionnaireSection] = useState<1 | 2 | 3>(1);

  // Modals & Action State
  const [selectedQuestionnaireAppt, setSelectedQuestionnaireAppt] = useState<AppointmentRecord | null>(null);
  const [cancellingAppt, setCancellingAppt] = useState<AppointmentRecord | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    coordinationApi.getQuestionnaire()
      .then((response) => {
        if (response.questions.length !== 18) {
          throw new Error('The server returned an incomplete pre-visit questionnaire.');
        }
        setQuestionnaire(toQuestionnaireView(response.questions));
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error
          ? `Using the saved 18-question intake because the server questionnaire could not be loaded: ${cause.message}`
          : 'Using the saved 18-question intake because the server questionnaire could not be loaded.');
      });
  }, []);

  const loadOptions = useCallback(async () => {
    setError('');
    try {
      if (mode !== 'DOCTOR') {
        const response = await coordinationApi.getDoctors();
        setDoctors(response.doctors);
        if (response.doctors.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(response.doctors[0].id);
          if (response.doctors[0].clinicName) {
            setClinicName(response.doctors[0].clinicName);
          }
        }
      }

      if (mode === 'DOCTOR') {
        const response = await coordinationApi.getDoctorPatients();
        setPatients(response.patients);
        if (response.patients.length > 0 && !selectedPatientId) {
          setSelectedPatientId(response.patients[0].patientId);
        }
      } else if (mode === 'CAREGIVER') {
        const response = await coordinationApi.getCaregiverPatients();
        const authorized = response.patients.filter((p) =>
          p.permissions?.includes('VIEW_APPOINTMENTS') || p.permissions?.includes('MANAGE_CONSULTATIONS')
        );
        setPatients(authorized);
        if (authorized.length > 0 && !selectedPatientId) {
          setSelectedPatientId(authorized[0].patientId);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load appointment options.');
    }
  }, [mode, selectedDoctorId, selectedPatientId]);

  const loadAppointments = useCallback(async () => {
    if (mode === 'CAREGIVER' && !selectedPatientId) {
      setAppointments([]);
      return;
    }
    try {
      const patientId = mode === 'CAREGIVER' ? selectedPatientId || undefined : undefined;
      const response = await coordinationApi.getAppointments(patientId);
      setAppointments(response.appointments || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load appointments.');
    }
  }, [mode, selectedPatientId]);

  const loadSlots = useCallback(async (docId: string, date: string) => {
    if (!docId || !date) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await coordinationApi.getDoctorAvailability(docId, date);
      setAvailableSlots(res.slots || []);
      if (res.clinicName) {
        setClinicName(res.clinicName);
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      try {
        await loadOptions();
        if (mounted) await loadAppointments();
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [loadOptions, loadAppointments]);

  useEffect(() => {
    if (selectedDoctorId && bookingDate) {
      void loadSlots(selectedDoctorId, bookingDate);
    }
  }, [selectedDoctorId, bookingDate, loadSlots]);

  async function refresh() {
    setRefreshing(true);
    try {
      await loadOptions();
      await loadAppointments();
    } finally {
      setRefreshing(false);
    }
  }

  const handleAnswerChange = (qId: string, val: any) => {
    setQuestionnaireAnswers((prev) => ({
      ...prev,
      [qId]: val,
    }));
  };

  async function bookAppointment() {
    setError('');
    setNotice('');

    if (mode !== 'DOCTOR' && !selectedDoctorId) {
      setError('Select a doctor first.');
      return;
    }

    if (!selectedSlot) {
      setError('Please select an available consultation slot.');
      return;
    }

    if (reason.trim().length < 3) {
      setError('Please enter a brief reason for your consultation.');
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        ...(mode === 'DOCTOR' ? { patientId: selectedPatientId } : { doctorId: selectedDoctorId }),
        ...(mode === 'CAREGIVER' ? { patientId: selectedPatientId } : {}),
        scheduledAt: selectedSlot.scheduledAt,
        durationMinutes: 30,
        reason: reason.trim(),
        visitType,
        clinicName,
        questionnaireResponse: questionnaireAnswers,
        idempotencyKey: `appointment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };

      const response = await coordinationApi.createAppointment(input);

      setNotice(
        response.appointment.status === 'CONFIRMED'
          ? 'Appointment scheduled and confirmed.'
          : 'Appointment request submitted with pre-visit intake. Your doctor will review and confirm.'
      );

      // Reset form
      setReason('');
      setSelectedSlot(null);
      setQuestionnaireAnswers({});
      setBookingStep(1);
      setMainTab('LIST');
      await loadAppointments();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not submit appointment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelSubmit() {
    if (!cancellingAppt) return;
    setError('');
    setNotice('');
    setBusyAppointmentId(cancellingAppt.id);
    try {
      await coordinationApi.updateAppointmentStatus(cancellingAppt.id, {
        status: 'CANCELLED',
        cancellationReason: cancellationReason || 'Cancelled by patient',
      });
      setNotice('Appointment cancelled successfully.');
      setCancellingAppt(null);
      setCancellationReason('');
      await loadAppointments();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not cancel appointment.');
    } finally {
      setBusyAppointmentId('');
    }
  }

  // Filtered Appointments
  const filteredAppointments = appointments.filter((a) => {
    if (listFilter === 'REQUESTS') return a.status === 'REQUESTED';
    if (listFilter === 'UPCOMING') return ['CONFIRMED', 'RESCHEDULED'].includes(a.status);
    return ['COMPLETED', 'CANCELLED', 'DECLINED', 'MISSED'].includes(a.status);
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' };
      case 'REQUESTED':
        return { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' };
      case 'RESCHEDULED':
        return { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' };
      case 'DECLINED':
        return { bg: '#FFF1F2', text: '#9F1239', border: '#FECDD3' };
      case 'CANCELLED':
        return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
      case 'COMPLETED':
        return { bg: '#F8FAFC', text: '#0F172A', border: '#E2E8F0' };
      case 'MISSED':
        return { bg: '#FAF5FF', text: '#6B21A8', border: '#E9D5FF' };
      default:
        return { bg: '#F1F5F9', text: '#334155', border: '#E2E8F0' };
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.muted}>Loading appointments…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>
        {mode === 'DOCTOR' ? 'CLINICAL WORKSPACE' : mode === 'CAREGIVER' ? 'FAMILY CARE' : 'CARE JOURNEY'}
      </Text>

      <Text style={styles.heading}>Appointments & Visits</Text>
      <Text style={styles.muted}>
        {mode === 'DOCTOR'
          ? 'Manage requests, review intake assessments, and coordinate patient visits.'
          : mode === 'CAREGIVER'
            ? 'View scheduled doctor appointments for authorized family members.'
            : 'Schedule clinical consultations, complete pre-visit intakes, and track visit status.'}
      </Text>

      {/* Mode Switcher / Tab Bar for Patient */}
      {mode === 'PATIENT' && (
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navTab, mainTab === 'LIST' && styles.navTabActive]}
            onPress={() => setMainTab('LIST')}
          >
            <Text style={[styles.navTabText, mainTab === 'LIST' && styles.navTabTextActive]}>
              My Visits ({appointments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, mainTab === 'BOOK' && styles.navTabActive]}
            onPress={() => {
              setMainTab('BOOK');
              setBookingStep(1);
            }}
          >
            <Text style={[styles.navTabText, mainTab === 'BOOK' && styles.navTabTextActive]}>
              + Book New Visit
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* SECTION 1: BOOKING WIZARD (PATIENT ONLY)                     */}
      {/* ------------------------------------------------------------ */}
      {mode === 'PATIENT' && mainTab === 'BOOK' && (
        <View style={styles.card}>
          {/* Wizard Step Header */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>
              Step {bookingStep} of 4:{' '}
              {bookingStep === 1
                ? 'Select Doctor & Clinic'
                : bookingStep === 2
                  ? 'Choose Date & Slot'
                  : bookingStep === 3
                    ? 'Pre-Visit Intake Assessment'
                    : 'Review & Request'}
            </Text>
            <View style={styles.stepBarContainer}>
              <View style={[styles.stepBarProgress, { width: `${(bookingStep / 4) * 100}%` }]} />
            </View>
          </View>

          {/* STEP 1: DOCTOR & CLINIC SELECTION */}
          {bookingStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.fieldLabel}>Select Treating Physician</Text>
              {doctors.length === 0 ? (
                <Text style={styles.muted}>No verified clinician accounts available.</Text>
              ) : (
                doctors.map((doctor) => {
                  const isSelected = selectedDoctorId === doctor.id;
                  return (
                    <TouchableOpacity
                      key={doctor.id}
                      style={[styles.doctorCard, isSelected && styles.doctorCardSelected]}
                      onPress={() => {
                        setSelectedDoctorId(doctor.id);
                        if (doctor.clinicName) setClinicName(doctor.clinicName);
                      }}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={styles.choiceTitle}>{doctor.name}</Text>
                        {isSelected && <Text style={styles.selectedBadge}>Selected</Text>}
                      </View>
                      <Text style={styles.clinicBadgeText}>🏥 {doctor.clinicName || 'Apollo Sugar Clinic, Pune'}</Text>
                      <Text style={styles.choiceSub}>{doctor.email}</Text>
                    </TouchableOpacity>
                  );
                })
              )}

              <TouchableOpacity
                disabled={!selectedDoctorId}
                style={[styles.primaryButton, !selectedDoctorId && styles.disabled]}
                onPress={() => setBookingStep(2)}
              >
                <Text style={styles.primaryButtonText}>Continue to Date & Slot →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: DATE & AVAILABLE SLOT */}
          {bookingStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.fieldLabel}>Consultation Date</Text>
              <TextInput
                value={bookingDate}
                onChangeText={setBookingDate}
                placeholder="YYYY-MM-DD"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Available Slots on this Date</Text>
              {loadingSlots ? (
                <ActivityIndicator color="#0D9488" style={{ marginVertical: 12 }} />
              ) : availableSlots.length === 0 ? (
                <Text style={styles.muted}>No practice slots available on this date. Select another date.</Text>
              ) : (
                <View style={styles.slotsGrid}>
                  {availableSlots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime;
                    return (
                      <TouchableOpacity
                        key={slot.startTime}
                        disabled={!slot.available}
                        style={[
                          styles.slotButton,
                          !slot.available && styles.slotDisabled,
                          isSelected && styles.slotSelected,
                        ]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <Text
                          style={[
                            styles.slotText,
                            !slot.available && styles.slotTextDisabled,
                            isSelected && styles.slotTextSelected,
                          ]}
                        >
                          {slot.startTime}
                        </Text>
                        {!slot.available && (
                          <Text style={styles.slotReason}>{slot.reason || 'Booked'}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.fieldLabel}>Visit Type</Text>
              <View style={styles.typeRow}>
                {['CHECKUP', 'FOLLOW_UP', 'DIABETES_REVIEW', 'OTHER'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeButton, visitType === t && styles.typeSelected]}
                    onPress={() => setVisitType(t)}
                  >
                    <Text style={[styles.typeText, visitType === t && styles.selectedText]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Primary Reason for Consultation</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="e.g., Routine glucose check, medication review, high morning sugars..."
                style={[styles.input, styles.reasonInput]}
                multiline
                maxLength={2000}
              />

              <View style={styles.rowButtons}>
                <TouchableOpacity style={styles.backButton} onPress={() => setBookingStep(1)}>
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!selectedSlot || reason.trim().length < 3}
                  style={[
                    styles.primaryButton,
                    (!selectedSlot || reason.trim().length < 3) && styles.disabled,
                    { flex: 2 },
                  ]}
                  onPress={() => setBookingStep(3)}
                >
                  <Text style={styles.primaryButtonText}>Pre-Visit Assessment (18 Qs) →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3: 18-QUESTION PRE-CONSULTATION INTAKE ASSESSMENT */}
          {bookingStep === 3 && (
            <View style={styles.stepContent}>
              <View style={styles.disclaimerBox}>
                <Text style={styles.disclaimerText}>
                  🛡️ <Text style={{ fontWeight: 'bold' }}>AarogyaDamu Clinical Intake Protocol:</Text> This
                  18-question pre-consultation assessment prepares your doctor for your visit. It is not a
                  diagnostic directive. In case of severe emergency symptoms, seek immediate hospital care.
                </Text>
              </View>

              {/* Sub-Section Pills */}
              <View style={styles.subSectionRow}>
                {[
                  { id: 1, label: 'Questions 1–6' },
                  { id: 2, label: 'Questions 7–12' },
                  { id: 3, label: 'Questions 13–18' },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.subSectionTab,
                      activeQuestionnaireSection === s.id && styles.subSectionTabActive,
                    ]}
                    onPress={() => setActiveQuestionnaireSection(s.id as any)}
                  >
                    <Text
                      style={[
                        styles.subSectionTabText,
                        activeQuestionnaireSection === s.id && styles.subSectionTabTextActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Questions for Active Section */}
              {questionnaire.filter((q) => q.section === activeQuestionnaireSection).map((q) => (
                <View key={q.id} style={styles.questionCard}>
                  <Text style={styles.questionTitle}>
                    Q{q.order}. {q.title}
                  </Text>

                  {q.type === 'SINGLE_SELECT' && q.options && (
                    <View style={styles.optionsWrap}>
                      {q.options.map((opt) => {
                        const isChosen = questionnaireAnswers[q.id] === opt;
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.optPill, isChosen && styles.optPillSelected]}
                            onPress={() => handleAnswerChange(q.id, opt)}
                          >
                            <Text style={[styles.optPillText, isChosen && styles.optPillTextSelected]}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {(q.type === 'TEXT' || q.type === 'NUMBER') && (
                    <TextInput
                      value={questionnaireAnswers[q.id] || ''}
                      onChangeText={(txt) => handleAnswerChange(q.id, txt)}
                      placeholder={q.placeholder || 'Your response...'}
                      keyboardType={q.type === 'NUMBER' ? 'numeric' : 'default'}
                      style={styles.input}
                    />
                  )}
                </View>
              ))}

              <View style={styles.rowButtons}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    if (activeQuestionnaireSection > 1) {
                      setActiveQuestionnaireSection((prev) => (prev - 1) as any);
                    } else {
                      setBookingStep(2);
                    }
                  }}
                >
                  <Text style={styles.backButtonText}>← Previous</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 2 }]}
                  onPress={() => {
                    if (activeQuestionnaireSection < 3) {
                      setActiveQuestionnaireSection((prev) => (prev + 1) as any);
                    } else {
                      setBookingStep(4);
                    }
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {activeQuestionnaireSection < 3 ? 'Next Section →' : 'Review & Request →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 4: REVIEW & CONFIRM REQUEST */}
          {bookingStep === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Review Consultation Details</Text>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Physician: </Text>
                  {doctors.find((d) => d.id === selectedDoctorId)?.name}
                </Text>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Clinic: </Text>
                  {clinicName}
                </Text>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Date & Time: </Text>
                  {bookingDate} at {selectedSlot?.startTime} (30 mins)
                </Text>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Visit Type: </Text>
                  {visitType.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Reason: </Text>
                  {reason}
                </Text>
                <Text style={styles.summaryRow}>
                  <Text style={styles.bold}>Pre-Visit Assessment: </Text>
                  18 Clinical Questions Completed ✓
                </Text>
              </View>

              <View style={styles.rowButtons}>
                <TouchableOpacity style={styles.backButton} onPress={() => setBookingStep(3)}>
                  <Text style={styles.backButtonText}>← Edit Answers</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={submitting}
                  style={[styles.primaryButton, submitting && styles.disabled, { flex: 2 }]}
                  onPress={bookAppointment}
                >
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'Submitting Request...' : 'Submit Consultation Request ✓'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ------------------------------------------------------------ */}
      {/* SECTION 2: APPOINTMENTS LIST VIEW                            */}
      {/* ------------------------------------------------------------ */}
      {(!mode || mode !== 'PATIENT' || mainTab === 'LIST') && (
        <View style={styles.listSection}>
          {/* Sub-filter tabs */}
          <View style={styles.filterRow}>
            {[
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'REQUESTS', label: 'Pending Review' },
              { id: 'HISTORY', label: 'History' },
            ].map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterPill, listFilter === f.id && styles.filterPillActive]}
                onPress={() => setListFilter(f.id as any)}
              >
                <Text style={[styles.filterPillText, listFilter === f.id && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Caregiver Dependent Picker */}
          {mode === 'CAREGIVER' && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.fieldLabel}>Select Authorized Dependent</Text>
              {patients.length === 0 ? (
                <Text style={styles.muted}>No family dependents have granted appointment permissions.</Text>
              ) : (
                <View style={styles.typeRow}>
                  {patients.map((p) => (
                    <TouchableOpacity
                      key={p.patientId}
                      style={[styles.typeButton, selectedPatientId === p.patientId && styles.typeSelected]}
                      onPress={() => setSelectedPatientId(p.patientId)}
                    >
                      <Text style={[styles.typeText, selectedPatientId === p.patientId && styles.selectedText]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {filteredAppointments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No appointments found</Text>
              <Text style={styles.muted}>
                {listFilter === 'REQUESTS'
                  ? 'No pending appointment requests waiting for review.'
                  : listFilter === 'UPCOMING'
                    ? 'No upcoming visits scheduled.'
                    : 'No past appointment history.'}
              </Text>
              {mode === 'PATIENT' && listFilter === 'UPCOMING' && (
                <TouchableOpacity style={[styles.primaryButton, { marginTop: 14 }]} onPress={() => setMainTab('BOOK')}>
                  <Text style={styles.primaryButtonText}>+ Schedule a Doctor Visit</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredAppointments.map((appt) => {
              const styleMeta = getStatusStyle(appt.status);
              const hasQuestionnaire = !!appt.questionnaireResponse;

              return (
                <View key={appt.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.appointmentTitle}>
                      {mode === 'DOCTOR' ? appt.patientName : appt.doctorName}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: styleMeta.bg, borderColor: styleMeta.border },
                      ]}
                    >
                      <Text style={[styles.statusBadgeText, { color: styleMeta.text }]}>
                        {appt.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.clinicText}>🏥 {appt.clinicName || 'Apollo Sugar Clinic, Pune'}</Text>
                  <Text style={styles.timeText}>🕒 {displayDate(appt.scheduledAt)} (30 mins)</Text>
                  <Text style={styles.bodyText}>
                    <Text style={styles.bold}>Reason: </Text>
                    {appt.reason}
                  </Text>
                  <Text style={styles.smallText}>Visit Type: {appt.visitType.replace(/_/g, ' ')}</Text>

                  {appt.rejectionReason && (
                    <View style={styles.rejectionBox}>
                      <Text style={styles.rejectionText}>
                        <Text style={styles.bold}>Doctor Note: </Text>
                        {appt.rejectionReason}
                      </Text>
                    </View>
                  )}

                  {appt.cancellationReason && (
                    <View style={styles.rejectionBox}>
                      <Text style={styles.rejectionText}>
                        <Text style={styles.bold}>Cancellation Note: </Text>
                        {appt.cancellationReason}
                      </Text>
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.cardActions}>
                    {hasQuestionnaire && (
                      <TouchableOpacity
                        style={styles.actionButtonOutline}
                        onPress={() => setSelectedQuestionnaireAppt(appt)}
                      >
                        <Text style={styles.actionButtonOutlineText}>View Intake Assessment</Text>
                      </TouchableOpacity>
                    )}

                    {mode === 'PATIENT' && ['REQUESTED', 'CONFIRMED'].includes(appt.status) && (
                      <TouchableOpacity
                        disabled={busyAppointmentId === appt.id}
                        style={styles.actionButtonDanger}
                        onPress={() => setCancellingAppt(appt)}
                      >
                        <Text style={styles.actionButtonDangerText}>Cancel Visit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ------------------------------------------------------------ */}
      {/* MODAL: VIEW INTAKE ASSESSMENT                                */}
      {/* ------------------------------------------------------------ */}
      {selectedQuestionnaireAppt && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pre-Consultation Intake Answers</Text>
            <Text style={styles.modalSubtitle}>
              Completed by: {selectedQuestionnaireAppt.patientName}
            </Text>

            <ScrollView style={{ maxHeight: 350, marginVertical: 12 }}>
              {questionnaire.map((q) => {
                const ans = selectedQuestionnaireAppt.questionnaireResponse?.[q.id];
                return (
                  <View key={q.id} style={styles.modalAnswerCard}>
                    <Text style={styles.modalQTitle}>
                      Q{q.order}. {q.title}
                    </Text>
                    <Text style={styles.modalQAnswer}>
                      {ans ? (Array.isArray(ans) ? ans.join(', ') : String(ans)) : 'Not answered'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setSelectedQuestionnaireAppt(null)}
            >
              <Text style={styles.primaryButtonText}>Close Review</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------ */}
      {/* MODAL: CANCEL APPOINTMENT                                    */}
      {/* ------------------------------------------------------------ */}
      {cancellingAppt && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancel Appointment</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to cancel your visit with {cancellingAppt.doctorName}?
            </Text>

            <TextInput
              value={cancellationReason}
              onChangeText={setCancellationReason}
              placeholder="Reason for cancellation (optional)..."
              style={[styles.input, { marginVertical: 14 }]}
            />

            <View style={styles.rowButtons}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setCancellingAppt(null);
                  setCancellationReason('');
                }}
              >
                <Text style={styles.backButtonText}>Keep Visit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonDanger, { flex: 2 }]}
                onPress={handleCancelSubmit}
              >
                <Text style={styles.actionButtonDangerText}>Confirm Cancellation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 18, paddingBottom: 50 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  eyebrow: {
    color: '#0D9488',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  muted: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  bold: { fontWeight: '700', color: '#1E293B' },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 12,
  },
  navTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  navTabActive: {
    backgroundColor: '#0D9488',
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  navTabTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  stepHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  stepBarContainer: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  stepBarProgress: {
    height: 6,
    backgroundColor: '#0D9488',
    borderRadius: 3,
  },
  stepContent: {
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 10,
  },
  doctorCard: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  doctorCardSelected: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  choiceSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  clinicBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 4,
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  reasonInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  slotButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 78,
  },
  slotDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  slotSelected: {
    borderColor: '#0D9488',
    backgroundColor: '#0D9488',
  },
  slotText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  slotTextDisabled: {
    color: '#94A3B8',
  },
  slotTextSelected: {
    color: '#FFFFFF',
  },
  slotReason: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeSelected: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  selectedText: {
    color: '#FFFFFF',
  },
  disclaimerBox: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 17,
  },
  subSectionRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  subSectionTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  subSectionTabActive: {
    backgroundColor: '#0F172A',
  },
  subSectionTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  subSectionTabTextActive: {
    color: '#FFFFFF',
  },
  questionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  questionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  optPillSelected: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  optPillText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  optPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
    gap: 8,
  },
  summaryRow: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  primaryButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  listSection: {
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  clinicText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 4,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 2,
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    marginTop: 6,
  },
  smallText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rejectionBox: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  rejectionText: {
    fontSize: 12,
    color: '#9F1239',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  actionButtonOutline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  actionButtonOutlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  actionButtonDanger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },
  noticeBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: {
    color: '#065F46',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#9F1239',
    fontSize: 13,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 999,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 450,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalAnswerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  modalQTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  modalQAnswer: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
});
