import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  Lock,
  AlertCircle,
  User,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  caregiverApi,
  CaregiverTask,
  CaregiverPatient,
} from '../../src/api/caregiver';

export default function CaregiverTasksScreen() {
  const [patients, setPatients] = useState<CaregiverPatient[]>([]);
  const [activePatient, setActivePatient] = useState<CaregiverPatient | null>(null);
  const [tasks, setTasks] = useState<CaregiverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CaregiverTask | null>(null);
  const [caregiverNote, setCaregiverNote] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'COMPLETED'>('ALL');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const patientRes = await caregiverApi.getPatients();
      const patientList = patientRes.patients || [];
      setPatients(patientList);

      if (patientList.length === 0) {
        setActivePatient(null);
        setTasks([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let patientId = await caregiverApi.getActivePatientId();
      let patient = patientList.find((p) => p.patientId === patientId);
      if (!patient) {
        patient = patientList[0];
        patientId = patient.patientId;
        await caregiverApi.setActivePatientId(patientId);
      }
      setActivePatient(patient);

      // Check permissions
      const perms = patient.permissions || [];
      const canView =
        perms.includes('VIEW_TASKS') ||
        perms.includes('COMPLETE_TASKS_ON_BEHALF') ||
        perms.includes('MANAGE_TASKS');

      if (!canView) {
        setError('Requires VIEW_TASKS permission to view patient care tasks.');
        setTasks([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const tasksRes = await caregiverApi.getTasks(patientId);
      setTasks(tasksRes.tasks || []);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Unable to load care tasks.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const openCompleteModal = (task: CaregiverTask) => {
    setSelectedTask(task);
    setCaregiverNote('');
    setShowNoteModal(true);
  };

  const handleConfirmCompletion = async () => {
    if (!activePatient || !selectedTask) return;
    setCompletingTaskId(selectedTask.id);
    try {
      await caregiverApi.completeTask(
        activePatient.patientId,
        selectedTask.id,
        caregiverNote.trim() || undefined
      );
      setShowNoteModal(false);
      await loadData();
    } catch (e: any) {
      alert(e instanceof Error ? e.message : 'Unable to complete task on behalf.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const canCompleteOnBehalf =
    (activePatient?.permissions || []).includes('COMPLETE_TASKS_ON_BEHALF') ||
    (activePatient?.permissions || []).includes('MANAGE_TASKS');

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'PENDING') return t.status === 'PENDING';
    if (filter === 'OVERDUE') return t.status === 'OVERDUE';
    if (filter === 'COMPLETED') return t.status === 'COMPLETED';
    return true;
  });

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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerHeaderRow}>
          <Text style={styles.headerTitle}>Care Tasks for {activePatient?.name || 'Patient'}</Text>
          <View style={[styles.permPill, canCompleteOnBehalf ? styles.permPillGreen : styles.permPillSlate]}>
            {canCompleteOnBehalf ? (
              <ShieldCheck size={12} color="#059669" />
            ) : (
              <Lock size={12} color="#64748B" />
            )}
            <Text style={[styles.permPillText, canCompleteOnBehalf ? styles.permPillTextGreen : styles.permPillTextSlate]}>
              {canCompleteOnBehalf ? 'Authorized' : 'Read-Only Mode'}
            </Text>
          </View>
        </View>

        <Text style={styles.headerSubtitle}>
          Tasks assigned by the doctor. When authorized, you can record completion on the patient's behalf with full audit attribution.
        </Text>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['ALL', 'PENDING', 'OVERDUE', 'COMPLETED'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillLabel, filter === f && styles.filterPillLabelActive]}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Main Body */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading assigned care tasks...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <AlertCircle size={28} color="#DC2626" />
          <Text style={styles.errorTitle}>Access Restricted</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.emptyCard}>
          <CheckSquare size={40} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No Tasks Found</Text>
          <Text style={styles.emptyBody}>
            There are currently no doctor-assigned tasks matching this filter.
          </Text>
        </View>
      ) : (
        filteredTasks.map((task) => {
          const isOverdue = task.status === 'OVERDUE';
          const isCompleted = task.status === 'COMPLETED';

          return (
            <View key={task.id} style={[styles.taskCard, isOverdue && styles.taskCardOverdue]}>
              {/* Task Header */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.categoryLabel}>{task.category.replace(/_/g, ' ')}</Text>
                </View>
                <View style={[styles.statusBadge, isCompleted ? styles.statusCompleted : isOverdue ? styles.statusOverdue : styles.statusPending]}>
                  <Text style={[styles.statusText, isCompleted ? styles.statusTextCompleted : isOverdue ? styles.statusTextOverdue : styles.statusTextPending]}>
                    {task.status}
                  </Text>
                </View>
              </View>

              {/* Instructions Callout */}
              {task.instructions ? (
                <View style={styles.instructionsBox}>
                  <Text style={styles.instructionsLabel}>DOCTOR INSTRUCTIONS</Text>
                  <Text style={styles.instructionsText}>{task.instructions}</Text>
                </View>
              ) : null}

              {/* Metadata Row */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Clock size={12} color="#64748B" />
                  <Text style={styles.metaText}>
                    Due: {new Date(task.dueAt).toLocaleDateString()}
                  </Text>
                </View>
                {task.assignedByDoctor ? (
                  <View style={styles.metaItem}>
                    <Stethoscope size={12} color="#64748B" />
                    <Text style={styles.metaText}>Dr. {task.assignedByDoctor}</Text>
                  </View>
                ) : null}
              </View>

              {/* Attribution / Completion Status Footer */}
              {isCompleted ? (
                <View style={styles.completionFooter}>
                  <CheckCircle2 size={14} color="#059669" />
                  <Text style={styles.completionText}>
                    Completed {task.completedAt ? `on ${new Date(task.completedAt).toLocaleDateString()}` : ''}{' '}
                    by{' '}
                    <Text style={{ fontWeight: '700' }}>
                      {task.completedByRole === 'CAREGIVER'
                        ? 'You (Caregiver on Behalf)'
                        : 'Patient (Self)'}
                    </Text>
                  </Text>
                </View>
              ) : task.canComplete ? (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openCompleteModal(task)}
                >
                  <CheckCircle2 size={16} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Complete on Patient's Behalf</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.readOnlyFooter}>
                  <Lock size={12} color="#64748B" />
                  <Text style={styles.readOnlyFooterText}>
                    Read-only. Requires COMPLETE_TASKS_ON_BEHALF permission from patient to complete.
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* MODAL: Complete Task on Behalf */}
      <Modal visible={showNoteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Task Completion</Text>
              <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                <X size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              You are completing "{selectedTask?.title}" on behalf of{' '}
              <Text style={{ fontWeight: '700', color: '#0F172A' }}>{activePatient?.name}</Text>.
              Your caregiver identity and timestamp will be permanently recorded.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Optional Caregiver Notes</Text>
              <TextInput
                style={styles.textInput}
                value={caregiverNote}
                onChangeText={setCaregiverNote}
                placeholder="e.g. Assisted with fingerprick test, glucose was normal."
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirmCompletion}
              disabled={Boolean(completingTaskId)}
            >
              {completingTaskId ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Task Completion</Text>
              )}
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
    backgroundColor: '#f8f9fc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    gap: 10,
    ...theme.shadows.soft,
  },
  headerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  permPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  permPillGreen: {
    backgroundColor: '#e6f4ea',
  },
  permPillSlate: {
    backgroundColor: '#f2f3f9',
  },
  permPillText: {
    fontFamily: theme.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  permPillTextGreen: {
    color: '#137333',
  },
  permPillTextSlate: {
    color: '#535f70',
  },
  headerTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: '#191c20',
  },
  headerSubtitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f2f3f9',
  },
  filterPillActive: {
    backgroundColor: '#004D4D',
  },
  filterPillLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: '#535f70',
    letterSpacing: 0.3,
  },
  filterPillLabelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  centerBox: {
    padding: 36,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    color: '#535f70',
  },
  errorCard: {
    backgroundColor: '#fff8f7',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ffdad6',
  },
  errorTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#ba1a1a',
  },
  errorBody: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#93000a',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    ...theme.shadows.soft,
  },
  emptyTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
  },
  emptyBody: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    textAlign: 'center',
    lineHeight: 18,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    gap: 12,
    ...theme.shadows.soft,
  },
  taskCardOverdue: {
    borderColor: '#ffdad6',
    backgroundColor: '#fff8f7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  taskTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#191c20',
  },
  categoryLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 10,
    fontWeight: '600',
    color: '#535f70',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: '#eef2ff',
  },
  statusOverdue: {
    backgroundColor: '#fff8f7',
  },
  statusCompleted: {
    backgroundColor: '#e6f4ea',
  },
  statusText: {
    fontFamily: theme.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusTextPending: {
    color: '#004D4D',
  },
  statusTextOverdue: {
    color: '#ba1a1a',
  },
  statusTextCompleted: {
    color: '#137333',
  },
  instructionsBox: {
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#004D4D',
    gap: 4,
  },
  instructionsLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 9,
    fontWeight: '700',
    color: '#004D4D',
    letterSpacing: 0.5,
  },
  instructionsText: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#191c20',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#535f70',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#004D4D',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
    ...theme.shadows.elevation2,
  },
  actionBtnText: {
    fontFamily: theme.fonts.label,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  completionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e6f4ea',
    padding: 10,
    borderRadius: 10,
  },
  completionText: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#137333',
  },
  readOnlyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f2f3f9',
    padding: 10,
    borderRadius: 10,
  },
  readOnlyFooterText: {
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    color: '#535f70',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 28, 32, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    gap: 14,
    ...theme.shadows.soft,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: '#191c20',
  },
  modalSub: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
    marginTop: 4,
  },
  inputLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: '#191c20',
    letterSpacing: 0.3,
  },
  textInput: {
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.15)',
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    fontFamily: theme.fonts.sans,
    color: '#191c20',
    backgroundColor: '#f8f9fc',
    textAlignVertical: 'top',
  },
  confirmBtn: {
    backgroundColor: '#004D4D',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    ...theme.shadows.elevation2,
  },
  confirmBtnText: {
    fontFamily: theme.fonts.label,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
