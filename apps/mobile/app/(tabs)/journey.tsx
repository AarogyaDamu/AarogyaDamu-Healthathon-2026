import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import {
  Calendar,
  ShieldCheck,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Check,
  Stethoscope,
  Target,
  FileText,
  Sparkles,
} from 'lucide-react-native';
import {
  clinicalStore,
  subscribeToClinicalStore,
  PreventiveCheckup,
} from '../../src/api/client';
import {
  journeyApi,
  type MobileJourneyTimeline,
  type MobileDailyJourney,
  type MobileJourneyFollowUp,
} from '../../src/api/journey';
import { theme } from '../../src/theme';

type JourneyTab = 'STAGES' | 'DAILY' | 'TRENDS' | 'FOLLOW_UP';

export default function JourneyScreen() {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<JourneyTab>('STAGES');

  // Backend Journey Data
  const [timelineData, setTimelineData] = useState<MobileJourneyTimeline | null>(null);
  const [dailyData, setDailyData] = useState<MobileDailyJourney | null>(null);
  const [followUpData, setFollowUpData] = useState<MobileJourneyFollowUp | null>(null);

  // Trends controls
  const [periodDays, setPeriodDays] = useState<14 | 30 | 90>(30);
  const [metricTab, setMetricTab] = useState<'GLUCOSE' | 'HBA1C'>('GLUCOSE');

  const loadServerData = useCallback(async () => {
    try {
      const [tData, dData, fData] = await Promise.all([
        journeyApi.getTimeline(),
        journeyApi.getDaily(),
        journeyApi.getFollowUp(),
      ]);
      setTimelineData(tData);
      setDailyData(dData);
      setFollowUpData(fData);
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServerData();
    return subscribeToClinicalStore(() => setTick((t) => t + 1));
  }, [loadServerData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadServerData();
    clinicalStore.notify();
    setRefreshing(false);
  };

  const observations = clinicalStore.observations;
  const checkups: PreventiveCheckup[] = clinicalStore.checkups;

  // Real previous-period comparison
  const { currentAvg, comparisonLabel } = useMemo(() => {
    const now = Date.now();
    const periodMs = periodDays * 86400000;
    const currentPool = observations.filter((o) => o.timestamp >= now - periodMs);
    const prevPool = observations.filter((o) => o.timestamp < now - periodMs && o.timestamp >= now - periodMs * 2);

    const cAvg = currentPool.length > 0 ? Math.round(currentPool.reduce((a, b) => a + b.value, 0) / currentPool.length) : 0;
    const pAvg = prevPool.length > 0 ? Math.round(prevPool.reduce((a, b) => a + b.value, 0) / prevPool.length) : 0;

    let delta = 0;
    let label = 'Based on live records';
    if (cAvg > 0 && pAvg > 0) {
      delta = cAvg - pAvg;
      label = delta <= 0 ? `${Math.abs(delta)} mg/dL lower than previous period` : `${delta} mg/dL higher than previous period`;
    } else if (cAvg > 0) {
      label = `Based on ${currentPool.length} verified readings`;
    }

    return { currentAvg: cAvg, comparisonLabel: label };
  }, [observations, periodDays]);

  const filteredReadings = useMemo(() => {
    const now = Date.now();
    const cutoff = now - periodDays * 86400000;
    const list = observations.filter((o) => o.timestamp >= cutoff);
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [observations, periodDays]);

  // SVG Chart
  const renderTrendsChart = () => {
    const data = filteredReadings;
    const chartWidth = screenWidth - 64;
    const chartHeight = 140;
    const padX = 28;
    const padY = 20;

    if (data.length < 2) {
      return (
        <View style={styles.chartEmpty}>
          <Activity color={theme.colors.textMuted} size={28} />
          <Text style={styles.chartEmptyText}>Log at least 2 readings to render trend trajectory</Text>
        </View>
      );
    }

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values, 70);
    const maxVal = Math.max(...values, 180);
    const range = Math.max(maxVal - minVal, 20);

    const getX = (idx: number) => padX + (idx / (data.length - 1)) * (chartWidth - padX * 2);
    const getY = (val: number) => chartHeight - padY - ((val - minVal) / range) * (chartHeight - padY * 2);

    let pathD = `M ${getX(0)},${getY(data[0].value)}`;
    for (let i = 1; i < data.length; i++) {
      pathD += ` L ${getX(i)},${getY(data[i].value)}`;
    }

    return (
      <Svg width={chartWidth} height={chartHeight}>
        <Line x1={padX} y1={getY(140)} x2={chartWidth - padX} y2={getY(140)} stroke="#A7F3D0" strokeWidth="1" strokeDasharray="4 4" />
        <Line x1={padX} y1={getY(70)} x2={chartWidth - padX} y2={getY(70)} stroke="#BFDBFE" strokeWidth="1" strokeDasharray="4 4" />
        <Path d={pathD} fill="none" stroke={theme.colors.primary} strokeWidth="2.5" strokeLinecap="round" />
        {data.map((d, i) => (
          <Circle key={d.id} cx={getX(i)} cy={getY(d.value)} r="4" fill={d.value > 180 ? '#EF4444' : d.value < 70 ? '#3B82F6' : theme.colors.primary} stroke="#FFFFFF" strokeWidth="1.5" />
        ))}
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSuper}>DIABETES CARE JOURNEY</Text>
          <Text style={styles.headerTitle}>Journey Navigator</Text>
        </View>

        {timelineData ? (
          <View style={styles.stageProgressPill}>
            <Compass color="#0F766E" size={13} />
            <Text style={styles.stageProgressPillText}>
              {timelineData.overallProgress.completedCount} of {timelineData.overallProgress.totalStages} Done
            </Text>
          </View>
        ) : null}
      </View>

      {/* Main Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'STAGES' && styles.tabItemActive]} onPress={() => setActiveTab('STAGES')}>
          <Text style={[styles.tabText, activeTab === 'STAGES' && styles.tabTextActive]}>Milestones</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'DAILY' && styles.tabItemActive]} onPress={() => setActiveTab('DAILY')}>
          <Text style={[styles.tabText, activeTab === 'DAILY' && styles.tabTextActive]}>Daily Agenda</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'TRENDS' && styles.tabItemActive]} onPress={() => setActiveTab('TRENDS')}>
          <Text style={[styles.tabText, activeTab === 'TRENDS' && styles.tabTextActive]}>Trends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'FOLLOW_UP' && styles.tabItemActive]} onPress={() => setActiveTab('FOLLOW_UP')}>
          <Text style={[styles.tabText, activeTab === 'FOLLOW_UP' && styles.tabTextActive]}>Follow-up</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />
        ) : activeTab === 'STAGES' ? (
          // -------------------------------------------------------------
          // 1. JOURNEY MILESTONES (CHRONOLOGICAL 9 STAGES)
          // -------------------------------------------------------------
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Care Journey Roadmap</Text>
                <Text style={styles.sectionSub}>Milestones advance only upon verified clinical records</Text>
              </View>
              <View style={styles.pctBadge}>
                <Text style={styles.pctBadgeText}>{timelineData?.overallProgress.completionPercentage ?? 55}%</Text>
              </View>
            </View>

            {/* Stages Timeline List */}
            <View style={styles.stagesList}>
              {(timelineData?.stages ?? []).map((stage, idx) => {
                const isCompleted = stage.status === 'COMPLETED';
                const isCurrent = stage.status === 'CURRENT';
                const isOverdue = stage.status === 'OVERDUE';
                const isUpcoming = stage.status === 'UPCOMING';

                return (
                  <View key={stage.id} style={styles.stageRow}>
                    <View style={styles.stageTrackCol}>
                      <View
                        style={[
                          styles.stageNode,
                          isCompleted && styles.nodeCompleted,
                          isCurrent && styles.nodeCurrent,
                          isOverdue && styles.nodeOverdue,
                          isUpcoming && styles.nodeUpcoming,
                        ]}
                      >
                        {isCompleted ? (
                          <Check color="#FFFFFF" size={12} />
                        ) : (
                          <Text style={[styles.stageOrderNum, isCurrent && styles.textWhite]}>{stage.order}</Text>
                        )}
                      </View>
                      {idx !== (timelineData?.stages.length ?? 0) - 1 && <View style={styles.stageTrackLine} />}
                    </View>

                    <View style={styles.stageBody}>
                      <View style={styles.stageTopRow}>
                        <Text style={styles.stageTitle}>{stage.title}</Text>
                        <View
                          style={[
                            styles.statusTag,
                            isCompleted && styles.tagGood,
                            isCurrent && styles.tagActive,
                            isOverdue && styles.tagWarn,
                            isUpcoming && styles.tagUpcoming,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusTagText,
                              isCompleted && styles.textGood,
                              isCurrent && styles.textActive,
                              isOverdue && styles.textWarn,
                              isUpcoming && styles.textUpcoming,
                            ]}
                          >
                            {stage.status}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.stageDesc}>{stage.description}</Text>

                      {stage.completedAt ? (
                        <Text style={styles.stageMeta}>
                          ✓ Verified: {new Date(stage.completedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {stage.recordType ? ` (${stage.recordType})` : ''}
                        </Text>
                      ) : stage.recordType ? (
                        <Text style={styles.stageMetaPending}>Source: {stage.recordType}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : activeTab === 'DAILY' ? (
          // -------------------------------------------------------------
          // 2. DAILY JOURNEY AGENDAS & TASKS
          // -------------------------------------------------------------
          <View style={{ gap: 14 }}>
            {dailyData?.carePlan ? (
              <View style={styles.carePlanBanner}>
                <View style={styles.bannerTop}>
                  <ShieldCheck color="#059669" size={16} />
                  <Text style={styles.bannerTitle}>Active Plan v{dailyData.carePlan.version}</Text>
                </View>
                <Text style={styles.planHeading}>{dailyData.carePlan.title}</Text>
                {dailyData.carePlan.doctorInstructions ? (
                  <View style={styles.instBox}>
                    <Text style={styles.instLabel}>Physician Instructions:</Text>
                    <Text style={styles.instText}>{dailyData.carePlan.doctorInstructions}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Today's Pending Tasks</Text>
                <Text style={styles.taskCountText}>
                  {dailyData?.summary.completedCount ?? 0} / {dailyData?.summary.totalTasksToday ?? 0} Completed
                </Text>
              </View>

              {(dailyData?.pendingTasks ?? []).length === 0 ? (
                <View style={styles.emptyCard}>
                  <CheckCircle2 color="#059669" size={24} />
                  <Text style={styles.emptyTitle}>All scheduled tasks completed!</Text>
                </View>
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {(dailyData?.pendingTasks ?? []).map((task) => (
                    <View key={task.id} style={styles.taskItem}>
                      <View style={styles.taskBullet} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <Text style={styles.taskTime}>Due today ({task.category})</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {dailyData?.medications && dailyData.medications.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Prescribed Medications</Text>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {dailyData.medications.map((m) => (
                    <View key={m.id} style={styles.medCard}>
                      <Text style={styles.medName}>{m.name}</Text>
                      <Text style={styles.medDose}>{m.dosage} • {m.timing}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : activeTab === 'TRENDS' ? (
          // -------------------------------------------------------------
          // 3. GLYCEMIC TRENDS & ACTUAL VS ESTIMATED
          // -------------------------------------------------------------
          <View style={{ gap: 14 }}>
            <View style={styles.card}>
              <View style={styles.metricSwitcherRow}>
                <TouchableOpacity style={[styles.metricTabBtn, metricTab === 'GLUCOSE' && styles.metricTabBtnActive]} onPress={() => setMetricTab('GLUCOSE')}>
                  <Text style={[styles.metricTabTitle, metricTab === 'GLUCOSE' && styles.metricTabTitleActive]}>Blood Glucose</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.metricTabBtn, metricTab === 'HBA1C' && styles.metricTabBtnActive]} onPress={() => setMetricTab('HBA1C')}>
                  <Text style={[styles.metricTabTitle, metricTab === 'HBA1C' && styles.metricTabTitleActive]}>HbA1c Target</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.comparisonBox}>
                <Text style={styles.comparisonValue}>
                  {metricTab === 'GLUCOSE' ? (currentAvg > 0 ? `${currentAvg} mg/dL` : 'No readings') : 'Goal: < 7.0%'}
                </Text>
                <View style={styles.comparisonBadge}>
                  <Text style={styles.comparisonBadgeText}>{comparisonLabel}</Text>
                </View>
              </View>

              <View style={styles.chartContainer}>{renderTrendsChart()}</View>

              {/* Crucial Clinical Distinction Note */}
              <View style={styles.provenanceNote}>
                <Sparkles color="#0D9488" size={13} />
                <Text style={styles.provenanceText}>
                  Actual self-monitored logs are recorded with provenance timestamps. Estimated A1c is derived from average blood glucose and does not replace a clinical venous lab draw.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Preventive Care Screening</Text>
              <View style={styles.checkupsList}>
                {checkups.map((chk) => (
                  <View key={chk.id} style={styles.checkupCard}>
                    <View style={styles.checkupIconCol}>
                      {chk.status === 'COMPLETED' ? (
                        <CheckCircle2 color={theme.colors.success} size={18} />
                      ) : (
                        <Clock color={theme.colors.warning} size={18} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkupTitle}>{chk.title}</Text>
                      <Text style={styles.checkupDoctor}>{chk.doctor} • {chk.frequency}</Text>
                    </View>
                    <View style={[styles.statusBadge, chk.status === 'COMPLETED' ? styles.badgeGood : styles.badgeWarn]}>
                      <Text style={[styles.statusText, chk.status === 'COMPLETED' ? styles.textGood : styles.textWarn]}>{chk.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          // -------------------------------------------------------------
          // 4. FOLLOW-UP NAVIGATOR & SERVER CONFIRMATIONS
          // -------------------------------------------------------------
          <View style={{ gap: 14 }}>
            {followUpData?.nextReviewDate ? (
              <View style={[styles.reviewCountdownCard, followUpData.isReviewOverdue && styles.reviewOverdueCard]}>
                <View style={styles.reviewHeaderRow}>
                  <Calendar color={followUpData.isReviewOverdue ? '#DC2626' : '#0D9488'} size={18} />
                  <Text style={[styles.reviewHeaderTitle, followUpData.isReviewOverdue && styles.textRed]}>
                    {followUpData.isReviewOverdue ? 'Clinical Review Overdue' : 'Next Clinical Review'}
                  </Text>
                </View>
                <Text style={styles.reviewDateDisplay}>
                  {new Date(followUpData.nextReviewDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={styles.reviewSub}>
                  {followUpData.isReviewOverdue
                    ? 'Your scheduled review date has passed. Please contact your clinician to review your glycemic records.'
                    : `${followUpData.daysUntilReview} days remaining until comprehensive care plan review`}
                </Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Upcoming Consultations</Text>
              {(followUpData?.upcomingAppointments ?? []).length === 0 ? (
                <View style={styles.emptyCard}>
                  <Clock color="#64748B" size={20} />
                  <Text style={styles.emptyTitle}>No appointments scheduled</Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 8 }}>
                  {(followUpData?.upcomingAppointments ?? []).map((appt) => (
                    <View key={appt.id} style={styles.apptCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.apptDoctor}>{appt.doctorName}</Text>
                        <Text style={styles.apptDate}>
                          {new Date(appt.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </Text>
                        <Text style={styles.apptReason}>{appt.reason}</Text>
                      </View>

                      {/* Strict Server Confirmation Badge */}
                      <View style={[styles.serverBadge, appt.isServerConfirmed ? styles.badgeGood : styles.badgeWarn]}>
                        <Text style={[styles.serverBadgeText, appt.isServerConfirmed ? styles.textGood : styles.textWarn]}>
                          {appt.statusLabel}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {followUpData?.assignedClinician ? (
              <View style={styles.card}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Stethoscope color="#0D9488" size={16} />
                    <Text style={styles.sectionTitle}>Attending Clinician</Text>
                  </View>
                  <View style={styles.activeClinicianBadge}>
                    <Text style={styles.activeClinicianText}>Active Assignment</Text>
                  </View>
                </View>
                <Text style={styles.clinicianName}>{followUpData.assignedClinician.name}</Text>
                <Text style={styles.clinicianEmail}>{followUpData.assignedClinician.email}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerSuper: { fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  stageProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stageProgressPillText: { fontSize: 11, fontWeight: '800', color: '#0F766E' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: theme.colors.primary },
  scrollContent: { padding: 16, backgroundColor: '#F8FAFC' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  sectionSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  pctBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  pctBadgeText: { fontSize: 12, fontWeight: '800', color: '#065F46' },
  stagesList: { marginTop: 4 },
  stageRow: { flexDirection: 'row', gap: 12 },
  stageTrackCol: { alignItems: 'center', width: 24 },
  stageNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginTop: 2,
  },
  nodeCompleted: { backgroundColor: '#059669', borderColor: '#059669' },
  nodeCurrent: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  nodeOverdue: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  nodeUpcoming: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  stageOrderNum: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  textWhite: { color: '#FFFFFF' },
  stageTrackLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginVertical: 3 },
  stageBody: { flex: 1, paddingBottom: 16 },
  stageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', flex: 1, marginRight: 6 },
  stageDesc: { fontSize: 11, color: '#475569', marginTop: 3, lineHeight: 16 },
  stageMeta: { fontSize: 10, fontWeight: '700', color: '#059669', marginTop: 4 },
  stageMetaPending: { fontSize: 10, color: '#94A3B8', marginTop: 3 },
  statusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagGood: { backgroundColor: '#ECFDF5' },
  tagActive: { backgroundColor: '#EFF6FF' },
  tagWarn: { backgroundColor: '#FEF2F2' },
  tagUpcoming: { backgroundColor: '#F1F5F9' },
  statusTagText: { fontSize: 9, fontWeight: '800' },
  textGood: { color: '#059669' },
  textActive: { color: '#2563EB' },
  textWarn: { color: '#DC2626' },
  textUpcoming: { color: '#64748B' },
  carePlanBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    gap: 6,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontSize: 11, fontWeight: '800', color: '#0F766E' },
  planHeading: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  instBox: { backgroundColor: '#F0FDFA', padding: 8, borderRadius: 8, marginTop: 4 },
  instLabel: { fontSize: 10, fontWeight: '800', color: '#0F766E' },
  instText: { fontSize: 11, color: '#134E4A', marginTop: 2 },
  taskCountText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  emptyCard: { padding: 18, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  taskItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 },
  taskBullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  taskTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  taskTime: { fontSize: 10, color: '#64748B', marginTop: 1 },
  medCard: { padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  medName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  medDose: { fontSize: 11, color: '#64748B', marginTop: 2 },
  metricSwitcherRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 3, marginBottom: 10 },
  metricTabBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  metricTabBtnActive: { backgroundColor: '#FFFFFF', elevation: 1 },
  metricTabTitle: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  metricTabTitleActive: { color: theme.colors.primary },
  comparisonBox: { marginBottom: 8 },
  comparisonValue: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  comparisonBadge: { alignSelf: 'flex-start', backgroundColor: '#F0FDFA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  comparisonBadgeText: { fontSize: 11, fontWeight: '700', color: '#0F766E' },
  chartContainer: { alignItems: 'center', marginVertical: 8 },
  chartEmpty: { height: 120, alignItems: 'center', justifyContent: 'center', gap: 6 },
  chartEmptyText: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },
  provenanceNote: { flexDirection: 'row', gap: 6, backgroundColor: '#F0FDFA', padding: 8, borderRadius: 8, marginTop: 8 },
  provenanceText: { fontSize: 10, color: '#0F766E', flex: 1, lineHeight: 14 },
  checkupsList: { gap: 8, marginTop: 6 },
  checkupCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 },
  checkupIconCol: { width: 22, alignItems: 'center' },
  checkupTitle: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  checkupDoctor: { fontSize: 10, color: '#64748B', marginTop: 1 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeGood: { backgroundColor: '#ECFDF5' },
  badgeWarn: { backgroundColor: '#FFFBEB' },
  statusText: { fontSize: 10, fontWeight: '800' },
  reviewCountdownCard: { backgroundColor: '#F0FDFA', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#99F6E4', gap: 6 },
  reviewOverdueCard: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewHeaderTitle: { fontSize: 12, fontWeight: '800', color: '#0F766E' },
  textRed: { color: '#DC2626' },
  reviewDateDisplay: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  reviewSub: { fontSize: 11, color: '#475569', lineHeight: 16 },
  apptCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  apptDoctor: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  apptDate: { fontSize: 11, color: '#0F766E', fontWeight: '700', marginTop: 2 },
  apptReason: { fontSize: 11, color: '#64748B', marginTop: 2 },
  serverBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  serverBadgeText: { fontSize: 10, fontWeight: '800' },
  activeClinicianBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeClinicianText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
  clinicianName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  clinicianEmail: { fontSize: 12, color: '#64748B', marginTop: 1 },
});