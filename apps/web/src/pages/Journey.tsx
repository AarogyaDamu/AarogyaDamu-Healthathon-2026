import { useEffect, useState, useMemo } from 'react';
import { apiFetch, getActiveTargetPatientId } from '../api/client';
import { SkeletonBlock } from '../components/StateViews';
import type {
  JourneyTimelineResponse,
  DailyJourneyResponse,
  JourneyProgressResponse,
  JourneyFollowUpResponse,
  JourneyHistoryResponse,
  JourneyStage,
} from '../api/types';
import {
  Calendar,
  CheckCircle2,
  Check,
  ShieldCheck,
  Stethoscope,
  Clock,
  Compass,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Pill,
  Award,
  History,
  X,
} from 'lucide-react';

type MainViewTab = 'MILESTONES' | 'DAILY' | 'PROGRESS' | 'FOLLOW_UP' | 'HISTORY';

export default function Journey() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainViewTab>('MILESTONES');

  // Journey API State
  const [timeline, setTimeline] = useState<JourneyTimelineResponse | null>(null);
  const [daily, setDaily] = useState<DailyJourneyResponse | null>(null);
  const [progress, setProgress] = useState<JourneyProgressResponse | null>(null);
  const [followUp, setFollowUp] = useState<JourneyFollowUpResponse | null>(null);
  const [history, setHistory] = useState<JourneyHistoryResponse | null>(null);

  // Filter for history
  const [historyFilter, setHistoryFilter] = useState<string>('ALL');

  // Task completing state
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Selected stage for inspection drawer
  const [selectedStage, setSelectedStage] = useState<JourneyStage | null>(null);

  const targetPatientId = getActiveTargetPatientId();

  const loadAllJourneyData = async () => {
    try {
      const query = targetPatientId ? `?patientId=${encodeURIComponent(targetPatientId)}` : '';
      const [tRes, dRes, pRes, fRes, hRes] = await Promise.all([
        apiFetch<JourneyTimelineResponse>(`/journey/timeline${query}`).catch(() => null),
        apiFetch<DailyJourneyResponse>(`/journey/daily${query}`).catch(() => null),
        apiFetch<JourneyProgressResponse>(`/journey/progress${query}`).catch(() => null),
        apiFetch<JourneyFollowUpResponse>(`/journey/follow-up${query}`).catch(() => null),
        apiFetch<JourneyHistoryResponse>(`/journey/history${query}`).catch(() => null),
      ]);

      setTimeline(tRes);
      setDaily(dRes);
      setProgress(pRes);
      setFollowUp(fRes);
      setHistory(hRes);
    } catch (err) {
      console.warn('Failed to load journey data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllJourneyData();
  }, [targetPatientId]);

  const handleCompleteTask = async (taskId: string) => {
    setCompletingTaskId(taskId);
    try {
      await apiFetch(`/care-plans/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Completed via Daily Journey Navigator' }),
      });
      await loadAllJourneyData();
    } catch (err: any) {
      alert(`Could not complete task: ${err.message}`);
    } finally {
      setCompletingTaskId(null);
    }
  };

  // SVG Geometry for Glucose Curve
  const glucoseReadings = useMemo(() => {
    return (progress?.actualObservations?.bloodGlucose || []).slice().reverse();
  }, [progress]);

  const svgWidth = 640;
  const svgHeight = 180;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const values = glucoseReadings.map((r) => r.numericValue);
  const minVal = values.length ? Math.min(Math.min(...values), 70) : 70;
  const maxVal = values.length ? Math.max(Math.max(...values), 180) : 180;
  const valRange = Math.max(maxVal - minVal, 20);

  const getY = (val: number) => svgHeight - padBottom - ((val - minVal) / valRange) * plotH;
  const getX = (idx: number, count: number) => padLeft + (idx / Math.max(count - 1, 1)) * plotW;

  const points = glucoseReadings.map((r, i) => ({
    x: getX(i, glucoseReadings.length),
    y: getY(r.numericValue),
    value: r.numericValue,
    date: r.observedAt,
    context: r.context,
  }));

  const buildPath = (pts: typeof points) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x},${pts[i].y}`;
    }
    return d;
  };

  const filteredHistory = useMemo(() => {
    if (!history?.history) return [];
    if (historyFilter === 'ALL') return history.history;
    return history.history.filter((ev) => ev.eventType === historyFilter);
  }, [history, historyFilter]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4">
        <SkeletonBlock lines={2} />
        <div className="grid sm:grid-cols-4 gap-3 pt-2">
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={4} />
        </div>
        <SkeletonBlock lines={8} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* 1. HERO HEADER WITH JOURNEY NAVIGATOR PILL */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shadow-2xs">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Diabetes Care Journey Navigator</h2>
              <p className="text-xs text-slate-500">
                Connected timeline bridging onboarding, consultations, care plans, daily routines, and doctor follow-up.
              </p>
            </div>
          </div>
        </div>

        {timeline && (
          <div className="flex items-center gap-2 rounded-2xl bg-teal-50 border border-teal-200 px-4 py-2 self-start shadow-2xs">
            <Award className="h-4 w-4 text-teal-700 shrink-0" />
            <div className="text-right">
              <span className="text-xs font-bold text-teal-900">
                {timeline.overallProgress.completedCount} of {timeline.overallProgress.totalStages} Milestones Completed
              </span>
              <p className="text-[10px] text-teal-700 font-medium">
                Overall Progress: {timeline.overallProgress.completionPercentage}%
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. TOP LEVEL TAB BAR */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('MILESTONES')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'MILESTONES' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Journey Milestones ({timeline?.stages?.length ?? 9})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DAILY')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'DAILY' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>Today's Daily Journey</span>
          {daily?.pendingTasks?.length ? (
            <span className="ml-1 rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-extrabold">
              {daily.pendingTasks.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PROGRESS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'PROGRESS' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Glycemic Progress & Targets</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FOLLOW_UP')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'FOLLOW_UP' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Stethoscope className="h-3.5 w-3.5" />
          <span>Follow-up Navigator</span>
          {followUp?.isReviewOverdue ? (
            <span className="ml-1 rounded-full bg-rose-100 text-rose-800 px-1.5 py-0.2 text-[10px] font-extrabold">
              Overdue
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'HISTORY' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Journey History ({history?.totalEvents ?? 0})</span>
        </button>
      </div>

      {/* 3. TAB 1: JOURNEY ROADMAP MILESTONES */}
      {activeTab === 'MILESTONES' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Chronological Milestones</h3>
                <p className="text-xs text-slate-500">
                  Each stage is validated against underlying database records (onboarding, observations, doctor notes, care plan approvals).
                </p>
              </div>
              <span className="text-xs font-bold text-teal-800">
                Current Stage: <span className="underline">{timeline?.currentStage}</span>
              </span>
            </div>

            <div className="space-y-3">
              {(timeline?.stages || []).map((stage) => {
                const isCompleted = stage.status === 'COMPLETED';
                const isCurrent = stage.status === 'CURRENT';
                const isOverdue = stage.status === 'OVERDUE';
                const isUpcoming = stage.status === 'UPCOMING';

                return (
                  <div
                    key={stage.id}
                    onClick={() => setSelectedStage(stage)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                      isCurrent
                        ? 'border-teal-300 bg-teal-50/40 shadow-xs'
                        : isOverdue
                        ? 'border-rose-300 bg-rose-50/40'
                        : isCompleted
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-100 bg-slate-50/60 opacity-80'
                    }`}
                  >
                    {/* Stage Badge Node */}
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${
                        isCompleted
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-teal-700 text-white ring-4 ring-teal-100'
                          : isOverdue
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : stage.order}
                    </div>

                    {/* Stage Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{stage.title}</h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : isCurrent
                              ? 'bg-teal-100 text-teal-800'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : isUpcoming
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {stage.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mt-1">{stage.description}</p>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                        {stage.completedAt && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            ✓ Verified: {new Date(stage.completedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </span>
                        )}
                        {stage.recordType && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                            Evidence: {stage.recordType}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 self-center" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: TODAY'S DAILY JOURNEY */}
      {activeTab === 'DAILY' && (
        <div className="space-y-4">
          {daily?.carePlan && (
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-teal-700" />
                <span className="text-xs font-bold uppercase tracking-wider text-teal-900">
                  Active Clinical Care Plan (v{daily.carePlan.version})
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{daily.carePlan.title}</h3>
              {daily.carePlan.doctorInstructions && (
                <div className="p-3 bg-white rounded-xl border border-teal-100 text-xs text-slate-700">
                  <span className="font-bold text-teal-900 block mb-1">Doctor Guidance:</span>
                  {daily.carePlan.doctorInstructions}
                </div>
              )}
            </div>
          )}

          {/* Pending Tasks with One-Click Completion */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Today's Scheduled Tasks</h3>
                <p className="text-xs text-slate-500">
                  {daily?.summary.completedCount ?? 0} of {daily?.summary.totalTasksToday ?? 0} tasks completed today ({daily?.summary.adherencePercentage ?? 0}% adherence)
                </p>
              </div>
              <span className="text-xs font-bold text-teal-800">Date: {daily?.date}</span>
            </div>

            {(daily?.pendingTasks || []).length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs bg-slate-50 rounded-xl">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                All scheduled tasks for today are completed! Great job maintaining your regimen.
              </div>
            ) : (
              <div className="space-y-2">
                {(daily?.pendingTasks || []).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 hover:bg-white transition"
                  >
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900">{t.title}</span>
                      <p className="text-[11px] text-slate-500">
                        Category: {t.category} • Due: {new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={completingTaskId === t.id}
                      onClick={() => handleCompleteTask(t.id)}
                      className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition flex items-center gap-1 shrink-0"
                    >
                      <Check className="h-3 w-3" />
                      {completingTaskId === t.id ? 'Saving...' : 'Mark Done'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prescribed Medications */}
          {daily?.medications && daily.medications.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Pill className="h-4 w-4 text-teal-700" />
                <h3 className="font-bold text-slate-900 text-sm">Active Medications</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {daily.medications.map((m) => (
                  <div key={m.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 space-y-1">
                    <span className="text-xs font-bold text-slate-900">{m.name}</span>
                    <p className="text-xs text-teal-800 font-semibold">{m.dosage}</p>
                    <p className="text-[11px] text-slate-500">Timing: {m.timing} {m.notes ? `• ${m.notes}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 3: GLYCEMIC PROGRESS & CLINICIAN TARGETS */}
      {activeTab === 'PROGRESS' && (
        <div className="space-y-5">
          {/* Targets vs Actual Overview Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Longitudinal Blood Glucose Curve</h3>
                <p className="text-xs text-slate-500">
                  Target Fasting: {progress?.clinicianTargets.fastingMin}–{progress?.clinicianTargets.fastingMax} mg/dL • Post-Meal Max: &lt;{progress?.clinicianTargets.postMealMax} mg/dL
                </p>
              </div>
              <span className="text-xs font-bold text-teal-800">
                Time-in-Range: {progress?.estimatedInsights.glycemicControl.timeInRangePercentage ?? 0}%
              </span>
            </div>

            {/* SVG Interactive Curve */}
            {points.length > 1 ? (
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-44">
                  {/* Target Zone */}
                  <rect
                    x={padLeft}
                    y={getY(progress?.clinicianTargets.postMealMax || 180)}
                    width={plotW}
                    height={Math.max(getY(progress?.clinicianTargets.fastingMin || 80) - getY(progress?.clinicianTargets.postMealMax || 180), 10)}
                    fill="#10b981"
                    opacity="0.08"
                  />
                  {/* Line */}
                  <path d={buildPath(points)} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Points */}
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4" fill="#0f766e" stroke="#ffffff" strokeWidth="1.5" />
                      <text x={p.x} y={p.y - 8} fontSize="9" textAnchor="middle" fill="#0f172a" fontWeight="bold">
                        {p.value}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                Insufficient readings to plot curve. Log at least 2 readings in Sugar Checks.
              </div>
            )}

            {/* Strict Clinical Safety Distinction Callout */}
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                <Sparkles className="h-4 w-4 text-teal-700" />
                <span>Actual Observations vs Estimated/AI Insights</span>
              </div>
              <p className="text-[11px] text-teal-800 leading-relaxed">
                All plotted blood glucose numbers represent <strong>verified actual self-monitored records</strong>. Any projected HbA1c value ({progress?.estimatedInsights.estimatedA1c?.value ?? 'N/A'}%) is an <strong>estimated insight</strong> derived mathematically from your mean glucose using the clinical Nathan formula. It serves as an informative trajectory guide and does not substitute for a clinical venous lab draw.
              </p>
            </div>
          </div>

          {/* Actual Records Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Verified Actual Observations</h3>
            <div className="space-y-2">
              {(progress?.actualObservations.bloodGlucose || []).slice(0, 5).map((obs) => (
                <div key={obs.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{obs.numericValue} {obs.unit}</span>
                    <span className="text-slate-500 ml-2">({obs.context})</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                    <span className="rounded bg-emerald-50 text-emerald-800 px-1.5 py-0.2 font-medium">Actual</span>
                    <span>{new Date(obs.observedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 4: FOLLOW-UP NAVIGATOR */}
      {activeTab === 'FOLLOW_UP' && (
        <div className="space-y-4">
          {/* Review Countdown Card */}
          {followUp?.nextReviewDate && (
            <div
              className={`rounded-2xl border p-5 shadow-xs space-y-2 ${
                followUp.isReviewOverdue
                  ? 'border-rose-300 bg-rose-50/70'
                  : 'border-teal-200 bg-gradient-to-r from-teal-50 to-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className={`h-5 w-5 ${followUp.isReviewOverdue ? 'text-rose-700' : 'text-teal-700'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${followUp.isReviewOverdue ? 'text-rose-900' : 'text-teal-900'}`}>
                  {followUp.isReviewOverdue ? 'Review Overdue Notice' : 'Clinical Care Plan Review'}
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900">
                {new Date(followUp.nextReviewDate).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              </h3>
              <p className="text-xs text-slate-600">
                {followUp.isReviewOverdue
                  ? 'Your scheduled care plan review date has lapsed without a subsequent clinical consultation. Contact your doctor to assess your glycemic trajectory.'
                  : `${followUp.daysUntilReview} days remaining until your comprehensive clinical review.`}
              </p>
            </div>
          )}

          {/* Upcoming Consultations with Strict Server Confirmation Flag */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Upcoming Consultations</h3>
            {(followUp?.upcomingAppointments || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                No upcoming appointments scheduled. Book your next review in Doctor Visit.
              </div>
            ) : (
              <div className="space-y-3">
                {(followUp?.upcomingAppointments || []).map((appt) => (
                  <div key={appt.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-sm font-bold text-slate-900">{appt.doctorName}</span>
                      <p className="text-xs text-slate-600">{appt.reason} ({appt.visitType})</p>
                      <p className="text-[11px] text-teal-800 font-semibold">
                        Scheduled: {new Date(appt.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>

                    {/* Strict Server Confirmation Check */}
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1 shrink-0 ${
                        appt.isServerConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {appt.isServerConfirmed ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      <span>{appt.statusLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Clinician Card */}
          {followUp?.assignedClinician && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Stethoscope className="h-4 w-4 text-teal-700" />
                <h3 className="font-bold text-slate-900 text-sm">Treating Clinician</h3>
              </div>
              <h4 className="text-base font-bold text-slate-900">{followUp.assignedClinician.name}</h4>
              <p className="text-xs text-slate-500">{followUp.assignedClinician.email}</p>
            </div>
          )}
        </div>
      )}

      {/* 7. TAB 5: JOURNEY HISTORY LOG */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Chronological Health History</h3>
                <p className="text-xs text-slate-500">Unified audit log of all clinical milestones, consultations, and tasks</p>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                {['ALL', 'OBSERVATION', 'CARE_PLAN', 'CONSULTATION', 'TASK', 'APPOINTMENT'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setHistoryFilter(type)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                      historyFilter === type ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredHistory.map((item) => (
                <div key={item.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{item.title}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{item.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. STAGE INSPECTION MODAL */}
      {selectedStage && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-teal-800">
                  Stage {selectedStage.order} of {timeline?.stages?.length ?? 9}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedStage.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStage(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">{selectedStage.description}</p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-teal-900">{selectedStage.status}</span>
              </div>
              {selectedStage.completedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed Date:</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedStage.completedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </span>
                </div>
              )}
              {selectedStage.recordType && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified Evidence:</span>
                  <span className="font-semibold text-slate-800">{selectedStage.recordType}</span>
                </div>
              )}
            </div>

            {selectedStage.details && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Clinical Record Details</span>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-x-auto font-mono">
                  {JSON.stringify(selectedStage.details, null, 2)}
                </pre>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSelectedStage(null)}
              className="w-full py-2 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 transition"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}