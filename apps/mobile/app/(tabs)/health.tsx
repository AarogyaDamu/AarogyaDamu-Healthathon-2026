import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Platform,
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  FileText,
  FileUp,
  Activity,
  AlertTriangle,
  X,
  Clock,
  Pill,
  Flame,
  Calendar,
  Stethoscope,
  Filter,
  Check,
  ShieldCheck,
  Download,
  AlertCircle,
  Camera,
  Image as ImageIcon,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import {
  mobileApiFetch,
  getSelectedMobileRole,
  getMobileToken,
  resolveApiBaseUrl,
} from '../../src/api/client';
import {
  enqueueOfflineObservation,
  syncOfflineQueue,
  getCachedObservations,
  setCachedObservations,
} from '../../src/api/services/offlineStorage';
import { medicationApi, type MobileMedication } from '../../src/api/medications';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

type VaultTab = 'RECORD_SUGAR' | 'MED_VAULT' | 'LIFESTYLE' | 'MEDICAL_REPORTS' | 'HEALTH_TIMELINE';

type VitalType = 'BLOOD_GLUCOSE' | 'BLOOD_PRESSURE' | 'WEIGHT' | 'HBA1C';

interface ObservationRecord {
  id: string;
  type: VitalType;
  numericValue: number;
  secondaryValue?: number;
  unit: string;
  context: string;
  clinicalFlag?: string;
  notes?: string;
  sourceProvenance?: string;
  observedAt: string;
}

interface LifestyleEntry {
  id: string;
  category: 'PHYSICAL_ACTIVITY' | 'SLEEP' | 'NUTRITION' | 'HYDRATION' | 'WELLBEING';
  numericValue?: number;
  unit?: string;
  qualitativeValue?: string;
  notes?: string;
  recordedAt: string;
}

interface MedicalDoc {
  id: string;
  title: string;
  category: string;
  issuingFacility?: string;
  reportDate: string;
  notes?: string;
  processingStatus: string;
  fileSizeBytes?: number;
  mimeType?: string;
  extractedData?: {
    provider?: string;
    status?: string;
    text?: string;
    error?: string;
    isSynthetic?: boolean;
  } | null;
}

interface SelectedReportFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: File;
}

interface TimelineEvent {
  id: string;
  eventType: 'OBSERVATION' | 'TASK' | 'CONSULTATION' | 'DOCUMENT' | 'CONSULTATION_NOTE' | 'MEDICATION_EVENT';
  title: string;
  details?: string;
  occurredAt: string;
}

function getRequestErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Unexpected server response.';
}

export default function HealthVaultScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<VaultTab>('RECORD_SUGAR');
  const [role, setRole] = useState<'PATIENT' | 'CAREGIVER'>('PATIENT');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Tab 1: Record Sugar & Vitals State
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [vitalType, setVitalType] = useState<VitalType>('BLOOD_GLUCOSE');
  const [sugarFilter, setSugarFilter] = useState<'ALL' | 'FASTING' | 'POST_MEAL_2HR' | 'RANDOM'>('ALL');
  const [showLogModal, setShowLogModal] = useState(false);
  const [primaryValue, setPrimaryValue] = useState('');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [vitalContext, setVitalContext] = useState('FASTING');
  const [vitalNotes, setVitalNotes] = useState('');
  const [submittingVital, setSubmittingVital] = useState(false);

  // Tab 2: Med Vault State
  const [medications, setMedications] = useState<MobileMedication[]>([]);
  const [adherenceRate, setAdherenceRate] = useState<number | null>(null);
  const [medicationError, setMedicationError] = useState<string | null>(null);
  const [recordingDoseId, setRecordingDoseId] = useState<string | null>(null);

  // Tab 3: Lifestyle State
  const [lifestyleEntries, setLifestyleEntries] = useState<LifestyleEntry[]>([]);
  const [showLifestyleModal, setShowLifestyleModal] = useState(false);
  const [lifestyleCategory, setLifestyleCategory] = useState<'PHYSICAL_ACTIVITY' | 'SLEEP' | 'NUTRITION' | 'HYDRATION'>('PHYSICAL_ACTIVITY');
  const [lifestyleValue, setLifestyleValue] = useState('');
  const [lifestyleNotes, setLifestyleNotes] = useState('');
  const [submittingLifestyle, setSubmittingLifestyle] = useState(false);

  // Tab 4: Medical Reports State
  const [reports, setReports] = useState<MedicalDoc[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFacility, setUploadFacility] = useState('');
  const [selectedReportFile, setSelectedReportFile] = useState<SelectedReportFile | null>(null);
  const [selectingReport, setSelectingReport] = useState(false);
  const [submittingUpload, setSubmittingUpload] = useState(false);
  const [selectedReportForReview, setSelectedReportForReview] = useState<MedicalDoc | null>(null);
  const [reportReviewTab, setReportReviewTab] = useState<'ocr' | 'source'>('ocr');
  const [reportPreviewToken, setReportPreviewToken] = useState<string | null>(null);
  const [abhaBusy, setAbhaBusy] = useState<'export' | 'import' | null>(null);
  const [abhaMessage, setAbhaMessage] = useState<string | null>(null);
  const [abhaSummary, setAbhaSummary] = useState<any | null>(null);

  // Tab 5: Health Timeline State
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string>('ALL');

  const loadMedicationData = useCallback(async () => {
    const [medicationsResult, adherenceResult] = await Promise.allSettled([
      medicationApi.getMedications({ status: 'ACTIVE' }),
      medicationApi.getAdherenceStats({ days: 14 }),
    ]);

    const errors: string[] = [];
    if (medicationsResult.status === 'fulfilled') {
      setMedications(medicationsResult.value);
    } else {
      errors.push(`Medication list: ${getRequestErrorMessage(medicationsResult.reason)}`);
    }

    if (adherenceResult.status === 'fulfilled' && typeof adherenceResult.value?.adherenceRate === 'number') {
      setAdherenceRate(adherenceResult.value.adherenceRate);
    } else {
      setAdherenceRate(null);
      errors.push(
        adherenceResult.status === 'rejected'
          ? `Adherence statistics: ${getRequestErrorMessage(adherenceResult.reason)}`
          : 'Adherence statistics: the server returned an invalid response.',
      );
    }

    setMedicationError(errors.length > 0 ? errors.join('\n') : null);
  }, []);

  const loadVaultData = useCallback(async () => {
    try {
      const activeRole = await getSelectedMobileRole();
      if (activeRole) setRole(activeRole);

      // Load Observations (Sugar)
      try {
        const obsRes = await mobileApiFetch<{ observations: ObservationRecord[] }>('/observations?limit=50');
        if (obsRes?.observations) {
          setObservations(obsRes.observations);
          await setCachedObservations(obsRes.observations);
        }
      } catch {
        const cached = await getCachedObservations();
        if (cached && cached.length > 0) setObservations(cached as ObservationRecord[]);
      }

      await loadMedicationData();

      // Load Lifestyle
      try {
        const lifeRes = await mobileApiFetch<{ records: LifestyleEntry[] }>('/lifestyle');
        if (lifeRes?.records) setLifestyleEntries(lifeRes.records);
      } catch {
        // Lifestyle fetch fallback
      }

      // Load Medical Reports
      try {
        const docRes = await mobileApiFetch<{ documents: MedicalDoc[] }>('/documents');
        if (docRes?.documents) setReports(docRes.documents);
      } catch {
        // Doc fetch fallback
      }

      // Load Timeline
      try {
        const timeRes = await mobileApiFetch<{ events: TimelineEvent[] }>('/timeline');
        if (timeRes?.events) setTimelineEvents(timeRes.events);
      } catch {
        // Timeline fetch fallback
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadMedicationData]);

  useEffect(() => {
    void loadVaultData();
  }, [loadVaultData]);

  useEffect(() => {
    if (!reports.some((report) => report.processingStatus === 'PENDING')) return;

    let requestInProgress = false;
    const timer = setInterval(() => {
      if (requestInProgress) return;
      requestInProgress = true;
      void mobileApiFetch<{ documents: MedicalDoc[] }>('/documents')
        .then((response) => {
          if (response?.documents) setReports(response.documents);
        })
        .catch(() => undefined)
        .finally(() => {
          requestInProgress = false;
        });
    }, 2500);

    return () => clearInterval(timer);
  }, [reports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncOfflineQueue();
    await loadVaultData();
  };

  // --- RECORD SUGAR HANDLERS ---
  const handleLogVital = async () => {
    const val = parseFloat(primaryValue);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid numeric reading.');
      return;
    }

    setSubmittingVital(true);
    const sourceProvenance = role === 'CAREGIVER' ? 'CAREGIVER_INPUT' : 'MANUAL_PATIENT';
    const idempotencyKey = `obs-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const payload = {
      type: vitalType,
      numericValue: val,
      secondaryValue: secondaryValue ? parseFloat(secondaryValue) : undefined,
      unit: vitalType === 'BLOOD_GLUCOSE' ? 'mg/dL' : vitalType === 'BLOOD_PRESSURE' ? 'mmHg' : vitalType === 'WEIGHT' ? 'kg' : '%',
      context: vitalContext,
      notes: vitalNotes.trim() || undefined,
      sourceProvenance,
      idempotencyKey,
      observedAt: new Date().toISOString(),
    };

    try {
      await mobileApiFetch('/observations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('✓ Reading saved to clinical logbook!');
      setShowLogModal(false);
      setPrimaryValue('');
      setSecondaryValue('');
      setVitalNotes('');
      await loadVaultData();
    } catch {
      // Offline fallback queue
      await enqueueOfflineObservation(payload);
      showToast('Reading queued offline. Will sync when back online.');
      setShowLogModal(false);
    } finally {
      setSubmittingVital(false);
    }
  };

  // --- MED VAULT ADHERENCE HANDLER ---
  const handleLogAdherence = async (medId: string, action: 'TAKEN' | 'SKIPPED') => {
    setRecordingDoseId(medId);
    try {
      await medicationApi.recordAdherenceEvent(
        medId,
        action,
        action === 'TAKEN' ? 'Confirmed dose taken' : 'Reported skipped dose',
        new Date().toISOString(),
      );
      showToast(action === 'TAKEN' ? '✓ Dose recorded as taken!' : 'Reported dose as skipped.');
      await loadVaultData();
    } catch {
      showToast('Unable to record dose adherence. Check your connection.');
    } finally {
      setRecordingDoseId(null);
    }
  };

  // --- LIFESTYLE LOG HANDLER ---
  const handleLogLifestyle = async () => {
    const val = parseFloat(lifestyleValue);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid duration or quantity.');
      return;
    }
    setSubmittingLifestyle(true);
    try {
      const unit = lifestyleCategory === 'PHYSICAL_ACTIVITY' ? 'MINUTES' : lifestyleCategory === 'SLEEP' ? 'HOURS' : 'GLASSES';
      await mobileApiFetch('/lifestyle', {
        method: 'POST',
        body: JSON.stringify({
          category: lifestyleCategory,
          numericValue: val,
          unit,
          notes: lifestyleNotes.trim() || undefined,
          recordedAt: new Date().toISOString(),
        }),
      });
      showToast('✓ Lifestyle activity recorded!');
      setShowLifestyleModal(false);
      setLifestyleValue('');
      setLifestyleNotes('');
      await loadVaultData();
    } catch {
      showToast('Unable to record lifestyle entry.');
    } finally {
      setSubmittingLifestyle(false);
    }
  };

  // --- REPORT UPLOAD HANDLER ---
  const setSelectedReport = (file: SelectedReportFile) => {
    if (file.size && file.size > 10 * 1024 * 1024) {
      showToast('Reports must be 10 MB or smaller.');
      return;
    }

    setSelectedReportFile(file);
    if (!uploadTitle.trim()) {
      setUploadTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const selectReportFile = async (source: 'camera' | 'photos' | 'pdf') => {
    setSelectingReport(true);
    try {
      if (source === 'pdf') {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        setSelectedReport({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || 'application/pdf',
          size: asset.size,
          file: asset.file,
        });
        return;
      }

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showToast('Allow camera access to take a report photo.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
      setSelectedReport({
        uri: asset.uri,
        name: asset.fileName || `medical-report-${Date.now()}${extension}`,
        mimeType,
        size: asset.fileSize,
        file: asset.file,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to select this report.');
    } finally {
      setSelectingReport(false);
    }
  };

  const handleUploadReport = async () => {
    if (!selectedReportFile) {
      showToast('Take a report photo or choose a photo or PDF first.');
      return;
    }
    setSubmittingUpload(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadTitle.trim() || selectedReportFile.name);
      if (uploadFacility.trim()) formData.append('issuingFacility', uploadFacility.trim());
      if (Platform.OS === 'web') {
        const file = selectedReportFile.file ?? await fetch(selectedReportFile.uri).then((response) => response.blob());
        formData.append('file', file, selectedReportFile.name);
      } else {
        formData.append('file', {
          uri: selectedReportFile.uri,
          name: selectedReportFile.name,
          type: selectedReportFile.mimeType,
        } as unknown as Blob);
      }

      const response = await mobileApiFetch<{
        document: MedicalDoc;
        extraction: { status: string; message: string };
      }>('/documents/upload-report', {
        method: 'POST',
        body: formData,
      });
      showToast(response.extraction.message);
      setShowUploadModal(false);
      setSelectedReportFile(null);
      setUploadTitle('');
      setUploadFacility('');
      await loadVaultData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to upload the report. Check your connection and try again.');
    } finally {
      setSubmittingUpload(false);
    }
  };

  const openReportReview = async (report: MedicalDoc) => {
    setSelectedReportForReview(report);
    setReportReviewTab('ocr');
    setReportPreviewToken(await getMobileToken());
  };

  const runSyntheticAbhaExchange = async (operation: 'export' | 'import') => {
    setAbhaBusy(operation);
    setAbhaMessage(null);
    try {
      const result = await mobileApiFetch<{ abhaId: string; summary: any; alreadyImported?: boolean }>(`/abha/${operation}`, {
        method: operation === 'import' ? 'POST' : 'GET',
      });
      setAbhaSummary({ ...result.summary, abhaId: result.abhaId });
      setAbhaMessage(operation === 'import'
        ? result.alreadyImported ? 'Synthetic ABHA data is already imported; your health record is up to date.' : 'Synthetic patient health imported successfully.'
        : 'Synthetic ABHA health summary is ready to review.');
      if (operation === 'import') await loadVaultData();
    } catch (error) {
      setAbhaMessage(getRequestErrorMessage(error));
    } finally {
      setAbhaBusy(null);
    }
  };

  // Filtered observations
  const filteredObs = useMemo(() => {
    return observations.filter((obs) => {
      if (obs.type !== 'BLOOD_GLUCOSE') return false;
      if (sugarFilter === 'ALL') return true;
      return obs.context === sugarFilter;
    });
  }, [observations, sugarFilter]);

  // Statistics
  const glucoseValues = filteredObs.map((o) => o.numericValue);
  const avgGlucose = glucoseValues.length > 0 ? Math.round(glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length) : 0;
  const inRangeCount = glucoseValues.filter((v) => v >= 70 && v <= 180).length;
  const tirPercentage = glucoseValues.length > 0 ? Math.round((inRangeCount / glucoseValues.length) * 100) : 100;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Health Vault</Text>
          <Text style={styles.headerSub}>Comprehensive Clinical Record & Vitals</Text>
        </View>
        <View style={styles.verifiedBadge}>
          <ShieldCheck color={theme.colors.primary} size={14} />
          <Text style={styles.verifiedBadgeText}>Verified Records</Text>
        </View>
      </View>

      {/* 5-MODULE TAB NAVIGATION PILLS */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'RECORD_SUGAR' && styles.tabPillActive]}
            onPress={() => setActiveTab('RECORD_SUGAR')}
            accessibilityRole="tab"
            accessibilityLabel="Record Sugar Module"
          >
            <Activity color={activeTab === 'RECORD_SUGAR' ? theme.colors.white : theme.colors.text} size={14} />
            <Text style={[styles.tabPillText, activeTab === 'RECORD_SUGAR' && styles.tabPillTextActive]}>
              Record Sugar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'MED_VAULT' && styles.tabPillActive]}
            onPress={() => setActiveTab('MED_VAULT')}
            accessibilityRole="tab"
            accessibilityLabel="Med Vault Module"
          >
            <Pill color={activeTab === 'MED_VAULT' ? theme.colors.white : theme.colors.text} size={14} />
            <Text style={[styles.tabPillText, activeTab === 'MED_VAULT' && styles.tabPillTextActive]}>
              Med Vault
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'LIFESTYLE' && styles.tabPillActive]}
            onPress={() => setActiveTab('LIFESTYLE')}
            accessibilityRole="tab"
            accessibilityLabel="Lifestyle Module"
          >
            <Flame color={activeTab === 'LIFESTYLE' ? theme.colors.white : theme.colors.text} size={14} />
            <Text style={[styles.tabPillText, activeTab === 'LIFESTYLE' && styles.tabPillTextActive]}>
              Lifestyle
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'MEDICAL_REPORTS' && styles.tabPillActive]}
            onPress={() => setActiveTab('MEDICAL_REPORTS')}
            accessibilityRole="tab"
            accessibilityLabel="Medical Reports Module"
          >
            <FileText color={activeTab === 'MEDICAL_REPORTS' ? theme.colors.white : theme.colors.text} size={14} />
            <Text style={[styles.tabPillText, activeTab === 'MEDICAL_REPORTS' && styles.tabPillTextActive]}>
              Medical Reports
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'HEALTH_TIMELINE' && styles.tabPillActive]}
            onPress={() => setActiveTab('HEALTH_TIMELINE')}
            accessibilityRole="tab"
            accessibilityLabel="Health Timeline Module"
          >
            <Calendar color={activeTab === 'HEALTH_TIMELINE' ? theme.colors.white : theme.colors.text} size={14} />
            <Text style={[styles.tabPillText, activeTab === 'HEALTH_TIMELINE' && styles.tabPillTextActive]}>
              Health Timeline
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.contentScroll, { paddingBottom: insets.bottom + 84 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Fetching Health Vault records...</Text>
          </View>
        ) : (
          <>
            {/* ============================================================== */}
            {/* 1. RECORD SUGAR MODULE                                         */}
            {/* ============================================================== */}
            {activeTab === 'RECORD_SUGAR' && (
              <View style={styles.tabSection}>
                {/* Stats Summary Cards */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxNum}>{avgGlucose || '--'}</Text>
                    <Text style={styles.statBoxUnit}>mg/dL</Text>
                    <Text style={styles.statBoxLabel}>Average Glucose</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxNum}>{tirPercentage}%</Text>
                    <Text style={styles.statBoxUnit}>70-180 mg/dL</Text>
                    <Text style={styles.statBoxLabel}>Time in Target</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxNum}>{filteredObs.length}</Text>
                    <Text style={styles.statBoxUnit}>Entries</Text>
                    <Text style={styles.statBoxLabel}>Total Logs</Text>
                  </View>
                </View>

                {/* Log Reading CTA */}
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={() => setShowLogModal(true)}
                  activeOpacity={0.88}
                >
                  <Plus color={theme.colors.white} size={20} />
                  <Text style={styles.primaryActionBtnText}>Record Blood Sugar / Vitals</Text>
                </TouchableOpacity>

                {/* Filter Pills */}
                <View style={styles.filterRow}>
                  {(['ALL', 'FASTING', 'POST_MEAL_2HR', 'RANDOM'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterChip, sugarFilter === f && styles.filterChipActive]}
                      onPress={() => setSugarFilter(f)}
                    >
                      <Text style={[styles.filterChipText, sugarFilter === f && styles.filterChipTextActive]}>
                        {f === 'ALL' ? 'All Readings' : f === 'POST_MEAL_2HR' ? '2h Post-Meal' : f.charAt(0) + f.slice(1).toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Logbook List */}
                <View style={styles.logListCard}>
                  <Text style={styles.sectionHeaderTitle}>Blood Glucose Logbook</Text>
                  {filteredObs.length > 0 ? (
                    filteredObs.map((obs) => {
                      const isNorm = obs.numericValue >= 80 && obs.numericValue <= 130;
                      const isElev = obs.numericValue > 130 && obs.numericValue <= 180;
                      return (
                        <View key={obs.id} style={styles.obsItemRow}>
                          <View style={styles.obsLeft}>
                            <View style={[styles.obsDot, isNorm ? styles.dotGreen : isElev ? styles.dotAmber : styles.dotRed]} />
                            <View>
                              <Text style={styles.obsValueText}>
                                {obs.numericValue} <Text style={styles.obsUnitText}>{obs.unit}</Text>
                              </Text>
                              <Text style={styles.obsContextText}>
                                {obs.context.replace(/_/g, ' ')} • {new Date(obs.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.obsRight}>
                            <View style={[styles.statusBadge, isNorm ? styles.badgeGreen : isElev ? styles.badgeAmber : styles.badgeRed]}>
                              <Text style={[styles.statusBadgeText, isNorm ? styles.badgeGreenText : isElev ? styles.badgeAmberText : styles.badgeRedText]}>
                                {isNorm ? 'In Target' : isElev ? 'Elevated' : 'High'}
                              </Text>
                            </View>
                            <Text style={styles.obsDateText}>
                              {new Date(obs.observedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Activity color={theme.colors.textMuted} size={32} />
                      <Text style={styles.emptyTitle}>No Readings in This Filter</Text>
                      <Text style={styles.emptySub}>Record your morning fasting or after-meal reading to populate this logbook.</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ============================================================== */}
            {/* 2. MED VAULT MODULE (Doctor-Prescribed Only)                   */}
            {/* ============================================================== */}
            {activeTab === 'MED_VAULT' && (
              <View style={styles.tabSection}>
                {/* Clinical Governance Notice */}
                <View style={styles.clinicalNoticeCard}>
                  <ShieldCheck color="#15803D" size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clinicalNoticeTitle}>Doctor-Prescribed Medication Regimen</Text>
                    <Text style={styles.clinicalNoticeBody}>
                      Med Vault displays prescriptions authorized by your treating clinician. To protect patient safety, medications cannot be prescribed or altered without doctor sign-off.
                    </Text>
                  </View>
                </View>

                {medicationError && (
                  <View
                    style={styles.medicationErrorCard}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <AlertCircle color={theme.colors.error} size={20} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={styles.medicationErrorText}>{medicationError}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setRefreshing(true);
                          void loadVaultData();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Retry loading medication information"
                        style={styles.medicationRetryButton}
                      >
                        <Text style={styles.medicationRetryText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Adherence Rate Banner */}
                <View style={styles.adherenceBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adherenceBannerTitle}>14-Day Adherence Rate</Text>
                    <Text style={styles.adherenceBannerSub}>Consistently taking medications helps maintain target glycemic stability.</Text>
                  </View>
                  <View style={styles.adherenceBadge}>
                    <Text style={styles.adherenceBadgeText}>{adherenceRate === null ? '--' : `${adherenceRate}%`}</Text>
                  </View>
                </View>

                {/* Prescriptions List */}
                <Text style={styles.sectionHeaderTitle}>Active Prescriptions ({medications.length})</Text>
                {medications.length > 0 ? (
                  medications.map((med) => (
                    <View key={med.id} style={styles.medCard}>
                      <View style={styles.medCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.medName}>{med.name}</Text>
                          <Text style={styles.medDetails}>
                            {med.dosage} {med.strength || ''} • {med.frequency} ({med.route || 'Oral'})
                          </Text>
                          {med.instructions && (
                            <Text style={styles.medInstructions}>{med.instructions}</Text>
                          )}
                        </View>
                        <View style={styles.verifiedPrescriptionBadge}>
                          <Text style={styles.verifiedPrescriptionText}>Clinician Reviewed</Text>
                        </View>
                      </View>

                      <View style={styles.medPrescriberRow}>
                        <Stethoscope color={theme.colors.textMuted} size={14} />
                        <Text style={styles.prescriberText}>
                          {med.prescriber || 'Treating Endocrinologist'} • {med.source === 'CLINICIAN_PRESCRIBED' ? 'Authorized Rx' : 'Reviewed Rx'}
                        </Text>
                      </View>

                      {/* One-Tap Adherence Actions */}
                      <View style={styles.medActionsRow}>
                        <TouchableOpacity
                          style={styles.takeBtn}
                          onPress={() => handleLogAdherence(med.id, 'TAKEN')}
                          disabled={recordingDoseId === med.id}
                        >
                          <Check color={theme.colors.white} size={15} />
                          <Text style={styles.takeBtnText}>Take Dose</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.skipBtn}
                          onPress={() => handleLogAdherence(med.id, 'SKIPPED')}
                          disabled={recordingDoseId === med.id}
                        >
                          <X color={theme.colors.textSecondary} size={15} />
                          <Text style={styles.skipBtnText}>Skip Dose</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyContainer}>
                    <Pill color={theme.colors.textMuted} size={32} />
                    <Text style={styles.emptyTitle}>No Active Prescriptions Documented</Text>
                    <Text style={styles.emptySub}>
                      Your doctor will record prescribed diabetes medications during your clinical consultation.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ============================================================== */}
            {/* 3. LIFESTYLE MODULE                                            */}
            {/* ============================================================== */}
            {activeTab === 'LIFESTYLE' && (
              <View style={styles.tabSection}>
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={() => setShowLifestyleModal(true)}
                  activeOpacity={0.88}
                >
                  <Plus color={theme.colors.white} size={20} />
                  <Text style={styles.primaryActionBtnText}>Log Lifestyle Activity</Text>
                </TouchableOpacity>

                <Text style={styles.sectionHeaderTitle}>Recent Lifestyle Records</Text>
                {lifestyleEntries.length > 0 ? (
                  lifestyleEntries.map((item) => (
                    <View key={item.id} style={styles.lifestyleCard}>
                      <View style={styles.lifestyleHeader}>
                        <View style={styles.lifestyleIconBox}>
                          <Flame color="#D97706" size={18} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lifestyleCat}>{item.category.replace(/_/g, ' ')}</Text>
                          <Text style={styles.lifestyleValue}>
                            {item.numericValue ? `${item.numericValue} ${item.unit || ''}` : item.qualitativeValue || 'Completed'}
                          </Text>
                          {item.notes && <Text style={styles.lifestyleNotes}>"{item.notes}"</Text>}
                        </View>
                        <Text style={styles.lifestyleDate}>
                          {new Date(item.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyContainer}>
                    <Flame color={theme.colors.textMuted} size={32} />
                    <Text style={styles.emptyTitle}>No Lifestyle Records Logged</Text>
                    <Text style={styles.emptySub}>Track 30 minutes of physical activity, restful sleep, or water intake.</Text>
                  </View>
                )}
              </View>
            )}

            {/* ============================================================== */}
            {/* 4. MEDICAL REPORTS MODULE                                      */}
            {/* ============================================================== */}
            {activeTab === 'MEDICAL_REPORTS' && (
              <View style={styles.tabSection}>
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={() => setShowUploadModal(true)}
                  activeOpacity={0.88}
                >
                  <FileUp color={theme.colors.white} size={20} />
                  <Text style={styles.primaryActionBtnText}>Upload Report Photo or PDF</Text>
                </TouchableOpacity>

                <View style={styles.abhaCard}>
                  <Text style={styles.abhaEyebrow}>ABHA SHOWCASE SANDBOX</Text>
                  <Text style={styles.abhaDescription}>Export a patient-health summary or import the bundled synthetic record. No ABDM connection and no real patient data.</Text>
                  <View style={styles.abhaActions}>
                    <TouchableOpacity style={styles.abhaSecondaryButton} onPress={() => void runSyntheticAbhaExchange('export')} disabled={Boolean(abhaBusy)}>
                      <Text style={styles.abhaSecondaryText}>{abhaBusy === 'export' ? 'Preparing…' : 'Export to ABHA ID'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.abhaPrimaryButton} onPress={() => void runSyntheticAbhaExchange('import')} disabled={Boolean(abhaBusy)}>
                      <Text style={styles.abhaPrimaryText}>{abhaBusy === 'import' ? 'Importing…' : 'Import from ABHA ID'}</Text>
                    </TouchableOpacity>
                  </View>
                  {abhaMessage ? <Text style={styles.abhaMessage}>{abhaMessage}</Text> : null}
                  {abhaSummary ? <View style={styles.abhaSummaryRow}><Text style={styles.abhaSummaryText}>Synthetic ID: {abhaSummary.abhaId}</Text><Text style={styles.abhaSummaryText}>Records: {(Object.values(abhaSummary.counts || {}) as Array<number | string>).reduce<number>((sum, value) => sum + Number(value), 0)}</Text></View> : null}
                  {abhaSummary ? <View style={styles.abhaSummaryDetail}><Text style={styles.abhaSummaryText}>Health summary: {abhaSummary.patient?.fullName || 'Synthetic Demo Patient'}</Text><Text style={styles.abhaSummaryDetailText}>Recent readings: {(abhaSummary.observations || []).slice(0, 2).map((item: any) => `${item.type.replace(/_/g, ' ')} ${item.numericValue} ${item.unit}`).join(' · ') || 'None'}</Text><Text style={styles.abhaSummaryDetailText}>Active medicines: {(abhaSummary.medications || []).slice(0, 2).map((item: any) => item.medicationName || item.medicineName).join(' · ') || 'None'}</Text></View> : null}
                </View>

                <Text style={styles.sectionHeaderTitle}>Lab Reports & Diagnostics ({reports.length})</Text>
                {reports.length > 0 ? (
                  reports.map((doc) => (
                    <View key={doc.id} style={styles.reportCard}>
                      <View style={styles.reportIconBox}>
                        <FileText color={theme.colors.primary} size={22} />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.reportTitle}>{doc.title}</Text>
                        {doc.issuingFacility ? <Text style={styles.reportFacility}>{doc.issuingFacility}</Text> : null}
                        <Text style={styles.reportDate}>
                          Uploaded: {new Date(doc.reportDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                        <View style={[
                          styles.reportStatusBadge,
                          doc.processingStatus === 'EXTRACTION_FAILED' && styles.reportStatusBadgeFailed,
                          doc.processingStatus === 'PENDING' && styles.reportStatusBadgePending,
                        ]}>
                          <Text style={[
                            styles.reportStatusText,
                            doc.processingStatus === 'EXTRACTION_FAILED' && styles.reportStatusTextFailed,
                            doc.processingStatus === 'PENDING' && styles.reportStatusTextPending,
                          ]}>
                            {doc.processingStatus === 'PENDING'
                              ? `${doc.extractedData?.provider || 'OCR'}: extracting text`
                              : doc.processingStatus === 'NEEDS_REVIEW'
                                ? `${doc.extractedData?.provider || 'OCR'}: text extracted`
                                : doc.processingStatus === 'OCR_NO_TEXT'
                                ? `${doc.extractedData?.provider || 'OCR'}: no text detected`
                                  : doc.processingStatus === 'EXTRACTION_FAILED'
                                ? `${doc.extractedData?.provider || 'OCR'}: extraction failed`
                                    : 'Report saved'}
                          </Text>
                        </View>
                        {doc.extractedData?.error ? (
                          <Text style={styles.reportExtractionError}>{doc.extractedData.error}</Text>
                        ) : null}
                        {doc.extractedData?.text ? (
                          <>
                            <Text style={styles.reportExtractedText} numberOfLines={4}>{doc.extractedData.text}</Text>
                            <TouchableOpacity style={styles.reviewReportButton} onPress={() => void openReportReview(doc)} accessibilityRole="button" accessibilityLabel={`Review OCR and original file for ${doc.title}`}>
                              <Text style={styles.reviewReportButtonText}>Review OCR & original file</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyContainer}>
                    <FileText color={theme.colors.textMuted} size={32} />
                    <Text style={styles.emptyTitle}>No Medical Reports Saved</Text>
                    <Text style={styles.emptySub}>Upload HbA1c lab reports, lipid profiles, and urine microalbumin PDFs for review.</Text>
                  </View>
                )}
              </View>
            )}

            {/* ============================================================== */}
            {/* 5. HEALTH TIMELINE MODULE                                      */}
            {/* ============================================================== */}
            {activeTab === 'HEALTH_TIMELINE' && (
              <View style={styles.tabSection}>
                <Text style={styles.sectionHeaderTitle}>Unified Clinical Event Timeline</Text>
                {timelineEvents.length > 0 ? (
                  timelineEvents.map((event) => (
                    <View key={event.id} style={styles.timelineRow}>
                      <View style={styles.timelineSpine}>
                        <View style={styles.timelineMarker} />
                        <View style={styles.timelineLine} />
                      </View>
                      <View style={styles.timelineCard}>
                        <View style={styles.timelineHeader}>
                          <Text style={styles.timelineTypeTag}>{event.eventType.replace(/_/g, ' ')}</Text>
                          <Text style={styles.timelineTime}>
                            {new Date(event.occurredAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </Text>
                        </View>
                        <Text style={styles.timelineTitle}>{event.title}</Text>
                        {event.details && <Text style={styles.timelineDetails}>{event.details}</Text>}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyContainer}>
                    <Calendar color={theme.colors.textMuted} size={32} />
                    <Text style={styles.emptyTitle}>No Timeline Events Recorded</Text>
                    <Text style={styles.emptySub}>Events, consultations, and readings will populate chronologically here.</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* MODAL: LOG BLOOD SUGAR / VITALS */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Health Reading</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            {/* Vital Type Selector */}
            <View style={styles.vitalTypeRow}>
              {(['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.vitalTypeBtn, vitalType === t && styles.vitalTypeBtnActive]}
                  onPress={() => setVitalType(t)}
                >
                  <Text style={[styles.vitalTypeBtnText, vitalType === t && styles.vitalTypeBtnTextActive]}>
                    {t === 'BLOOD_GLUCOSE' ? 'Glucose' : t === 'BLOOD_PRESSURE' ? 'BP' : t === 'WEIGHT' ? 'Weight' : 'HbA1c'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {vitalType === 'BLOOD_GLUCOSE'
                  ? 'Blood Glucose (mg/dL)'
                  : vitalType === 'BLOOD_PRESSURE'
                    ? 'Systolic (mmHg)'
                    : vitalType === 'WEIGHT'
                      ? 'Weight (kg)'
                      : 'HbA1c (%)'}
              </Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="e.g. 110"
                value={primaryValue}
                onChangeText={setPrimaryValue}
              />
            </View>

            {vitalType === 'BLOOD_PRESSURE' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Diastolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 78"
                  value={secondaryValue}
                  onChangeText={setSecondaryValue}
                />
              </View>
            )}

            {vitalType === 'BLOOD_GLUCOSE' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meal Context</Text>
                <View style={styles.contextGrid}>
                  {(['FASTING', 'POST_MEAL_2HR', 'RANDOM', 'BEDTIME'] as const).map((ctx) => (
                    <TouchableOpacity
                      key={ctx}
                      style={[styles.contextOption, vitalContext === ctx && styles.contextOptionActive]}
                      onPress={() => setVitalContext(ctx)}
                    >
                      <Text style={[styles.contextOptionText, vitalContext === ctx && styles.contextOptionTextActive]}>
                        {ctx.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Clinical Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 64 }]}
                placeholder="e.g. Taken after 15 min morning walk"
                value={vitalNotes}
                onChangeText={setVitalNotes}
                multiline
              />
            </View>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleLogVital}
              disabled={submittingVital}
            >
              {submittingVital ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Reading</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: LOG LIFESTYLE */}
      <Modal visible={showLifestyleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Lifestyle Activity</Text>
              <TouchableOpacity onPress={() => setShowLifestyleModal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.vitalTypeRow}>
              {(['PHYSICAL_ACTIVITY', 'SLEEP', 'HYDRATION'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.vitalTypeBtn, lifestyleCategory === cat && styles.vitalTypeBtnActive]}
                  onPress={() => setLifestyleCategory(cat)}
                >
                  <Text style={[styles.vitalTypeBtnText, lifestyleCategory === cat && styles.vitalTypeBtnTextActive]}>
                    {cat === 'PHYSICAL_ACTIVITY' ? 'Exercise' : cat === 'SLEEP' ? 'Sleep' : 'Hydration'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {lifestyleCategory === 'PHYSICAL_ACTIVITY' ? 'Duration (Minutes)' : lifestyleCategory === 'SLEEP' ? 'Duration (Hours)' : 'Water Intake (Glasses)'}
              </Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder={lifestyleCategory === 'PHYSICAL_ACTIVITY' ? 'e.g. 30' : lifestyleCategory === 'SLEEP' ? 'e.g. 7.5' : 'e.g. 8'}
                value={lifestyleValue}
                onChangeText={setLifestyleValue}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Activity Notes</Text>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                placeholder="e.g. Evening brisk walking in garden"
                value={lifestyleNotes}
                onChangeText={setLifestyleNotes}
                multiline
              />
            </View>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleLogLifestyle}
              disabled={submittingLifestyle}
            >
              {submittingLifestyle ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Lifestyle Record</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: REVIEW OCR AND ORIGINAL MEDICAL REPORT */}
      <Modal visible={Boolean(selectedReportForReview)} transparent animationType="slide" onRequestClose={() => setSelectedReportForReview(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Review Medical Report</Text>
                <Text style={styles.reportFacility} numberOfLines={1}>{selectedReportForReview?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedReportForReview(null)} accessibilityRole="button" accessibilityLabel="Close report review" style={styles.modalCloseButton}><X color={theme.colors.text} size={22} /></TouchableOpacity>
            </View>
            {selectedReportForReview?.extractedData?.isSynthetic || selectedReportForReview?.extractedData?.provider?.includes('SYNTHETIC') ? (
              <View style={styles.syntheticNotice}><ShieldCheck color="#92400E" size={17} /><Text style={styles.syntheticNoticeText}>Synthetic showcase OCR. Not connected to ABDM and not real patient data.</Text></View>
            ) : null}
            <View style={styles.reviewTabRow}>
              <TouchableOpacity style={[styles.reviewTab, reportReviewTab === 'ocr' && styles.reviewTabActive]} onPress={() => setReportReviewTab('ocr')}><Text style={[styles.reviewTabText, reportReviewTab === 'ocr' && styles.reviewTabTextActive]}>OCR review</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.reviewTab, reportReviewTab === 'source' && styles.reviewTabActive]} onPress={() => setReportReviewTab('source')}><Text style={[styles.reviewTabText, reportReviewTab === 'source' && styles.reviewTabTextActive]}>Original file</Text></TouchableOpacity>
            </View>
            {reportReviewTab === 'ocr' ? (
              <ScrollView style={styles.reviewBody} contentContainerStyle={{ gap: 12 }}>
                <View style={styles.reviewStatusCard}><Text style={styles.reviewStatusLabel}>Extraction status</Text><Text style={styles.reviewStatusValue}>{selectedReportForReview?.processingStatus.replace(/_/g, ' ')}</Text><Text style={styles.reportFacility}>{selectedReportForReview?.extractedData?.provider || 'OCR provider'}</Text></View>
                {selectedReportForReview?.extractedData?.error ? <Text style={styles.reportExtractionError}>{selectedReportForReview.extractedData.error}</Text> : null}
                <Text style={styles.reviewBodyText}>{selectedReportForReview?.extractedData?.text || 'No OCR text is available yet.'}</Text>
                <Text style={styles.reviewHelperText}>Compare this extracted text with the original file before relying on it. OCR is a reading aid, not a diagnosis.</Text>
              </ScrollView>
            ) : (
              selectedReportForReview && reportPreviewToken ? (
                <View style={styles.reportSourceFrame}>
                  {selectedReportForReview.mimeType?.startsWith('image/') ? <Image source={{ uri: `${resolveApiBaseUrl()}/documents/${encodeURIComponent(selectedReportForReview.id)}/preview`, headers: { Authorization: `Bearer ${reportPreviewToken}` } }} style={styles.reportSourceImage} resizeMode="contain" /> : <WebView source={{ uri: `${resolveApiBaseUrl()}/documents/${encodeURIComponent(selectedReportForReview.id)}/preview`, headers: { Authorization: `Bearer ${reportPreviewToken}` } }} style={styles.reportSourceWebView} startInLoadingState />}
                </View>
              ) : <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 40 }} />
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: UPLOAD MEDICAL REPORT */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Medical Report</Text>
              <TouchableOpacity
                onPress={() => setShowUploadModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close report upload"
                style={styles.modalCloseButton}
              >
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={styles.reportPickerPrompt}>Take a new photo or choose a saved photo or PDF.</Text>
            <View style={styles.filePickerRow}>
              <TouchableOpacity
                style={styles.filePickerButton}
                onPress={() => void selectReportFile('camera')}
                disabled={selectingReport || submittingUpload}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Take a medical report photo"
              >
                <Camera color={theme.colors.primary} size={20} />
                <Text style={styles.filePickerButtonText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filePickerButton}
                onPress={() => void selectReportFile('photos')}
                disabled={selectingReport || submittingUpload}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Choose a report photo from the library"
              >
                <ImageIcon color={theme.colors.primary} size={20} />
                <Text style={styles.filePickerButtonText}>Choose photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filePickerButton}
                onPress={() => void selectReportFile('pdf')}
                disabled={selectingReport || submittingUpload}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Choose a medical report PDF"
              >
                <FileText color={theme.colors.primary} size={20} />
                <Text style={styles.filePickerButtonText}>Choose PDF</Text>
              </TouchableOpacity>
            </View>
            {selectingReport ? <ActivityIndicator color={theme.colors.primary} /> : null}
            {selectedReportFile ? (
              <View style={styles.selectedReportFile}>
                <FileText color={theme.colors.primary} size={18} />
                <Text style={styles.selectedReportFileName} numberOfLines={1}>{selectedReportFile.name}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedReportFile(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove selected report"
                  style={styles.modalCloseButton}
                >
                  <X color={theme.colors.textSecondary} size={18} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Report Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Apollo HbA1c Lab Report"
                value={uploadTitle}
                onChangeText={setUploadTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Diagnostic Facility</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Apollo Diagnostics, Pune"
                value={uploadFacility}
                onChangeText={setUploadFacility}
              />
            </View>

            <View style={styles.uploadInfoBox}>
              <FileUp color={theme.colors.primary} size={24} />
              <Text style={styles.uploadInfoText}>
                The original is retained in your private records. Google Cloud Vision extracts text only; check the extracted text against your report.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleUploadReport}
              disabled={submittingUpload || selectingReport || !selectedReportFile}
              accessibilityRole="button"
            >
              {submittingUpload ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Upload and Extract Text</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  headerSub: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: theme.typography.weights.semibold,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  // Tabs Container
  tabsContainer: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: 8,
  },
  tabsScroll: { paddingHorizontal: theme.spacing.lg, gap: 8 },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.cardMuted,
  },
  tabPillActive: { backgroundColor: theme.colors.primary },
  tabPillText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  tabPillTextActive: { color: theme.colors.white },
  // Content Scroll
  contentScroll: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.bg,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
  },
  tabSection: { gap: theme.spacing.lg },
  // Stats Row
  statsRow: { flexDirection: 'row', gap: theme.spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  statBoxNum: {
    fontSize: 24,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  statBoxUnit: { fontSize: 10, color: theme.colors.textMuted, fontWeight: theme.typography.weights.bold },
  statBoxLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
    marginTop: 4,
  },
  // Primary Action Button
  primaryActionBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...theme.shadows.card,
  },
  primaryActionBtnText: {
    color: theme.colors.white,
    fontWeight: theme.typography.weights.extrabold,
    fontSize: theme.typography.sizes.body,
  },
  // Filter Chips
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  filterChipTextActive: { color: theme.colors.white },
  // Logbook List
  logListCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderTitle: {
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    marginBottom: 8,
  },
  obsItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  obsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  obsDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: theme.colors.success },
  dotAmber: { backgroundColor: '#F59E0B' },
  dotRed: { backgroundColor: '#EF4444' },
  obsValueText: { fontSize: 18, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  obsUnitText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  obsContextText: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  obsRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  badgeGreen: { backgroundColor: theme.colors.successBg },
  badgeAmber: { backgroundColor: '#FEF3C7' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  statusBadgeText: { fontSize: 10, fontWeight: theme.typography.weights.bold },
  badgeGreenText: { color: theme.colors.success },
  badgeAmberText: { color: '#B45309' },
  badgeRedText: { color: '#B91C1C' },
  obsDateText: { fontSize: 11, color: theme.colors.textMuted },
  // Med Vault Styles
  clinicalNoticeCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  clinicalNoticeTitle: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: '#166534' },
  clinicalNoticeBody: { fontSize: 11, color: '#15803D', marginTop: 2, lineHeight: 16 },
  medicationErrorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.errorBg,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  medicationErrorText: { color: theme.colors.error, fontSize: 12, lineHeight: 18 },
  medicationRetryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
  },
  medicationRetryText: { color: theme.colors.error, fontSize: 12, fontWeight: theme.typography.weights.bold },
  adherenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  adherenceBannerTitle: { fontSize: theme.typography.sizes.body, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  adherenceBannerSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  adherenceBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  adherenceBadgeText: { fontSize: 16, fontWeight: theme.typography.weights.black, color: theme.colors.primary },
  medCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  medCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  medName: { fontSize: theme.typography.sizes.bodyLg, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  medDetails: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: theme.typography.weights.medium },
  medInstructions: { fontSize: 11, color: '#166534', marginTop: 4, fontWeight: theme.typography.weights.semibold },
  verifiedPrescriptionBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  verifiedPrescriptionText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: '#15803D' },
  medPrescriberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prescriberText: { fontSize: 11, color: theme.colors.textMuted },
  medActionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  takeBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    borderRadius: theme.radius.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  takeBtnText: { color: theme.colors.white, fontWeight: theme.typography.weights.bold, fontSize: 12 },
  skipBtn: {
    flex: 1,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  skipBtnText: { color: theme.colors.textSecondary, fontWeight: theme.typography.weights.bold, fontSize: 12 },
  // Lifestyle Styles
  lifestyleCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  lifestyleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lifestyleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifestyleCat: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: '#D97706' },
  lifestyleValue: { fontSize: 15, fontWeight: theme.typography.weights.black, color: theme.colors.text, marginTop: 1 },
  lifestyleNotes: { fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  lifestyleDate: { fontSize: 11, color: theme.colors.textMuted },
  // Medical Reports Styles
  reportCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  reportIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTitle: { fontSize: theme.typography.sizes.body, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  reportFacility: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  reportDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  reportStatusBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  reportStatusText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: '#166534' },
  reportStatusBadgePending: { backgroundColor: '#FEF3C7' },
  reportStatusTextPending: { color: '#92400E' },
  reportStatusBadgeFailed: { backgroundColor: '#FEE2E2' },
  reportStatusTextFailed: { color: '#B91C1C' },
  reportExtractionError: { fontSize: 11, color: '#B91C1C', lineHeight: 16 },
  reportExtractedText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 16,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  reviewReportButton: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  reviewReportButtonText: { color: theme.colors.white, fontSize: 11, fontWeight: theme.typography.weights.bold },
  abhaCard: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', borderWidth: 1, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 8 },
  abhaEyebrow: { color: '#3730A3', fontSize: 10, fontWeight: theme.typography.weights.black, letterSpacing: 1 },
  abhaDescription: { color: '#312E81', fontSize: 11, lineHeight: 16 },
  abhaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  abhaSecondaryButton: { backgroundColor: theme.colors.white, borderColor: '#A5B4FC', borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  abhaSecondaryText: { color: '#3730A3', fontSize: 11, fontWeight: theme.typography.weights.bold },
  abhaPrimaryButton: { backgroundColor: '#4338CA', borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  abhaPrimaryText: { color: theme.colors.white, fontSize: 11, fontWeight: theme.typography.weights.bold },
  abhaMessage: { backgroundColor: theme.colors.white, borderRadius: theme.radius.sm, color: '#312E81', fontSize: 11, padding: 8 },
  abhaSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  abhaSummaryText: { color: '#3730A3', fontSize: 10, fontWeight: theme.typography.weights.bold },
  abhaSummaryDetail: { backgroundColor: theme.colors.white, borderRadius: theme.radius.sm, gap: 4, padding: 8 },
  abhaSummaryDetailText: { color: '#312E81', fontSize: 10, lineHeight: 15 },
  syntheticNotice: { alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderRadius: theme.radius.sm, borderWidth: 1, flexDirection: 'row', gap: 7, padding: 9 },
  syntheticNoticeText: { color: '#78350F', flex: 1, fontSize: 11, lineHeight: 15 },
  reviewTabRow: { borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 8, marginTop: 12 },
  reviewTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingHorizontal: 10, paddingVertical: 9 },
  reviewTabActive: { borderBottomColor: theme.colors.primary },
  reviewTabText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: theme.typography.weights.bold },
  reviewTabTextActive: { color: theme.colors.primary },
  reviewBody: { maxHeight: 360, marginTop: 12 },
  reviewStatusCard: { backgroundColor: theme.colors.primarySurface, borderColor: '#99F6E4', borderRadius: theme.radius.md, borderWidth: 1, padding: 12 },
  reviewStatusLabel: { color: theme.colors.primary, fontSize: 10, fontWeight: theme.typography.weights.black, letterSpacing: 1 },
  reviewStatusValue: { color: theme.colors.text, fontSize: 15, fontWeight: theme.typography.weights.black, marginTop: 4 },
  reviewBodyText: { backgroundColor: theme.colors.bg, borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 12, lineHeight: 18, padding: 12 },
  reviewHelperText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  reportSourceFrame: { backgroundColor: theme.colors.bg, borderRadius: theme.radius.md, height: 380, marginTop: 12, overflow: 'hidden' },
  reportSourceImage: { height: '100%', width: '100%' },
  reportSourceWebView: { flex: 1 },
  // Timeline Styles
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineSpine: { alignItems: 'center', width: 16 },
  timelineMarker: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: theme.colors.borderLight, marginVertical: 2 },
  timelineCard: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  timelineTypeTag: { fontSize: 10, fontWeight: theme.typography.weights.black, color: theme.colors.primary },
  timelineTime: { fontSize: 11, color: theme.colors.textMuted },
  timelineTitle: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  timelineDetails: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  // Empty State
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: theme.typography.sizes.body, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  emptySub: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: 14,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalCloseButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: theme.typography.sizes.headingSm, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  vitalTypeRow: { flexDirection: 'row', gap: 6 },
  vitalTypeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardMuted,
    alignItems: 'center',
  },
  vitalTypeBtnActive: { backgroundColor: theme.colors.primary },
  vitalTypeBtnText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  vitalTypeBtnTextActive: { color: theme.colors.white },
  inputGroup: { gap: 4 },
  inputLabel: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  textInput: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.typography.sizes.body,
    color: theme.colors.text,
  },
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  contextOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.cardMuted,
  },
  contextOptionActive: { backgroundColor: theme.colors.primary },
  contextOptionText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  contextOptionTextActive: { color: theme.colors.white },
  uploadInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primarySurface,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  uploadInfoText: { fontSize: 11, color: theme.colors.primaryDark, flex: 1, lineHeight: 16 },
  reportPickerPrompt: { fontSize: 12, color: theme.colors.textSecondary },
  filePickerRow: { flexDirection: 'row', gap: 8 },
  filePickerButton: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 4,
  },
  filePickerButtonText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  selectedReportFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primarySurface,
    borderRadius: theme.radius.md,
    paddingLeft: theme.spacing.md,
  },
  selectedReportFileName: { flex: 1, fontSize: 12, color: theme.colors.text, fontWeight: theme.typography.weights.semibold },
  modalSubmitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalSubmitBtnText: { color: theme.colors.white, fontWeight: theme.typography.weights.bold, fontSize: 14 },
});
