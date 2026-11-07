import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  Moon,
  Utensils,
  Droplets,
  Smile,
  Plus,
  Clock,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Info,
  Calendar,
  X,
  Edit2,
  Trash2,
  Pill,
  Heart,
  CheckCircle2,
  Sparkles,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  lifestyleApi,
  type MobileLifestyleRecord,
  type MobileLifestyleStats,
  type MobileDigitalHealthTwin,
  type LifestyleCategory,
} from '../../src/api/lifestyle';
import { coordinationApi } from '../../src/api/coordination';
import { useToast } from '../../components/ui/ToastProvider';

export default function LifestyleScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'LOGS' | 'TWIN'>('LOGS');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Lifestyle Records State
  const [records, setRecords] = useState<MobileLifestyleRecord[]>([]);
  const [stats, setStats] = useState<MobileLifestyleStats | null>(null);
  const [twin, setTwin] = useState<MobileDigitalHealthTwin | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | LifestyleCategory>('ALL');

  // Modal: Add Entry State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LifestyleCategory>('PHYSICAL_ACTIVITY');
  const [inputValue, setInputValue] = useState('');
  const [inputUnit, setInputUnit] = useState('MINUTES');
  const [inputQualitative, setInputQualitative] = useState('BRISK_WALKING');
  const [inputNotes, setInputNotes] = useState('');

  // Modal: Edit/Correct Entry State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MobileLifestyleRecord | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    const results = await Promise.allSettled([
      lifestyleApi.getRecords(),
      lifestyleApi.getStats(7),
      lifestyleApi.getDigitalHealthTwin(),
    ]);

    let failed = false;
    const recordsResult = results[0];
    const statsResult = results[1];
    const twinResult = results[2];
    if (recordsResult.status === 'fulfilled') setRecords(recordsResult.value);
    else failed = true;
    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    else failed = true;
    if (twinResult.status === 'fulfilled') setTwin(twinResult.value);
    else failed = true;

    if (failed) {
      showToast('Some lifestyle insights could not be refreshed. Your saved logs remain available.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleCategorySelect = (cat: LifestyleCategory) => {
    setSelectedCategory(cat);
    if (cat === 'PHYSICAL_ACTIVITY') {
      setInputUnit('MINUTES');
      setInputQualitative('BRISK_WALKING');
    } else if (cat === 'SLEEP') {
      setInputUnit('HOURS');
      setInputQualitative('RESTFUL');
    } else if (cat === 'HYDRATION') {
      setInputUnit('ML');
      setInputQualitative('WATER');
    } else if (cat === 'NUTRITION') {
      setInputUnit('');
      setInputQualitative('BALANCED_MEAL');
    } else if (cat === 'WELLBEING') {
      setInputUnit('SCORE_1_5');
      setInputQualitative('GOOD');
    }
  };

  const handleCreateEntry = async () => {
    let numVal: number | undefined = undefined;
    if (inputValue.trim()) {
      numVal = parseFloat(inputValue);
      if (isNaN(numVal) || numVal < 0) {
        Alert.alert('Invalid Measurement', 'Please enter a valid positive number.');
        return;
      }
      if (selectedCategory === 'SLEEP' && numVal > 24) {
        Alert.alert('Invalid Sleep Duration', 'Sleep duration cannot exceed 24 hours per entry.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await lifestyleApi.createRecord({
        category: selectedCategory,
        numericValue: numVal,
        unit: inputUnit.trim() || undefined,
        qualitativeValue: inputQualitative.trim() || undefined,
        notes: inputNotes.trim() || undefined,
      });

      showToast(`Logged: ${selectedCategory.replace(/_/g, ' ')}`);
      setIsAddModalOpen(false);
      setInputValue('');
      setInputNotes('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmEdit = async () => {
    if (!editingRecord) return;
    if (!correctionReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for correcting this entry.');
      return;
    }

    let numVal: number | undefined = undefined;
    if (editValue.trim()) {
      numVal = parseFloat(editValue);
      if (isNaN(numVal) || numVal < 0) {
        Alert.alert('Invalid Number', 'Measurement must be a positive number.');
        return;
      }
    }

    setEditSubmitting(true);
    try {
      await lifestyleApi.updateRecord(editingRecord.id, {
        numericValue: numVal,
        notes: editNotes.trim() || undefined,
        reasonForCorrection: correctionReason.trim(),
      });

      showToast('Entry corrected successfully.');
      setIsEditModalOpen(false);
      setEditingRecord(null);
      setCorrectionReason('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update entry');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteEntry = (record: MobileLifestyleRecord) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this lifestyle entry? An audit trail will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await lifestyleApi.deleteRecord(record.id);
              showToast('Entry removed.');
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete entry');
            }
          },
        },
      ]
    );
  };

  const getCategoryIcon = (cat: LifestyleCategory, size = 18) => {
    switch (cat) {
      case 'PHYSICAL_ACTIVITY':
        return <Activity color={theme.colors.primary} size={size} />;
      case 'SLEEP':
        return <Moon color="#6366F1" size={size} />;
      case 'HYDRATION':
        return <Droplets color="#0284C7" size={size} />;
      case 'NUTRITION':
        return <Utensils color="#D97706" size={size} />;
      case 'WELLBEING':
        return <Smile color="#10B981" size={size} />;
    }
  };

  const filteredRecords = records.filter((r) => {
    if (categoryFilter === 'ALL') return true;
    return r.category === categoryFilter;
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.screenTitle}>Lifestyle & Health Twin</Text>
          <Text style={styles.screenSubtitle}>Daily Habits • Activity • Personal Twin</Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setIsAddModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Log Lifestyle Entry"
        >
          <Plus color={theme.colors.white} size={18} />
          <Text style={styles.addButtonText}>Log Activity</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'LOGS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('LOGS')}
        >
          <Activity color={activeTab === 'LOGS' ? theme.colors.primary : '#64748B'} size={16} />
          <Text style={[styles.tabButtonText, activeTab === 'LOGS' && styles.tabButtonTextActive]}>
            Lifestyle Logs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'TWIN' && styles.tabButtonActive]}
          onPress={() => setActiveTab('TWIN')}
        >
          <Sparkles color={activeTab === 'TWIN' ? theme.colors.primary : '#64748B'} size={16} />
          <Text style={[styles.tabButtonText, activeTab === 'TWIN' && styles.tabButtonTextActive]}>
            Digital Health Twin
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 84 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ============================================================== */}
        {/* TAB 1: LIFESTYLE LOGS                                          */}
        {/* ============================================================== */}
        {activeTab === 'LOGS' && (
          <>
            {/* 7-Day Lifestyle Quick Stats */}
            {stats && (
              <View style={styles.statsCard}>
                <Text style={styles.statsCardTitle}>7-Day Habit Summary</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Activity color={theme.colors.primary} size={18} />
                    <Text style={styles.statValue}>
                      {stats.physicalActivity.totalMinutes} min
                    </Text>
                    <Text style={styles.statLabel}>Active Movement</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Moon color="#6366F1" size={18} />
                    <Text style={styles.statValue}>
                      {stats.sleep.averageHoursPerNight !== null
                        ? `${stats.sleep.averageHoursPerNight} h`
                        : 'No logs'}
                    </Text>
                    <Text style={styles.statLabel}>Avg Sleep / Night</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Droplets color="#0284C7" size={18} />
                    <Text style={styles.statValue}>
                      {stats.hydration.dailyAverageMl !== null
                        ? `${stats.hydration.dailyAverageMl} mL`
                        : 'No logs'}
                    </Text>
                    <Text style={styles.statLabel}>Daily Hydration</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Category Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {(
                [
                  'ALL',
                  'PHYSICAL_ACTIVITY',
                  'SLEEP',
                  'HYDRATION',
                  'NUTRITION',
                  'WELLBEING',
                ] as const
              ).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, categoryFilter === f && styles.filterChipActive]}
                  onPress={() => setCategoryFilter(f)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      categoryFilter === f && styles.filterChipTextActive,
                    ]}
                  >
                    {f === 'ALL' ? 'All Records' : f.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Records List */}
            {loading && !refreshing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading lifestyle data...</Text>
              </View>
            ) : filteredRecords.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Activity color={theme.colors.textMuted} size={44} />
                <Text style={styles.emptyTitle}>No Lifestyle Records Found</Text>
                <Text style={styles.emptyMessage}>
                  Track your daily physical activity, sleep, hydration, and nutrition to build a
                  personalized digital health picture.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaButton}
                  onPress={() => setIsAddModalOpen(true)}
                >
                  <Plus color={theme.colors.white} size={16} />
                  <Text style={styles.emptyCtaText}>Log First Activity</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredRecords.map((r) => (
                <View key={r.id} style={styles.recordCard}>
                  <View style={styles.recordHeader}>
                    <View style={styles.recordCategoryRow}>
                      {getCategoryIcon(r.category, 18)}
                      <Text style={styles.recordCategoryTitle}>
                        {r.category.replace(/_/g, ' ')}
                      </Text>
                      <View style={styles.provenancePill}>
                        <Text style={styles.provenancePillText}>
                          {r.source === 'DOCTOR_CLINICAL'
                            ? 'Doctor Clinical'
                            : r.source === 'CAREGIVER_INPUT'
                            ? 'Caregiver Log'
                            : 'Patient Logged'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.recordActionsRow}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingRecord(r);
                          setEditValue(r.numericValue !== null && r.numericValue !== undefined ? String(r.numericValue) : '');
                          setEditNotes(r.notes || '');
                          setCorrectionReason('');
                          setIsEditModalOpen(true);
                        }}
                        style={styles.iconBtn}
                        accessibilityLabel="Edit Entry"
                      >
                        <Edit2 color="#64748B" size={14} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteEntry(r)}
                        style={styles.iconBtn}
                        accessibilityLabel="Delete Entry"
                      >
                        <Trash2 color="#EF4444" size={14} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Value and qualitative details */}
                  <View style={styles.recordDetailsRow}>
                    {r.numericValue !== null && r.numericValue !== undefined && (
                      <Text style={styles.recordMainValue}>
                        {r.numericValue} {r.unit || ''}
                      </Text>
                    )}
                    {r.qualitativeValue && (
                      <Text style={styles.recordQualitative}>
                        • {r.qualitativeValue.replace(/_/g, ' ')}
                      </Text>
                    )}
                  </View>

                  {/* Notes */}
                  {r.notes && <Text style={styles.recordNotes}>{r.notes}</Text>}

                  {/* Reason for correction if edited */}
                  {r.reasonForCorrection && (
                    <View style={styles.correctionBox}>
                      <Info color="#B45309" size={12} />
                      <Text style={styles.correctionText}>
                        Corrected: {r.reasonForCorrection}
                      </Text>
                    </View>
                  )}

                  {/* Timestamp */}
                  <View style={styles.recordFooter}>
                    <Clock color="#94A3B8" size={12} />
                    <Text style={styles.recordDateText}>
                      {new Date(r.recordedAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 2: DIGITAL HEALTH TWIN                                     */}
        {/* ============================================================== */}
        {activeTab === 'TWIN' && (
          <>
            {/* Read-Only Governance Banner */}
            <View style={styles.twinGovernanceCard}>
              <View style={styles.twinGovernanceHeader}>
                <ShieldCheck color="#047857" size={18} />
                <Text style={styles.twinGovernanceTitle}>
                  Personal Digital Health Twin (Read-Only)
                </Text>
              </View>
              <Text style={styles.twinGovernanceDesc}>
                A rule-based aggregation of your recorded vitals, medications, and lifestyle
                habits. AarogyaDamu does not predict future values, simulate diagnoses, or
                autonomously modify medical treatments. Status: PENDING_CLINICIAN_APPROVAL.
              </Text>
            </View>

            {/* Data Quality & Recency Alerts */}
            {twin && twin.dataQualityAlerts.length > 0 && (
              <View style={styles.alertsContainer}>
                {twin.dataQualityAlerts.map((alert, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.alertItem,
                      alert.severity === 'WARNING' ? styles.alertWarning : styles.alertInfo,
                    ]}
                  >
                    {alert.severity === 'WARNING' ? (
                      <AlertTriangle color="#B45309" size={16} />
                    ) : (
                      <Info color="#0284C7" size={16} />
                    )}
                    <Text
                      style={[
                        styles.alertItemText,
                        alert.severity === 'WARNING' ? styles.alertTextWarn : styles.alertTextInfo,
                      ]}
                    >
                      {alert.message}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {twin ? (
              <View style={styles.twinPillars}>
                {/* Pillar 1: Glycemic & Vitals */}
                <View style={styles.pillarCard}>
                  <View style={styles.pillarHeader}>
                    <Heart color="#E11D48" size={18} />
                    <Text style={styles.pillarTitle}>Glycemic & Vitals Profile</Text>
                  </View>

                  {twin.metrics.vitals.hasData ? (
                    <View style={styles.pillarBody}>
                      <View style={styles.vitalStatRow}>
                        <Text style={styles.vitalStatLabel}>14-Day Mean Glucose:</Text>
                        <Text style={styles.vitalStatValue}>
                          {twin.metrics.vitals.glucose.meanMgDl !== null
                            ? `${twin.metrics.vitals.glucose.meanMgDl} mg/dL`
                            : 'No data recorded'}
                        </Text>
                      </View>

                      <View style={styles.vitalStatRow}>
                        <Text style={styles.vitalStatLabel}>Time in Range (70-180 mg/dL):</Text>
                        <Text style={styles.vitalStatValue}>
                          {twin.metrics.vitals.glucose.timeInRangePercent !== null
                            ? `${twin.metrics.vitals.glucose.timeInRangePercent}%`
                            : 'No data recorded'}
                        </Text>
                      </View>

                      {twin.metrics.vitals.bloodPressure.lastReading && (
                        <View style={styles.vitalStatRow}>
                          <Text style={styles.vitalStatLabel}>Latest Blood Pressure:</Text>
                          <Text style={styles.vitalStatValue}>
                            {twin.metrics.vitals.bloodPressure.lastReading.systolic}/
                            {twin.metrics.vitals.bloodPressure.lastReading.diastolic} mmHg
                          </Text>
                        </View>
                      )}

                      {twin.metrics.vitals.hba1c.lastReading && (
                        <View style={styles.vitalStatRow}>
                          <Text style={styles.vitalStatLabel}>Latest Recorded HbA1c:</Text>
                          <Text style={styles.vitalStatValue}>
                            {twin.metrics.vitals.hba1c.lastReading.value}%
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.noDataPlaceholder}>No vital signs recorded yet.</Text>
                  )}
                </View>

                {/* Pillar 2: Lifestyle Habits */}
                <View style={styles.pillarCard}>
                  <View style={styles.pillarHeader}>
                    <Activity color={theme.colors.primary} size={18} />
                    <Text style={styles.pillarTitle}>Lifestyle & Habit Trends</Text>
                  </View>

                  <View style={styles.pillarBody}>
                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>Weekly Physical Activity:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.lifestyle.physicalActivity.totalWeeklyMinutes} min
                      </Text>
                    </View>

                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>Average Sleep Duration:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.lifestyle.sleep.averageHoursPerNight !== null
                          ? `${twin.metrics.lifestyle.sleep.averageHoursPerNight} hrs / night`
                          : 'No data recorded'}
                      </Text>
                    </View>

                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>Average Daily Hydration:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.lifestyle.hydration.dailyAverageMl !== null
                          ? `${twin.metrics.lifestyle.hydration.dailyAverageMl} mL`
                          : 'No data recorded'}
                      </Text>
                    </View>

                    {twin.metrics.lifestyle.wellbeing.recentStatus && (
                      <View style={styles.vitalStatRow}>
                        <Text style={styles.vitalStatLabel}>Recent Wellbeing State:</Text>
                        <Text style={styles.vitalStatValue}>
                          {twin.metrics.lifestyle.wellbeing.recentStatus.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Pillar 3: Medication Regimen */}
                <View style={styles.pillarCard}>
                  <View style={styles.pillarHeader}>
                    <Pill color="#0D9488" size={18} />
                    <Text style={styles.pillarTitle}>Medication Regimen & Adherence</Text>
                  </View>

                  <View style={styles.pillarBody}>
                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>Active Prescriptions:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.medications.activeCount} medications
                      </Text>
                    </View>

                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>14-Day Adherence Rate:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.medications.adherenceRate14d !== null
                          ? `${twin.metrics.medications.adherenceRate14d}%`
                          : 'No doses logged'}
                      </Text>
                    </View>

                    {twin.metrics.medications.unreviewedCount > 0 && (
                      <View style={styles.vitalStatRow}>
                        <Text style={styles.vitalStatLabel}>Unreviewed Patient Entries:</Text>
                        <Text style={[styles.vitalStatValue, { color: '#B45309' }]}>
                          {twin.metrics.medications.unreviewedCount} awaiting review
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Pillar 4: Care Plan Progress */}
                <View style={styles.pillarCard}>
                  <View style={styles.pillarHeader}>
                    <CheckCircle2 color="#3B82F6" size={18} />
                    <Text style={styles.pillarTitle}>Care Plan Engagement</Text>
                  </View>

                  <View style={styles.pillarBody}>
                    <View style={styles.vitalStatRow}>
                      <Text style={styles.vitalStatLabel}>Care Plan Status:</Text>
                      <Text style={styles.vitalStatValue}>
                        {twin.metrics.carePlan.hasActivePlan
                          ? `${twin.metrics.carePlan.planTitle} (v${twin.metrics.carePlan.planVersion})`
                          : 'No active clinical care plan'}
                      </Text>
                    </View>

                    {twin.metrics.carePlan.hasActivePlan && (
                      <View style={styles.vitalStatRow}>
                        <Text style={styles.vitalStatLabel}>Daily Tasks Adherence:</Text>
                        <Text style={styles.vitalStatValue}>
                          {twin.metrics.carePlan.completedTasksCount} of{' '}
                          {twin.metrics.carePlan.totalTasksCount} done (
                          {twin.metrics.carePlan.progressPercent}%)
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Causation & Disclaimer Footer */}
                <View style={styles.twinFooter}>
                  <Text style={styles.twinFooterText}>
                    {twin.governance.causationNotice} Last updated:{' '}
                    {new Date(twin.generatedAt).toLocaleString('en-IN')}.
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Modal: Add Lifestyle Entry */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Daily Lifestyle</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <X color={theme.colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category Picker */}
              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryPickerRow}>
                {(
                  [
                    'PHYSICAL_ACTIVITY',
                    'SLEEP',
                    'HYDRATION',
                    'NUTRITION',
                    'WELLBEING',
                  ] as const
                ).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catPickerBtn,
                      selectedCategory === cat && styles.catPickerBtnActive,
                    ]}
                    onPress={() => handleCategorySelect(cat)}
                  >
                    <Text
                      style={[
                        styles.catPickerBtnText,
                        selectedCategory === cat && styles.catPickerBtnTextActive,
                      ]}
                    >
                      {cat === 'PHYSICAL_ACTIVITY' ? 'Activity' : cat.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dynamic Value Input */}
              {selectedCategory !== 'NUTRITION' && (
                <>
                  <Text style={styles.inputLabel}>
                    {selectedCategory === 'PHYSICAL_ACTIVITY'
                      ? 'Duration (Minutes) *'
                      : selectedCategory === 'SLEEP'
                      ? 'Sleep Duration (Hours) *'
                      : selectedCategory === 'HYDRATION'
                      ? 'Water Intake (mL) *'
                      : 'Score (1 to 5)'}
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 45"
                    keyboardType="numeric"
                    value={inputValue}
                    onChangeText={setInputValue}
                  />
                </>
              )}

              {/* Qualitative / Type */}
              <Text style={styles.inputLabel}>
                {selectedCategory === 'PHYSICAL_ACTIVITY'
                  ? 'Activity Type'
                  : selectedCategory === 'SLEEP'
                  ? 'Sleep Quality'
                  : selectedCategory === 'NUTRITION'
                  ? 'Meal Type'
                  : 'Qualitative Status'}
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Brisk Walking, Restful, Light Lunch"
                value={inputQualitative}
                onChangeText={setInputQualitative}
              />

              {/* Notes */}
              <Text style={styles.inputLabel}>Notes / Reflections</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Felt energetic, took walk after dinner"
                multiline
                numberOfLines={3}
                value={inputNotes}
                onChangeText={setInputNotes}
              />

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsAddModalOpen(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.btnDisabled]}
                  onPress={handleCreateEntry}
                  disabled={submitting}
                >
                  <Text style={styles.submitBtnText}>
                    {submitting ? 'Saving...' : 'Save Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Edit Entry with Audit Trail */}
      <Modal
        visible={isEditModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Correct Lifestyle Entry</Text>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <X color={theme.colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Editing a health or lifestyle log requires a documented reason for clinical audit
              preservation.
            </Text>

            <Text style={styles.inputLabel}>Corrected Value</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={editValue}
              onChangeText={setEditValue}
            />

            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={styles.textInput}
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <Text style={styles.inputLabel}>Reason for Correction *</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="e.g. Corrected walking duration from 60 to 45 min"
              multiline
              numberOfLines={2}
              value={correctionReason}
              onChangeText={setCorrectionReason}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsEditModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, editSubmitting && styles.btnDisabled]}
                onPress={handleConfirmEdit}
                disabled={editSubmitting}
              >
                <Text style={styles.submitBtnText}>
                  {editSubmitting ? 'Updating...' : 'Save Correction'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTextContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: theme.colors.primary,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  statsCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginTop: 6,
  },
  emptyMessage: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  emptyCtaText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  recordCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordCategoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  provenancePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  provenancePillText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  recordActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
  },
  recordDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordMainValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  recordQualitative: {
    fontSize: 13,
    color: '#475569',
  },
  recordNotes: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    marginTop: 2,
  },
  correctionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 6,
    borderRadius: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  correctionText: {
    fontSize: 11,
    color: '#B45309',
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  recordDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  twinGovernanceCard: {
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  twinGovernanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  twinGovernanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  twinGovernanceDesc: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 16,
  },
  alertsContainer: {
    gap: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
  },
  alertWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  alertInfo: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  alertItemText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  alertTextWarn: {
    color: '#92400E',
  },
  alertTextInfo: {
    color: '#0369A1',
  },
  twinPillars: {
    gap: 12,
  },
  pillarCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  pillarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  pillarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  pillarBody: {
    gap: 8,
  },
  vitalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalStatLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  vitalStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  noDataPlaceholder: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  twinFooter: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  twinFooterText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 16,
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  catPickerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  catPickerBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  catPickerBtnText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  catPickerBtnTextActive: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
});
