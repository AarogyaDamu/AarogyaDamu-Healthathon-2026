import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Pill,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  Calendar,
  X,
  Stethoscope,
  Info,
  ChevronRight,
  Sun,
  Sunset,
  Moon,
  Coffee,
  Check,
  User,
  Star,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  medicationApi,
  type MobileMedication,
  type MobileAdherenceStats,
  type MobileAdherenceEvent,
  type IssuedPrescription,
} from '../../src/api/medications';
import { coordinationApi } from '../../src/api/coordination';
import { useToast } from '../../components/ui/ToastProvider';

export default function MedicationsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [medications, setMedications] = useState<MobileMedication[]>([]);
  const [prescriptions, setPrescriptions] = useState<IssuedPrescription[]>([]);
  const [selectedPrescription, setSelectedPrescription] = useState<IssuedPrescription | null>(null);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [stats, setStats] = useState<MobileAdherenceStats | null>(null);
  const [userRole, setUserRole] = useState<'PATIENT' | 'CAREGIVER'>('PATIENT');
  const [patientId, setPatientId] = useState<string | null>(null);

  // Tab view: SCHEDULE (Today's Doses), ALL_PRESCRIBED, OFFICIAL_RX, UNREVIEWED, DISCONTINUED
  const [activeTab, setActiveTab] = useState<'SCHEDULE' | 'ALL_PRESCRIBED' | 'OFFICIAL_RX' | 'UNREVIEWED' | 'DISCONTINUED'>('SCHEDULE');

  // Adherence action state
  const [markingMedId, setMarkingMedId] = useState<string | null>(null);

  // Modal: Skip Dose Reason
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [selectedMedForSkip, setSelectedMedForSkip] = useState<MobileMedication | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [submittingSkip, setSubmittingSkip] = useState(false);

  // Local state for today's dose statuses (keyed by medicationId)
  const [todayAdherence, setTodayAdherence] = useState<Record<string, { action: 'TAKEN' | 'SKIPPED'; time?: string; reason?: string }>>({});

  const loadData = useCallback(async () => {
    try {
      const ctx = await coordinationApi.getContext();
      if (ctx) {
        if (ctx.defaultRole === 'CAREGIVER' || ctx.availableRoles.includes('CAREGIVER')) {
          setUserRole('CAREGIVER');
        }
        if (ctx.userId) {
          setPatientId(ctx.userId);
        }
      }

      const [medsList, adherenceStats, rxList] = await Promise.all([
        medicationApi.getMedications({ status: 'ALL' }),
        medicationApi.getAdherenceStats({ days: 14 }),
        medicationApi.getPrescriptions().catch(() => []),
      ]);

      setMedications(medsList);
      setStats(adherenceStats);
      setPrescriptions(rxList || []);

      // Map today's adherence from latest events
      const todayMap: Record<string, { action: 'TAKEN' | 'SKIPPED'; time?: string; reason?: string }> = {};
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      medsList.forEach((med) => {
        if (med.events && med.events.length > 0) {
          const recent = med.events[0];
          const eventDate = new Date(recent.recordedAt);
          if (eventDate >= todayStart) {
            if (recent.action === 'TAKEN' || recent.action === 'SKIPPED') {
              todayMap[med.id] = {
                action: recent.action,
                time: eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                reason: recent.notes || undefined,
              };
            }
          }
        }
      });
      setTodayAdherence(todayMap);
    } catch {
      showToast('Unable to sync medication schedule. Showing local data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // 1. Patient Marks Dose as TAKEN
  const handleTakeDose = async (med: MobileMedication) => {
    setMarkingMedId(med.id);
    try {
      await medicationApi.recordAdherenceEvent(
        med.id,
        'TAKEN',
        'Taken as scheduled',
        new Date().toISOString(),
      );
      setTodayAdherence((prev) => ({
        ...prev,
        [med.id]: {
          action: 'TAKEN',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      }));
      showToast(`✓ Marked ${med.name} as TAKEN`);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record dose. Please try again.');
    } finally {
      setMarkingMedId(null);
    }
  };

  // 2. Patient Reports Dose as SKIPPED
  const handleConfirmSkipDose = async () => {
    if (!selectedMedForSkip) return;
    setSubmittingSkip(true);
    try {
      await medicationApi.recordAdherenceEvent(
        selectedMedForSkip.id,
        'SKIPPED',
        skipReason.trim() || 'Reported skipped by patient',
        new Date().toISOString(),
      );
      setTodayAdherence((prev) => ({
        ...prev,
        [selectedMedForSkip.id]: {
          action: 'SKIPPED',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reason: skipReason.trim() || undefined,
        },
      }));
      showToast(`Logged: Skipped dose for ${selectedMedForSkip.name}`);
      setIsSkipModalOpen(false);
      setSelectedMedForSkip(null);
      setSkipReason('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to log skipped dose.');
    } finally {
      setSubmittingSkip(false);
    }
  };

  // Group medications by Schedule Time Buckets
  const scheduleBuckets = useMemo(() => {
    const morning: MobileMedication[] = [];
    const afternoon: MobileMedication[] = [];
    const evening: MobileMedication[] = [];
    const night: MobileMedication[] = [];

    const activeMeds = medications.filter((m) => m.status === 'ACTIVE');

    activeMeds.forEach((m) => {
      const t = (m.timing || m.timeOfDay || '').toUpperCase();
      if (t.includes('NIGHT') || t.includes('BEDTIME')) {
        night.push(m);
      } else if (t.includes('EVENING') || t.includes('DINNER')) {
        evening.push(m);
      } else if (t.includes('AFTERNOON') || t.includes('LUNCH')) {
        afternoon.push(m);
      } else {
        // Default to Morning
        morning.push(m);
      }
    });

    return [
      { id: 'MORNING', title: 'Morning', time: '8:00 AM', icon: Sun, iconColor: '#d97706', meds: morning },
      { id: 'AFTERNOON', title: 'Afternoon', time: '1:00 PM', icon: Coffee, iconColor: '#059669', meds: afternoon },
      { id: 'EVENING', title: 'Evening', time: '7:30 PM', icon: Sunset, iconColor: '#004D4D', meds: evening },
      { id: 'NIGHT', title: 'Night', time: '10:00 PM', icon: Moon, iconColor: '#4f46e5', meds: night },
    ];
  }, [medications]);

  // Tab filtered subsets
  const unreviewedMeds = useMemo(() => {
    return medications.filter((m) => m.source === 'PATIENT_ENTERED' && m.reviewStatus === 'UNREVIEWED');
  }, [medications]);

  const discontinuedMeds = useMemo(() => {
    return medications.filter((m) => m.status === 'DISCONTINUED' || m.status === 'PAUSED');
  }, [medications]);

  const allDoctorPrescriptions = useMemo(() => {
    return medications.filter((m) => m.source === 'CLINICIAN_PRESCRIBED');
  }, [medications]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header (Alexandria Style) */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.screenTitle}>Med Vault</Text>
          <Text style={styles.screenSubtitle}>
            {userRole === 'CAREGIVER'
              ? 'Caregiver View • Doctor-Prescribed Regimen'
              : 'Doctor-Prescribed Regimen & Daily Adherence'}
          </Text>
        </View>
        <View style={styles.headerBadgeContainer}>
          <View style={styles.avatarCircle}>
            <User color="#ffffff" size={16} />
          </View>
        </View>
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
        {/* 2. Clinical Non-Prescribing Safety Guardrail */}
        <View style={styles.safetyNotice}>
          <View style={styles.safetyIconBox}>
            <ShieldCheck color="#004D4D" size={16} />
          </View>
          <Text style={styles.safetyNoticeText}>
            AarogyaDamu is a personal health companion, not a prescriber. Your medication regimen is prescribed and governed by your doctor. Prescriptions cannot be added or altered without clinician authorization. To Pause Medication, contact your doctor. Reason for pausing medication must be evaluated clinically.
          </Text>
        </View>

        {/* 3. 14-Day Adherence Stats Card (Alexandria Curator Card) */}
        {stats && (
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View style={styles.statsTitleRow}>
                <View style={styles.statsIconBox}>
                  <CheckCircle2 color={theme.colors.primary} size={16} />
                </View>
                <div>
                  <Text style={styles.statsTitle}>14-Day Adherence Rate</Text>
                  <Text style={styles.statsSubtitle}>Confirmed dose consistency profile</Text>
                </div>
              </View>
              <View style={styles.adherenceBadge}>
                <Star color="#211b00" size={11} fill="#211b00" />
                <Text style={styles.adherenceBadgeText}>
                  {stats.adherenceRate >= 85 ? 'OPTIMAL' : 'MONITOR'}
                </Text>
              </View>
            </View>

            <View style={styles.adherenceRateRow}>
              <View style={styles.rateDisplay}>
                <Text style={styles.rateNumber}>{stats.adherenceRate}%</Text>
                <Text style={styles.rateBenchmark}>target rate (&gt;85%)</Text>
              </View>
              <Text style={styles.rateSummary}>
                {stats.takenCount} of {stats.takenCount + stats.skippedCount} Taken
              </Text>
            </View>

            {/* Adherence Micro Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(0, stats.adherenceRate))}%` },
                ]}
              />
              {stats.skippedCount > 0 && (
                <View
                  style={[
                    styles.progressBarSkipped,
                    { width: `${Math.min(100, 100 - stats.adherenceRate)}%` },
                  ]}
                />
              )}
            </View>

            {/* 3 Metrics Pill Boxes */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <View style={styles.statRowVal}>
                  <CheckCircle color="#059669" size={14} />
                  <Text style={styles.statValue}>{stats.takenCount}</Text>
                </View>
                <Text style={styles.statLabel}>Taken</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <View style={styles.statRowVal}>
                  <XCircle color="#ba1a1a" size={14} />
                  <Text style={[styles.statValue, { color: '#ba1a1a' }]}>{stats.skippedCount}</Text>
                </View>
                <Text style={styles.statLabel}>Skipped</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <View style={styles.statRowVal}>
                  <Clock color={theme.colors.textMuted} size={14} />
                  <Text style={[styles.statValue, { color: theme.colors.textMuted }]}>
                    {Math.max(0, (stats.totalEvents || 0) - stats.takenCount - stats.skippedCount)}
                  </Text>
                </View>
                <Text style={styles.statLabel}>Not Confirmed</Text>
              </View>
            </View>
          </View>
        )}

        {/* 4. Tab Navigation Bar (Alexandria Pill Segmented Bar) */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'SCHEDULE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('SCHEDULE')}
          >
            <Calendar
              color={activeTab === 'SCHEDULE' ? theme.colors.primary : theme.colors.textMuted}
              size={14}
            />
            <Text style={[styles.tabButtonText, activeTab === 'SCHEDULE' && styles.tabButtonTextActive]}>
              Today's Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ALL_PRESCRIBED' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ALL_PRESCRIBED')}
          >
            <Pill
              color={activeTab === 'ALL_PRESCRIBED' ? theme.colors.primary : theme.colors.textMuted}
              size={14}
            />
            <Text style={[styles.tabButtonText, activeTab === 'ALL_PRESCRIBED' && styles.tabButtonTextActive]}>
              Meds ({allDoctorPrescriptions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'OFFICIAL_RX' && styles.tabButtonActive]}
            onPress={() => setActiveTab('OFFICIAL_RX')}
          >
            <FileText
              color={activeTab === 'OFFICIAL_RX' ? theme.colors.primary : theme.colors.textMuted}
              size={14}
            />
            <Text style={[styles.tabButtonText, activeTab === 'OFFICIAL_RX' && styles.tabButtonTextActive]}>
              Official Rx ({prescriptions.length})
            </Text>
          </TouchableOpacity>

          {unreviewedMeds.length > 0 && (
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'UNREVIEWED' && styles.tabButtonActive]}
              onPress={() => setActiveTab('UNREVIEWED')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'UNREVIEWED' && styles.tabButtonTextActive]}>
                Unreviewed ({unreviewedMeds.length})
              </Text>
            </TouchableOpacity>
          )}

          {discontinuedMeds.length > 0 && (
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'DISCONTINUED' && styles.tabButtonActive]}
              onPress={() => setActiveTab('DISCONTINUED')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'DISCONTINUED' && styles.tabButtonTextActive]}>
                Discontinued
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Loading Spinner */}
        {loading && !refreshing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading prescribed regimens...</Text>
          </View>
        )}

        {/* VIEW A: TODAY'S SCHEDULE (Bucket Grouped with Alexandria Cards) */}
        {!loading && activeTab === 'SCHEDULE' && (
          <View style={styles.scheduleContainer}>
            {scheduleBuckets.map((bucket) => {
              const BucketIcon = bucket.icon;
              return (
                <View key={bucket.id} style={styles.bucketCard}>
                  {/* Bucket Header */}
                  <View style={styles.bucketHeader}>
                    <View style={styles.bucketTitleRow}>
                      <View style={[styles.bucketIconWrap, { backgroundColor: `${bucket.iconColor}15` }]}>
                        <BucketIcon color={bucket.iconColor} size={18} />
                      </View>
                      <View>
                        <Text style={styles.bucketTitle}>{bucket.title}</Text>
                        <Text style={styles.bucketTime}>{bucket.time}</Text>
                      </View>
                    </View>
                    <View style={styles.bucketBadge}>
                      <Text style={styles.bucketCount}>
                        {bucket.meds.length} {bucket.meds.length === 1 ? 'dose' : 'doses'}
                      </Text>
                    </View>
                  </View>

                  {/* Bucket Meds */}
                  {bucket.meds.length === 0 ? (
                    <Text style={styles.noDosesText}>No scheduled doses for this period.</Text>
                  ) : (
                    bucket.meds.map((med) => {
                      const doseState = todayAdherence[med.id];
                      const isTaken = doseState?.action === 'TAKEN';
                      const isSkipped = doseState?.action === 'SKIPPED';
                      const isNotConfirmed = !isTaken && !isSkipped;
                      const isClinicianReviewed = med.reviewStatus === 'CLINICIAN_REVIEWED';

                      return (
                        <View key={med.id} style={styles.doseItem}>
                          {/* Accessible Dose Checkbox */}
                          <TouchableOpacity
                            style={[
                              styles.checkbox,
                              isTaken && styles.checkboxTaken,
                              isSkipped && styles.checkboxSkipped,
                            ]}
                            onPress={() => !isTaken && handleTakeDose(med)}
                            disabled={isTaken || markingMedId === med.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isTaken }}
                            accessibilityLabel={`Mark ${med.name} as taken`}
                          >
                            {isTaken && <Check color="#FFFFFF" size={14} />}
                            {isSkipped && <X color="#FFFFFF" size={14} />}
                          </TouchableOpacity>

                          {/* Dose Details */}
                          <View style={styles.doseInfoContainer}>
                            <View style={styles.doseNameRow}>
                              <Text style={[styles.doseName, isTaken && styles.doseNameTaken]}>
                                {med.name}
                              </Text>
                              {med.strength && (
                                <View style={styles.doseStrengthBadge}>
                                  <Text style={styles.doseStrength}>{med.strength}</Text>
                                </View>
                              )}
                            </View>

                            <Text style={styles.doseInstructions}>
                              {med.dosage} • {med.frequency}
                              {med.foodInstructions ? ` • ${med.foodInstructions}` : ''}
                            </Text>

                            {med.instructions ? (
                              <Text style={styles.doseClinicalNote}>
                                Guidance: {med.instructions}
                              </Text>
                            ) : null}

                            {/* Adherence State Label & Provenance */}
                            <View style={styles.adherenceStatusRow}>
                              {isTaken && (
                                <View style={styles.statusBadgeTaken}>
                                  <Text style={styles.statusTextTaken}>
                                    ✓ Taken at {doseState?.time || 'today'}
                                  </Text>
                                </View>
                              )}
                              {isSkipped && (
                                <View style={styles.statusBadgeSkipped}>
                                  <Text style={styles.statusTextSkipped}>
                                    ✕ Skipped{doseState?.reason ? `: ${doseState.reason}` : ''}
                                  </Text>
                                </View>
                              )}
                              {isNotConfirmed && (
                                <View style={styles.statusBadgePending}>
                                  <Text style={styles.statusTextPending}>
                                    NOT CONFIRMED • Awaiting Dose Report
                                  </Text>
                                </View>
                              )}

                              {isClinicianReviewed ? (
                                <View style={styles.provenancePillReviewed}>
                                  <CheckCircle2 color="#059669" size={11} />
                                  <Text style={styles.provenanceNote}>Clinician Reviewed</Text>
                                </View>
                              ) : (
                                <View style={styles.provenancePillUnreviewed}>
                                  <AlertCircle color="#b45309" size={11} />
                                  <Text style={styles.provenanceNoteUnreviewed}>
                                    Patient Reported (Unreviewed)
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Quick Action: Take Dose / Skip Dose Button */}
                          <View style={styles.quickActionCol}>
                            {!isTaken && !isSkipped && (
                              <>
                                <TouchableOpacity
                                  style={styles.btnTakeDose}
                                  onPress={() => handleTakeDose(med)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Take Dose ${med.name}`}
                                >
                                  <Text style={styles.btnTakeDoseText}>Take Dose</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.btnSkipDose}
                                  onPress={() => {
                                    setSelectedMedForSkip(med);
                                    setIsSkipModalOpen(true);
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Skip Dose ${med.name}`}
                                >
                                  <Text style={styles.btnSkipDoseText}>Skip Dose</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* VIEW B: ALL PRESCRIBED MEDICATIONS */}
        {!loading && activeTab === 'ALL_PRESCRIBED' && (
          <View style={styles.medsListContainer}>
            {allDoctorPrescriptions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Pill color={theme.colors.textMuted} size={40} />
                <Text style={styles.emptyTitle}>No Prescriptions on File</Text>
                <Text style={styles.emptyMessage}>
                  Your attending clinician will issue your prescriptions during your medical
                  consultation.
                </Text>
              </View>
            ) : (
              allDoctorPrescriptions.map((med) => (
                <View key={med.id} style={styles.prescCard}>
                  <View style={styles.prescHeader}>
                    <View style={styles.prescTitleRow}>
                      <View style={styles.prescIconBox}>
                        <Pill color={theme.colors.primary} size={18} />
                      </View>
                      <View>
                        <Text style={styles.prescName}>{med.name}</Text>
                        {med.genericName && (
                          <Text style={styles.prescGeneric}>Generic: {med.genericName}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.statusPillActive}>
                      <Text style={styles.statusPillTextActive}>{med.status}</Text>
                    </View>
                  </View>

                  <View style={styles.prescDetailRow}>
                    <Text style={styles.prescDetail}>
                      <Text style={styles.boldLabel}>Dosage:</Text> {med.dosage}{med.strength ? ` (${med.strength})` : ''}
                    </Text>
                    <Text style={styles.prescDetail}>
                      <Text style={styles.boldLabel}>Route:</Text> {med.route || 'ORAL'}
                    </Text>
                  </View>

                  <View style={styles.prescDetailRow}>
                    <Text style={styles.prescDetail}>
                      <Text style={styles.boldLabel}>Schedule:</Text> {med.frequency}
                    </Text>
                    <Text style={styles.prescDetail}>
                      <Text style={styles.boldLabel}>Timing:</Text> {med.timing || med.timeOfDay || 'Morning'}
                    </Text>
                  </View>

                  {med.foodInstructions && (
                    <Text style={styles.prescDetail}>
                      <Text style={styles.boldLabel}>Food:</Text> {med.foodInstructions}
                    </Text>
                  )}

                  {med.instructions && (
                    <Text style={styles.prescInstructionBox}>
                      Clinical Guidance: {med.instructions}
                    </Text>
                  )}

                  <View style={styles.prescFooter}>
                    <Text style={styles.prescDoctor}>
                      {med.prescriber ? `Prescribed by: ${med.prescriber}` : 'Attending Clinician'}
                    </Text>
                    <View style={styles.badgeReviewed}>
                      <CheckCircle2 color="#065F46" size={12} />
                      <Text style={styles.badgeReviewedText}>Clinician Reviewed</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* VIEW: OFFICIAL PRESCRIPTIONS (OFFICIAL_RX) */}
        {!loading && activeTab === 'OFFICIAL_RX' && (
          <View style={styles.medsListContainer}>
            {prescriptions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FileText color={theme.colors.textMuted} size={40} />
                <Text style={styles.emptyTitle}>No Official Prescriptions Yet</Text>
                <Text style={styles.emptyMessage}>
                  When your doctor finalizes a clinical consultation, your official digital
                  prescription document will be securely delivered here.
                </Text>
              </View>
            ) : (
              prescriptions.map((rx) => (
                <TouchableOpacity
                  key={rx.id}
                  style={styles.officialRxCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedPrescription(rx);
                    setIsPrescriptionModalOpen(true);
                  }}
                >
                  {/* Card Header */}
                  <View style={styles.officialRxHeader}>
                    <View style={styles.officialRxDoctorGroup}>
                      <View style={styles.officialRxIconBox}>
                        <Stethoscope color="#004D4D" size={18} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.officialRxDoctorName}>
                          {rx.doctor?.name || 'Attending Physician'}
                        </Text>
                        <Text style={styles.officialRxDoctorSpec}>
                          {rx.doctor?.specialty || 'Consultant Diabetologist'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.officialRxBadgeGroup}>
                      <View style={styles.rxRefBadge}>
                        <Text style={styles.rxRefText}>{rx.prescriptionReference}</Text>
                      </View>
                      <View style={styles.rxStatusBadge}>
                        <CheckCircle2 color="#065F46" size={11} />
                        <Text style={styles.rxStatusText}>ISSUED</Text>
                      </View>
                    </View>
                  </View>

                  {/* Clinic and Date Info */}
                  <View style={styles.officialRxMetaRow}>
                    <Text style={styles.officialRxClinic}>
                      {rx.clinicName || 'Apollo Sugar Clinic, Pune'}
                    </Text>
                    <Text style={styles.officialRxDate}>
                      {new Date(rx.issuedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>

                  {/* Diagnoses Pills */}
                  {rx.diagnoses && rx.diagnoses.length > 0 && (
                    <View style={styles.rxDiagnosesRow}>
                      {rx.diagnoses.map((d, idx) => (
                        <View key={idx} style={styles.rxDiagnosisChip}>
                          <Text style={styles.rxDiagnosisText}>{d.display}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Medications Summary Preview */}
                  <View style={styles.rxMedicationsBox}>
                    <Text style={styles.rxMedsCountTitle}>
                      Prescribed Regimen ({rx.medications.length} items)
                    </Text>
                    {rx.medications.map((m, mIdx) => (
                      <View key={m.id || mIdx} style={styles.rxMedItemRow}>
                        <View style={styles.rxBullet} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rxMedName}>
                            {m.medicationName}{' '}
                            <Text style={styles.rxMedDose}>({m.dosage})</Text>
                          </Text>
                          <Text style={styles.rxMedInstruction}>
                            {m.frequency} • {m.timing.replace('_', ' ')} • {m.durationDays} days
                            {m.instructions ? ` — ${m.instructions}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Lab Orders Preview */}
                  {rx.labOrders && rx.labOrders.length > 0 && (
                    <View style={styles.rxLabOrdersRow}>
                      <Text style={styles.rxLabOrdersLabel}>Labs Ordered:</Text>
                      <Text style={styles.rxLabOrdersText}>{rx.labOrders.join(', ')}</Text>
                    </View>
                  )}

                  {/* Card Action Footer */}
                  <View style={styles.officialRxCardFooter}>
                    <View style={styles.signedAuditTag}>
                      <ShieldCheck color="#004D4D" size={13} />
                      <Text style={styles.signedAuditText}>
                        Digitally Authorized &amp; Verified
                      </Text>
                    </View>
                    <View style={styles.viewDocAction}>
                      <Text style={styles.viewDocText}>View Official Prescription</Text>
                      <ChevronRight color="#004D4D" size={15} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* VIEW C: UNREVIEWED PATIENT-REPORTED MEDICATIONS */}
        {!loading && activeTab === 'UNREVIEWED' && (
          <View style={styles.medsListContainer}>
            <View style={styles.unreviewedNotice}>
              <AlertCircle color="#b45309" size={16} />
              <Text style={styles.unreviewedNoticeText}>
                These self-reported records have not yet been evaluated by your clinician. They
                will be reconciled during your upcoming clinical visit.
              </Text>
            </View>

            {unreviewedMeds.map((med) => (
              <View key={med.id} style={styles.unreviewedCard}>
                <View style={styles.prescHeader}>
                  <Text style={styles.prescName}>{med.name}</Text>
                  <View style={styles.statusBadgeUnreviewed}>
                    <Text style={styles.statusTextUnreviewed}>Patient Reported (Unreviewed)</Text>
                  </View>
                </View>
                <Text style={styles.prescDetail}>
                  {med.dosage} • {med.frequency}
                </Text>
                {med.instructions && (
                  <Text style={styles.doseClinicalNote}>Note: {med.instructions}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* VIEW D: DISCONTINUED / PAUSED MEDICATIONS */}
        {!loading && activeTab === 'DISCONTINUED' && (
          <View style={styles.medsListContainer}>
            {discontinuedMeds.map((med) => (
              <View key={med.id} style={styles.discontinuedCard}>
                <View style={styles.prescHeader}>
                  <Text style={styles.discontinuedName}>{med.name}</Text>
                  <View style={styles.statusBadgeDiscontinued}>
                    <Text style={styles.statusTextDiscontinued}>{med.status}</Text>
                  </View>
                </View>
                <Text style={styles.discontinuedDetail}>
                  {med.dosage} • {med.frequency}
                </Text>
                {med.reasonForChange && (
                  <Text style={styles.discontinuedReason}>
                    Clinical Reason for {med.status}: {med.reasonForChange}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal: Report Skipped Dose with Reason (Alexandria Dialog Sheet) */}
      <Modal
        visible={isSkipModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSkipModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Top decorative tonal bar */}
            <View style={styles.modalTonalBar} />

            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <View style={styles.modalIconWrap}>
                  <Pill color="#004D4D" size={18} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Report Skipped Dose</Text>
                  <Text style={styles.modalSubtitle}>Metabolic adherence logging protocol</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsSkipModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.modalCloseBtn}
              >
                <X color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalMedicineCard}>
              <Text style={styles.modalMedicine}>
                {selectedMedForSkip?.name} ({selectedMedForSkip?.dosage})
              </Text>
              <Text style={styles.modalMedicineSub}>
                {selectedMedForSkip?.frequency} • {selectedMedForSkip?.timing || 'Morning'}
              </Text>
            </View>

            <Text style={styles.modalPrompt}>
              Reporting a skipped dose helps your doctor understand your real-world regimen.
              Please provide an optional reason:
            </Text>

            <TextInput
              style={styles.modalInput}
              value={skipReason}
              onChangeText={setSkipReason}
              placeholder="e.g. Mild nausea, fasting for lab tests, ran out of pills"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsSkipModalOpen(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleConfirmSkipDose}
                disabled={submittingSkip}
              >
                <Text style={styles.modalSubmitBtnText}>
                  {submittingSkip ? 'Submitting...' : 'Confirm Skipped'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Official Prescription Document View */}
      <Modal
        visible={isPrescriptionModalOpen && !!selectedPrescription}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPrescriptionModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.rxDocCard}>
            <View style={styles.rxDocTonalBar} />

            {/* Document Modal Header */}
            <View style={styles.rxDocHeader}>
              <View style={styles.rxDocHeaderTitleGroup}>
                <View style={styles.rxDocIconWrap}>
                  <ShieldCheck color="#004D4D" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rxDocHeaderTitle}>Official Medical Prescription</Text>
                  <Text style={styles.rxDocHeaderSubtitle} numberOfLines={1}>
                    {selectedPrescription?.prescriptionReference} • Issued by {selectedPrescription?.doctor?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsPrescriptionModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close Prescription Document"
                style={styles.modalCloseBtn}
              >
                <X color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            {/* Document Scroll Content */}
            <ScrollView
              style={styles.rxDocScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.rxDocScrollContent}
            >
              {/* 1. Clinic Letterhead */}
              <View style={styles.letterheadBox}>
                <View style={styles.letterheadTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clinicName}>
                      {selectedPrescription?.clinicName || 'Apollo Sugar Clinic, Pune'}
                    </Text>
                    <Text style={styles.doctorName}>
                      {selectedPrescription?.doctor?.name}
                    </Text>
                    <Text style={styles.doctorSpec}>
                      {selectedPrescription?.doctor?.qualification || 'MBBS, MD (Medicine)'} •{' '}
                      {selectedPrescription?.doctor?.specialty || 'Consultant Diabetologist'}
                    </Text>
                    <Text style={styles.doctorReg}>
                      Medical Registration No: {selectedPrescription?.doctor?.registrationNumber || 'MCI-84920'}
                    </Text>
                  </View>
                  <View style={styles.letterheadRxSymbol}>
                    <Text style={styles.rxSymbolText}>℞</Text>
                  </View>
                </View>

                <View style={styles.letterheadDivider} />

                <View style={styles.letterheadMetaRow}>
                  <View>
                    <Text style={styles.metaLabel}>Prescription Ref:</Text>
                    <Text style={styles.metaValue}>{selectedPrescription?.prescriptionReference}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaLabel}>Date Issued:</Text>
                    <Text style={styles.metaValue}>
                      {selectedPrescription?.issuedAt
                        ? new Date(selectedPrescription.issuedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Recent'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.metaLabel}>Encounter:</Text>
                    <Text style={styles.metaValue}>
                      {selectedPrescription?.visitType?.replace('_', ' ') || 'Outpatient'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. Clinical Diagnoses & Assessment */}
              <View style={styles.docSection}>
                <Text style={styles.docSectionTitle}>Clinical Assessment &amp; Diagnoses</Text>
                {selectedPrescription?.diagnoses && selectedPrescription.diagnoses.length > 0 ? (
                  <View style={styles.diagnosesBox}>
                    {selectedPrescription.diagnoses.map((d, idx) => (
                      <View key={idx} style={styles.diagnosisItemRow}>
                        <CheckCircle2 color="#004D4D" size={14} />
                        <Text style={styles.diagnosisItemText}>
                          {d.code ? `[${d.code}] ` : ''}{d.display}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptySectionText}>Primary Diabetes Mellitus Consultation</Text>
                )}
              </View>

              {/* 3. Prescribed Medications (Rx Table) */}
              <View style={styles.docSection}>
                <Text style={styles.docSectionTitle}>Prescribed Medications (Rx)</Text>
                <View style={styles.medsTable}>
                  {selectedPrescription?.medications.map((m, idx) => (
                    <View key={m.id || idx} style={styles.medRow}>
                      <View style={styles.medRowHeader}>
                        <Text style={styles.medNameText}>{m.medicationName}</Text>
                        <Text style={styles.medDosageBadge}>{m.dosage}</Text>
                      </View>

                      <View style={styles.medMetaRow}>
                        <View style={styles.medMetaItem}>
                          <Text style={styles.medMetaLabel}>Frequency:</Text>
                          <Text style={styles.medMetaVal}>{m.frequency}</Text>
                        </View>
                        <View style={styles.medMetaItem}>
                          <Text style={styles.medMetaLabel}>Timing:</Text>
                          <Text style={styles.medMetaVal}>{m.timing.replace('_', ' ')}</Text>
                        </View>
                        <View style={styles.medMetaItem}>
                          <Text style={styles.medMetaLabel}>Duration:</Text>
                          <Text style={styles.medMetaVal}>{m.durationDays} Days</Text>
                        </View>
                      </View>

                      {m.instructions ? (
                        <View style={styles.medInstructionsBox}>
                          <Text style={styles.medInstructionsLabel}>Directions:</Text>
                          <Text style={styles.medInstructionsText}>{m.instructions}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>

              {/* 4. Ordered Investigations */}
              {selectedPrescription?.labOrders && selectedPrescription.labOrders.length > 0 && (
                <View style={styles.docSection}>
                  <Text style={styles.docSectionTitle}>Diagnostic Lab Orders</Text>
                  <View style={styles.labsListBox}>
                    {selectedPrescription.labOrders.map((lab, idx) => (
                      <View key={idx} style={styles.labItemChip}>
                        <Text style={styles.labItemText}>{lab}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 5. Lifestyle & Dietary Advice */}
              {selectedPrescription?.lifestyleAdvice && (
                <View style={styles.docSection}>
                  <Text style={styles.docSectionTitle}>Dietary &amp; Lifestyle Guidance</Text>
                  <View style={styles.adviceCard}>
                    <Text style={styles.adviceText}>{selectedPrescription.lifestyleAdvice}</Text>
                  </View>
                </View>
              )}

              {/* 6. Follow-up Timeline */}
              {selectedPrescription?.followUpNote && (
                <View style={styles.docSection}>
                  <Text style={styles.docSectionTitle}>Follow-Up Review</Text>
                  <View style={styles.followUpCard}>
                    <Calendar color="#004D4D" size={16} />
                    <Text style={styles.followUpText}>{selectedPrescription.followUpNote}</Text>
                  </View>
                </View>
              )}

              {/* 7. Doctor Digital Verification Seal */}
              <View style={styles.sealBox}>
                <View style={styles.sealTopRow}>
                  <ShieldCheck color="#065F46" size={24} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sealTitle}>Digitally Authorized by Clinician</Text>
                    <Text style={styles.sealDoctor}>
                      {selectedPrescription?.doctor?.name} ({selectedPrescription?.doctor?.registrationNumber || 'MCI-84920'})
                    </Text>
                  </View>
                </View>
                <Text style={styles.sealDisclaimer}>
                  This prescription was authorized through the AarogyaDamu Clinical Command Center. Tamper-evident digital audit trail recorded with medical council compliance.
                </Text>
              </View>
            </ScrollView>

            {/* Document Footer Close Button */}
            <View style={styles.rxDocFooter}>
              <TouchableOpacity
                style={styles.rxDocCloseBtn}
                onPress={() => setIsPrescriptionModalOpen(false)}
              >
                <Text style={styles.rxDocCloseBtnText}>Close Prescription</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 22,
    fontWeight: '700',
    color: '#191c20',
  },
  screenSubtitle: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '600',
    color: '#737784',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  headerBadgeContainer: {
    marginLeft: 12,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#004D4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  safetyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 14,
  },
  safetyIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  safetyNoticeText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 11.5,
    lineHeight: 17,
    color: '#78350f',
  },
  statsCard: {
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
    gap: 12,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statsIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 15,
    fontWeight: '700',
    color: '#191c20',
  },
  statsSubtitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
    marginTop: 1,
  },
  adherenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8e37f',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  adherenceBadgeText: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '800',
    color: '#211b00',
    letterSpacing: 0.5,
  },
  adherenceRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2,
  },
  rateDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  rateNumber: {
    fontFamily: 'Public Sans',
    fontSize: 32,
    fontWeight: '800',
    color: '#004D4D',
    fontVariant: ['tabular-nums'],
  },
  rateBenchmark: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
  },
  rateSummary: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#33628b',
  },
  progressBarTrack: {
    width: '100%',
    height: 7,
    backgroundColor: '#e6e8ed',
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#004D4D',
    borderRadius: 999,
  },
  progressBarSkipped: {
    height: '100%',
    backgroundColor: '#ba1a1a',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f2f3f9',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statRowVal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    fontFamily: 'Public Sans',
    fontSize: 16,
    fontWeight: '800',
    color: '#191c20',
  },
  statLabel: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
    marginTop: 2,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#e1e2e8',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#eceef3',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tabButtonText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '600',
    color: '#737784',
  },
  tabButtonTextActive: {
    color: '#004D4D',
    fontWeight: '700',
  },
  scheduleContainer: {
    gap: 14,
  },
  bucketCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    padding: 16,
    gap: 12,
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  bucketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f3f9',
    paddingBottom: 10,
  },
  bucketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bucketIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 14,
    fontWeight: '700',
    color: '#191c20',
  },
  bucketTime: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
  },
  bucketBadge: {
    backgroundColor: '#f2f3f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  bucketCount: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#737784',
  },
  noDosesText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  doseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fc',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#c3c6d5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#ffffff',
  },
  checkboxTaken: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  checkboxSkipped: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  doseInfoContainer: {
    flex: 1,
    gap: 3,
  },
  doseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doseName: {
    fontFamily: 'Public Sans',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#191c20',
  },
  doseNameTaken: {
    color: '#737784',
    textDecorationLine: 'line-through',
  },
  doseStrengthBadge: {
    backgroundColor: '#f2f3f9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  doseStrength: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#525866',
    fontWeight: '600',
  },
  doseInstructions: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
  },
  doseClinicalNote: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    fontStyle: 'italic',
  },
  adherenceStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusBadgeTaken: {
    backgroundColor: '#e6f4ea',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTextTaken: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#137333',
  },
  statusBadgeSkipped: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTextSkipped: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#92400e',
  },
  statusBadgePending: {
    backgroundColor: '#eceef3',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTextPending: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#737784',
  },
  provenancePillReviewed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  provenanceNote: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '700',
  },
  provenancePillUnreviewed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  provenanceNoteUnreviewed: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: '#b45309',
    fontWeight: '700',
  },
  quickActionCol: {
    gap: 5,
    alignItems: 'flex-end',
  },
  btnTakeDose: {
    backgroundColor: '#004D4D',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#004D4D',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 1,
  },
  btnTakeDoseText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnSkipDose: {
    backgroundColor: '#f2f3f9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  btnSkipDoseText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    color: '#737784',
    fontWeight: '600',
  },
  medsListContainer: {
    gap: 12,
  },
  prescCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    padding: 16,
    gap: 8,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  prescHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prescTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  prescIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prescName: {
    fontFamily: 'Public Sans',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#191c20',
  },
  prescGeneric: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
    fontStyle: 'italic',
  },
  statusPillActive: {
    backgroundColor: '#e6f4ea',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillTextActive: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#137333',
  },
  prescDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  prescDetail: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
  },
  boldLabel: {
    fontWeight: '700',
    color: '#191c20',
  },
  prescInstructionBox: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#334155',
    backgroundColor: '#f2f3f9',
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  prescFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f2f3f9',
  },
  prescDoctor: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    fontWeight: '500',
  },
  badgeReviewed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeReviewedText: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#065f46',
  },
  unreviewedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 12,
    borderRadius: 12,
  },
  unreviewedNoticeText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 16,
    color: '#78350f',
  },
  unreviewedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 14,
    gap: 6,
  },
  statusBadgeUnreviewed: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTextUnreviewed: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#b45309',
  },
  discontinuedCard: {
    backgroundColor: '#f2f3f9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e2e8',
    padding: 14,
    gap: 4,
    opacity: 0.85,
  },
  discontinuedName: {
    fontFamily: 'Public Sans',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#737784',
    textDecorationLine: 'line-through',
  },
  statusBadgeDiscontinued: {
    backgroundColor: '#e6e8ed',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTextDiscontinued: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#737784',
  },
  discontinuedDetail: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
  },
  discontinuedReason: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#ba1a1a',
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 15,
    fontWeight: '700',
    color: '#191c20',
  },
  emptyMessage: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#737784',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 28, 32, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
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
    alignItems: 'flex-start',
    marginTop: 4,
  },
  modalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
  },
  modalSubtitle: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    color: '#737784',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f2f3f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalMedicineCard: {
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
  },
  modalMedicine: {
    fontFamily: 'Public Sans',
    fontSize: 14,
    fontWeight: '700',
    color: '#004D4D',
  },
  modalMedicineSub: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
    marginTop: 2,
  },
  modalPrompt: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
    lineHeight: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#c3c6d5',
    borderRadius: 12,
    padding: 12,
    fontSize: 12.5,
    fontFamily: 'Inter',
    color: '#191c20',
    minHeight: 74,
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f3f9',
  },
  modalCancelBtnText: {
    fontFamily: 'Public Sans',
    fontSize: 12,
    color: '#737784',
    fontWeight: '700',
  },
  modalSubmitBtn: {
    backgroundColor: '#c95410',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSubmitBtnText: {
    fontFamily: 'Public Sans',
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },
  // Official Prescription Cards & Modal Styles
  officialRxCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  officialRxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  officialRxDoctorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  officialRxIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 77, 77, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  officialRxDoctorName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#191c20',
  },
  officialRxDoctorSpec: {
    fontSize: 10.5,
    color: '#737784',
    marginTop: 1,
  },
  officialRxBadgeGroup: {
    alignItems: 'flex-end',
    gap: 3,
  },
  rxRefBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  rxRefText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  rxStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  rxStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065f46',
  },
  officialRxMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  officialRxClinic: {
    fontSize: 11,
    fontWeight: '600',
    color: '#004D4D',
  },
  officialRxDate: {
    fontSize: 11,
    color: '#64748b',
  },
  rxDiagnosesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  rxDiagnosisChip: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rxDiagnosisText: {
    fontSize: 10.5,
    color: '#1e293b',
    fontWeight: '500',
  },
  rxMedicationsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rxMedsCountTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  rxMedItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginVertical: 3,
  },
  rxBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#004D4D',
    marginTop: 5,
  },
  rxMedName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  rxMedDose: {
    fontWeight: '600',
    color: '#004D4D',
  },
  rxMedInstruction: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  rxLabOrdersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  rxLabOrdersLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  rxLabOrdersText: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  officialRxCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  signedAuditTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signedAuditText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#004D4D',
  },
  viewDocAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewDocText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
  },
  // Modal Sheet Styles
  rxDocCard: {
    width: '92%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  rxDocTonalBar: {
    height: 4,
    backgroundColor: '#004D4D',
  },
  rxDocHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  rxDocHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rxDocIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 77, 77, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxDocHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  rxDocHeaderSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  rxDocScroll: {
    flex: 1,
  },
  rxDocScrollContent: {
    padding: 16,
    gap: 12,
  },
  letterheadBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  letterheadTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clinicName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#004D4D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  doctorSpec: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  doctorReg: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  letterheadRxSymbol: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 77, 77, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxSymbolText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#004D4D',
    fontStyle: 'italic',
  },
  letterheadDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  letterheadMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  docSection: {
    gap: 5,
  },
  docSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diagnosesBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  diagnosisItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diagnosisItemText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0f172a',
  },
  emptySectionText: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  medsTable: {
    gap: 6,
  },
  medRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  medRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  medDosageBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#004D4D',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  medMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  medMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  medMetaLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  medMetaVal: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0f172a',
  },
  medInstructionsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 6,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  medInstructionsLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#004D4D',
    textTransform: 'uppercase',
  },
  medInstructionsText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 1,
  },
  labsListBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  labItemChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  labItemText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1e293b',
  },
  adviceCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  adviceText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
  },
  followUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  followUpText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0f172a',
  },
  sealBox: {
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginTop: 2,
  },
  sealTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sealTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065f46',
  },
  sealDoctor: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 1,
  },
  sealDisclaimer: {
    fontSize: 9,
    color: '#065f46',
    marginTop: 4,
    lineHeight: 13,
  },
  rxDocFooter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  rxDocCloseBtn: {
    backgroundColor: '#004D4D',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  rxDocCloseBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
