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
import { router } from 'expo-router';
import Svg, { Path, Circle, Line } from 'react-native-svg';
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
  Pill,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  User,
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
  type MobileJourneyProgressSummary,
  type MobileHealthInsight,
  type MobileJourneyMilestone,
} from '../../src/api/journey';
import { theme } from '../../src/theme';

type JourneyTab = 'OVERVIEW' | 'STAGES' | 'DAILY' | 'TRENDS' | 'FOLLOW_UP';

export default function JourneyScreen() {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<JourneyTab>('OVERVIEW');

  // Backend Journey Data
  const [timelineData, setTimelineData] = useState<MobileJourneyTimeline | null>(null);
  const [dailyData, setDailyData] = useState<MobileDailyJourney | null>(null);
  const [followUpData, setFollowUpData] = useState<MobileJourneyFollowUp | null>(null);
  const [summaryData, setSummaryData] = useState<MobileJourneyProgressSummary | null>(null);
  const [insightsData, setInsightsData] = useState<MobileHealthInsight[]>([]);
  const [milestonesData, setMilestonesData] = useState<MobileJourneyMilestone[]>([]);

  // Trends controls
  const [periodDays, setPeriodDays] = useState<14 | 30 | 90>(30);
  const [metricTab, setMetricTab] = useState<'GLUCOSE' | 'HBA1C'>('GLUCOSE');

  const loadServerData = useCallback(async () => {
    try {
      const [tData, dData, fData, sData, iData, mData] = await Promise.all([
        journeyApi.getTimeline(),
        journeyApi.getDaily(),
        journeyApi.getFollowUp(),
        journeyApi.getSummary(),
        journeyApi.getInsights(),
        journeyApi.getMilestones(),
      ]);
      setTimelineData(tData);
      setDailyData(dData);
      setFollowUpData(fData);
      setSummaryData(sData);
      setInsightsData(iData);
      setMilestonesData(mData);
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
        <Line x1={padX} y1={getY(140)} x2={chartWidth - padX} y2={getY(140)} stroke="#a7f3d0" strokeWidth={1} strokeDasharray="4 4" />
        <Line x1={padX} y1={getY(70)} x2={chartWidth - padX} y2={getY(70)} stroke="#cfe5ff" strokeWidth={1} strokeDasharray="4 4" />
        <Path d={pathD} fill="none" stroke="#004D4D" strokeWidth={2.5} strokeLinecap="round" />
        {data.map((d, i) => (
          <Circle
            key={d.id}
            cx={getX(i)}
            cy={getY(d.value)}
            r={4}
            fill={d.value > 180 ? '#ba1a1a' : d.value < 70 ? '#0284c7' : '#059669'}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        ))}
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header (Alexandria Style) */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSuper}>DIABETES CARE JOURNEY</Text>
          <Text style={styles.headerTitle}>My Journey</Text>
        </View>

        <View style={styles.headerRight}>
          {summaryData ? (
            <View style={styles.stageProgressPill}>
              <Compass color="#004D4D" size={13} />
              <Text style={styles.stageProgressPillText}>
                {summaryData.overallProgress.completedStagesCount} of {summaryData.overallProgress.totalStagesCount} Done
              </Text>
            </View>
          ) : null}
          <View style={styles.avatarCircle}>
            <User color="#ffffff" size={16} />
          </View>
        </View>
      </View>

      {/* 2. Main Tabs (Alexandria Pill Segmented Bar) */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
        >
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'OVERVIEW' && styles.tabItemActive]}
            onPress={() => setActiveTab('OVERVIEW')}
          >
            <Text style={[styles.tabText, activeTab === 'OVERVIEW' && styles.tabTextActive]}>Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'STAGES' && styles.tabItemActive]}
            onPress={() => setActiveTab('STAGES')}
          >
            <Text style={[styles.tabText, activeTab === 'STAGES' && styles.tabTextActive]}>Milestones</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'DAILY' && styles.tabItemActive]}
            onPress={() => setActiveTab('DAILY')}
          >
            <Text style={[styles.tabText, activeTab === 'DAILY' && styles.tabTextActive]}>Daily</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'TRENDS' && styles.tabItemActive]}
            onPress={() => setActiveTab('TRENDS')}
          >
            <Text style={[styles.tabText, activeTab === 'TRENDS' && styles.tabTextActive]}>Trends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'FOLLOW_UP' && styles.tabItemActive]}
            onPress={() => setActiveTab('FOLLOW_UP')}
          >
            <Text style={[styles.tabText, activeTab === 'FOLLOW_UP' && styles.tabTextActive]}>Follow-up</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />
        ) : activeTab === 'OVERVIEW' ? (
          // -------------------------------------------------------------
          // 0. HEALTH PROGRESS DASHBOARD (PHASE 7 PRIMARY VIEW)
          // -------------------------------------------------------------
          <View style={{ gap: 14 }}>
            {/* A. Overall Journey Stage Banner (Alexandria Hero Card) */}
            <View style={styles.overviewHeroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.stageTag}>
                  <View style={styles.stageDot} />
                  <Text style={styles.heroSuperText}>CURRENT CARE STAGE</Text>
                </View>
                <Text style={styles.heroPctText}>{summaryData?.overallProgress.completionPercentage ?? 55}%</Text>
              </View>

              <Text style={styles.heroStageTitle}>
                {summaryData?.overallProgress.currentStageId.replace(/_/g, ' ') || 'Daily Monitoring & Adherence'}
              </Text>

              {summaryData?.carePlanProgress.activePlanTitle ? (
                <Text style={styles.heroSubText}>
                  Plan v{summaryData.carePlanProgress.planVersion}: {summaryData.carePlanProgress.activePlanTitle}
                </Text>
              ) : null}

              {/* Editorial Progress Gauge & Metrics */}
              <View style={styles.gaugeContainer}>
                <View style={styles.gaugeRow}>
                  <View>
                    <Text style={styles.gaugeLabel}>Milestone Completion</Text>
                    <Text style={styles.gaugePct}>
                      {summaryData?.overallProgress.completionPercentage ?? 55}%
                    </Text>
                  </View>
                  <View style={styles.gaugeRight}>
                    <Text style={styles.gaugeTargetLabel}>Clinical Target</Text>
                    <Text style={styles.gaugeTargetVal}>Target HbA1c ≤ 6.7%</Text>
                  </View>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${summaryData?.overallProgress.completionPercentage ?? 55}%` },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* B. Blood Glucose Progress Card */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.iconBox}>
                    <Activity color="#004D4D" size={16} />
                  </View>
                  <Text style={styles.sectionTitle}>Blood Glucose Progress</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveTab('TRENDS')}>
                  <Text style={styles.linkText}>View Chart →</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>30-Day Average</Text>
                  <Text style={styles.metricBigVal}>
                    {summaryData?.glucoseProgress.averageGlucose30Days
                      ? `${summaryData.glucoseProgress.averageGlucose30Days} mg/dL`
                      : 'No Data'}
                  </Text>
                  <Text style={styles.metricSub}>
                    {summaryData?.glucoseProgress.totalReadings30Days ?? 0} reading(s) logged
                  </Text>
                </View>

                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Time-In-Range</Text>
                  <Text style={[styles.metricBigVal, { color: '#059669' }]}>
                    {summaryData?.glucoseProgress.timeInRangePercentage ?? 0}%
                  </Text>
                  <Text style={styles.metricSub}>Target: 70 - 180 mg/dL</Text>
                </View>
              </View>

              {summaryData?.glucoseProgress.trendDelta7Days !== null && (
                <View style={styles.trendRow}>
                  <TrendingUp color="#004D4D" size={14} />
                  <Text style={styles.trendText}>
                    7d vs Prior 7d:{' '}
                    <Text style={{ fontWeight: '800' }}>
                      {(summaryData?.glucoseProgress.trendDelta7Days ?? 0) > 0 ? '+' : ''}
                      {summaryData?.glucoseProgress.trendDelta7Days} mg/dL
                    </Text>{' '}
                    ({summaryData?.glucoseProgress.trendDirection})
                  </Text>
                </View>
              )}

              {summaryData?.glucoseProgress.missingMeasurementAlert ? (
                <View style={styles.warningBanner}>
                  <AlertCircle color="#d97706" size={14} />
                  <Text style={styles.warningText}>{summaryData.glucoseProgress.missingMeasurementAlert}</Text>
                </View>
              ) : null}

              <Text style={styles.nonCausationNote}>
                {summaryData?.glucoseProgress.nonCausationDisclaimer ||
                  'Descriptive measurements only. Fluctuations reflect nutrition, exercise, illness, and medications.'}
              </Text>
            </View>

            {/* C. Medication Adherence Card */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.iconBox, { backgroundColor: '#ecfdf5' }]}>
                    <Pill color="#059669" size={16} />
                  </View>
                  <Text style={styles.sectionTitle}>Medication Adherence</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/medications')}>
                  <Text style={styles.linkText}>Med Vault →</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>30-Day Rate</Text>
                  <Text style={[styles.metricBigVal, { color: '#059669' }]}>
                    {summaryData?.medicationAdherence.adherenceRatePercentage ?? 100}%
                  </Text>
                  <Text style={styles.metricSub}>
                    {summaryData?.medicationAdherence.prescribedMedicinesCount ?? 0} Doctor Prescriptions
                  </Text>
                </View>

                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Doses Breakdown</Text>
                  <Text style={styles.doseBreakdownText}>
                    Taken: {summaryData?.medicationAdherence.takenDosesCount ?? 0}
                  </Text>
                  <Text style={styles.doseBreakdownText}>
                    Skipped: {summaryData?.medicationAdherence.skippedDosesCount ?? 0}
                  </Text>
                  <Text style={styles.doseBreakdownText}>
                    Pending: {summaryData?.medicationAdherence.unconfirmedDosesCount ?? 0}
                  </Text>
                </View>
              </View>
            </View>

            {/* D. Care Plan Progress */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.iconBox, { backgroundColor: '#eef2ff' }]}>
                    <CheckCircle2 color="#4f46e5" size={16} />
                  </View>
                  <Text style={styles.sectionTitle}>Doctor Care Tasks</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')}>
                  <Text style={styles.linkText}>Tasks →</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.taskProgressRow}>
                <Text style={styles.taskProgressNum}>
                  {summaryData?.carePlanProgress.completedTasksCount ?? 0} /{' '}
                  {summaryData?.carePlanProgress.totalTasksAssigned ?? 0} Completed ({summaryData?.carePlanProgress.pendingTasksCount ?? 0} Pending)
                </Text>
                <Text style={styles.taskProgressPct}>
                  {summaryData?.carePlanProgress.completionRatePercentage ?? 100}%
                </Text>
              </View>

              {(summaryData?.carePlanProgress.overdueTasksCount ?? 0) > 0 ? (
                <View style={styles.overdueBanner}>
                  <AlertTriangle color="#ba1a1a" size={14} />
                  <Text style={styles.overdueText}>
                    {summaryData?.carePlanProgress.overdueTasksCount} doctor-assigned task(s) are overdue.
                  </Text>
                </View>
              ) : (
                <Text style={styles.onScheduleText}>All doctor care routines are up to date.</Text>
              )}
            </View>

            {/* E. Health Insights & Observations */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.iconBox, { backgroundColor: '#f0fdfa' }]}>
                    <TrendingUp color="#0f766e" size={16} />
                  </View>
                  <Text style={styles.sectionTitle}>Health Journey Insights</Text>
                </View>
              </View>

              {insightsData.length === 0 ? (
                <Text style={styles.emptySubText}>Log observations to generate validated health insights.</Text>
              ) : (
                <View style={{ gap: 10, marginTop: 4 }}>
                  {insightsData.slice(0, 4).map((ins) => (
                    <View key={ins.id} style={styles.insightCard}>
                      <View style={styles.insightHeaderRow}>
                        <Text style={styles.insightTitle}>{ins.title}</Text>
                        <View style={styles.periodPill}>
                          <Text style={styles.periodPillText}>{ins.periodLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.insightSummary}>{ins.summary}</Text>
                      {ins.suggestedDiscussion ? (
                        <View style={styles.insightDiscussionBox}>
                          <Text style={styles.insightDiscussion}>
                            Discussion Points for Doctor: {ins.suggestedDiscussion}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : activeTab === 'STAGES' ? (
          // -------------------------------------------------------------
          // 1. JOURNEY MILESTONES (CHRONOLOGICAL 9 STAGES)
          // -------------------------------------------------------------
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Care Milestones & Roadmap</Text>
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
                          Verified: {new Date(stage.completedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                <Activity color="#004D4D" size={13} />
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
                        <CheckCircle2 color="#059669" size={18} />
                      ) : (
                        <Clock color="#d97706" size={18} />
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
                  <Calendar color={followUpData.isReviewOverdue ? '#ba1a1a' : '#004D4D'} size={18} />
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
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f2f3f9' }}
                onPress={() => router.push('/(tabs)/tasks')}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: 'Public Sans', fontSize: 13.5, fontWeight: '700', color: '#191c20' }}>Your Care Plan</Text>
                  <Text style={{ fontFamily: 'Inter', fontSize: 11, color: '#737784', marginTop: 2 }}>
                    Doctor-prescribed daily care tasks, instructions & adherence.
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#004D4D', borderRadius: 8 }}>
                  <Text style={{ fontFamily: 'Public Sans', color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Open Plan →</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Upcoming Consultations</Text>
              {(followUpData?.upcomingAppointments ?? []).length === 0 ? (
                <View style={styles.emptyCard}>
                  <Clock color="#737784" size={20} />
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
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.iconBox}>
                      <Stethoscope color="#004D4D" size={16} />
                    </View>
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
  safeArea: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(9, 76, 178, 0.08)',
  },
  headerSuper: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '800',
    color: '#004D4D',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 22,
    fontWeight: '700',
    color: '#191c20',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stageProgressPillText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004D4D',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#004D4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f3f9',
  },
  tabBarScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#eceef3',
  },
  tabItemActive: {
    backgroundColor: '#004D4D',
  },
  tabText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#737784',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  scrollContent: { padding: 16 },

  // Overview Hero Card (Alexandria Editorial Card)
  overviewHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8e37f',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#004D4D',
  },
  heroSuperText: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '800',
    color: '#004D4D',
    letterSpacing: 0.6,
  },
  heroPctText: {
    fontFamily: 'Public Sans',
    fontSize: 18,
    fontWeight: '800',
    color: '#004D4D',
  },
  heroStageTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 18,
    fontWeight: '700',
    color: '#191c20',
    marginTop: 2,
  },
  heroSubText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
  },
  gaugeContainer: {
    backgroundColor: '#f2f3f9',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    gap: 8,
  },
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  gaugeLabel: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#33628b',
    textTransform: 'uppercase',
  },
  gaugePct: {
    fontFamily: 'Public Sans',
    fontSize: 26,
    fontWeight: '800',
    color: '#004D4D',
    marginTop: 2,
  },
  gaugeRight: {
    alignItems: 'flex-end',
  },
  gaugeTargetLabel: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#191c20',
  },
  gaugeTargetVal: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    marginTop: 1,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#e6e8ed',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#004D4D',
    borderRadius: 999,
  },

  // Metric Grids
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#f2f3f9',
    padding: 12,
    borderRadius: 12,
  },
  metricLabel: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#737784',
  },
  metricBigVal: {
    fontFamily: 'Public Sans',
    fontSize: 18,
    fontWeight: '800',
    color: '#191c20',
    marginTop: 4,
  },
  metricSub: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
    marginTop: 2,
  },
  doseBreakdownText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: '#434653',
    marginTop: 2,
  },

  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8f9fc',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
  },
  trendText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#004D4D',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#92400e',
    fontWeight: '600',
  },
  nonCausationNote: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 14,
  },

  // Tasks overview
  taskProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  taskProgressNum: {
    fontFamily: 'Public Sans',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#191c20',
  },
  taskProgressPct: {
    fontFamily: 'Public Sans',
    fontSize: 15,
    fontWeight: '800',
    color: '#004D4D',
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  overdueText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#ba1a1a',
    fontWeight: '700',
  },
  onScheduleText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 8,
  },

  // Insight Cards
  insightCard: {
    backgroundColor: '#f2f3f9',
    borderRadius: 12,
    padding: 12,
  },
  insightHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  insightTitle: {
    fontFamily: 'Public Sans',
    fontSize: 13,
    fontWeight: '700',
    color: '#191c20',
    flex: 1,
  },
  periodPill: {
    backgroundColor: '#e6e8ed',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  periodPillText: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#434653',
  },
  insightSummary: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
    marginTop: 4,
    lineHeight: 16,
  },
  insightDiscussionBox: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
  },
  insightDiscussion: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
  },
  emptySubText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
    fontStyle: 'italic',
    marginTop: 6,
  },
  linkText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
  },

  // Common Card Styles
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 15,
    fontWeight: '700',
    color: '#191c20',
  },
  sectionSub: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
    marginTop: 2,
  },
  pctBadge: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pctBadgeText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '800',
    color: '#004D4D',
  },

  // Stages Timeline Styles
  stagesList: { marginTop: 16 },
  stageRow: { flexDirection: 'row', gap: 14 },
  stageTrackCol: { alignItems: 'center', width: 24 },
  stageNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#eceef3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#c3c6d5',
  },
  nodeCompleted: { backgroundColor: '#059669', borderColor: '#059669' },
  nodeCurrent: { backgroundColor: '#004D4D', borderColor: '#004D4D' },
  nodeOverdue: { backgroundColor: '#ba1a1a', borderColor: '#ba1a1a' },
  nodeUpcoming: { backgroundColor: '#f8f9fc', borderColor: '#e1e2e8' },
  stageOrderNum: { fontFamily: 'Public Sans', fontSize: 10, fontWeight: '800', color: '#737784' },
  textWhite: { color: '#ffffff' },
  stageTrackLine: { width: 2, flex: 1, backgroundColor: '#e6e8ed', marginVertical: 4 },
  stageBody: { flex: 1, paddingBottom: 18 },
  stageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageTitle: { fontFamily: 'Noto Serif', fontSize: 13.5, fontWeight: '700', color: '#191c20', flex: 1 },
  statusTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusTagText: { fontFamily: 'Public Sans', fontSize: 9.5, fontWeight: '800' },
  tagGood: { backgroundColor: '#ecfdf5' },
  textGood: { color: '#059669' },
  tagActive: { backgroundColor: 'rgba(9, 76, 178, 0.08)' },
  textActive: { color: '#004D4D' },
  tagWarn: { backgroundColor: '#fef2f2' },
  textWarn: { color: '#ba1a1a' },
  tagUpcoming: { backgroundColor: '#eceef3' },
  textUpcoming: { color: '#737784' },
  stageDesc: { fontFamily: 'Inter', fontSize: 11, color: '#434653', marginTop: 4, lineHeight: 16 },
  stageMeta: { fontFamily: 'Inter', fontSize: 10, fontWeight: '700', color: '#059669', marginTop: 4 },
  stageMetaPending: { fontFamily: 'Inter', fontSize: 10, color: '#737784', marginTop: 4 },

  // Daily Journey Styles
  carePlanBanner: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontFamily: 'Public Sans', fontSize: 10.5, fontWeight: '800', color: '#059669', letterSpacing: 0.5 },
  planHeading: { fontFamily: 'Noto Serif', fontSize: 16, fontWeight: '700', color: '#191c20', marginTop: 4 },
  instBox: { backgroundColor: '#f2f3f9', padding: 10, borderRadius: 10, marginTop: 8 },
  instLabel: { fontFamily: 'Public Sans', fontSize: 10, fontWeight: '800', color: '#059669' },
  instText: { fontFamily: 'Inter', fontSize: 11.5, color: '#434653', marginTop: 2 },
  taskCountText: { fontFamily: 'Public Sans', fontSize: 11, fontWeight: '700', color: '#737784' },
  emptyCard: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  emptyTitle: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700', color: '#737784' },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: '#f2f3f9',
    borderRadius: 10,
  },
  taskBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004D4D' },
  taskTitle: { fontFamily: 'Public Sans', fontSize: 12, fontWeight: '700', color: '#191c20' },
  taskTime: { fontFamily: 'Inter', fontSize: 10, color: '#737784', marginTop: 2 },
  medCard: { padding: 10, backgroundColor: '#f2f3f9', borderRadius: 10 },
  medName: { fontFamily: 'Public Sans', fontSize: 12, fontWeight: '800', color: '#191c20' },
  medDose: { fontFamily: 'Inter', fontSize: 11, color: '#737784', marginTop: 2 },

  // Trends Tab Styles
  metricSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#eceef3',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  metricTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  metricTabBtnActive: { backgroundColor: '#ffffff', elevation: 1 },
  metricTabTitle: { fontFamily: 'Public Sans', fontSize: 11, fontWeight: '700', color: '#737784' },
  metricTabTitleActive: { color: '#004D4D', fontWeight: '800' },
  comparisonBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  comparisonValue: { fontFamily: 'Public Sans', fontSize: 20, fontWeight: '800', color: '#191c20', fontVariant: ['tabular-nums'] },
  comparisonBadge: { backgroundColor: 'rgba(9, 76, 178, 0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  comparisonBadgeText: { fontFamily: 'Public Sans', fontSize: 10, fontWeight: '800', color: '#004D4D' },
  chartContainer: { alignItems: 'center', paddingVertical: 6 },
  chartEmpty: { height: 140, justifyContent: 'center', alignItems: 'center', gap: 6 },
  chartEmptyText: { fontFamily: 'Inter', fontSize: 11, color: '#737784' },
  provenanceNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f8f9fc',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
  },
  provenanceText: { fontFamily: 'Inter', fontSize: 10, color: '#004D4D', flex: 1, lineHeight: 14 },
  checkupsList: { gap: 8, marginTop: 10 },
  checkupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: '#f2f3f9',
    borderRadius: 10,
  },
  checkupIconCol: { width: 24, alignItems: 'center' },
  checkupTitle: { fontFamily: 'Public Sans', fontSize: 12, fontWeight: '700', color: '#191c20' },
  checkupDoctor: { fontFamily: 'Inter', fontSize: 10, color: '#737784', marginTop: 2 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontFamily: 'Public Sans', fontSize: 9.5, fontWeight: '800' },
  badgeGood: { backgroundColor: '#ecfdf5' },
  badgeWarn: { backgroundColor: '#fffbeb' },

  // Follow-up Tab Styles
  reviewCountdownCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  reviewOverdueCard: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewHeaderTitle: { fontFamily: 'Public Sans', fontSize: 11.5, fontWeight: '800', color: '#004D4D' },
  textRed: { color: '#ba1a1a' },
  reviewDateDisplay: { fontFamily: 'Noto Serif', fontSize: 18, fontWeight: '700', color: '#191c20', marginTop: 6 },
  reviewSub: { fontFamily: 'Inter', fontSize: 11, color: '#737784', marginTop: 4, lineHeight: 16 },
  apptCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f2f3f9',
    borderRadius: 12,
  },
  apptDoctor: { fontFamily: 'Public Sans', fontSize: 13, fontWeight: '700', color: '#191c20' },
  apptDate: { fontFamily: 'Inter', fontSize: 11, color: '#004D4D', fontWeight: '700', marginTop: 2 },
  apptReason: { fontFamily: 'Inter', fontSize: 11, color: '#737784', marginTop: 2 },
  serverBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  serverBadgeText: { fontFamily: 'Public Sans', fontSize: 10, fontWeight: '800' },
  activeClinicianBadge: { backgroundColor: 'rgba(9, 76, 178, 0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeClinicianText: { fontFamily: 'Public Sans', fontSize: 10, fontWeight: '800', color: '#004D4D' },
  clinicianName: { fontFamily: 'Noto Serif', fontSize: 14, fontWeight: '700', color: '#191c20', marginTop: 6 },
  clinicianEmail: { fontFamily: 'Inter', fontSize: 11, color: '#737784', marginTop: 2 },
});
