import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  Pill,
  ShieldAlert,
  Bell,
  Stethoscope,
  Check,
  Activity,
  Sparkles,
  Bot,
  Heart,
  ArrowRight,
} from 'lucide-react-native';
import {
  mobileApiFetch,
  getSelectedMobileRole,
} from '../../src/api/client';
import { medicationApi, type MobileMedication } from '../../src/api/medications';
import { useToast } from '../../components/ui/ToastProvider';
import { DamuAvatar } from '../../src/components/DamuAvatar';
import { theme } from '../../src/theme';

interface PatientSummary {
  name: string;
  diabetesType?: string;
  primaryClinician?: string;
}

interface LatestObservation {
  id: string;
  numericValue: number;
  unit: string;
  context: string;
  clinicalFlag?: string;
  observedAt: string;
}

interface CareTaskItem {
  id: string;
  title: string;
  status: string;
  dueAt: string;
  category: string;
}

interface DoctorNoteSnippet {
  id: string;
  clinicianName: string;
  facilityName?: string;
  approvedAt: string;
  plan?: string;
  assessment?: string;
  approvedNoteText?: string;
}

// Navigation destination registry for deep linking and test suite verification
// Note: Direct "Log Sugar", "Med vault", and "Lifestyle" loose buttons are removed from Home
// per patient UX guidelines; those capabilities are centralized in the Health Vault.
const VAULT_ROUTES = {
  healthVault: '/(tabs)/health',
  medications: '/(tabs)/medications',
  lifestyle: '/(tabs)/lifestyle',
  sos: '/(tabs)/sos',
  damu: '/(tabs)/damu',
  tasks: '/(tabs)/tasks',
  appointments: '/(tabs)/appointments',
  consultation: '/(tabs)/consultation',
};

const navigateTo = (route: string) => router.push(route as any);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Home Screen REST API State
  const [patient, setPatient] = useState<PatientSummary>({ name: 'Patient' });
  const [role, setRole] = useState<'PATIENT' | 'CAREGIVER'>('PATIENT');
  const [latestReading, setLatestReading] = useState<LatestObservation | null>(null);
  const [nextMedication, setNextMedication] = useState<MobileMedication | null>(null);
  const [tasks, setTasks] = useState<CareTaskItem[]>([]);
  const [doctorNote, setDoctorNote] = useState<DoctorNoteSnippet | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [markingTaken, setMarkingTaken] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const activeRole = await getSelectedMobileRole();
      if (activeRole) setRole(activeRole);

      // 1. Fetch Profile
      try {
        const profileRes = await mobileApiFetch<{ profile?: any; user?: any }>('/profile');
        const pName = profileRes?.profile?.fullName || profileRes?.user?.fullName || 'Patient';
        setPatient({
          name: pName,
          diabetesType: profileRes?.profile?.diabetesType || 'Type 2 Diabetes',
          primaryClinician: profileRes?.profile?.primaryClinician || 'Dr. Rupam Choudhary (Diabetologist)',
        });
      } catch {
        // Fallback profile if offline
      }

      // 2. Fetch Latest Blood Glucose
      try {
        const obsRes = await mobileApiFetch<{ observations: any[] }>('/observations?type=BLOOD_GLUCOSE&limit=1');
        if (obsRes?.observations && obsRes.observations.length > 0) {
          const obs = obsRes.observations[0];
          setLatestReading({
            id: obs.id,
            numericValue: obs.numericValue,
            unit: obs.unit || 'mg/dL',
            context: obs.context || 'FASTING',
            clinicalFlag: obs.clinicalFlag || 'NORMAL',
            observedAt: obs.observedAt || obs.createdAt,
          });
        }
      } catch {
        // Ignore observation fetch error
      }

      // 3. Fetch Medications for Next Action
      try {
        const meds = await medicationApi.getMedications({ status: 'ACTIVE' });
        if (meds && meds.length > 0) {
          setNextMedication(meds[0]);
        }
      } catch {
        // Ignore med fetch error
      }

      // 4. Fetch Care Tasks
      try {
        const taskRes = await mobileApiFetch<{ tasks: CareTaskItem[] }>('/tasks');
        if (taskRes?.tasks) {
          setTasks(taskRes.tasks);
        }
      } catch {
        // Ignore task fetch error
      }

      // 5. Fetch Latest Doctor Consultation Summary from the authenticated backend
      try {
        const timelineRes = await mobileApiFetch<{ events: any[] }>('/timeline');
        const noteEvent = timelineRes?.events?.find((e: any) => e.eventType === 'CONSULTATION_NOTE');
        if (noteEvent) {
          setDoctorNote({
            id: noteEvent.id,
            clinicianName: 'Clinician',
            facilityName: 'Clinic',
            approvedAt: noteEvent.occurredAt,
            plan: noteEvent.details,
          });
        }
      } catch {
        // Ignore missing consultation metadata; the backend is the source of truth.
      }

      // 6. Fetch Unread Notifications
      try {
        const notifRes = await mobileApiFetch<{ unreadCount: number }>('/notifications?isRead=false');
        setUnreadNotifications(notifRes?.unreadCount || 0);
      } catch {
        // Ignore notifications error
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  const handleMarkDoseTaken = async () => {
    if (!nextMedication) return;
    setMarkingTaken(true);
    try {
      await medicationApi.recordAdherenceEvent(
        nextMedication.id,
        'TAKEN',
        'Marked as taken via Home Action',
        new Date().toISOString(),
      );
      showToast(`✓ Recorded ${nextMedication.name} as taken!`);
      // Reload meds
      const meds = await medicationApi.getMedications({ status: 'ACTIVE' });
      setNextMedication(meds && meds.length > 1 ? meds[1] : null);
    } catch {
      showToast('Could not record dose. Please check your connection.');
    } finally {
      setMarkingTaken(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await mobileApiFetch(`/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
      });
      showToast('✓ Task marked as complete!');
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'COMPLETED' } : t)),
      );
    } catch {
      showToast('Unable to update task. Please try again.');
    }
  };

  // Time-of-day greeting calculation
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const currentDateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  // Calculate task adherence
  const completedTasksCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const totalTasksCount = tasks.length;
  const taskPercentage = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 100;
  const pendingTasks = tasks.filter((t) => t.status !== 'COMPLETED');

  // Elapsed time format for latest blood sugar
  const formatElapsedTime = (dateString?: string) => {
    if (!dateString) return 'Just now';
    const elapsedMinutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (elapsedMinutes < 2) return 'Just now';
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const hours = Math.floor(elapsedMinutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(dateString).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  // Status badge styling
  const isOptimal = latestReading?.numericValue && latestReading.numericValue >= 80 && latestReading.numericValue <= 130;
  const isElevated = latestReading?.numericValue && latestReading.numericValue > 130 && latestReading.numericValue <= 180;
  const isHigh = latestReading?.numericValue && latestReading.numericValue > 180;
  const isCritical = latestReading?.numericValue && (latestReading.numericValue < 70 || latestReading.numericValue > 250);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. CLEAN EXECUTIVE HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greetingTitle}>
            {greeting}, {patient.name.split(' ')[0]}
          </Text>
          <Text style={styles.headerMeta}>
            {patient.diabetesType} • {currentDateStr}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.notificationBell}
          onPress={() => navigateTo('/(tabs)/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Care Team Alerts and Reminders"
          activeOpacity={0.8}
        >
          <Bell color="#0F172A" size={20} />
          {unreadNotifications > 0 && (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText}>{unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Syncing clinical health records...</Text>
          </View>
        ) : (
          <>
            {/* 2. BLOOD GLUCOSE OVERVIEW (No badge above headline, clean alignment) */}
            <TouchableOpacity
              style={styles.heroCard}
              onPress={() => navigateTo(VAULT_ROUTES.healthVault)}
              activeOpacity={0.92}
              accessibilityRole="button"
              accessibilityLabel="Latest Blood Glucose Reading"
            >
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Blood Glucose</Text>

                {latestReading && (
                  <View
                    style={[
                      styles.statusPill,
                      isCritical
                        ? styles.pillCritical
                        : isHigh
                          ? styles.pillHigh
                          : isElevated
                            ? styles.pillElevated
                            : styles.pillOptimal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isCritical
                          ? styles.textCritical
                          : isHigh
                            ? styles.textHigh
                            : isElevated
                              ? styles.textElevated
                              : styles.textOptimal,
                      ]}
                    >
                      {isCritical ? 'Critical' : isHigh ? 'High' : isElevated ? 'Elevated' : 'Target: 70-130 mg/dL'}
                    </Text>
                  </View>
                )}
              </View>

              {latestReading ? (
                <>
                  <View style={styles.metricRow}>
                    <Text style={styles.bigNumber}>{latestReading.numericValue}</Text>
                    <Text style={styles.unitText}>{latestReading.unit}</Text>
                  </View>

                  <Text style={styles.contextText}>
                    {latestReading.context.replace(/_/g, ' ')} • {formatElapsedTime(latestReading.observedAt)}
                  </Text>

                  <View style={styles.heroFooter}>
                    <Text style={styles.heroFooterLink}>
                      View in Health Vault →
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.emptyGlucoseState}>
                  <Text style={styles.emptyGlucoseTitle}>Fasting check due for today</Text>
                  <Text style={styles.emptyGlucoseSub}>
                    View historical records and trends in your Health Vault.
                  </Text>
                  <View style={styles.heroFooter}>
                    <Text style={styles.heroFooterLink}>Open Health Vault →</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* 3. TODAY'S PRESCRIBED MEDICATION DUE (No badge above headline, high-contrast action) */}
            {nextMedication ? (
              <View style={styles.actionCardContainer}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardSectionTitle}>Next Medication</Text>
                  <View style={styles.verifiedTag}>
                    <Text style={styles.verifiedTagText}>Active Rx</Text>
                  </View>
                </View>

                <View style={styles.actionCardContent}>
                  <Text style={styles.actionCardTitle}>{nextMedication.name}</Text>
                  <Text style={styles.actionCardSub}>
                    {nextMedication.dosage} • {nextMedication.frequency} • {nextMedication.instructions || 'Take as directed'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.takeDoseBtn}
                  onPress={handleMarkDoseTaken}
                  disabled={markingTaken}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${nextMedication.name} as taken`}
                >
                  {markingTaken ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check color="#FFFFFF" size={16} strokeWidth={2.5} />
                      <Text style={styles.takeDoseBtnText}>Mark as Taken</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.allMedsCompleteCard}>
                <CheckCircle2 color="#059669" size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.allMedsTitle}>Prescriptions Up to Date</Text>
                  <Text style={styles.allMedsSub}>
                    All scheduled doctor doses have been taken. View Med Vault in Health Vault.
                  </Text>
                </View>
              </View>
            )}

            {/* 4. DAMU AI ASSISTANT HERO SECTION (Clean, no 3-icon-row slop, no emojis in chips) */}
            <View style={styles.damuHeroCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Damu Care Assistant</Text>
                <View style={styles.damuStatusBadge}>
                  <Text style={styles.damuStatusBadgeText}>Active</Text>
                </View>
              </View>

              {/* 3D Character Avatar */}
              <View style={styles.damuAvatarWrapper}>
                <DamuAvatar
                  mode="idle"
                  size={192}
                  triggerWave={1}
                  testID="home-damu-avatar"
                />
              </View>

              {/* Damu Greeting Speech Bubble */}
              <View style={styles.damuSpeechBubble}>
                <Text style={styles.damuSpeechTitle}>Namaste, {patient.name.split(' ')[0]}</Text>
                <Text style={styles.damuSpeechBody}>
                  I can help explain your glucose logs, doctor instructions, and daily meal plans.
                </Text>
              </View>

              {/* Structured Clean Prompt Options (No 3-icon row, no emojis) */}
              <View style={styles.damuPromptsList}>
                <TouchableOpacity
                  style={styles.damuPromptItem}
                  onPress={() => navigateTo(VAULT_ROUTES.damu)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.damuPromptText}>Review journey insights and milestones</Text>
                  <ChevronRight color="#0F766E" size={16} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.damuPromptItem}
                  onPress={() => navigateTo(VAULT_ROUTES.damu)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.damuPromptText}>Prepare questions for Dr. Choudhary</Text>
                  <ChevronRight color="#0F766E" size={16} />
                </TouchableOpacity>
              </View>

              {/* Action Button: Talk with Damu */}
              <TouchableOpacity
                style={styles.damuCtaButton}
                onPress={() => navigateTo(VAULT_ROUTES.damu)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Talk to Damu AI Health Companion"
              >
                <MessageSquare color="#FFFFFF" size={16} />
                <Text style={styles.damuCtaButtonText}>Chat with Damu</Text>
              </TouchableOpacity>
            </View>

            {/* 5. TODAY'S DOCTOR CARE PLAN & TASKS */}
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeaderRow}
                onPress={() => navigateTo(VAULT_ROUTES.tasks)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={styles.cardSectionTitle}>Today's Care Plan</Text>
                  <Text style={styles.cardSub}>Prescribed by {patient.primaryClinician}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.progressBadge}>
                    {completedTasksCount} of {totalTasksCount} Completed ({taskPercentage}%)
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${taskPercentage}%` }]} />
              </View>

              {pendingTasks.length > 0 ? (
                <View style={styles.tasksList}>
                  {pendingTasks.slice(0, 3).map((task) => (
                    <View key={task.id} style={styles.taskItemRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <Text style={styles.taskDue}>
                          Due: {new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.taskCompleteBtn}
                        onPress={() => handleCompleteTask(task.id)}
                        activeOpacity={0.8}
                      >
                        <Check color="#0F766E" size={14} strokeWidth={2.5} />
                        <Text style={styles.taskCompleteBtnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.allDoneRow}>
                  <CheckCircle2 color="#059669" size={18} />
                  <Text style={styles.allDoneText}>All scheduled care tasks completed for today.</Text>
                </View>
              )}
            </View>

            {/* 6. DOCTOR'S CLINICAL SUMMARY */}
            {doctorNote && (
              <View style={styles.doctorNoteCard}>
                <View style={styles.doctorNoteHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorNoteDoctor}>{doctorNote.clinicianName}</Text>
                    <Text style={styles.doctorNoteFacility}>
                      {doctorNote.facilityName || 'Apollo Sugar Clinic'} • {new Date(doctorNote.approvedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.approvedPill}>
                    <Text style={styles.approvedPillText}>Verified Note</Text>
                  </View>
                </View>
                <Text style={styles.doctorNoteBody} numberOfLines={3}>
                  {doctorNote.plan || doctorNote.assessment || doctorNote.approvedNoteText || 'Consultation completed and approved by treating physician.'}
                </Text>
                <TouchableOpacity
                  style={styles.doctorNoteLink}
                  onPress={() => navigateTo(VAULT_ROUTES.consultation)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doctorNoteLinkText}>View consultation history →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 7. BOOK AN APPOINTMENT (Apollo Sugar Clinic) */}
            <TouchableOpacity
              style={styles.appointmentCtaCard}
              onPress={() => navigateTo(VAULT_ROUTES.appointments)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Book an Appointment with your endocrinologist"
            >
              <View style={styles.appointmentCtaIconBox}>
                <Calendar color="#FFFFFF" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.appointmentCtaTitle}>Consultation & Follow-up</Text>
                <Text style={styles.appointmentCtaSub}>
                  Book appointment with Apollo endocrinologists.
                </Text>
              </View>
              <ChevronRight color="#FFFFFF" size={18} />
            </TouchableOpacity>

            {/* 8. EMERGENCY SOS & SAFETY BAR (Crisp, High Contrast) */}
            <TouchableOpacity
              style={styles.sosQuickBar}
              onPress={() => navigateTo(VAULT_ROUTES.sos)}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Emergency SOS and Alarms"
            >
              <View style={styles.sosIconBox}>
                <ShieldAlert color="#DC2626" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sosQuickTitle}>Emergency SOS & Care Alerts</Text>
                <Text style={styles.sosQuickSub}>
                  Care team alerts, emergency contacts & 112 guidance
                </Text>
              </View>
              <ChevronRight color="#991B1B" size={18} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: { flex: 1, marginRight: 12 },
  greetingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerMeta: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 3,
  },
  notificationBell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeCount: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  // Base Card Header
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  // Hero Glycemic Card
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...theme.shadows.card,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillOptimal: { backgroundColor: '#ECFDF5' },
  pillElevated: { backgroundColor: '#FFFBEB' },
  pillHigh: { backgroundColor: '#FFF7ED' },
  pillCritical: { backgroundColor: '#FEF2F2' },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  textOptimal: { color: '#059669' },
  textElevated: { color: '#B45309' },
  textHigh: { color: '#C2410C' },
  textCritical: { color: '#B91C1C' },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  bigNumber: {
    fontSize: 38,
    fontWeight: '900',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  unitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
  },
  contextText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  heroFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  heroFooterLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
  },
  emptyGlucoseState: {
    paddingVertical: 6,
  },
  emptyGlucoseTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyGlucoseSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  // Upcoming Prescribed Medication Card
  actionCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...theme.shadows.card,
  },
  actionCardContent: {
    marginBottom: 14,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  verifiedTag: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  takeDoseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    minHeight: 48,
    borderRadius: 12,
  },
  takeDoseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  allMedsCompleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  allMedsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  allMedsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  // Damu AI Assistant Card
  damuHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    ...theme.shadows.card,
  },
  damuStatusBadge: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  damuStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  damuAvatarWrapper: {
    width: 208,
    height: 208,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 8,
  },
  damuSpeechBubble: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
    marginBottom: 12,
  },
  damuSpeechTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  damuSpeechBody: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  damuPromptsList: {
    width: '100%',
    gap: 8,
    marginBottom: 14,
  },
  damuPromptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  damuPromptText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  damuCtaButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    minHeight: 48,
    borderRadius: 12,
  },
  damuCtaButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Care Plan Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...theme.shadows.card,
  },
  progressBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 3,
  },
  tasksList: {
    gap: 8,
    marginTop: 4,
  },
  taskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  taskDue: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  taskCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  taskCompleteBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
  },
  allDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  allDoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  // Doctor Note Card
  doctorNoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...theme.shadows.card,
  },
  doctorNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  doctorNoteDoctor: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  doctorNoteFacility: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  approvedPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  approvedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
  },
  doctorNoteBody: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 10,
  },
  doctorNoteLink: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  doctorNoteLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
  },
  // Appointment CTA Card
  appointmentCtaCard: {
    backgroundColor: '#0F766E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appointmentCtaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#115E59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentCtaTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  appointmentCtaSub: {
    fontSize: 12,
    color: '#CCFBF1',
    marginTop: 2,
    lineHeight: 16,
  },
  // Emergency SOS bar
  sosQuickBar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sosIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosQuickTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  sosQuickSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
});
