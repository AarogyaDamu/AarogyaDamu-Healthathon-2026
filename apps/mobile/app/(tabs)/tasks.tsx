import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Stethoscope,
  Activity,
  Heart,
  Pill,
  ShieldCheck,
  Check,
  UserCheck,
} from 'lucide-react-native';
import { mobileApiFetch } from '../../src/api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

export interface MobileCareTask {
  id: string;
  userId: string;
  assignedById?: string | null;
  assigningDoctorName?: string;
  title: string;
  category: string;
  instructions?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  frequency?: string;
  recurrence?: string | null;
  dueAt: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';
  computedStatus?: string;
  completedAt?: string | null;
  completedById?: string | null;
  completedByRole?: 'PATIENT' | 'CAREGIVER' | 'DOCTOR' | null;
  completedByName?: string;
  clinicalNotes?: string | null;
  cancellationReason?: string | null;
}

export interface CareTaskStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  cancelledTasks: number;
  completionPercentage: number;
  patientCompletedCount: number;
  caregiverCompletedCount: number;
}

type CarePlanTab = 'DUE_TODAY' | 'UPCOMING' | 'COMPLETED' | 'OVERDUE';

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<MobileCareTask[]>([]);
  const [stats, setStats] = useState<CareTaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CarePlanTab>('DUE_TODAY');

  const loadData = useCallback(async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        mobileApiFetch<{ tasks: MobileCareTask[] }>('/tasks'),
        mobileApiFetch<{ stats: CareTaskStats }>('/tasks/stats').catch(() => ({ stats: null })),
      ]);
      setTasks(tasksRes?.tasks || []);
      if (statsRes?.stats) {
        setStats(statsRes.stats);
      }
    } catch {
      // Keep existing data on offline / error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Handle server-side task completion with duplicate prevention
  const handleCompleteTask = async (task: MobileCareTask) => {
    if (task.status === 'COMPLETED' || completingTaskId === task.id) {
      return;
    }

    setCompletingTaskId(task.id);
    try {
      const res = await mobileApiFetch<{ task: MobileCareTask; success: boolean; replayed?: boolean }>(
        `/tasks/${encodeURIComponent(task.id)}/complete`,
        { method: 'POST' }
      );

      showToast('✓ Care task marked as completed!');
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'COMPLETED', completedAt: new Date().toISOString() } : t))
      );

      // Refresh stats
      mobileApiFetch<{ stats: CareTaskStats }>('/tasks/stats')
        .then((sRes) => {
          if (sRes?.stats) setStats(sRes.stats);
        })
        .catch(() => {});
    } catch (err: any) {
      showToast(err?.message || 'Unable to complete task. Please try again.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Partition tasks into Due Today, Upcoming, Completed, and Overdue
  const { dueTodayTasks, upcomingTasks, completedTasks, overdueTasks } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    const dueToday: MobileCareTask[] = [];
    const upcoming: MobileCareTask[] = [];
    const completed: MobileCareTask[] = [];
    const overdue: MobileCareTask[] = [];

    tasks.forEach((t) => {
      if (t.status === 'COMPLETED') {
        completed.push(t);
        return;
      }
      if (t.status === 'CANCELLED') {
        return; // Exclude cancelled from active views
      }

      const dueTime = new Date(t.dueAt).getTime();
      if (dueTime < startOfToday) {
        overdue.push(t);
      } else if (dueTime >= startOfToday && dueTime < endOfToday) {
        dueToday.push(t);
      } else {
        upcoming.push(t);
      }
    });

    return {
      dueTodayTasks: dueToday,
      upcomingTasks: upcoming,
      completedTasks: completed,
      overdueTasks: overdue,
    };
  }, [tasks]);

  const activeTaskList = useMemo(() => {
    switch (activeTab) {
      case 'DUE_TODAY':
        return dueTodayTasks;
      case 'UPCOMING':
        return upcomingTasks;
      case 'COMPLETED':
        return completedTasks;
      case 'OVERDUE':
        return overdueTasks;
      default:
        return dueTodayTasks;
    }
  }, [activeTab, dueTodayTasks, upcomingTasks, completedTasks, overdueTasks]);

  const totalActive = tasks.filter((t) => t.status !== 'CANCELLED').length;
  const totalCompleted = completedTasks.length;
  const progressPercent = totalActive > 0 ? Math.round((totalCompleted / totalActive) * 100) : 100;

  const renderCategoryIcon = (category: string) => {
    switch (category) {
      case 'BLOOD_SUGAR_CHECK':
        return <Activity color={theme.colors.primary} size={16} />;
      case 'MEDICATION':
        return <Pill color={theme.colors.primary} size={16} />;
      case 'WALK_20_MIN':
      case 'PHYSICAL_ACTIVITY':
        return <Heart color={theme.colors.primary} size={16} />;
      default:
        return <Stethoscope color={theme.colors.primary} size={16} />;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {/* Screen Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.screenTitle}>Your Care Plan</Text>
              <Text style={styles.screenSubtitle}>
                Doctor-prescribed daily tasks, clinical instructions, and health directives.
              </Text>
            </View>
            <View style={styles.badgeShield}>
              <ShieldCheck color={theme.colors.primary} size={18} />
            </View>
          </View>

          {/* Progress Card */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Overall Plan Adherence</Text>
              <Text style={styles.progressValue}>
                {totalCompleted} of {totalActive} Done ({progressPercent}%)
              </Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
          </View>
        </View>

        {/* Tab Filters */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'DUE_TODAY' && styles.tabButtonActive]}
            onPress={() => setActiveTab('DUE_TODAY')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabButtonText, activeTab === 'DUE_TODAY' && styles.tabButtonTextActive]}>
              Due Today ({dueTodayTasks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'UPCOMING' && styles.tabButtonActive]}
            onPress={() => setActiveTab('UPCOMING')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabButtonText, activeTab === 'UPCOMING' && styles.tabButtonTextActive]}>
              Upcoming ({upcomingTasks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'COMPLETED' && styles.tabButtonActive]}
            onPress={() => setActiveTab('COMPLETED')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabButtonText, activeTab === 'COMPLETED' && styles.tabButtonTextActive]}>
              Done ({completedTasks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'OVERDUE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('OVERDUE')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabButtonText, activeTab === 'OVERDUE' && styles.tabButtonTextActive]}>
              Overdue ({overdueTasks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Task List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading your care tasks...</Text>
          </View>
        ) : activeTaskList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle2 color={theme.colors.textMuted} size={36} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'DUE_TODAY'
                ? 'All scheduled tasks completed for today!'
                : activeTab === 'UPCOMING'
                ? 'No upcoming tasks scheduled.'
                : activeTab === 'COMPLETED'
                ? 'No completed tasks yet.'
                : 'No overdue tasks! You are completely on track.'}
            </Text>
            <Text style={styles.emptySubtitle}>
              New tasks will appear here whenever your assigned doctor updates your diabetes care plan.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {activeTaskList.map((task) => {
              const isCompleted = task.status === 'COMPLETED';
              const isCompleting = completingTaskId === task.id;

              return (
                <View key={task.id} style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}>
                  <View style={styles.taskCardMain}>
                    {/* Completion Checkbox */}
                    <TouchableOpacity
                      style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}
                      onPress={() => handleCompleteTask(task)}
                      disabled={isCompleted || isCompleting}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isCompleted }}
                      accessibilityLabel={`Mark ${task.title} as completed`}
                    >
                      {isCompleting ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : isCompleted ? (
                        <Check color="#FFFFFF" size={14} />
                      ) : null}
                    </TouchableOpacity>

                    {/* Task Content */}
                    <View style={styles.taskContent}>
                      <View style={styles.taskTitleRow}>
                        <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>
                          {task.title}
                        </Text>
                        {task.priority && task.priority === 'HIGH' && (
                          <View style={styles.priorityBadge}>
                            <Text style={styles.priorityText}>High</Text>
                          </View>
                        )}
                      </View>

                      {/* Doctor's Instructions */}
                      {task.instructions ? (
                        <View style={styles.doctorInstructionBox}>
                          <Stethoscope color={theme.colors.primary} size={13} style={{ marginTop: 2 }} />
                          <Text style={styles.doctorInstructionText}>
                            <Text style={styles.doctorInstructionBold}>Doctor Instructions: </Text>
                            {task.instructions}
                          </Text>
                        </View>
                      ) : null}

                      {/* Metadata Row */}
                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Clock color={theme.colors.textMuted} size={12} />
                          <Text style={styles.metaText}>
                            Due: {new Date(task.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                            {new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        {task.frequency && (
                          <View style={styles.metaItem}>
                            <Calendar color={theme.colors.textMuted} size={12} />
                            <Text style={styles.metaText}>{task.frequency}</Text>
                          </View>
                        )}
                      </View>

                      {/* Doctor Attribution */}
                      <Text style={styles.assignedByText}>
                        Prescribed by: {task.assigningDoctorName || 'Assigned Doctor'}
                      </Text>

                      {/* Submitter Attribution (if completed) */}
                      {isCompleted && (
                        <View style={styles.completionBanner}>
                          {task.completedByRole === 'CAREGIVER' ? (
                            <View style={styles.attributionRow}>
                              <UserCheck color="#4338CA" size={13} />
                              <Text style={styles.caregiverAttributionText}>
                                Completed by caregiver on your behalf
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.attributionRow}>
                              <CheckCircle2 color={theme.colors.success} size={13} />
                              <Text style={styles.patientAttributionText}>Completed by you</Text>
                            </View>
                          )}
                          {task.completedAt && (
                            <Text style={styles.completionTimestamp}>
                              {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  header: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  screenTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.onSurface,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
    lineHeight: 17,
    maxWidth: '90%',
  },
  badgeShield: {
    padding: 8,
    borderRadius: theme.borders.radius.md,
    backgroundColor: '#E6F8EF',
  },
  progressCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  progressValue: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    ...theme.shadows.soft,
  },
  tabButtonText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  emptyContainer: {
    padding: 36,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
    ...theme.shadows.elevation2,
  },
  emptyTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 17,
  },
  listContainer: {
    gap: 12,
  },
  taskCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    padding: 16,
    ...theme.shadows.elevation2,
  },
  taskCardCompleted: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderColor: theme.borders.ghost,
    opacity: 0.9,
  },
  taskCardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.borders.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  checkboxCompleted: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  taskTitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.onSurface,
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: theme.colors.outline,
  },
  priorityBadge: {
    backgroundColor: '#ffdad6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.borders.radius.sm,
  },
  priorityText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: '#ba1a1a',
    textTransform: 'uppercase',
  },
  doctorInstructionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#E6F8EF',
    borderRadius: theme.borders.radius.md,
    padding: 10,
    marginTop: 8,
  },
  doctorInstructionText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: '#004D4D',
    lineHeight: 17,
    flex: 1,
  },
  doctorInstructionBold: {
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  assignedByText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.secondary,
    marginTop: 6,
    fontWeight: '500',
  },
  completionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  patientAttributionText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  caregiverAttributionText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
  },
  completionTimestamp: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 10,
    color: theme.colors.outline,
  },
});
