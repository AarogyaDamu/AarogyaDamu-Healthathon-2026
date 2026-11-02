import { useEffect, useState } from 'react';
import { apiFetch, getActiveTargetPatientId } from '../api/client';
import { SkeletonBlock } from '../components/StateViews';
import type { CarePlan, CarePlanProgress } from '../api/types';
import {
  CheckCircle2,
  Calendar,
  AlertCircle,
  Stethoscope,
  Target,
  Sparkles,
  ChevronRight,
  Plus,
  FileText,
  Activity,
  History,
  Check,
  X,
  Flame,
} from 'lucide-react';

interface CareTask {
  id: string;
  userId: string;
  carePlanId?: string | null;
  title: string;
  category: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  dueAt: string;
  completedAt?: string | null;
}

export default function CarePlanPage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [activePlan, setActivePlan] = useState<CarePlan | null>(null);
  const [allPlans, setAllPlans] = useState<CarePlan[]>([]);
  const [progress, setProgress] = useState<CarePlanProgress | null>(null);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCaregiverMode, setIsCaregiverMode] = useState(false);

  // Clinician Builder / Revision Modal
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [builderMode, setBuilderMode] = useState<'NEW' | 'REVISE' | 'EDIT_DRAFT'>('NEW');
  const [selectedPlanForRevision, setSelectedPlanForRevision] = useState<CarePlan | null>(null);
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderDiagnosis, setBuilderDiagnosis] = useState('Type 2 Diabetes Mellitus');
  const [builderSummary, setBuilderSummary] = useState('');
  const [builderInstructions, setBuilderInstructions] = useState('');
  const [builderReviewDate, setBuilderReviewDate] = useState('');
  const [builderGoals, setBuilderGoals] = useState<
    Array<{ category: string; title: string; targetValue: string; unit: string; timeframe: string }>
  >([]);
  const [builderActivities, setBuilderActivities] = useState<
    Array<{ category: string; title: string; frequency: string; timing: string; instructions: string; isCaregiverEligible: boolean }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const targetPatientId = getActiveTargetPatientId();

  const loadCarePlanData = async () => {
    try {
      setError(null);
      const userRes = await apiFetch<{ user: any; profile: any }>('/auth/me');
      setCurrentUser(userRes.user);

      const effectiveId = targetPatientId || userRes.user.id;
      setIsCaregiverMode(Boolean(targetPatientId && targetPatientId !== userRes.user.id));

      const [activeRes, historyRes, tasksRes] = await Promise.all([
        apiFetch<{ carePlan: CarePlan | null; progress: CarePlanProgress | null }>(
          `/care-plans/patient/${effectiveId}/active`
        ).catch(() => ({ carePlan: null, progress: null })),
        apiFetch<{ plans: CarePlan[] }>(`/care-plans/patient/${effectiveId}`).catch(() => ({ plans: [] })),
        apiFetch<{ tasks: CareTask[] }>('/tasks').catch(() => ({ tasks: [] })),
      ]);

      setActivePlan(activeRes.carePlan);
      setProgress(activeRes.progress);
      setAllPlans(historyRes.plans || []);
      setTasks(tasksRes.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve care plan records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCarePlanData();
  }, [targetPatientId]);

  const handleCompleteTask = async (taskId: string) => {
    if (completingTaskId) return;
    setCompletingTaskId(taskId);
    try {
      await apiFetch(`/care-plans/tasks/${taskId}/complete`, {
        method: 'POST',
      });
      // Refresh tasks & progress
      await loadCarePlanData();
    } catch (err: any) {
      alert(err.message || 'Could not mark task completed');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const openNewPlanModal = () => {
    setBuilderMode('NEW');
    setBuilderTitle('Personalized Type 2 Diabetes Management Plan');
    setBuilderDiagnosis('Type 2 Diabetes Mellitus');
    setBuilderSummary('Daily glycemic continuity, diet monitoring, and activity schedule.');
    setBuilderInstructions('Check morning fasting glucose before breakfast; take evening walk 25 mins.');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setBuilderReviewDate(d.toISOString().slice(0, 10));
    setBuilderGoals([
      { category: 'GLUCOSE', title: 'Fasting Blood Glucose', targetValue: '80-130', unit: 'mg/dL', timeframe: 'Daily' },
      { category: 'GLUCOSE', title: 'Post-Meal Sugar (2h)', targetValue: '< 180', unit: 'mg/dL', timeframe: 'Post Lunch/Dinner' },
      { category: 'HBA1C', title: 'HbA1c Clinical Target', targetValue: '< 7.0', unit: '%', timeframe: 'Quarterly' },
    ]);
    setBuilderActivities([
      {
        category: 'BLOOD_SUGAR_CHECK',
        title: 'Morning Fasting Glucose Check',
        frequency: 'DAILY',
        timing: 'MORNING_FASTING',
        instructions: 'Test before breakfast and log into Sugar Checks',
        isCaregiverEligible: true,
      },
      {
        category: 'EXERCISE',
        title: 'Post-Dinner Brisk Walk',
        frequency: 'DAILY',
        timing: 'EVENING',
        instructions: 'Walk 25-30 minutes at a comfortable pace',
        isCaregiverEligible: true,
      },
      {
        category: 'FOOT_CARE',
        title: 'Daily Diabetic Foot Inspection',
        frequency: 'DAILY',
        timing: 'BEDTIME',
        instructions: 'Check feet for dryness, red spots, or cuts; apply moisturizer',
        isCaregiverEligible: true,
      },
    ]);
    setShowBuilderModal(true);
  };

  const openReviseModal = (plan: CarePlan) => {
    setSelectedPlanForRevision(plan);
    setBuilderMode('REVISE');
    setBuilderTitle(`${plan.title} (Revision v${plan.version + 1})`);
    setBuilderDiagnosis(plan.diagnosis || 'Type 2 Diabetes Mellitus');
    setBuilderSummary(plan.summary || '');
    setBuilderInstructions(plan.doctorInstructions || '');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setBuilderReviewDate(d.toISOString().slice(0, 10));
    setBuilderGoals(
      plan.goals.map((g) => ({
        category: g.category,
        title: g.title,
        targetValue: g.targetValue,
        unit: g.unit || '',
        timeframe: g.timeframe || 'Daily',
      }))
    );
    setBuilderActivities(
      plan.activities.map((a) => ({
        category: a.category,
        title: a.title,
        frequency: a.frequency,
        timing: a.timing || 'MORNING',
        instructions: a.instructions || '',
        isCaregiverEligible: a.isCaregiverEligible,
      }))
    );
    setShowBuilderModal(true);
  };

  const handleSavePlan = async (action: 'SAVE_DRAFT' | 'APPROVE') => {
    if (!builderTitle.trim()) {
      alert('Please enter a care plan title');
      return;
    }
    setSubmitting(true);
    try {
      const effectiveId = targetPatientId || currentUser?.id;
      const reviewDateIso = builderReviewDate ? new Date(builderReviewDate).toISOString() : null;

      let savedPlanId: string;

      if (builderMode === 'NEW') {
        const res = await apiFetch<{ plan: CarePlan }>('/care-plans', {
          method: 'POST',
          body: JSON.stringify({
            patientId: effectiveId,
            title: builderTitle.trim(),
            diagnosis: builderDiagnosis.trim(),
            summary: builderSummary.trim(),
            doctorInstructions: builderInstructions.trim(),
            reviewDate: reviewDateIso,
            goals: builderGoals,
            activities: builderActivities,
          }),
        });
        savedPlanId = res.plan.id;
      } else if (builderMode === 'REVISE' && selectedPlanForRevision) {
        const res = await apiFetch<{ plan: CarePlan }>(`/care-plans/${selectedPlanForRevision.id}/revise`, {
          method: 'POST',
          body: JSON.stringify({
            title: builderTitle.trim(),
            diagnosis: builderDiagnosis.trim(),
            summary: builderSummary.trim(),
            doctorInstructions: builderInstructions.trim(),
            reviewDate: reviewDateIso,
            goals: builderGoals,
            activities: builderActivities,
            reasonForRevision: 'Updated in Clinical Care Plan Builder',
          }),
        });
        savedPlanId = res.plan.id;
      } else {
        throw new Error('Unknown builder state');
      }

      if (action === 'APPROVE') {
        await apiFetch(`/care-plans/${savedPlanId}/approve`, {
          method: 'POST',
        });
      }

      setShowBuilderModal(false);
      await loadCarePlanData();
    } catch (err: any) {
      alert(`Could not save care plan: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const isDoctor = Boolean(currentUser?.isClinician);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <SkeletonBlock lines={3} />
        <div className="grid md:grid-cols-3 gap-4 pt-4">
          <SkeletonBlock lines={6} className="md:col-span-2" />
          <SkeletonBlock lines={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-300">
      {/* 1. TOP HEADER & WORKSPACE CONTEXT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Shared Diabetes Care Plan
            </h1>
            {activePlan && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Active v{activePlan.version}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isCaregiverMode
              ? 'Viewing authorized dependent care plan via verified patient consent.'
              : 'Coordinated clinical plan with health targets, daily activities, and review milestones.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {allPlans.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
              <span>Versions ({allPlans.length})</span>
            </button>
          )}

          {isDoctor && (
            <button
              type="button"
              onClick={activePlan ? () => openReviseModal(activePlan) : openNewPlanModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{activePlan ? 'Revise Plan (v' + (activePlan.version + 1) + ')' : 'Create Care Plan'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* 2. CARE PLAN OVERVIEW CARD (IF ACTIVE PLAN EXISTS) */}
      {activePlan ? (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-teal-50/20 to-slate-50 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-700">
                {activePlan.diagnosis || 'Type 2 Diabetes Mellitus'}
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">{activePlan.title}</h2>
              {activePlan.summary && (
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{activePlan.summary}</p>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 text-xs text-slate-500">
              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                <Stethoscope className="h-3.5 w-3.5 text-teal-600" />
                <span>Dr. {activePlan.doctor?.profile?.fullName || activePlan.doctor?.email || 'Attending Physician'}</span>
              </div>
              {activePlan.reviewDate && (
                <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg font-semibold">
                  <Calendar className="h-3.5 w-3.5 text-amber-700" />
                  <span>Review Date: {new Date(activePlan.reviewDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              )}
            </div>
          </div>

          {/* DOCTOR INSTRUCTIONS BANNER */}
          {activePlan.doctorInstructions && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                  Doctor's Clinical Instructions
                </h4>
                <p className="text-xs text-teal-900 leading-relaxed font-medium">
                  {activePlan.doctorInstructions}
                </p>
              </div>
            </div>
          )}

          {/* PROGRESS SUMMARY BAR */}
          {progress && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-amber-500" />
                  Today's Care Plan Adherence
                </span>
                <span className="font-black text-teal-700">
                  {progress.completedTasks} / {progress.totalTasks} tasks completed ({progress.percentage}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    progress.percentage >= 80 ? 'bg-teal-600' : progress.percentage >= 50 ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-3">
          <Stethoscope className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Active Clinical Care Plan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            A comprehensive shared diabetes plan will appear here once authored and approved by your assigned clinician.
          </p>
          {isDoctor && (
            <button
              type="button"
              onClick={openNewPlanModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition"
            >
              <Plus className="h-4 w-4" /> Create Initial Care Plan
            </button>
          )}
        </div>
      )}

      {/* 3. GRID OF HEALTH GOALS & DAILY ACTIVITIES */}
      {activePlan && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* HEALTH GOALS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-teal-700" />
                Clinical Health Goals
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {activePlan.goals.length} targets defined
              </span>
            </div>

            <div className="space-y-2.5">
              {activePlan.goals.length === 0 ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-white text-center text-xs text-slate-500">
                  No specific goals documented in this version.
                </div>
              ) : (
                activePlan.goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs flex items-center justify-between gap-3 hover:border-teal-200 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {goal.category}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{goal.title}</span>
                      </div>
                      {goal.notes && <p className="text-[11px] text-slate-500">{goal.notes}</p>}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-teal-800">
                        {goal.targetValue} {goal.unit || ''}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">{goal.timeframe}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* DAILY ACTIVITIES */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-700" />
                Scheduled Daily Activities
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {activePlan.activities.length} daily routines
              </span>
            </div>

            <div className="space-y-2.5">
              {activePlan.activities.length === 0 ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-white text-center text-xs text-slate-500">
                  No routine activities documented in this plan.
                </div>
              ) : (
                activePlan.activities.map((act) => (
                  <div
                    key={act.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2 hover:border-teal-200 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{act.title}</span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {act.frequency}
                        </span>
                      </div>
                      {act.isCaregiverEligible && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          Caregiver Eligible
                        </span>
                      )}
                    </div>
                    {act.instructions && (
                      <p className="text-xs text-slate-600 leading-relaxed">{act.instructions}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. TODAY'S CARE TASKS CHECKLIST (WITH CAREGIVER ASSISTANCE) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-700" />
              Actionable Care Tasks
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isCaregiverMode
                ? 'Authorized caregivers can complete tasks on behalf of the patient with recorded attribution.'
                : 'Mark activities completed to maintain your adherence streak.'}
            </p>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No scheduled tasks for today. Scheduled tasks generated from approved activities appear here.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const isCompleted = task.status === 'COMPLETED';
              return (
                <div key={task.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isCompleted || completingTaskId === task.id}
                      onClick={() => handleCompleteTask(task.id)}
                      className={`h-5 w-5 rounded-md flex items-center justify-center border transition ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 hover:border-teal-600 text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <div>
                      <p className={`text-xs font-bold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {task.title}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Due {new Date(task.dueAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {isCompleted && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      Completed
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. DAMU ASSISTANT HELPER CARDS */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-amber-50 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Need Help with Your Care Plan?</h4>
            <p className="text-xs text-slate-600">
              Ask Damu to explain instructions, summarize progress, or prepare a doctor consultation review.
            </p>
          </div>
        </div>

        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('ask-damu')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition shrink-0"
          >
            <span>Ask Damu</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 6. VERSION HISTORY DRAWER / MODAL */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Care Plan Version History</h3>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {allPlans.map((p) => (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    p.status === 'ACTIVE'
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : p.status === 'SUPERSEDED'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-amber-200 bg-amber-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {p.title} (v{p.version})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-200 text-emerald-900'
                          : p.status === 'SUPERSEDED'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{p.summary || 'Clinical management plan'}</p>
                  <div className="text-[10px] text-slate-400">
                    Created: {new Date(p.createdAt).toLocaleDateString('en-IN')}
                    {p.approvedAt && ` • Approved: ${new Date(p.approvedAt).toLocaleDateString('en-IN')}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. CLINICAL BUILDER / REVISION MODAL */}
      {showBuilderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {builderMode === 'REVISE' ? 'Revise Care Plan' : 'Create Patient Care Plan'}
                </h3>
                <p className="text-xs text-slate-500">
                  Author patient-specific health goals, routines, and doctor instructions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBuilderModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Plan Title</label>
                <input
                  type="text"
                  value={builderTitle}
                  onChange={(e) => setBuilderTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="e.g. Type 2 Diabetes Glycemic Management Plan"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosis</label>
                <input
                  type="text"
                  value={builderDiagnosis}
                  onChange={(e) => setBuilderDiagnosis(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Doctor Instructions</label>
                <textarea
                  value={builderInstructions}
                  onChange={(e) => setBuilderInstructions(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="Specific guidance for patient and caregiver..."
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Next Review Date</label>
                  <input
                    type="date"
                    value={builderReviewDate}
                    onChange={(e) => setBuilderReviewDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plan Summary</label>
                  <input
                    type="text"
                    value={builderSummary}
                    onChange={(e) => setBuilderSummary(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                    placeholder="Short clinical summary..."
                  />
                </div>
              </div>

              {/* Goals Summary in Builder */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Health Targets ({builderGoals.length})
                </label>
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border">
                  {builderGoals.map((g, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border">
                      <span className="font-semibold text-slate-800">{g.title}</span>
                      <span className="font-bold text-teal-800">{g.targetValue} {g.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activities Summary in Builder */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Scheduled Activities ({builderActivities.length})
                </label>
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border">
                  {builderActivities.map((a, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border">
                      <span className="font-semibold text-slate-800">{a.title}</span>
                      <span className="text-slate-500">{a.frequency} ({a.timing})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSavePlan('SAVE_DRAFT')}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSavePlan('APPROVE')}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold"
              >
                {submitting ? 'Approving...' : 'Approve & Publish Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
