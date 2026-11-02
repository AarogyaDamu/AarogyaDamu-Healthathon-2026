import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { SkeletonBlock } from '../components/StateViews';
import {
  CheckCircle2,
  Circle,
  Plus,
  Clock,
  Pill,
  FlaskConical,
  Stethoscope,
  Footprints,
  Trash2,
  AlarmClock,
  Check,
  AlertCircle,
  Sparkles,
  Flame,
} from 'lucide-react';

interface CareTask {
  id: string;
  userId: string;
  title: string;
  category: string;
  status: 'PENDING' | 'COMPLETED' | 'SNOOZED';
  dueAt: string;
  completedAt?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'TODAY' | 'OVERDUE' | 'COMPLETED'>('ALL');

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('FOLLOW_UP');
  const [duePreset, setDuePreset] = useState<'TODAY' | 'TOMORROW' | '3DAYS' | 'WEEK'>('TODAY');
  const [submitting, setSubmitting] = useState(false);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  const loadTasks = async () => {
    try {
      const res = await apiFetch<{ tasks: CareTask[] }>('/tasks');
      setTasks(res.tasks || []);
    } catch (err) {
      console.warn('Failed to load care tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const calculateDueDate = (preset: 'TODAY' | 'TOMORROW' | '3DAYS' | 'WEEK'): Date => {
    const d = new Date();
    if (preset === 'TODAY') {
      d.setHours(20, 0, 0, 0); // 8:00 PM today
    } else if (preset === 'TOMORROW') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0); // 9:00 AM tomorrow
    } else if (preset === '3DAYS') {
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
    } else if (preset === 'WEEK') {
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
    }
    return d;
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const dueAt = calculateDueDate(duePreset).toISOString();
      const res = await apiFetch<{ task: CareTask }>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          category,
          dueAt,
          idempotencyKey: `user_task_${Date.now()}`,
        }),
      });

      if (res.task) {
        setTasks((prev) => [...prev, res.task]);
        setTitle('');
      }
    } catch (err: any) {
      alert(`Could not save task: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleComplete = async (task: CareTask) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    setActionTaskId(task.id);
    try {
      await apiFetch(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: newStatus,
                completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
              }
            : t
        )
      );
    } catch (err: any) {
      alert(`Could not update task status: ${err.message}`);
    } finally {
      setActionTaskId(null);
    }
  };

  const handleSnooze = async (taskId: string) => {
    setActionTaskId(taskId);
    try {
      const res = await apiFetch<{ task: CareTask }>(`/tasks/${taskId}/snooze`, {
        method: 'POST',
      });

      if (res.task) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      }
    } catch (err: any) {
      alert(`Could not snooze task: ${err.message}`);
    } finally {
      setActionTaskId(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Remove this task from your care schedule?')) return;
    setActionTaskId(taskId);
    try {
      await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert(`Could not delete task: ${err.message}`);
    } finally {
      setActionTaskId(null);
    }
  };

  const quickTemplates = [
    { title: 'Check morning fasting sugar (FBS)', cat: 'LAB_TEST' },
    { title: 'Take evening Tab Metformin 500mg SR with dinner', cat: 'MEDICATION' },
    { title: '30-minute post-lunch gentle walk', cat: 'LIFESTYLE' },
    { title: 'Review repeat HbA1c test with Dr. Kulkarni', cat: 'FOLLOW_UP' },
  ];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000;

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const dueTime = new Date(t.dueAt).getTime();
      const isOverdue = t.status === 'PENDING' && dueTime < now.getTime();
      const isToday = dueTime >= startOfToday && dueTime < endOfToday;

      if (filter === 'TODAY') return isToday && t.status !== 'COMPLETED';
      if (filter === 'OVERDUE') return isOverdue;
      if (filter === 'COMPLETED') return t.status === 'COMPLETED';
      return true;
    });
  }, [tasks, filter, startOfToday, endOfToday, now]);

  const counts = useMemo(() => {
    const overdueCount = tasks.filter((t) => t.status === 'PENDING' && new Date(t.dueAt).getTime() < now.getTime()).length;
    const todayCount = tasks.filter((t) => {
      const d = new Date(t.dueAt).getTime();
      return d >= startOfToday && d < endOfToday && t.status !== 'COMPLETED';
    }).length;
    const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
    const totalCount = tasks.length;
    const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return { overdueCount, todayCount, completedCount, totalCount, completionPercent };
  }, [tasks, now, startOfToday, endOfToday]);

  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'MEDICATION':
        return { label: 'Medication', icon: Pill, color: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'LAB_TEST':
        return { label: 'Lab Test', icon: FlaskConical, color: 'bg-blue-50 text-blue-800 border-blue-200' };
      case 'LIFESTYLE':
        return { label: 'Lifestyle', icon: Footprints, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'FOLLOW_UP':
      default:
        return { label: 'Doctor Follow-Up', icon: Stethoscope, color: 'bg-teal-50 text-teal-800 border-teal-200' };
    }
  };

  const formatDue = (isoDate: string, isCompleted: boolean) => {
    if (isCompleted) return 'Completed';
    const due = new Date(isoDate);
    const diffHours = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60));
    const isPast = due.getTime() < now.getTime();

    if (isPast) {
      const daysAgo = Math.max(1, Math.round(Math.abs(diffHours) / 24));
      return `Overdue by ${daysAgo} day${daysAgo > 1 ? 's' : ''}`;
    }
    if (diffHours < 24 && due.getDate() === now.getDate()) {
      return `Due today at ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    if (diffHours < 48) {
      return `Due tomorrow at ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return `Due on ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <SkeletonBlock lines={3} />
        <SkeletonBlock lines={4} />
        <SkeletonBlock lines={6} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* 1. HERO PROGRESS & ADHERENCE BANNER */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shadow-2xs">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Care Tasks & Regimen</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Keep track of daily glucose tests, medications, doctor appointments, and healthy habits.
              </p>
            </div>
          </div>

          {/* Adherence Progress Bar */}
          <div className="pt-3 max-w-lg space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700">Daily Care Completion</span>
              <span className="text-teal-800 font-extrabold">{counts.completionPercent}% Completed</span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div
                style={{ width: `${counts.completionPercent}%` }}
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-700"
              />
            </div>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="px-3.5 py-2 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 flex items-center gap-2 shadow-2xs">
            <Flame className="h-4 w-4 text-teal-700 animate-pulse" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-extrabold text-teal-800 block">Check-in</span>
              <span className="text-xs font-black">4-Day Streak</span>
            </div>
          </div>

          {counts.overdueCount > 0 && (
            <div className="px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2 shadow-2xs">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <div className="text-left">
                <span className="text-[10px] uppercase font-extrabold text-rose-800 block">Needs Action</span>
                <span className="text-xs font-black">{counts.overdueCount} Overdue</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. ADD CARE TASK FORM WITH QUICK TEMPLATES */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Care Follow-up Task</h3>
              <p className="text-[11px] text-slate-500">Record medicine refills, laboratory visits, or doctor check-ins</p>
            </div>
          </div>

          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            Smart Care Assistant
          </span>
        </div>

        {/* 1-Click Quick Template Chips */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Popular Task Presets (Click to autofill)
          </span>
          <div className="flex flex-wrap gap-2">
            {quickTemplates.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTitle(tpl.title);
                  setCategory(tpl.cat);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-900 text-slate-600 text-xs font-medium transition shadow-2xs flex items-center gap-1.5"
              >
                <Sparkles className="h-3 w-3 text-teal-600" />
                <span>{tpl.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleCreateTask} className="grid sm:grid-cols-12 gap-3.5 items-end pt-1">
          {/* Description */}
          <div className="sm:col-span-5 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Task Description
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Fasting lipid profile blood draw"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-700 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium transition"
            />
          </div>

          {/* Category Dropdown */}
          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-700 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-slate-900 font-medium transition"
            >
              <option value="FOLLOW_UP">🩺 Doctor Follow-Up</option>
              <option value="MEDICATION">💊 Medication Refill / Dose</option>
              <option value="LAB_TEST">🧪 Lab Test / Blood Draw</option>
              <option value="LIFESTYLE">👟 Diet & Lifestyle Habit</option>
            </select>
          </div>

          {/* Due Preset Selector */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Due Date
            </label>
            <select
              value={duePreset}
              onChange={(e) => setDuePreset(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-700 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-slate-900 font-medium transition"
            >
              <option value="TODAY">Today (Tonight)</option>
              <option value="TOMORROW">Tomorrow Morning</option>
              <option value="3DAYS">In 3 Days</option>
              <option value="WEEK">Next Week</option>
            </select>
          </div>

          {/* Submit Button */}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>{submitting ? 'Saving...' : 'Save Task'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. YOUR CARE TASKS CONTAINER WITH INTERACTIVE TABS */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Your Care Tasks ({tasks.length})
              </h3>
              {counts.overdueCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Keep track of upcoming and completed health obligations
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
            {[
              { id: 'ALL', label: `All (${counts.totalCount})` },
              { id: 'TODAY', label: `Today (${counts.todayCount})` },
              { id: 'OVERDUE', label: `Overdue (${counts.overdueCount})` },
              { id: 'COMPLETED', label: `Completed (${counts.completedCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filter === tab.id
                    ? 'bg-teal-700 text-white shadow-2xs font-bold'
                    : 'hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task Cards Stream */}
        {filteredTasks.length === 0 ? (
          /* RICH EMPTY STATE */
          <div className="py-12 px-4 text-center max-w-sm mx-auto space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-teal-50 border border-teal-200 mx-auto flex items-center justify-center text-teal-700 shadow-2xs">
              <Check className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">No tasks in this view</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {filter === 'ALL'
                  ? 'Your care agenda is currently clear. Add a new task or choose from the popular presets above.'
                  : `You have no ${filter.toLowerCase()} tasks right now.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map((t) => {
              const isCompleted = t.status === 'COMPLETED';
              const meta = getCategoryMeta(t.category);
              const CatIcon = meta.icon;
              const isOverdue = t.status === 'PENDING' && new Date(t.dueAt).getTime() < now.getTime();
              const isProcessing = actionTaskId === t.id;

              return (
                <div
                  key={t.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCompleted
                      ? 'bg-slate-50/70 border-slate-200 opacity-75'
                      : isOverdue
                      ? 'bg-rose-50/30 border-rose-200 hover:border-rose-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-teal-200 hover:shadow-xs'
                  }`}
                >
                  {/* Left: Checkbox & Title */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleToggleComplete(t)}
                      className="mt-0.5 text-slate-400 hover:text-teal-700 transition shrink-0 focus:outline-none"
                      title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 animate-in zoom-in-75 duration-150" />
                      ) : (
                        <Circle className="h-5 w-5 hover:scale-110 transition" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <p
                        className={`text-xs sm:text-sm font-bold leading-snug transition-all ${
                          isCompleted
                            ? 'line-through text-slate-400 font-normal'
                            : 'text-slate-900'
                        }`}
                      >
                        {t.title}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        {/* Category Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold border ${meta.color}`}
                        >
                          <CatIcon className="h-3 w-3" />
                          <span>{meta.label}</span>
                        </span>

                        {/* Due Date Indicator */}
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isCompleted
                              ? 'text-slate-400'
                              : isOverdue
                              ? 'text-rose-600 font-bold'
                              : 'text-slate-500'
                          }`}
                        >
                          {isOverdue && !isCompleted ? (
                            <AlertCircle className="h-3 w-3 text-rose-500" />
                          ) : (
                            <Clock className="h-3 w-3 text-slate-400" />
                          )}
                          <span>{formatDue(t.dueAt, isCompleted)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 w-full sm:w-auto justify-end">
                    {!isCompleted && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleSnooze(t.id)}
                        className="p-2 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition flex items-center gap-1 text-[11px] font-semibold"
                        title="Snooze for 24 hours"
                      >
                        <AlarmClock className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">+24h</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleDelete(t.id)}
                      className="p-2 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition text-[11px]"
                      title="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}