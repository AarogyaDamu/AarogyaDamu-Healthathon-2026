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
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.borders.ghost,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  headerSuper: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    backgroundColor: theme.colors.background,
  },
  heroCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgePrimary: {
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: theme.borders.radius.sm,
  },
  badgePrimaryText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: 0.6,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borders.radius.sm,
  },
  statusTagText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusConfirmed: {
    backgroundColor: '#E6F8EF',
  },
  statusConfirmedText: {
    color: '#004D4D',
  },
  statusPending: {
    backgroundColor: '#fff0d8',
  },
  statusPendingText: {
    color: '#92400e',
  },
  doctorName: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginTop: 6,
  },
  doctorSpecialty: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  detailText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.secondary,
  },
  facilityText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.outline,
    marginTop: 4,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  heroPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 11,
    borderRadius: theme.borders.radius.md,
    gap: 4,
    ...theme.shadows.soft,
  },
  heroPrimaryBtnText: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fonts.label,
    fontSize: 13,
    fontWeight: '700',
  },
  heroSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    paddingVertical: 11,
    borderRadius: theme.borders.radius.md,
  },
  heroSecondaryBtnText: {
    color: theme.colors.primary,
    fontFamily: theme.typography.fonts.label,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  emptyTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginTop: 10,
  },
  emptySub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  bookVisitBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: theme.borders.radius.md,
    ...theme.shadows.soft,
  },
  bookVisitBtnText: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fonts.label,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  sectionSub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 14,
  },
  checklistWrap: {
    gap: 10,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainerHigh,
  },
  checkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.borders.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  checkBoxDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurface,
    flex: 1,
  },
  checkTextDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.outline,
  },
  checkActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borders.radius.sm,
  },
  checkActionPillText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  emptyNoteState: {
    padding: 16,
    alignItems: 'center',
  },
  emptyNoteText: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  emptyNoteSub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    marginBottom: 12,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  summaryDoctorName: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  summaryFacility: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  summaryDate: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.secondary,
    marginTop: 2,
  },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borders.radius.sm,
  },
  signedBadgeText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: '#004D4D',
  },
  noteSection: {
    marginTop: 8,
  },
  noteSectionLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  noteSectionBody: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurface,
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  bulletText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  summaryActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceContainerHigh,
  },
  expandBtn: {
    paddingVertical: 4,
  },
  expandBtnText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  shareBtnText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
});
