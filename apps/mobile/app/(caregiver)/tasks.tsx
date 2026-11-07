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
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    ...theme.shadows.card,
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
    paddingVertical: 3,
    borderRadius: 6,
  },
  permPillGreen: {
    backgroundColor: '#ECFDF5',
  },
  permPillSlate: {
    backgroundColor: '#F1F5F9',
  },
  permPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  permPillTextGreen: {
    color: '#059669',
  },
  permPillTextSlate: {
    color: '#64748B',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
  },
  filterPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillLabelActive: {
    color: '#FFFFFF',
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorBody: {
    fontSize: 12,
    color: '#7F1D1D',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyBody: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  taskCardOverdue: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFBFB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: '#EFF6FF',
  },
  statusOverdue: {
    backgroundColor: '#FEF2F2',
  },
  statusCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextPending: {
    color: '#2563EB',
  },
  statusTextOverdue: {
    color: '#DC2626',
  },
  statusTextCompleted: {
    color: '#059669',
  },
  instructionsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    gap: 3,
  },
  instructionsLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  instructionsText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
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
    fontSize: 11,
    color: '#64748B',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  completionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: 6,
  },
  completionText: {
    fontSize: 11,
    color: '#166534',
  },
  readOnlyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
  },
  readOnlyFooterText: {
    fontSize: 10,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  confirmBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
