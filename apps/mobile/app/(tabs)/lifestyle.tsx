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
  User,
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
        return <Activity color="#004D4D" size={size} />;
      case 'SLEEP':
        return <Moon color="#6366f1" size={size} />;
      case 'HYDRATION':
        return <Droplets color="#0284c7" size={size} />;
      case 'NUTRITION':
        return <Utensils color="#d97706" size={size} />;
      case 'WELLBEING':
        return <Smile color="#059669" size={size} />;
    }
  };

  const filteredRecords = records.filter((r) => {
    if (categoryFilter === 'ALL') return true;
    return r.category === categoryFilter;
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header (Alexandria Style) */}
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
          <Plus color="#ffffff" size={16} />
          <Text style={styles.addButtonText}>Log Activity</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Segmented Tab Switcher (Alexandria Segmented Pills) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'LOGS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('LOGS')}
        >
          <Activity color={activeTab === 'LOGS' ? '#004D4D' : '#737784'} size={15} />
          <Text style={[styles.tabButtonText, activeTab === 'LOGS' && styles.tabButtonTextActive]}>
            Lifestyle Logs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'TWIN' && styles.tabButtonActive]}
          onPress={() => setActiveTab('TWIN')}
        >
          <Sparkles color={activeTab === 'TWIN' ? '#004D4D' : '#737784'} size={15} />
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
            {/* 7-Day Lifestyle Quick Stats (Alexandria Card) */}
            {stats && (
              <View style={styles.statsCard}>
                <Text style={styles.statsCardTitle}>7-Day Habit Summary</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <View style={styles.statIconBox}>
                      <Activity color="#004D4D" size={16} />
                    </View>
                    <Text style={styles.statValue}>
                      {stats.physicalActivity.totalMinutes} min
                    </Text>
                    <Text style={styles.statLabel}>Active Movement</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <View style={[styles.statIconBox, { backgroundColor: '#eef2ff' }]}>
                      <Moon color="#6366f1" size={16} />
                    </View>
                    <Text style={styles.statValue}>
                      {stats.sleep.averageHoursPerNight !== null
                        ? `${stats.sleep.averageHoursPerNight} h`
                        : 'No logs'}
                    </Text>
                    <Text style={styles.statLabel}>Avg Sleep / Night</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <View style={[styles.statIconBox, { backgroundColor: '#f0f9ff' }]}>
                      <Droplets color="#0284c7" size={16} />
                    </View>
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
                <Activity color={theme.colors.textMuted} size={40} />
                <Text style={styles.emptyTitle}>No Lifestyle Records Found</Text>
                <Text style={styles.emptyMessage}>
                  Track your daily physical activity, sleep, hydration, and nutrition to build a
                  personalized digital health picture.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaButton}
                  onPress={() => setIsAddModalOpen(true)}
                >
                  <Plus color="#ffffff" size={16} />
                  <Text style={styles.emptyCtaText}>Log First Activity</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredRecords.map((r) => (
                <View key={r.id} style={styles.recordCard}>
                  <View style={styles.recordHeader}>
                    <View style={styles.recordCategoryRow}>
                      <View style={styles.catIconWrap}>
                        {getCategoryIcon(r.category, 16)}
                      </View>
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
                        <Edit2 color="#737784" size={14} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteEntry(r)}
                        style={styles.iconBtn}
                        accessibilityLabel="Delete Entry"
                      >
                        <Trash2 color="#ba1a1a" size={14} />
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
                      <Info color="#b45309" size={12} />
                      <Text style={styles.correctionText}>
                        Reason for correction: {r.reasonForCorrection}
                      </Text>
                    </View>
                  )}

                  {/* Timestamp */}
                  <View style={styles.recordFooter}>
                    <Clock color="#737784" size={12} />
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
            {/* Read-Only Governance Banner (Alexandria Card) */}
            <View style={styles.twinGovernanceCard}>
              <View style={styles.twinGovernanceHeader}>
                <ShieldCheck color="#059669" size={18} />
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
                      <AlertTriangle color="#b45309" size={16} />
                    ) : (
                      <Info color="#004D4D" size={16} />
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
                    <View style={[styles.catIconWrap, { backgroundColor: '#fee2e2' }]}>
                      <Heart color="#ba1a1a" size={16} />
                    </View>
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
                    <View style={styles.catIconWrap}>
                      <Activity color="#004D4D" size={16} />
                    </View>
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
                    <View style={[styles.catIconWrap, { backgroundColor: '#ecfdf5' }]}>
                      <Pill color="#059669" size={16} />
                    </View>
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
                        <Text style={[styles.vitalStatValue, { color: '#b45309' }]}>
                          {twin.metrics.medications.unreviewedCount} awaiting review
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Pillar 4: Care Plan Progress */}
                <View style={styles.pillarCard}>
                  <View style={styles.pillarHeader}>
                    <View style={[styles.catIconWrap, { backgroundColor: 'rgba(9, 76, 178, 0.08)' }]}>
                      <CheckCircle2 color="#004D4D" size={16} />
                    </View>
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

      {/* Modal: Add Lifestyle Entry (Alexandria Sheet) */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalTonalBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Daily Lifestyle</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)} style={styles.modalCloseBtn}>
                <X color={theme.colors.textMuted} size={18} />
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
                    placeholderTextColor="#737784"
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
                placeholderTextColor="#737784"
                value={inputQualitative}
                onChangeText={setInputQualitative}
              />

              {/* Notes */}
              <Text style={styles.inputLabel}>Notes / Reflections</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Felt energetic, took walk after dinner"
                placeholderTextColor="#737784"
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
            <View style={styles.modalTonalBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Correct Lifestyle Entry</Text>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)} style={styles.modalCloseBtn}>
                <X color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Editing a health or lifestyle log requires a documented Reason for correction for clinical audit
              preservation.
            </Text>

            <Text style={styles.inputLabel}>Corrected Value</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholderTextColor="#737784"
              value={editValue}
              onChangeText={setEditValue}
            />

            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={styles.textInput}
              placeholderTextColor="#737784"
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <Text style={styles.inputLabel}>Reason for correction *</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="e.g. Corrected walking duration from 60 to 45 min"
              placeholderTextColor="#737784"
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
    backgroundColor: '#f8f9fc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(9, 76, 178, 0.08)',
  },
  headerTextContainer: {
    flex: 1,
  },
  screenTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 20,
    fontWeight: '700',
    color: '#191c20',
  },
  screenSubtitle: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#33628b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D4D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
    shadowColor: '#004D4D',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 1,
  },
  addButtonText: {
    color: '#ffffff',
    fontFamily: 'Public Sans',
    fontWeight: '700',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f3f9',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eceef3',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.15)',
  },
  tabButtonText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#737784',
  },
  tabButtonTextActive: {
    color: '#004D4D',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  statsCard: {
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
  statsCardTitle: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '800',
    color: '#33628b',
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
    flex: 1,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: 'Public Sans',
    fontSize: 16,
    fontWeight: '800',
    color: '#191c20',
  },
  statLabel: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e1e2e8',
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eceef3',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#004D4D',
  },
  filterChipText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    color: '#737784',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
  },
  emptyContainer: {
    padding: 36,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
    marginTop: 6,
  },
  emptyMessage: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D4D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  emptyCtaText: {
    color: '#ffffff',
    fontFamily: 'Public Sans',
    fontSize: 12,
    fontWeight: '700',
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 6,
    shadowColor: '#004D4D',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
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
  catIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCategoryTitle: {
    fontFamily: 'Public Sans',
    fontSize: 13,
    fontWeight: '700',
    color: '#191c20',
  },
  provenancePill: {
    backgroundColor: '#f2f3f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  provenancePillText: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: '#737784',
    fontWeight: '600',
  },
  recordActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f2f3f9',
  },
  recordDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordMainValue: {
    fontFamily: 'Public Sans',
    fontSize: 15,
    fontWeight: '800',
    color: '#004D4D',
  },
  recordQualitative: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#434653',
  },
  recordNotes: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
    backgroundColor: '#f2f3f9',
    padding: 8,
    borderRadius: 8,
    marginTop: 2,
  },
  correctionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 6,
    borderRadius: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  correctionText: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#92400e',
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  recordDateText: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
  },
  twinGovernanceCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 6,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  twinGovernanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  twinGovernanceTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  twinGovernanceDesc: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#434653',
    lineHeight: 16,
  },
  alertsContainer: {
    gap: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
  },
  alertWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  alertInfo: {
    backgroundColor: 'rgba(9, 76, 178, 0.05)',
    borderColor: 'rgba(9, 76, 178, 0.15)',
  },
  alertItemText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 11.5,
    lineHeight: 16,
  },
  alertTextWarn: {
    color: '#92400e',
  },
  alertTextInfo: {
    color: '#004D4D',
  },
  twinPillars: {
    gap: 12,
  },
  pillarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 10,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  pillarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f3f9',
    paddingBottom: 8,
  },
  pillarTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 14,
    fontWeight: '700',
    color: '#191c20',
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
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#737784',
  },
  vitalStatValue: {
    fontFamily: 'Public Sans',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#191c20',
  },
  noDataPlaceholder: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#737784',
    fontStyle: 'italic',
  },
  twinFooter: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  twinFooterText: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    textAlign: 'center',
    lineHeight: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 28, 32, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalTonalBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#004D4D',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  modalTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 17,
    fontWeight: '700',
    color: '#191c20',
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f2f3f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSub: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#737784',
    marginBottom: 14,
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
    borderRadius: 999,
    backgroundColor: '#f2f3f9',
  },
  catPickerBtnActive: {
    backgroundColor: '#004D4D',
  },
  catPickerBtnText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    color: '#737784',
    fontWeight: '600',
  },
  catPickerBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  inputLabel: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#434653',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: '#c3c6d5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'Inter',
    color: '#191c20',
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
    borderRadius: 10,
    backgroundColor: '#f2f3f9',
  },
  cancelBtnText: {
    fontFamily: 'Public Sans',
    color: '#737784',
    fontWeight: '700',
    fontSize: 13,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#004D4D',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: 'Public Sans',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
