import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  Sparkles,
  Trash2,
  Pill,
  Activity,
  Heart,
  Stethoscope,
  CheckCircle2,
  Target,
  Calendar,
  ShieldCheck,
} from 'lucide-react-native';
import {
  clinicalStore,
  subscribeToClinicalStore,
  type CareTask,
  type TaskCategory,
} from '../../src/api/client';
import { coordinationApi } from '../../src/api/coordination';
import { carePlanApi, type MobileCarePlan } from '../../src/api/careplan';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

type TaskFilter = 'ALL' | TaskCategory;

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [taskInput, setTaskInput] = useState('');
  const [selectedCat, setSelectedCat] =
    useState<TaskCategory>('MEDICINE');
  const [activeFilter, setActiveFilter] =
    useState<TaskFilter>('ALL');
  const [activePlan, setActivePlan] = useState<MobileCarePlan | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCarePlan() {
      try {
        const ctx = await coordinationApi.getContext();
        if (ctx && ctx.userId) {
          const plan = await carePlanApi.getActivePlan(ctx.userId);
          if (isMounted) {
            setActivePlan(plan);
          }
        }
      } catch {
        // Fallback gracefully in offline / demo mode
      }
    }
    void loadCarePlan();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToClinicalStore(() => {
      setTick((tick) => tick + 1);
    });
  }, []);

  const tasks = Array.isArray(clinicalStore.tasks)
    ? clinicalStore.tasks
    : [];

  const streak = clinicalStore.calculateStreak();

  const { completed, total, percentage } =
    clinicalStore.calculateTaskProgress();

  const handleAddTask = () => {
    const title = taskInput.trim();

    if (!title) {
      showToast('Enter a reminder title first.');
      return;
    }

    try {
      clinicalStore.addTask(
        title,
        selectedCat,
        'Today',
        'Daily Reminder',
      );

      setTaskInput('');
      showToast('Reminder added to this session.');
    } catch {
      showToast('Could not add this reminder.');
    }
  };

  const handleToggleTask = (task: CareTask) => {
    clinicalStore.toggleTask(task.id);
  };

  const handleDeleteTask = (task: CareTask) => {
    clinicalStore.deleteTask(task.id);
    showToast('Reminder removed from this session.');
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case 'MEDICINE':
        return <Pill color={theme.colors.primary} size={16} />;
      case 'GLUCOSE':
        return <Activity color={theme.colors.primary} size={16} />;
      case 'ACTIVITY':
        return <Heart color={theme.colors.primary} size={16} />;
      case 'CONSULT':
        return <Stethoscope color={theme.colors.primary} size={16} />;
      default:
        return <Activity color={theme.colors.primary} size={16} />;
    }
  };

  const filteredGroups = useMemo(() => {
    const filtered =
      activeFilter === 'ALL'
        ? tasks
        : tasks.filter((task) => task.category === activeFilter);

    return {
      dueNowTasks: filtered.filter(
        (task) => !task.completed && task.dueStatus === 'due_now',
      ),
      upcomingTasks: filtered.filter(
        (task) => !task.completed && task.dueStatus === 'upcoming',
      ),
      completedTasks: filtered.filter((task) => task.completed),
    };
  }, [tasks, activeFilter]);

  const renderTaskItem = (item: CareTask) => (
    <View
      key={item.id}
      style={[
        styles.taskItem,
        item.completed && styles.taskItemDone,
      ]}
    >
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed }}
        accessibilityLabel={`Mark ${item.title} ${
          item.completed ? 'incomplete' : 'complete'
        }`}
        style={[
          styles.checkbox,
          item.completed && styles.checkboxDone,
        ]}
        onPress={() => handleToggleTask(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {item.completed ? (
          <CheckCircle2 color={theme.colors.white} size={16} />
        ) : null}
      </TouchableOpacity>

      <View style={styles.taskTextCol}>
        <View style={styles.taskCategoryHeader}>
          {getCategoryIcon(item.category)}
          <Text style={styles.taskCategoryText}>
            {item.category} {'\u2022'} {item.time}
          </Text>
        </View>

        <Text
          style={[
            styles.taskTitle,
            item.completed && styles.taskTitleDone,
          ]}
        >
          {item.title}
        </Text>

        <Text style={styles.taskRecurrence}>
          {item.recurrence}
        </Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.title}`}
        style={styles.deleteBtn}
        onPress={() => handleDeleteTask(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Trash2 color={theme.colors.textPlaceholder} size={17} />
      </TouchableOpacity>
    </View>
  );

  const renderTaskSection = (
    title: string,
    sectionTasks: CareTask[],
    emptyMessage: string,
  ) => (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionHeader}>{title}</Text>

      {sectionTasks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        sectionTasks.map(renderTaskItem)
      )}
    </View>
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerSuper}>DAILY CARE AGENDA</Text>
          <Text style={styles.headerTitle}>Tasks & Reminders</Text>
        </View>

        <View style={styles.streakBadge}>
          <Sparkles color={theme.colors.primary} size={14} />
          <Text style={styles.streakText}>
            {streak > 0 ? `${streak}-Day Streak` : 'Start Streak'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activePlan ? (
          <View style={styles.carePlanCard}>
            <View style={styles.carePlanHeader}>
              <View style={styles.carePlanBadge}>
                <ShieldCheck color="#059669" size={13} />
                <Text style={styles.carePlanBadgeText}>
                  ACTIVE CARE PLAN v{activePlan.version}
                </Text>
              </View>
              {activePlan.reviewDate ? (
                <View style={styles.reviewBadge}>
                  <Calendar color="#64748B" size={11} />
                  <Text style={styles.reviewBadgeText}>
                    Review: {new Date(activePlan.reviewDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.carePlanTitle}>{activePlan.title}</Text>
            <Text style={styles.carePlanDiagnosis}>Condition: {activePlan.diagnosis}</Text>

            {activePlan.goals && activePlan.goals.length > 0 ? (
              <View style={styles.goalsContainer}>
                <Text style={styles.goalsTitle}>CLINICAL TARGETS</Text>
                <View style={styles.goalsWrap}>
                  {activePlan.goals.map((goal) => (
                    <View key={goal.id} style={styles.goalPill}>
                      <Target color="#0284C7" size={12} />
                      <Text style={styles.goalText}>
                        {goal.targetMetric}: {goal.targetValue} ({goal.timeframe})
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {activePlan.doctorInstructions ? (
              <View style={styles.doctorInstructionBox}>
                <View style={styles.doctorInstructionHeader}>
                  <Stethoscope color="#0D9488" size={13} />
                  <Text style={styles.doctorInstructionLabel}>
                    Doctor Instructions
                    {activePlan.approvedBy ? ` (${activePlan.approvedBy.name})` : ''}
                  </Text>
                </View>
                <Text style={styles.doctorInstructionText}>
                  {activePlan.doctorInstructions}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.progressHeader}>
            <Text style={styles.cardTitle}>
              Task Completion
            </Text>

            <Text style={styles.progressCount}>
              {completed} of {total} ({percentage}%)
            </Text>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: percentage,
            }}
            style={styles.progressBarBg}
          >
            <View
              style={[
                styles.progressBarFill,
                { width: `${percentage}%` },
              ]}
            />
          </View>

          <Text style={styles.helperText}>
            Progress reflects tasks currently in this session.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Daily Reminder</Text>

          <View style={styles.addBar}>
            <TextInput
              style={styles.addInput}
              placeholder="e.g. Take a walk or record a reading"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={taskInput}
              onChangeText={setTaskInput}
              onSubmitEditing={handleAddTask}
              returnKeyType="done"
              accessibilityLabel="Reminder title"
              maxLength={120}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              style={styles.addBtn}
              onPress={handleAddTask}
            >
              <Plus color={theme.colors.white} size={21} />
            </TouchableOpacity>
          </View>

          <View style={styles.catSelectRow}>
            {(
              ['MEDICINE', 'GLUCOSE', 'ACTIVITY', 'CONSULT'] as const
            ).map((category) => {
              const selected = selectedCat === category;

              const label =
                category === 'MEDICINE'
                  ? 'Meds'
                  : category === 'GLUCOSE'
                    ? 'Sugar'
                    : category === 'ACTIVITY'
                      ? 'Activity'
                      : 'Doctor';

              return (
                <TouchableOpacity
                  key={category}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.catBtn,
                    selected && styles.catBtnActive,
                  ]}
                  onPress={() => setSelectedCat(category)}
                >
                  <Text
                    style={[
                      styles.catBtnText,
                      selected && styles.catBtnTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {(
            [
              'ALL',
              'MEDICINE',
              'GLUCOSE',
              'ACTIVITY',
              'CONSULT',
            ] as const
          ).map((filter) => {
            const selected = activeFilter === filter;

            return (
              <TouchableOpacity
                key={filter}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.filterPill,
                  selected && styles.filterPillActive,
                ]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    selected && styles.filterPillTextActive,
                  ]}
                >
                  {filter === 'ALL' ? 'All tasks' : filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {renderTaskSection(
          'DUE NOW',
          filteredGroups.dueNowTasks,
          'Nothing due right now.',
        )}

        {renderTaskSection(
          'UPCOMING',
          filteredGroups.upcomingTasks,
          'No upcoming tasks in this session.',
        )}

        {filteredGroups.completedTasks.length > 0
          ? renderTaskSection(
              `COMPLETED (${filteredGroups.completedTasks.length})`,
              filteredGroups.completedTasks,
              'No completed tasks yet.',
            )
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerSuper: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  streakText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
    flexGrow: 1,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  progressCount: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  helperText: {
    marginTop: 8,
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  addBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  addInput: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 14,
    color: theme.colors.text,
  },
  addBtn: {
    width: 48,
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  catBtn: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBtnActive: {
    backgroundColor: theme.colors.primaryBorder,
  },
  catBtnText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
  },
  catBtnTextActive: {
    color: theme.colors.primary,
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
  },
  filterPillTextActive: {
    color: theme.colors.white,
  },
  sectionBlock: {
    gap: 8,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
  },
  emptyBox: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 12,
  },
  taskItemDone: {
    opacity: 0.72,
    backgroundColor: theme.colors.bg,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  taskTextCol: {
    flex: 1,
    minWidth: 0,
  },
  taskCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  taskCategoryText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.textMuted,
  },
  taskRecurrence: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  deleteBtn: {
    minWidth: 38,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carePlanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  carePlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  carePlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  carePlanBadgeText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: '#065F46',
    letterSpacing: 0.5,
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reviewBadgeText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.medium,
    color: '#475569',
  },
  carePlanTitle: {
    fontSize: 16,
    fontWeight: theme.typography.weights.extrabold,
    color: '#0F172A',
  },
  carePlanDiagnosis: {
    fontSize: 12,
    fontWeight: theme.typography.weights.medium,
    color: '#64748B',
  },
  goalsContainer: {
    marginTop: 4,
    gap: 6,
  },
  goalsTitle: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  goalsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  goalText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    color: '#0369A1',
  },
  doctorInstructionBox: {
    backgroundColor: '#F0FDFA',
    borderLeftWidth: 3,
    borderLeftColor: '#0D9488',
    borderRadius: 8,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  doctorInstructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  doctorInstructionLabel: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: '#0F766E',
  },
  doctorInstructionText: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 18,
  },
});