import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
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
  Plus,
  Mic,
  FileText,
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

  // Initials for avatar
  const initials = patient.name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PT';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. OFFICIAL BRAND TOP BAR */}
      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>

        <View style={styles.headerCenter}>
          <View style={styles.brandTitleRow}>
            <Image
              source={require('../../assets/brand/mark_primary_gradient_512.png')}
              style={styles.headerBrandMark}
              resizeMode="contain"
              accessibilityLabel="AarogyaDamu Mark"
            />
            <Text style={styles.protocolHeaderTitle}>AarogyaDamu</Text>
          </View>
          <Text style={styles.protocolHeaderLabel}>SMARTER CARE. CONNECTED.</Text>
        </View>

        <TouchableOpacity
          style={styles.notificationBell}
          onPress={() => navigateTo('/(tabs)/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Care Team Alerts and Reminders"
          activeOpacity={0.8}
        >
          <Bell color={theme.colors.text} size={20} />
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
        {/* HERO GREETING */}
        <View style={styles.heroGreetingSection}>
          <Text style={styles.heroDateText}>{currentDateStr}</Text>
          <Text style={styles.heroGreetingTitle}>
            {greeting}, {patient.name.split(' ')[0]}
          </Text>
          <Text style={styles.heroGreetingSub}>
            Fasting protocol maintained. Here is your daily clinical status.
          </Text>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Syncing clinical health records...</Text>
          </View>
        ) : (
          <>
            {/* 2. GLUCOSE HEALTH CARD (Hero Clinical Card) */}
            <TouchableOpacity
              style={styles.heroCard}
              onPress={() => navigateTo(VAULT_ROUTES.healthVault)}
              activeOpacity={0.92}
              accessibilityRole="button"
              accessibilityLabel="Latest Blood Glucose Reading"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIndicatorRow}>
                  <View style={styles.liveIndicatorDot} />
                  <Text style={styles.cardSectionTitle}>Blood Glucose Monitor</Text>
                </View>

                <View style={styles.headerPill}>
                  <Text style={styles.headerPillText}>
                    {latestReading ? `${latestReading.context.replace(/_/g, ' ')} • ${formatElapsedTime(latestReading.observedAt)}` : 'Fasting Protocol'}
                  </Text>
                </View>
              </View>

              {latestReading ? (
                <>
                  <View style={styles.metricRow}>
                    <Text style={styles.bigNumber}>{latestReading.numericValue}</Text>
                    <Text style={styles.unitText}>{latestReading.unit}</Text>
                  </View>

                  <View style={styles.trendRow}>
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
                      <TrendingDown size={14} color={isCritical ? theme.colors.error : isHigh ? theme.colors.mascotOrange : isElevated ? theme.colors.tertiary : theme.colors.secondary} />
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
                        {isCritical ? 'Critical Level' : isHigh ? 'Elevated Range' : isElevated ? 'Above Baseline' : 'In Target Range (70–140 mg/dL)'}
                      </Text>
                    </View>
                  </View>

                  {/* Time in Range Mini-Summary Bar */}
                  <View style={styles.tirBarContainer}>
                    <View style={styles.tirHeaderRow}>
                      <Text style={styles.tirTitle}>82% Time in Range</Text>
                      <Text style={styles.tirMeta}>Last 7 Days</Text>
                    </View>
                    <View style={styles.tirBarTrack}>
                      <View style={[styles.tirSegment, { width: '82%', backgroundColor: theme.colors.primary }]} />
                      <View style={[styles.tirSegment, { width: '12%', backgroundColor: theme.colors.tertiaryContainer }]} />
                      <View style={[styles.tirSegment, { width: '6%', backgroundColor: theme.colors.errorBg }]} />
                    </View>
                    <View style={styles.tirLegendRow}>
                      <View style={styles.tirLegendItem}>
                        <View style={[styles.tirLegendDot, { backgroundColor: theme.colors.primary }]} />
                        <Text style={styles.tirLegendText}>82% In-range</Text>
                      </View>
                      <View style={styles.tirLegendItem}>
                        <View style={[styles.tirLegendDot, { backgroundColor: theme.colors.tertiaryContainer }]} />
                        <Text style={styles.tirLegendText}>12% Elevated</Text>
                      </View>
                      <View style={styles.tirLegendItem}>
                        <View style={[styles.tirLegendDot, { backgroundColor: theme.colors.errorBg }]} />
                        <Text style={styles.tirLegendText}>6% High</Text>
                      </View>
                    </View>
                  </View>

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

            {/* 3. NEXT PRESCRIBED MEDICATION CARD */}
            {nextMedication ? (
              <View style={styles.actionCardContainer}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIndicatorRow}>
                    <Pill size={18} color={theme.colors.secondary} />
                    <Text style={styles.medCardSectionTitle}>Next Prescription</Text>
                  </View>
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

                <View style={styles.medActionsRow}>
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

                  <TouchableOpacity
                    style={styles.viewRegimenBtn}
                    onPress={() => navigateTo(VAULT_ROUTES.medications)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.viewRegimenBtnText}>View Regimen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.allMedsCompleteCard}>
                <CheckCircle2 color={theme.colors.success} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.allMedsTitle}>Prescriptions Up to Date</Text>
                  <Text style={styles.allMedsSub}>
                    All scheduled doctor doses have been taken. View Med Vault in Health Vault.
                  </Text>
                </View>
              </View>
            )}

            {/* 4. DAMU AI ASSISTANT HERO WIDGET */}
            <View style={styles.damuHeroCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIndicatorRow}>
                  <View style={styles.damuMonogram}>
                    <Sparkles size={16} color={theme.colors.mascotOrange} />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardSectionTitle}>Damu AI Companion</Text>
                      <View style={styles.damuActiveDot} />
                    </View>
                    <Text style={styles.damuRoleSubtitle}>Clinical Insights Agent</Text>
                  </View>
                </View>
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

              {/* Damu Conversational Speech Bubble */}
              <View style={styles.damuSpeechBubble}>
                <Text style={styles.damuSpeechTitle}>Namaste, {patient.name.split(' ')[0]}</Text>
                <Text style={styles.damuSpeechBody}>
                  “I can help explain your glucose logs, doctor instructions, and daily meal plans.”
                </Text>
              </View>

              {/* Action Prompts */}
              <View style={styles.damuPromptsList}>
                <TouchableOpacity
                  style={styles.damuPromptItem}
                  onPress={() => navigateTo(VAULT_ROUTES.damu)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.damuPromptText}>Review journey insights and milestones</Text>
                  <ChevronRight color={theme.colors.primary} size={16} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.damuPromptItem}
                  onPress={() => navigateTo(VAULT_ROUTES.damu)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.damuPromptText}>Prepare questions for {patient.primaryClinician}</Text>
                  <ChevronRight color={theme.colors.primary} size={16} />
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
                <View style={styles.progressPill}>
                  <Text style={styles.progressBadge}>
                    {taskPercentage}%
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
                        <Check color={theme.colors.primary} size={14} strokeWidth={2.5} />
                        <Text style={styles.taskCompleteBtnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.allDoneRow}>
                  <CheckCircle2 color={theme.colors.success} size={18} />
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
                <ShieldAlert color={theme.colors.error} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sosQuickTitle}>Emergency SOS & Care Alerts</Text>
                <Text style={styles.sosQuickSub}>
                  Care team alerts, emergency contacts & 112 guidance
                </Text>
              </View>
              <ChevronRight color={theme.colors.error} size={18} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderGhost,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  headerCenter: {
    alignItems: 'center',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerBrandMark: {
    width: 20,
    height: 20,
  },
  protocolHeaderLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 1.1,
    marginTop: 2,
  },
  protocolHeaderTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fonts.sans,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  notificationBell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeCount: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.colors.error,
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
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.extrabold,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  heroGreetingSection: {
    paddingVertical: theme.spacing.xs,
  },
  heroDateText: {
    fontSize: theme.typography.sizes.caption,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroGreetingTitle: {
    fontSize: 26,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  heroGreetingSub: {
    fontSize: theme.typography.sizes.bodySm,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.semibold,
  },
  // Base Card Header
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  headerPillText: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  // Hero Glycemic Card
  heroCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  bigNumber: {
    fontSize: 42,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    fontSize: 16,
    fontFamily: theme.typography.fonts.sans,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  pillOptimal: { backgroundColor: 'rgba(9, 76, 178, 0.08)' },
  pillElevated: { backgroundColor: 'rgba(109, 94, 0, 0.1)' },
  pillHigh: { backgroundColor: 'rgba(201, 84, 16, 0.1)' },
  pillCritical: { backgroundColor: 'rgba(186, 26, 26, 0.1)' },
  statusPillText: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
  },
  textOptimal: { color: theme.colors.primary },
  textElevated: { color: theme.colors.tertiary },
  textHigh: { color: theme.colors.mascotOrange },
  textCritical: { color: theme.colors.error },
  tirBarContainer: {
    marginTop: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing.md,
  },
  tirHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tirTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  tirMeta: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
  },
  tirBarTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceContainer,
  },
  tirSegment: {
    height: '100%',
  },
  tirLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  tirLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tirLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tirLegendText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    color: theme.colors.textMuted,
  },
  heroFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderGhost,
  },
  heroFooterLink: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  emptyGlucoseState: {
    paddingVertical: 6,
  },
  emptyGlucoseTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  emptyGlucoseSub: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  // Next Medication Card
  actionCardContainer: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  medCardSectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actionCardContent: {
    marginVertical: 10,
  },
  actionCardTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  actionCardSub: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  verifiedTag: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  verifiedTagText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  medActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  takeDoseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    minHeight: 46,
    borderRadius: theme.borders.radius.lg,
    ...theme.shadows.card,
  },
  takeDoseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
  },
  viewRegimenBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  viewRegimenBtnText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
  },
  allMedsCompleteCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...theme.shadows.card,
  },
  allMedsTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  allMedsSub: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  // Damu AI Assistant Card
  damuHeroCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  damuMonogram: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.mascotCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  damuActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  damuRoleSubtitle: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
  },
  damuStatusBadge: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  damuStatusBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  damuAvatarWrapper: {
    width: 208,
    height: 208,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 4,
  },
  damuSpeechBubble: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
    marginBottom: 12,
  },
  damuSpeechTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  damuSpeechBody: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    fontStyle: 'italic',
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
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.borders.radius.md,
  },
  damuPromptText: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  damuCtaButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    minHeight: 48,
    borderRadius: theme.borders.radius.lg,
    ...theme.shadows.card,
  },
  damuCtaButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
  },
  // Care Plan Card
  card: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  progressPill: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  progressBadge: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 3,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
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
    backgroundColor: theme.colors.surfaceContainerLow,
    padding: 12,
    borderRadius: theme.borders.radius.md,
  },
  taskTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  taskDue: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  taskCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  taskCompleteBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  allDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  allDoneText: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.success,
  },
  // Doctor Note Card
  doctorNoteCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  doctorNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  doctorNoteDoctor: {
    fontSize: 14,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  doctorNoteFacility: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  approvedPill: {
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  approvedPillText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.success,
  },
  doctorNoteBody: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  doctorNoteLink: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderGhost,
    paddingTop: 8,
  },
  doctorNoteLinkText: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  // Appointment CTA Card
  appointmentCtaCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...theme.shadows.card,
  },
  appointmentCtaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentCtaTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: '#FFFFFF',
  },
  appointmentCtaSub: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.sans,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    lineHeight: 16,
  },
  // Emergency SOS bar
  sosQuickBar: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: 'rgba(186, 26, 26, 0.2)',
    borderRadius: theme.borders.radius.xl,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...theme.shadows.card,
  },
  sosIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosQuickTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.error,
  },
  sosQuickSub: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
});
