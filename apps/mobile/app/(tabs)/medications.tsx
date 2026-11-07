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
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  medicationApi,
  type MobileMedication,
  type MobileAdherenceStats,
  type MobileAdherenceEvent,
} from '../../src/api/medications';
import { coordinationApi } from '../../src/api/coordination';
import { useToast } from '../../components/ui/ToastProvider';

export default function MedicationsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [medications, setMedications] = useState<MobileMedication[]>([]);
  const [stats, setStats] = useState<MobileAdherenceStats | null>(null);
  const [userRole, setUserRole] = useState<'PATIENT' | 'CAREGIVER'>('PATIENT');
  const [patientId, setPatientId] = useState<string | null>(null);

  // Tab view: SCHEDULE (Today's Doses), ALL_PRESCRIBED, UNREVIEWED, DISCONTINUED
  const [activeTab, setActiveTab] = useState<'SCHEDULE' | 'ALL_PRESCRIBED' | 'UNREVIEWED' | 'DISCONTINUED'>('SCHEDULE');

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

      const [medsList, adherenceStats] = await Promise.all([
        medicationApi.getMedications({ status: 'ALL' }),
        medicationApi.getAdherenceStats({ days: 14 }),
      ]);

      setMedications(medsList);
      setStats(adherenceStats);

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
      { id: 'MORNING', title: 'Morning', time: '8:00 AM', icon: Sun, iconColor: '#F59E0B', meds: morning },
      { id: 'AFTERNOON', title: 'Afternoon', time: '1:00 PM', icon: Coffee, iconColor: '#10B981', meds: afternoon },
      { id: 'EVENING', title: 'Evening', time: '7:30 PM', icon: Sunset, iconColor: '#6366F1', meds: evening },
      { id: 'NIGHT', title: 'Night', time: '10:00 PM', icon: Moon, iconColor: '#8B5CF6', meds: night },
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
      {/* 1. Header (Clean, Doctor-Prescribed Med Vault) */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.screenTitle}>Med Vault</Text>
          <Text style={styles.screenSubtitle}>
            {userRole === 'CAREGIVER'
              ? 'Caregiver View • Doctor-Prescribed Regimen'
              : 'Doctor-Prescribed Regimen & Daily Adherence'}
          </Text>
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
          <Info color="#B45309" size={16} />
          <Text style={styles.safetyNoticeText}>
            AarogyaDamu is a personal health companion, not a prescriber. Your medication regimen is prescribed and governed by your doctor. Prescriptions cannot be added or altered without clinician authorization. To Pause Medication, contact your doctor. Reason for pausing medication must be evaluated clinically.
          </Text>
        </View>

        {/* 3. 14-Day Adherence Stats Card */}
        {stats && (
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View>
                <Text style={styles.statsTitle}>14-Day Adherence Rate</Text>
                <Text style={styles.statsSubtitle}>Confirmed dose consistency profile</Text>
              </View>
              <View style={styles.adherenceBadge}>
                <Text style={styles.adherenceBadgeText}>{stats.adherenceRate}%</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.takenCount}</Text>
                <Text style={styles.statLabel}>Taken</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.skippedCount}</Text>
                <Text style={styles.statLabel}>Skipped</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {Math.max(0, (stats.totalEvents || 0) - stats.takenCount - stats.skippedCount)}
                </Text>
                <Text style={styles.statLabel}>Not Confirmed</Text>
              </View>
            </View>
          </View>
        )}

        {/* 4. Tab Navigation Bar */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'SCHEDULE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('SCHEDULE')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'SCHEDULE' && styles.tabButtonTextActive]}>
              Today's Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ALL_PRESCRIBED' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ALL_PRESCRIBED')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'ALL_PRESCRIBED' && styles.tabButtonTextActive]}>
              Prescriptions ({allDoctorPrescriptions.length})
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

        {/* VIEW A: TODAY'S SCHEDULE (Bucket Grouped with Checkboxes) */}
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
                    <Text style={styles.bucketCount}>
                      {bucket.meds.length} {bucket.meds.length === 1 ? 'dose' : 'doses'}
                    </Text>
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
                                <Text style={styles.doseStrength}>({med.strength})</Text>
                              )}
                            </View>

                            <Text style={styles.doseInstructions}>
                              {med.dosage} • {med.frequency}
                              {med.foodInstructions ? ` • ${med.foodInstructions}` : ''}
                            </Text>

                            {med.instructions ? (
                              <Text style={styles.doseClinicalNote}>
                                Instructions: {med.instructions}
                              </Text>
                            ) : null}

                            {/* Adherence State Label */}
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
                                <Text style={styles.provenanceNote}>Clinician Reviewed</Text>
                              ) : (
                                <Text style={styles.provenanceNoteUnreviewed}>
                                  Patient Reported (Unreviewed)
                                </Text>
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
                      <Pill color={theme.colors.primary} size={18} />
                      <Text style={styles.prescName}>{med.name}</Text>
                    </View>
                    <View style={styles.statusPillActive}>
                      <Text style={styles.statusPillTextActive}>{med.status}</Text>
                    </View>
                  </View>

                  {med.genericName && (
                    <Text style={styles.prescGeneric}>Generic: {med.genericName}</Text>
                  )}

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

        {/* VIEW C: UNREVIEWED PATIENT-REPORTED MEDICATIONS */}
        {!loading && activeTab === 'UNREVIEWED' && (
          <View style={styles.medsListContainer}>
            <View style={styles.unreviewedNotice}>
              <AlertCircle color="#B45309" size={16} />
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

      {/* Modal: Report Skipped Dose with Reason */}
      <Modal
        visible={isSkipModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSkipModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Skipped Dose</Text>
              <TouchableOpacity
                onPress={() => setIsSkipModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X color={theme.colors.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalMedicine}>
              {selectedMedForSkip?.name} ({selectedMedForSkip?.dosage})
            </Text>

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTextContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  safetyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
  },
  safetyNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  statsSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  adherenceBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  adherenceBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  scheduleContainer: {
    gap: 14,
  },
  bucketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  bucketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  bucketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bucketIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  bucketTime: {
    fontSize: 11,
    color: '#64748B',
  },
  bucketCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  noDosesText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  doseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxTaken: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxSkipped: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  doseInfoContainer: {
    flex: 1,
    gap: 2,
  },
  doseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  doseNameTaken: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  doseStrength: {
    fontSize: 11,
    color: '#64748B',
  },
  doseInstructions: {
    fontSize: 11,
    color: '#475569',
  },
  doseClinicalNote: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 1,
  },
  adherenceStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusBadgeTaken: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextTaken: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  statusBadgeSkipped: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextSkipped: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  statusBadgePending: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextPending: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
  },
  provenanceNote: {
    fontSize: 9,
    color: '#059669',
    fontWeight: '600',
  },
  provenanceNoteUnreviewed: {
    fontSize: 9,
    color: '#B45309',
    fontWeight: '600',
  },
  quickActionCol: {
    gap: 4,
    alignItems: 'flex-end',
  },
  btnTakeDose: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  btnTakeDoseText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnSkipDose: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  btnSkipDoseText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  medsListContainer: {
    gap: 12,
  },
  prescCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 6,
  },
  prescHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prescTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  prescName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  prescGeneric: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusPillTextActive: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  prescDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  prescDetail: {
    fontSize: 11,
    color: '#475569',
  },
  boldLabel: {
    fontWeight: '700',
    color: '#0F172A',
  },
  prescInstructionBox: {
    fontSize: 11,
    color: '#334155',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 4,
  },
  prescFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  prescDoctor: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  badgeReviewed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeReviewedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  unreviewedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
  },
  unreviewedNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
  },
  unreviewedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 12,
    gap: 4,
  },
  statusBadgeUnreviewed: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextUnreviewed: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  discontinuedCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 4,
    opacity: 0.8,
  },
  discontinuedName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  statusBadgeDiscontinued: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextDiscontinued: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  discontinuedDetail: {
    fontSize: 11,
    color: '#94A3B8',
  },
  discontinuedReason: {
    fontSize: 10,
    color: '#E11D48',
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
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptyMessage: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalMedicine: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  modalPrompt: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalSubmitBtn: {
    backgroundColor: '#B45309',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSubmitBtnText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
