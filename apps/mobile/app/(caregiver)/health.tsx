import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Activity,
  Heart,
  Droplet,
  TrendingUp,
  Clock,
  ShieldAlert,
  Lock,
  Calendar,
  AlertCircle,
  Users,
  ChevronDown,
  Sparkles,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  caregiverApi,
  CaregiverPatient,
  CaregiverHealthData,
} from '../../src/api/caregiver';

export default function CaregiverHealthScreen() {
  const [patients, setPatients] = useState<CaregiverPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<CaregiverHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showPatientPicker, setShowPatientPicker] = useState(false);

  const activePatient = patients.find((p) => p.patientId === selectedPatientId);

  const hasHealthPermission =
    activePatient?.permissions.includes('VIEW_HEALTH_SUMMARY') ||
    activePatient?.permissions.includes('VIEW_OBSERVATIONS');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await caregiverApi.getPatients();
      const patientList = res.patients || [];
      setPatients(patientList);

      if (patientList.length === 0) {
        setSelectedPatientId(null);
        setHealthData(null);
        await caregiverApi.clearActivePatientId();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const savedId = await caregiverApi.getActivePatientId();
      const validActive = patientList.find((p) => p.patientId === savedId);
      const targetId = validActive ? validActive.patientId : patientList[0].patientId;

      setSelectedPatientId(targetId);
      await caregiverApi.setActivePatientId(targetId);

      const targetPatient = patientList.find((p) => p.patientId === targetId);
      const permitted =
        targetPatient?.permissions.includes('VIEW_HEALTH_SUMMARY') ||
        targetPatient?.permissions.includes('VIEW_OBSERVATIONS');

      if (permitted) {
        try {
          const healthRes = await caregiverApi.getHealth(targetId);
          setHealthData(healthRes);
        } catch (fetchErr: any) {
          setError(fetchErr?.message || 'Failed to load health metrics');
        }
      } else {
        setHealthData(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to clinical servers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSelectPatient = async (pId: string) => {
    setSelectedPatientId(pId);
    setShowPatientPicker(false);
    await caregiverApi.setActivePatientId(pId);
    setLoading(true);
    loadData();
  };

  const formatContext = (context: string) => {
    switch (context?.toUpperCase()) {
      case 'FASTING':
        return 'Fasting';
      case 'POST_MEAL':
      case 'POST_PRANDIAL':
        return 'Post-Meal';
      case 'RANDOM':
        return 'Random Check';
      case 'BEDTIME':
        return 'Bedtime';
      default:
        return context || 'Blood Glucose';
    }
  };

  const getGlucoseStatus = (value: number) => {
    if (value < 70) return { label: 'Low (Hypo)', color: '#EF4444', bg: '#FEF2F2' };
    if (value > 180) return { label: 'High (Hyper)', color: '#F59E0B', bg: '#FFFBEB' };
    return { label: 'In Target Range', color: '#10B981', bg: '#ECFDF5' };
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Syncing patient health records...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.headerTitle}>Blood Glucose & Trends</Text>
          <Text style={styles.headerSubtitle}>
            Continuous glucose observations & ambulatory glycemic trends
          </Text>
        </View>

        {patients.length > 0 && (
          <TouchableOpacity
            style={styles.patientPickerBtn}
            onPress={() => setShowPatientPicker(true)}
            activeOpacity={0.7}
          >
            <Users size={15} color="#0F766E" />
            <Text style={styles.patientPickerBtnText} numberOfLines={1}>
              {activePatient ? activePatient.name : 'Select Patient'}
            </Text>
            <ChevronDown size={14} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Patient Switcher Modal */}
      <Modal visible={showPatientPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPatientPicker(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Switch Dependent</Text>
            <Text style={styles.modalSubtitle}>Select which patient health records to inspect</Text>
            {patients.map((p) => {
              const isSelected = p.patientId === selectedPatientId;
              return (
                <TouchableOpacity
                  key={p.patientId}
                  style={[styles.patientOption, isSelected && styles.patientOptionActive]}
                  onPress={() => handleSelectPatient(p.patientId)}
                >
                  <View style={styles.patientOptionLeft}>
                    <View style={[styles.avatarCircle, isSelected && styles.avatarCircleActive]}>
                      <Text style={[styles.avatarText, isSelected && styles.avatarTextActive]}>
                        {p.name.charAt(0)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.optionName}>{p.name}</Text>
                      <Text style={styles.optionMeta}>
                        {p.relationship} • {p.diabetesType}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {error ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* No Patients State */}
      {patients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Users size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No Authorized Patients</Text>
          <Text style={styles.emptySubtitle}>
            You currently have no active patient consents. When a patient invites you from their mobile app, their
            health logs will appear here.
          </Text>
        </View>
      ) : !hasHealthPermission ? (
        /* Permission Locked State */
        <View style={styles.lockedContainer}>
          <View style={styles.lockIconBox}>
            <Lock size={36} color="#D97706" />
          </View>
          <Text style={styles.lockedTitle}>Health Summary Permission Required</Text>
          <Text style={styles.lockedDesc}>
            {activePatient?.name} has not granted you the{' '}
            <Text style={styles.boldText}>VIEW_HEALTH_SUMMARY</Text> permission.
          </Text>
          <View style={styles.lockedHintBox}>
            <ShieldAlert size={16} color="#64748B" />
            <Text style={styles.lockedHintText}>
              To view blood glucose readings and ambulatory trends, ask the patient to enable Health Summary access in
              their Profile → Caregiver Access Manager.
            </Text>
          </View>
        </View>
      ) : (
        /* Health Content */
        <View>
          {/* Key Metric Overview */}
          <View style={styles.metricsSummaryCard}>
            <View style={styles.metricPrimaryCol}>
              <Text style={styles.metricSmallLabel}>Average Glucose</Text>
              <View style={styles.metricValueRow}>
                <Text style={styles.metricHeroNumber}>
                  {healthData?.stats?.averageGlucose ? `${healthData.stats.averageGlucose}` : '--'}
                </Text>
                <Text style={styles.metricHeroUnit}>mg/dL</Text>
              </View>
              <Text style={styles.metricHeroSub}>Continuous observation baseline</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricSecondaryCol}>
              <View style={styles.metricStatRow}>
                <Text style={styles.metricStatLabel}>Time in Range (TIR)</Text>
                <Text style={styles.metricStatHighlight}>
                  {healthData?.stats?.timeInRangePercentage != null
                    ? `${healthData.stats.timeInRangePercentage}%`
                    : '--'}
                </Text>
              </View>
              <View style={styles.metricStatRow}>
                <Text style={styles.metricStatLabel}>Target Window</Text>
                <Text style={styles.metricStatSub}>70-180 mg/dL</Text>
              </View>
              <View style={styles.metricStatRow}>
                <Text style={styles.metricStatLabel}>Total Observations</Text>
                <Text style={styles.metricStatSub}>
                  {healthData?.stats?.totalReadings ?? 0} logs
                </Text>
              </View>
            </View>
          </View>

          {/* Clinical Target Notice */}
          <View style={styles.targetBanner}>
            <Activity size={14} color="#64748B" />
            <Text style={styles.targetBannerText}>
              Standard Clinical Target: Fasting 80-130 mg/dL • Post-Meal &lt; 180 mg/dL
            </Text>
          </View>

          {/* Recent Blood Glucose Observations */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Glucose Readings</Text>
            <Text style={styles.sectionSubtitle}>Doctor & Patient Synchronized Journal</Text>
          </View>

          {!healthData?.observations || healthData.observations.length === 0 ? (
            <View style={styles.emptyObservations}>
              <Clock size={32} color="#94A3B8" />
              <Text style={styles.emptyObsTitle}>No glucose logs found</Text>
              <Text style={styles.emptyObsSubtitle}>
                New blood sugar measurements logged by {activePatient?.name} will automatically sync here.
              </Text>
            </View>
          ) : (
            healthData.observations.map((obs) => {
              const status = getGlucoseStatus(obs.numericValue);
              const dateStr = new Date(obs.observedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(obs.observedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View key={obs.id} style={styles.readingCard}>
                  <View style={styles.readingLeft}>
                    <View style={styles.valueRow}>
                      <Text style={styles.readingValue}>{obs.numericValue}</Text>
                      <Text style={styles.readingUnit}>{obs.unit || 'mg/dL'}</Text>
                    </View>
                    <View style={styles.contextBadge}>
                      <Text style={styles.contextBadgeText}>{formatContext(obs.context)}</Text>
                    </View>
                    {obs.clinicalFlag ? (
                      <View style={styles.flagBadge}>
                        <Text style={styles.flagBadgeText}>{obs.clinicalFlag}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.readingRight}>
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
                    </View>
                    <View style={styles.timeRow}>
                      <Clock size={12} color="#94A3B8" />
                      <Text style={styles.timeText}>
                        {dateStr} • {timeStr}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  patientPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 160,
  },
  patientPickerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flexShrink: 1,
  },
  metricsSummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 16,
  },
  metricPrimaryCol: {
    flex: 1.2,
    justifyContent: 'center',
  },
  metricSmallLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricHeroNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
  },
  metricHeroUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  metricHeroSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
  },
  metricSecondaryCol: {
    flex: 1.3,
    justifyContent: 'center',
    gap: 6,
  },
  metricStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  metricStatHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  metricStatSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  targetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  targetBannerText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  readingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readingLeft: {
    gap: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  readingValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  readingUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  contextBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contextBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  flagBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    textTransform: 'uppercase',
  },
  readingRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  emptyObservations: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  emptyObsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyObsSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  lockedContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
  },
  lockIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lockedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
    marginBottom: 8,
  },
  lockedDesc: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  lockedHintBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lockedHintText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  patientOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  patientOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#EFF6FF',
  },
  patientOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  avatarTextActive: {
    color: '#FFFFFF',
  },
  optionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  optionMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
