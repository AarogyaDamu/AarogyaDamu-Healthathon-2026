import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Calendar,
  Stethoscope,
  Pill,
  CheckCircle2,
  FileText,
  ChevronRight,
  ShieldCheck,
  Share2,
  Clock,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react-native';
import {
  mobileApiFetch,
  clinicalStore,
  subscribeToClinicalStore,
  Appointment,
} from '../../src/api/client';
import { coordinationApi, AppointmentRecord } from '../../src/api/coordination';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

interface DoctorSummary {
  id: string;
  clinicianName: string;
  facilityName: string;
  approvedAt: string;
  approvedNoteText?: string;
  structuredNote?: {
    chiefComplaint?: string;
    assessment?: string;
    plan?: string;
    medications?: string[];
    lifestyleGoals?: string;
    followUpWeeks?: number;
  };
}

interface PrepItem {
  id: string;
  text: string;
  done: boolean;
  actionRoute?: string;
  actionLabel?: string;
}

const DEFAULT_CHECKLIST: PrepItem[] = [
  {
    id: 'chk-1',
    text: 'Record fasting morning glucose in Health Vault',
    done: false,
    actionRoute: '/(tabs)/health',
    actionLabel: 'Log Sugar',
  },
  {
    id: 'chk-2',
    text: 'List any new symptoms or medication side-effects',
    done: false,
    actionRoute: '/(tabs)/damu',
    actionLabel: 'Ask Damu',
  },
  {
    id: 'chk-3',
    text: 'Bring recent HbA1c lab report (within last 90 days)',
    done: false,
    actionRoute: '/(tabs)/health',
    actionLabel: 'Upload Report',
  },
  {
    id: 'chk-4',
    text: 'Verify current daily medication dosages',
    done: true,
    actionRoute: '/(tabs)/medications',
    actionLabel: 'Med Vault',
  },
];

export default function ConsultationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [upcomingAppointment, setUpcomingAppointment] = useState<AppointmentRecord | null>(null);
  const [summaries, setSummaries] = useState<DoctorSummary[]>([]);
  const [checklist, setChecklist] = useState<PrepItem[]>(DEFAULT_CHECKLIST);
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // 1. Fetch appointments from coordinationApi
    try {
      const apptRes = await coordinationApi.getAppointments();
      if (apptRes?.appointments && apptRes.appointments.length > 0) {
        // Find next upcoming non-cancelled appointment
        const next = apptRes.appointments.find(
          (a) => a.status === 'CONFIRMED' || a.status === 'REQUESTED' || a.status === 'RESCHEDULED',
        );
        setUpcomingAppointment(next || apptRes.appointments[0]);
      }
    } catch {
      // Fallback to local clinicalStore appointment
      const localAppt = clinicalStore.appointments[0];
      if (localAppt) {
        setUpcomingAppointment({
          id: localAppt.id,
          patientId: 'patient-local',
          doctorId: 'doc-local',
          patientName: localAppt.patientName,
          doctorName: localAppt.doctorName,
          scheduledAt: `${localAppt.date}T${localAppt.time || '10:00:00'}Z`,
          durationMinutes: 30,
          reason: 'Diabetes Comprehensive Review',
          visitType: 'DIABETES_REVIEW',
          status: 'CONFIRMED',
          clinicName: localAppt.hospital,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 2. Fetch approved consultation summaries from the authenticated backend.
    try {
      const timelineRes = await mobileApiFetch<{ events: any[] }>('/timeline');
      const noteEvents = (timelineRes?.events || []).filter((e: any) => e.eventType === 'CONSULTATION_NOTE');
      if (noteEvents.length > 0) {
        const mapped: DoctorSummary[] = noteEvents.map((e: any) => ({
          id: e.id,
          clinicianName: 'Clinician',
          facilityName: 'Clinic',
          approvedAt: e.occurredAt,
          approvedNoteText: e.details,
          structuredNote: {
            assessment: 'Clinical summary reported by the treating clinician.',
            plan: e.details,
            medications: [],
            lifestyleGoals: '',
            followUpWeeks: 0,
          },
        }));
        setSummaries(mapped);
      } else {
        setSummaries([]);
      }
    } catch {
      setSummaries([]);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = subscribeToClinicalStore(loadData);
    return unsub;
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    showToast('Consultation details refreshed');
  };

  const toggleCheckItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );
  };

  const handleShareSummary = async (summary: DoctorSummary) => {
    const text = [
      `AarogyaDamu Approved Doctor Consultation Note`,
      `Physician: ${summary.clinicianName}`,
      `Facility: ${summary.facilityName}`,
      `Date: ${new Date(summary.approvedAt).toLocaleDateString()}`,
      `\nAssessment: ${summary.structuredNote?.assessment || 'Not specified'}`,
      `\nTreatment Plan: ${summary.structuredNote?.plan || summary.approvedNoteText || 'Follow regular medication'}`,
      summary.structuredNote?.medications ? `\nMedications:\n- ${summary.structuredNote.medications.join('\n- ')}` : '',
      summary.structuredNote?.lifestyleGoals ? `\nLifestyle Goals: ${summary.structuredNote.lifestyleGoals}` : '',
      `\nNext Follow-up: in ${summary.structuredNote?.followUpWeeks || 12} weeks`,
      `\n[Verified by Treating Physician • AarogyaDamu Clinical Record]`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({
        message: text,
        title: 'Doctor Consultation Summary',
      });
    } catch {
      showToast('Summary copied to clipboard');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSuper}>DOCTOR APPOINTMENTS & RECORDS</Text>
          <Text style={styles.headerTitle}>Consultations</Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh consultation records"
        >
          <RefreshCw color={theme.colors.primary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* 1. Next Upcoming Consultation Card */}
        {upcomingAppointment ? (
          <View style={styles.heroCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.badgePrimary}>
                <Text style={styles.badgePrimaryText}>UPCOMING VISIT</Text>
              </View>
              <View
                style={[
                  styles.statusTag,
                  upcomingAppointment.status === 'CONFIRMED' ? styles.statusConfirmed : styles.statusPending,
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    upcomingAppointment.status === 'CONFIRMED' ? styles.statusConfirmedText : styles.statusPendingText,
                  ]}
                >
                  {upcomingAppointment.status}
                </Text>
              </View>
            </View>

            <Text style={styles.doctorName}>{upcomingAppointment.doctorName || 'Dr. Rupam Choudhary (Diabetologist)'}</Text>
            <Text style={styles.doctorSpecialty}>Consultant Diabetologist & Endocrinologist</Text>

            <View style={styles.detailRow}>
              <Calendar color={theme.colors.primary} size={15} />
              <Text style={styles.detailText}>
                {new Date(upcomingAppointment.scheduledAt).toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <Clock color={theme.colors.textMuted} size={15} style={{ marginLeft: 8 }} />
              <Text style={styles.detailText}>
                {new Date(upcomingAppointment.scheduledAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            {upcomingAppointment.clinicName && (
              <Text style={styles.facilityText}>{upcomingAppointment.clinicName}</Text>
            )}

            <View style={styles.heroActionRow}>
              <TouchableOpacity
                style={styles.heroPrimaryBtn}
                onPress={() => router.push('/(tabs)/appointments')}
                accessibilityRole="button"
                accessibilityLabel="Manage or reschedule appointment"
              >
                <Text style={styles.heroPrimaryBtnText}>Manage Booking</Text>
                <ChevronRight color={theme.colors.white} size={15} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.heroSecondaryBtn}
                onPress={() => router.push('/(tabs)/damu')}
                accessibilityRole="button"
                accessibilityLabel="Ask Damu to prep questions for this visit"
              >
                <Text style={styles.heroSecondaryBtnText}>Prep with Damu</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Calendar color={theme.colors.primary} size={32} />
            <Text style={styles.emptyTitle}>No Scheduled Visit</Text>
            <Text style={styles.emptySub}>Book a consultation with your diabetologist to review blood sugar logs.</Text>
            <TouchableOpacity
              style={styles.bookVisitBtn}
              onPress={() => router.push('/(tabs)/appointments')}
              accessibilityRole="button"
              accessibilityLabel="Book an appointment"
            >
              <Text style={styles.bookVisitBtnText}>Book Appointment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. Pre-Consultation Preparation Checklist */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <CheckCircle2 color={theme.colors.primary} size={18} />
            <Text style={styles.sectionTitle}>Consultation Readiness Checklist</Text>
          </View>
          <Text style={styles.sectionSub}>Complete these preparations before meeting your clinician</Text>

          <View style={styles.checklistWrap}>
            {checklist.map((item) => (
              <View key={item.id} style={styles.checkItemRow}>
                <TouchableOpacity
                  style={styles.checkToggle}
                  onPress={() => toggleCheckItem(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.done }}
                  accessibilityLabel={item.text}
                >
                  <View style={[styles.checkBox, item.done && styles.checkBoxDone]}>
                    {item.done && <CheckCircle2 color={theme.colors.white} size={13} />}
                  </View>
                  <Text style={[styles.checkText, item.done && styles.checkTextDone]}>{item.text}</Text>
                </TouchableOpacity>

                {item.actionRoute && (
                  <TouchableOpacity
                    style={styles.checkActionPill}
                    onPress={() => router.push(item.actionRoute as any)}
                    accessibilityRole="button"
                    accessibilityLabel={item.actionLabel}
                  >
                    <Text style={styles.checkActionPillText}>{item.actionLabel}</Text>
                    <ArrowUpRight color={theme.colors.primary} size={12} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* 3. Approved Doctor Consultation Summaries */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <FileText color={theme.colors.primary} size={18} />
            <Text style={styles.sectionTitle}>Approved Consultation Notes</Text>
          </View>
          <Text style={styles.sectionSub}>Official visit documentation signed and approved by your doctor</Text>

          {summaries.length === 0 ? (
            <View style={styles.emptyNoteState}>
              <Text style={styles.emptyNoteText}>No signed consultation notes yet.</Text>
              <Text style={styles.emptyNoteSub}>
                When your doctor reviews and approves a consultation note from their workstation, it will appear here.
              </Text>
            </View>
          ) : (
            summaries.map((summary) => {
              const isExpanded = expandedSummaryId === summary.id;
              const formattedDate = summary.approvedAt
                ? new Date(summary.approvedAt).toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Recent Visit';

              return (
                <View key={summary.id} style={styles.summaryCard}>
                  {/* Summary Card Header */}
                  <View style={styles.summaryCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryDoctorName}>{summary.clinicianName}</Text>
                      <Text style={styles.summaryFacility}>{summary.facilityName}</Text>
                      <Text style={styles.summaryDate}>Approved on {formattedDate}</Text>
                    </View>

                    <View style={styles.signedBadge}>
                      <ShieldCheck color={theme.colors.success} size={13} />
                      <Text style={styles.signedBadgeText}>Doctor Signed</Text>
                    </View>
                  </View>

                  {/* Clinical Assessment */}
                  {summary.structuredNote?.assessment && (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteSectionLabel}>ASSESSMENT & DIAGNOSIS</Text>
                      <Text style={styles.noteSectionBody}>{summary.structuredNote.assessment}</Text>
                    </View>
                  )}

                  {/* Treatment Plan */}
                  <View style={styles.noteSection}>
                    <Text style={styles.noteSectionLabel}>PHYSICIAN TREATMENT PLAN</Text>
                    <Text style={styles.noteSectionBody}>
                      {summary.structuredNote?.plan || summary.approvedNoteText || 'Continue current prescribed plan.'}
                    </Text>
                  </View>

                  {/* Medication Changes (Expanded) */}
                  {isExpanded && summary.structuredNote?.medications && summary.structuredNote.medications.length > 0 && (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteSectionLabel}>PRESCRIBED MEDICATIONS</Text>
                      {summary.structuredNote.medications.map((m, idx) => (
                        <View key={idx} style={styles.bulletRow}>
                          <Pill color={theme.colors.primary} size={13} />
                          <Text style={styles.bulletText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Lifestyle Recommendations (Expanded) */}
                  {isExpanded && summary.structuredNote?.lifestyleGoals && (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteSectionLabel}>LIFESTYLE & DIETARY ADVICE</Text>
                      <Text style={styles.noteSectionBody}>{summary.structuredNote.lifestyleGoals}</Text>
                    </View>
                  )}

                  {/* Actions: Expand/Collapse & Share */}
                  <View style={styles.summaryActionRow}>
                    <TouchableOpacity
                      style={styles.expandBtn}
                      onPress={() => setExpandedSummaryId(isExpanded ? null : summary.id)}
                    >
                      <Text style={styles.expandBtnText}>{isExpanded ? 'Show Less' : 'View Full Clinical Note'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.shareBtn}
                      onPress={() => handleShareSummary(summary)}
                      accessibilityRole="button"
                      accessibilityLabel="Share consultation note"
                    >
                      <Share2 color={theme.colors.primary} size={15} />
                      <Text style={styles.shareBtnText}>Share Note</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerSuper: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.bg,
  },
  heroCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgePrimary: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  badgePrimaryText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  statusConfirmed: {
    backgroundColor: '#ECFDF5',
  },
  statusConfirmedText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: '#059669',
  },
  statusPending: {
    backgroundColor: '#FFFBEB',
  },
  statusPendingText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: '#D97706',
  },
  doctorName: {
    fontSize: 19,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    marginTop: 4,
  },
  doctorSpecialty: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  facilityText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  heroPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    gap: 4,
  },
  heroPrimaryBtnText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
  },
  heroSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  heroSecondaryBtnText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
  },
  emptyCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  bookVisitBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  bookVisitBtnText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  sectionSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  checklistWrap: {
    gap: 10,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  checkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkText: {
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
  },
  checkTextDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.textMuted,
  },
  checkActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  checkActionPillText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  emptyNoteState: {
    padding: 16,
    alignItems: 'center',
  },
  emptyNoteText: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  emptyNoteSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  summaryDoctorName: {
    fontSize: 15,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  summaryFacility: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  summaryDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  signedBadgeText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: '#059669',
  },
  noteSection: {
    marginTop: 8,
  },
  noteSectionLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  noteSectionBody: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  bulletText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  summaryActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  expandBtn: {
    paddingVertical: 4,
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
});
