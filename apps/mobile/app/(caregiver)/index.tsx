import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Image,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  Heart,
  Users,
  Calendar,
  Clock,
  ShieldCheck,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Pill,
  Activity,
  CheckSquare,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  caregiverApi,
  CaregiverPatient,
  CaregiverDashboardData,
} from '../../src/api/caregiver';

export default function CaregiverHomeScreen() {
  const [patients, setPatients] = useState<CaregiverPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<CaregiverDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await caregiverApi.getPatients();
      const patientList = res.patients || [];
      setPatients(patientList);

      if (patientList.length === 0) {
        setSelectedPatientId(null);
        setDashboard(null);
        await caregiverApi.clearActivePatientId();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Check stored active patient or fallback to first
      let currentId = selectedPatientId;
      if (!currentId || !patientList.some((p) => p.patientId === currentId)) {
        const storedId = await caregiverApi.getActivePatientId();
        if (storedId && patientList.some((p) => p.patientId === storedId)) {
          currentId = storedId;
        } else {
          currentId = patientList[0].patientId;
        }
      }

      setSelectedPatientId(currentId);
      await caregiverApi.setActivePatientId(currentId);

      // Load patient dashboard
      const dash = await caregiverApi.getDashboard(currentId);
      setDashboard(dash);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Unable to load caregiver dashboard.';
      if (msg.includes('Forbidden') || msg.includes('Access denied') || msg.includes('revoked')) {
        setError('Access to this patient workspace has been revoked or expired.');
        setDashboard(null);
        await caregiverApi.clearActivePatientId();
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPatientId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const handleSelectPatient = async (patientId: string) => {
    setShowPatientPicker(false);
    setSelectedPatientId(patientId);
    await caregiverApi.setActivePatientId(patientId);
    setLoading(true);
    try {
      const dash = await caregiverApi.getDashboard(patientId);
      setDashboard(dash);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Unable to switch patient workspace.');
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!selectedPatientId) return;
    setCompletingTaskId(taskId);
    try {
      await caregiverApi.completeTask(selectedPatientId, taskId);
      await loadData();
    } catch (e: any) {
      alert(e instanceof Error ? e.message : 'Unable to complete task.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const currentPatient = patients.find((p) => p.patientId === selectedPatientId);
  const permissions = currentPatient?.permissions || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <Image
            source={require('../../assets/brand/mark_primary_gradient_512.png')}
            style={styles.headerBrandMark}
            resizeMode="contain"
            accessibilityLabel="AarogyaDamu Mark"
          />
          <Text style={styles.brandSubtitlePill}>AAROGYADAMU CAREGIVER</Text>
        </View>
        <Text style={styles.title}>Caregiver Workspace</Text>
        <Text style={styles.subtitle}>
          Permission-governed family support for prescribed diabetes routines
        </Text>

        {/* Patient Switcher */}
        {patients.length > 0 && (
          <TouchableOpacity
            style={styles.patientSelector}
            onPress={() => setShowPatientPicker(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Select authorized patient"
          >
            <View style={styles.patientAvatar}>
              <Text style={styles.patientAvatarText}>
                {(currentPatient?.name || 'P').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorLabel}>SUPPORTING PATIENT</Text>
              <Text style={styles.selectorName}>{currentPatient?.name || 'Select Patient'}</Text>
              <Text style={styles.selectorSub}>
                {currentPatient?.relationship ? `${currentPatient.relationship} • ` : ''}
                {currentPatient?.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes'}
              </Text>
            </View>
            {patients.length > 1 && (
              <View style={styles.switchPill}>
                <Text style={styles.switchPillText}>Switch</Text>
                <ChevronDown size={14} color={theme.colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Loading / Error / Empty States */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading authorized patient care plan...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <AlertCircle size={28} color="#DC2626" />
          <Text style={styles.errorTitle}>Access Restricted</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Refresh Permissions</Text>
          </TouchableOpacity>
        </View>
      ) : patients.length === 0 ? (
        <View style={styles.emptyCard}>
          <Users size={44} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No Authorized Patients Linked</Text>
          <Text style={styles.emptyBody}>
            You do not currently have any active caregiver delegations.
            Ask your family member to invite your email address from their AarogyaDamu Profile under "Caregiver Access Manager".
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Check for Invitations</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Active Permissions Banner */}
          <View style={styles.permBanner}>
            <View style={styles.permHeaderRow}>
              <ShieldCheck size={16} color={theme.colors.primary} />
              <Text style={styles.permBannerTitle}>Active Granted Permissions</Text>
            </View>
            <View style={styles.pillsRow}>
              {permissions.map((p) => (
                <View key={p} style={styles.permPill}>
                  <Text style={styles.permPillText}>{p.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Structured Clinical Overview (No 3-icon row) */}
          <View style={styles.overviewContainer}>
            <View style={styles.glucoseSummaryCard}>
              <View style={styles.summaryTopRow}>
                <Text style={styles.summaryLabel}>Latest Blood Glucose</Text>
                <View style={styles.targetStatusBadge}>
                  <Text style={styles.targetStatusText}>
                    {dashboard?.healthSummary?.latestReading ? 'Target Range' : 'No Reading'}
                  </Text>
                </View>
              </View>
              <View style={styles.glucoseMetricRow}>
                <Text style={styles.bigGlucoseValue}>
                  {dashboard?.healthSummary?.latestReading
                    ? dashboard.healthSummary.latestReading.numericValue
                    : '--'}
                </Text>
                <Text style={styles.glucoseUnit}>
                  {dashboard?.healthSummary?.latestReading?.unit || 'mg/dL'}
                </Text>
              </View>
              <Text style={styles.glucoseSubText}>
                {dashboard?.healthSummary?.latestReading
                  ? `Context: ${dashboard.healthSummary.latestReading.context.replace(/_/g, ' ')}`
                  : 'Requires VIEW_HEALTH_SUMMARY permission'}
              </Text>
            </View>

            <View style={styles.secondaryStatsRow}>
              <View style={styles.secondaryStatCard}>
                <Text style={styles.secondaryStatNumber}>
                  {dashboard?.tasks ? dashboard.tasks.summary.pendingCount : '--'}
                </Text>
                <Text style={styles.secondaryStatLabel}>Pending Care Tasks</Text>
              </View>
              <View style={styles.secondaryStatCard}>
                <Text style={styles.secondaryStatNumber}>
                  {dashboard?.medications ? dashboard.medications.activeCount : '--'}
                </Text>
                <Text style={styles.secondaryStatLabel}>Active Prescriptions</Text>
              </View>
            </View>
          </View>

          {/* Section: Today's Tasks */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <CheckSquare size={18} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>Doctor Care Tasks</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(caregiver)/tasks' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {dashboard?.tasks ? (
              dashboard.tasks.items.length === 0 ? (
                <Text style={styles.emptyNotice}>No pending tasks scheduled for this patient today.</Text>
              ) : (
                dashboard.tasks.items.slice(0, 3).map((task) => (
                  <View key={task.id} style={styles.taskItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      {task.instructions ? (
                        <Text style={styles.taskInstructions} numberOfLines={2}>
                          {task.instructions}
                        </Text>
                      ) : null}
                      <View style={styles.taskMetaRow}>
                        <Clock size={12} color={theme.colors.textMuted} />
                        <Text style={styles.taskDueText}>
                          Due: {new Date(task.dueAt).toLocaleDateString()}
                        </Text>
                        <Text style={[styles.priorityBadge, task.priority === 'HIGH' || task.priority === 'URGENT' ? styles.priorityHigh : styles.priorityNormal]}>
                          {task.priority}
                        </Text>
                      </View>
                    </View>

                    {task.status === 'COMPLETED' ? (
                      <View style={styles.completedBadge}>
                        <CheckCircle2 size={16} color="#059669" />
                        <Text style={styles.completedBadgeText}>Completed</Text>
                      </View>
                    ) : task.canComplete ? (
                      <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={() => handleCompleteTask(task.id)}
                        disabled={completingTaskId === task.id}
                      >
                        {completingTaskId === task.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.completeBtnText}>Mark Done</Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.readOnlyBadge}>
                        <Lock size={12} color="#64748B" />
                        <Text style={styles.readOnlyText}>View Only</Text>
                      </View>
                    )}
                  </View>
                ))
              )
            ) : (
              <View style={styles.restrictedNotice}>
                <Lock size={14} color="#64748B" />
                <Text style={styles.restrictedNoticeText}>
                  Requires VIEW_TASKS permission to view patient care tasks.
                </Text>
              </View>
            )}
          </View>

          {/* Section: Doctor Prescribed Medicines */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Pill size={18} color="#7C3AED" />
                <Text style={styles.sectionTitle}>Prescribed Medicines</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(caregiver)/medications' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {dashboard?.medications ? (
              dashboard.medications.items.length === 0 ? (
                <Text style={styles.emptyNotice}>No active medications prescribed by doctor.</Text>
              ) : (
                dashboard.medications.items.slice(0, 3).map((med) => (
                  <View key={med.id} style={styles.medItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{med.medicineName}</Text>
                      <Text style={styles.medDosage}>
                        {med.dosage} • {med.timing}
                        {med.frequency ? ` • ${med.frequency}` : ''}
                      </Text>
                      {med.instructions ? (
                        <Text style={styles.medInstructions} numberOfLines={1}>
                          {med.instructions}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )
            ) : (
              <View style={styles.restrictedNotice}>
                <Lock size={14} color="#64748B" />
                <Text style={styles.restrictedNoticeText}>
                  Requires VIEW_MEDICATIONS permission to inspect prescribed medicines.
                </Text>
              </View>
            )}
          </View>

          {/* Section: Blood Glucose & Health Overview */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Activity size={18} color="#059669" />
                <Text style={styles.sectionTitle}>Health Overview</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(caregiver)/health' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {dashboard?.healthSummary ? (
              dashboard.healthSummary.latestReading ? (
                <View style={styles.sugarSnippet}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugarValue}>
                      {dashboard.healthSummary.latestReading.numericValue}{' '}
                      <Text style={{ fontSize: 13, fontWeight: 'normal', color: theme.colors.textMuted }}>
                        {dashboard.healthSummary.latestReading.unit}
                      </Text>
                    </Text>
                    <Text style={styles.sugarMeta}>
                      Context: {dashboard.healthSummary.latestReading.context} • Logged:{' '}
                      {new Date(dashboard.healthSummary.latestReading.observedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  {dashboard.healthSummary.averageGlucose ? (
                    <View style={styles.avgBox}>
                      <Text style={styles.avgLabel}>Recent Avg</Text>
                      <Text style={styles.avgValue}>{dashboard.healthSummary.averageGlucose} mg/dL</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.emptyNotice}>No glucose observations recorded yet.</Text>
              )
            ) : (
              <View style={styles.restrictedNotice}>
                <Lock size={14} color="#64748B" />
                <Text style={styles.restrictedNoticeText}>
                  Requires VIEW_HEALTH_SUMMARY permission to view blood glucose logs.
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* MODAL: Switch Supporting Patient */}
      <Modal visible={showPatientPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Switch Supporting Patient</Text>
            <Text style={styles.modalSub}>
              Select which family member's care plan you want to support:
            </Text>

            <ScrollView style={{ maxHeight: 260 }}>
              {patients.map((p) => {
                const isSelected = p.patientId === selectedPatientId;
                return (
                  <TouchableOpacity
                    key={p.patientId}
                    style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                    onPress={() => handleSelectPatient(p.patientId)}
                  >
                    <View style={styles.pickerAvatar}>
                      <Text style={styles.pickerAvatarText}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerName, isSelected && styles.pickerNameSelected]}>
                        {p.name}
                      </Text>
                      <Text style={styles.pickerSub}>
                        {p.relationship ? `${p.relationship} • ` : ''}
                        {p.diabetesType.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    {isSelected && <CheckCircle2 size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.closePickerBtn}
              onPress={() => setShowPatientPicker(false)}
            >
              <Text style={styles.closePickerBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 50,
    gap: 14,
  },
  header: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    gap: 8,
    ...theme.shadows.elevation2,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  headerBrandMark: {
    width: 20,
    height: 20,
  },
  brandSubtitlePill: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  subtitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
  },
  patientSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.lg,
    padding: 12,
    marginTop: 4,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  patientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectorLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectorName: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  selectorSub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.surfaceContainerLowest,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borders.radius.full,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  switchPillText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  errorCard: {
    backgroundColor: '#ffdad6',
    borderRadius: theme.borders.radius.lg,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ffb4ab',
  },
  errorTitle: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 15,
    fontWeight: '800',
    color: '#93000a',
  },
  errorBody: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: '#ba1a1a',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  emptyTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  emptyBody: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: theme.borders.radius.md,
    marginTop: 6,
    ...theme.shadows.soft,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fonts.label,
    fontSize: 12,
    fontWeight: '700',
  },
  permBanner: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    gap: 8,
  },
  permHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  permBannerTitle: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permPill: {
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borders.radius.sm,
  },
  permPillText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  overviewContainer: {
    gap: 10,
  },
  glucoseSummaryCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  targetStatusBadge: {
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borders.radius.sm,
  },
  targetStatusText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '800',
    color: '#004D4D',
  },
  glucoseMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  bigGlucoseValue: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 34,
    fontWeight: '900',
    color: theme.colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  glucoseUnit: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.secondary,
  },
  glucoseSubText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 3,
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryStatCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  secondaryStatNumber: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.onSurface,
  },
  secondaryStatLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    gap: 10,
    ...theme.shadows.elevation2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  viewAllText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainerHigh,
    gap: 10,
  },
  taskTitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  taskInstructions: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  taskDueText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 10,
    color: theme.colors.outline,
  },
  priorityBadge: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borders.radius.sm,
    textTransform: 'uppercase',
  },
  priorityHigh: {
    backgroundColor: '#ffdad6',
    color: '#ba1a1a',
  },
  priorityNormal: {
    backgroundColor: theme.colors.surfaceContainer,
    color: theme.colors.onSurfaceVariant,
  },
  completeBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borders.radius.md,
    ...theme.shadows.soft,
  },
  completeBtnText: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borders.radius.sm,
  },
  completedBadgeText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: '#004D4D',
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borders.radius.sm,
  },
  readOnlyText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    color: theme.colors.outline,
  },
  medItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainerHigh,
  },
  medName: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  medDosage: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  medInstructions: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 10,
    color: theme.colors.outline,
    marginTop: 2,
  },
  sugarSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainerLow,
    padding: 12,
    borderRadius: theme.borders.radius.lg,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  sugarValue: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primary,
    fontVariant: ['tabular-nums'],
  },
  sugarMeta: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  avgBox: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    padding: 8,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  avgLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 9,
    color: theme.colors.secondary,
    textTransform: 'uppercase',
  },
  avgValue: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  emptyNotice: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.outline,
    paddingVertical: 8,
  },
  restrictedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceContainerLow,
    padding: 10,
    borderRadius: theme.borders.radius.md,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  restrictedNoticeText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 28, 32, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 20,
    gap: 12,
    ...theme.shadows.elevation2,
  },
  modalTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  modalSub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: theme.borders.radius.lg,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    marginBottom: 8,
    gap: 10,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  pickerItemSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F8EF',
  },
  pickerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: {
    fontFamily: theme.typography.fonts.label,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  pickerName: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  pickerNameSelected: {
    color: theme.colors.primary,
  },
  pickerSub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  closePickerBtn: {
    backgroundColor: theme.colors.surfaceContainer,
    padding: 12,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    marginTop: 6,
  },
  closePickerBtnText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.onSurfaceVariant,
  },
});
