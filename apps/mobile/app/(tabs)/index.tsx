import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Plus,
  FileUp,
  MessageSquare,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  HeartHandshake,
} from 'lucide-react-native';
import {
  clinicalStore,
  subscribeToClinicalStore,
  GlucoseRecord,
  CareTask,
  Appointment,
} from '../../src/api/client';
import { StateView, SyncBanner } from '../../components/ui/StateView';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    return subscribeToClinicalStore(() => setTick((t) => t + 1));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await clinicalStore.syncWithBackend();
    setRefreshing(false);
  };

  const syncState = clinicalStore.syncState;
  const patient = clinicalStore.patient;
  const isDoctor = patient.role === 'DOCTOR';
  const isCaregiver = patient.role === 'CAREGIVER';

  // --- Patient Data ---
  const observations: GlucoseRecord[] = clinicalStore.observations;
  const latestReading: GlucoseRecord | undefined = observations[0];
  const pendingReports = clinicalStore.reports.filter(
    (report) => report.status === 'PENDING_PA_REVIEW',
  );
  const upcomingAppointment: Appointment | undefined = clinicalStore.appointments.find((a) => a.status === 'UPCOMING');
  const { completed, total, percentage } = clinicalStore.calculateTaskProgress();
  const nextTask: CareTask | undefined = clinicalStore.tasks.find((t) => !t.completed);
  const activeCaregiverTarget = clinicalStore.caregivers.find((c) => c.active);

  // ============================================================================
  // DOCTOR DASHBOARD
  // ============================================================================
  if (isDoctor) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingTitle}>Dr. {patient.name.split(' ')[0]}</Text>
            <Text style={styles.greetingSub}>Clinical Dashboard</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <CheckCircle2 color={theme.colors.primary} size={14} />
            <Text style={styles.verifiedBadgeText}>Verified Provider</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 84 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          {/* NEO Ambient AI Scribe */}
          <View style={styles.neoCard}>
            <View style={styles.neoHeaderRow}>
              <Text style={styles.neoTitle}>NEO Ambient Scribe</Text>
            </View>
            <Text style={styles.neoDesc}>
              Audio recording and transcription are not available in this mobile dashboard. No recording is active and no note has been created. Use the authenticated clinician web desk when it is configured.
            </Text>

            <View style={styles.neoMicContainer} accessibilityRole="text" accessibilityLabel="NEO recording unavailable in mobile">
              <Text style={styles.neoStatusText}>Unavailable in this mobile client</Text>
            </View>
          </View>

          {/* Quick Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statBig}>12</Text>
              <Text style={styles.statLabel}>Today's Patients</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statBig}>{pendingReports.length}</Text>
              <Text style={styles.statLabel}>Lab Approvals</Text>
            </View>
          </View>

          {/* PA Review Queue Reminder */}
          {pendingReports.length > 0 && (
            <TouchableOpacity
              style={styles.doctorActionCard}
              onPress={() => router.push('/(tabs)/health')}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorActionTitle}>Review Lab Reports</Text>
                <Text style={styles.doctorActionSub}>{pendingReports.length} reports are awaiting your clinical sign-off.</Text>
              </View>
              <ChevronRight color={theme.colors.textPlaceholder} size={20} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================================================
  // PATIENT / CAREGIVER DASHBOARD
  // ============================================================================
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greetingTitle}>Namaste, {patient.name.split(' ')[0]}</Text>
          <Text style={styles.greetingSub}>{isCaregiver ? 'Caregiver Mode' : patient.condition}</Text>
        </View>
        <View style={patient.abhaLinked ? styles.verifiedBadge : styles.offlineBadge}>
          <Text style={patient.abhaLinked ? styles.verifiedBadgeText : styles.offlineBadgeText}>
            {patient.abhaLinked ? 'ABDM Active' : 'Offline Mode'}
          </Text>
        </View>
      </View>

      <SyncBanner
        status={syncState.status}
        isDemoMode={clinicalStore.isDemoMode}
        lastUpdated={syncState.lastSyncedAt}
        pendingSyncCount={syncState.pendingSyncCount}
        onRetrySync={() => clinicalStore.syncWithBackend()}
        onExitDemo={() => clinicalStore.setDemoMode(false)}
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 84 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Active Caregiver Target Banner */}
        {isCaregiver && activeCaregiverTarget && (
          <View style={styles.caregiverBanner}>
            <HeartHandshake color={theme.colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cgBannerTitle}>Managing Care: {activeCaregiverTarget.name}</Text>
              <Text style={styles.cgBannerSub}>All recorded data will be saved to their profile.</Text>
            </View>
          </View>
        )}

        {/* Latest Reading Hero Card */}
        {latestReading ? (
          <TouchableOpacity
            style={styles.heroCard}
            onPress={() => router.push('/(tabs)/health')}
            activeOpacity={0.9}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.heroSectionTag}>LATEST BLOOD GLUCOSE</Text>
              <View style={[styles.statusPill, latestReading.status === 'ELEVATED' ? styles.statusPillWarn : styles.statusPillGood]}>
                {latestReading.status === 'NORMAL' || latestReading.status === 'OPTIMAL' ? (
                  <TrendingDown color={theme.colors.success} size={13} />
                ) : (
                  <TrendingUp color={theme.colors.warning} size={13} />
                )}
                <Text style={[styles.statusPillText, latestReading.status === 'ELEVATED' ? styles.textWarn : styles.textGood]}>
                  {latestReading.status === 'NORMAL' || latestReading.status === 'OPTIMAL' ? 'In Target' : 'Elevated'}
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.bigNumber}>{latestReading.value}</Text>
              <Text style={styles.unitText}>mg/dL</Text>
            </View>

            <Text style={styles.contextText}>
              {latestReading.type === 'FASTING' ? 'Morning Fasting' : latestReading.type === 'POST_MEAL_2HR' ? '2 Hours After Meal' : 'Random Check'} • {latestReading.date}, {latestReading.time}
            </Text>

            <View style={styles.heroFooter}>
              <Text style={styles.heroFooterLink}>View all readings in Health Vault →</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <StateView
            state="empty"
            title="No Glucose Readings Recorded"
            message="Start tracking your morning fasting or after-meal readings to view live trends."
            ctaText="+ Record Blood Sugar"
            onCtaPress={() => router.push('/(tabs)/health')}
          />
        )}

        {/* Quick Actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/health')} activeOpacity={0.85}>
            <View style={styles.actionIconBox}>
              <Plus color={theme.colors.primary} size={20} />
            </View>
            <Text style={styles.actionLabel}>Record Sugar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/health')} activeOpacity={0.85}>
            <View style={styles.actionIconBox}>
              <FileUp color={theme.colors.primary} size={20} />
            </View>
            <Text style={styles.actionLabel}>Upload Report</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/ask-damu')} activeOpacity={0.85}>
            <View style={styles.actionIconBox}>
              <MessageSquare color={theme.colors.primary} size={20} />
            </View>
            <Text style={styles.actionLabel}>Ask Damu</Text>
          </TouchableOpacity>
        </View>

        {/* Care Plan Adherence */}
        <TouchableOpacity style={styles.card} onPress={() => router.push('/(tabs)/tasks')} activeOpacity={0.85}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Today's Care Plan</Text>
            <Text style={styles.progressText}>
              {completed} of {total} Done ({percentage}%)
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
          </View>
          {nextTask ? (
            <View style={styles.nextTaskRow}>
              <Clock color={theme.colors.textMuted} size={13} />
              <Text style={styles.nextTaskText} numberOfLines={1}>
                Next: {nextTask.title} ({nextTask.time})
              </Text>
            </View>
          ) : (
            <Text style={styles.allDoneText}>✓ All scheduled care tasks completed for today!</Text>
          )}
        </TouchableOpacity>

        {/* Upcoming Consultation */}
        {upcomingAppointment ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Upcoming Consultation</Text>
              <View style={styles.badgeOrange}>
                <Text style={styles.badgeOrangeText}>Scheduled</Text>
              </View>
            </View>
            <Text style={styles.doctorName}>{upcomingAppointment.doctorName}</Text>
            <Text style={styles.doctorMeta}>{upcomingAppointment.specialty} • {upcomingAppointment.hospital}</Text>
            <Text style={styles.appointmentTime}>📅 {upcomingAppointment.date} at {upcomingAppointment.time}</Text>
            <TouchableOpacity style={styles.consultButton} onPress={() => router.push('/(tabs)/consultation')} activeOpacity={0.85}>
              <Calendar color={theme.colors.primary} size={15} />
              <Text style={styles.consultButtonText}>Consultation Preparation & Checklist →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <StateView
            state="empty"
            title="No Upcoming Consultations"
            message="You have no doctor appointments scheduled. Check back or connect with your clinic."
            ctaText="Connect With Doctor"
            onCtaPress={() => router.push('/(tabs)/consultation')}
          />
        )}
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
    backgroundColor: theme.colors.white,
  },
  headerLeft: { flex: 1, marginRight: theme.spacing.md },
  greetingTitle: { fontSize: theme.typography.sizes.heading, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  greetingSub: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.textMuted, marginTop: 2, fontWeight: theme.typography.weights.semibold },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  verifiedBadgeText: { fontSize: theme.typography.sizes.caption, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  offlineBadge: { backgroundColor: theme.colors.cardMuted, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.md },
  offlineBadgeText: { fontSize: theme.typography.sizes.caption, fontWeight: theme.typography.weights.semibold, color: theme.colors.textMuted },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.bg },
  // Common Cards
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  cardTitle: { fontSize: theme.typography.sizes.bodyLg, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  // Caregiver Banner
  caregiverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.primarySurface,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  cgBannerTitle: { fontSize: theme.typography.sizes.body, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary },
  cgBannerSub: { fontSize: theme.typography.sizes.caption, color: theme.colors.primaryDark, marginTop: 2 },
  // Hero Card
  heroCard: { backgroundColor: theme.colors.white, borderRadius: theme.radius.xl, padding: theme.spacing.xl, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.card },
  heroSectionTag: { fontSize: 11, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, letterSpacing: 0.6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.sm },
  statusPillGood: { backgroundColor: theme.colors.successBg },
  statusPillWarn: { backgroundColor: theme.colors.warningBg },
  statusPillText: { fontSize: 11, fontWeight: theme.typography.weights.bold },
  textGood: { color: theme.colors.success },
  textWarn: { color: theme.colors.warning },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 4 },
  bigNumber: { fontSize: 44, fontWeight: theme.typography.weights.black, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  unitText: { fontSize: 18, color: theme.colors.textSecondary, fontWeight: theme.typography.weights.bold },
  contextText: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.textSecondary, marginTop: 4, fontWeight: theme.typography.weights.medium },
  heroFooter: { marginTop: theme.spacing.lg, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  heroFooterLink: { fontSize: theme.typography.sizes.bodySm, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  // Actions Grid
  actionsGrid: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { flex: 1, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, minHeight: 82, justifyContent: 'center' },
  actionIconBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionLabel: { fontSize: theme.typography.sizes.caption, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  // Progress & Appointments
  progressText: { fontSize: theme.typography.sizes.caption, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  progressBarTrack: { height: 8, backgroundColor: theme.colors.cardMuted, borderRadius: 4, marginVertical: 12, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 4 },
  nextTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextTaskText: { fontSize: theme.typography.sizes.caption, color: theme.colors.textSecondary, flex: 1, fontWeight: theme.typography.weights.medium },
  allDoneText: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.success, fontWeight: theme.typography.weights.bold },
  badgeOrange: { backgroundColor: theme.colors.accentLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.xs },
  badgeOrangeText: { fontSize: 11, fontWeight: theme.typography.weights.extrabold, color: theme.colors.accent },
  doctorName: { fontSize: theme.typography.sizes.bodyLg, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text, marginTop: 4 },
  doctorMeta: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.textMuted, marginTop: 2 },
  appointmentTime: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.textSecondary, marginTop: 6, fontWeight: theme.typography.weights.semibold },
  consultButton: { backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 14, borderWidth: 1, borderColor: theme.colors.primaryBorder },
  consultButtonText: { color: theme.colors.primary, fontSize: theme.typography.sizes.bodySm, fontWeight: theme.typography.weights.bold },
  // DOCTOR SCRIBE STYLES
  neoCard: { backgroundColor: theme.colors.bg, borderRadius: theme.radius.lg, padding: theme.spacing.xl, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  neoHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  neoTitle: { fontSize: theme.typography.sizes.headingSm, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  neoDesc: { fontSize: theme.typography.sizes.bodySm, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  neoMicContainer: { alignItems: 'center', justifyContent: 'center' },
  neoStatusText: { fontSize: theme.typography.sizes.bodySm, fontWeight: theme.typography.weights.bold, color: theme.colors.primary, marginTop: 16 },
  statsGrid: { flexDirection: 'row', gap: theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  statBig: { fontSize: 32, fontWeight: theme.typography.weights.black, color: theme.colors.primary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: theme.typography.sizes.caption, color: theme.colors.textMuted, marginTop: 4, fontWeight: theme.typography.weights.bold },
  doctorActionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.white, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  doctorActionTitle: { fontSize: theme.typography.sizes.body, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  doctorActionSub: { fontSize: theme.typography.sizes.caption, color: theme.colors.textMuted, marginTop: 4 },
});