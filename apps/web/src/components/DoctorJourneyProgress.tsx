import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Pill,
  Calendar,
  Sparkles,
  RefreshCw,
  User,
  HeartHandshake,
  ShieldAlert,
} from 'lucide-react';
import {
  getPatientJourneySummary,
  getPatientJourneyInsights,
  getPatientJourneyMilestones,
} from '../api/client';
import type {
  JourneyProgressSummary,
  HealthInsight,
  JourneyMilestoneItem,
} from '../api/types';

interface DoctorJourneyProgressProps {
  patientId: string;
  patientName?: string;
}

export const DoctorJourneyProgress: React.FC<DoctorJourneyProgressProps> = ({
  patientId,
  patientName = 'Patient',
}) => {
  const [summary, setSummary] = useState<JourneyProgressSummary | null>(null);
  const [insights, setInsights] = useState<HealthInsight[]>([]);
  const [milestones, setMilestones] = useState<JourneyMilestoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, insData, mlsData] = await Promise.all([
        getPatientJourneySummary(patientId),
        getPatientJourneyInsights(patientId),
        getPatientJourneyMilestones(patientId),
      ]);
      setSummary(sumData);
      setInsights(insData.insights || []);
      setMilestones(mlsData.milestones || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load journey progress details.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) {
      void loadData();
    }
  }, [patientId, loadData]);

  if (loading) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <RefreshCw className="h-6 w-6 text-teal-600 animate-spin mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">Loading patient progress data...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
        <div className="flex items-center gap-2 mb-2 font-bold text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>Unable to Load Progress Overview</span>
        </div>
        <p className="text-xs">{error || 'No progress records available for this patient.'}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded text-xs font-semibold hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredInsights =
    selectedCategory === 'ALL'
      ? insights
      : insights.filter((i) => i.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner: Journey Stage & Care Plan Status */}
      <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-sm border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-teal-300 text-xs font-bold uppercase tracking-wider">
              <Compass className="h-4 w-4" />
              <span>Care Journey Navigator</span>
            </div>
            <h3 className="text-lg font-black text-white mt-0.5">
              Stage: {summary.overallProgress.currentStageId.replace(/_/g, ' ')}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Patient: <span className="font-semibold text-white">{patientName}</span> • Evaluated:{' '}
              {new Date(summary.evaluationDate).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black text-teal-400">
              {summary.overallProgress.completionPercentage}%
            </div>
            <p className="text-[11px] text-slate-300">
              {summary.overallProgress.completedStagesCount} of {summary.overallProgress.totalStagesCount} Stages Completed
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
          <div
            className="bg-teal-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${summary.overallProgress.completionPercentage}%` }}
          />
        </div>
      </div>

      {/* 2. Core Progress Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Glucose Control */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>GLYCEMIC CONTROL (30D)</span>
            <Activity className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">
              {summary.glucoseProgress.averageGlucose30Days
                ? `${summary.glucoseProgress.averageGlucose30Days} mg/dL`
                : 'No Data'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                TIR: {summary.glucoseProgress.timeInRangePercentage}%
              </span>
              <span className="text-[11px] text-slate-500">
                {summary.glucoseProgress.totalReadings30Days} reading(s)
              </span>
            </div>
          </div>
          {summary.glucoseProgress.trendDelta7Days !== null && (
            <div className="mt-3 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
              7d Delta:{' '}
              <span
                className={`font-bold ${
                  summary.glucoseProgress.trendDelta7Days > 5
                    ? 'text-rose-600'
                    : summary.glucoseProgress.trendDelta7Days < -5
                    ? 'text-emerald-600'
                    : 'text-slate-700'
                }`}
              >
                {summary.glucoseProgress.trendDelta7Days > 0 ? `+` : ''}
                {summary.glucoseProgress.trendDelta7Days} mg/dL
              </span>{' '}
              ({summary.glucoseProgress.trendDirection})
            </div>
          )}
        </div>

        {/* Medication Adherence */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>MEDICATION ADHERENCE</span>
            <Pill className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">
              {summary.medicationAdherence.adherenceRatePercentage}%
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                7d: {summary.medicationAdherence.weeklyAdherenceRate}%
              </span>
              <span className="text-[11px] text-slate-500">
                {summary.medicationAdherence.prescribedMedicinesCount} Rx active
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-600 border-t border-slate-100 pt-2 flex justify-between">
            <span>Taken: {summary.medicationAdherence.takenDosesCount}</span>
            <span>Skipped: {summary.medicationAdherence.skippedDosesCount}</span>
            <span>Unconfirmed: {summary.medicationAdherence.unconfirmedDosesCount}</span>
          </div>
        </div>

        {/* Doctor Care Tasks */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>CARE PLAN TASKS</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">
              {summary.carePlanProgress.completedTasksCount} / {summary.carePlanProgress.totalTasksAssigned}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded">
                {summary.carePlanProgress.completionRatePercentage}% Done
              </span>
              {summary.carePlanProgress.overdueTasksCount > 0 ? (
                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                  {summary.carePlanProgress.overdueTasksCount} Overdue
                </span>
              ) : (
                <span className="text-[11px] text-emerald-600 font-semibold">On Schedule</span>
              )}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2 truncate">
            {summary.carePlanProgress.activePlanTitle
              ? `Plan v${summary.carePlanProgress.planVersion}: ${summary.carePlanProgress.activePlanTitle}`
              : 'No Active Plan'}
          </div>
        </div>

        {/* Follow-up Consultations */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>FOLLOW-UP APPOINTMENT</span>
            <Calendar className="h-4 w-4 text-amber-600" />
          </div>
          {summary.consultationsAndAppointments.nextAppointment ? (
            <div className="mt-2">
              <div className="text-sm font-black text-slate-900 truncate">
                {new Date(summary.consultationsAndAppointments.nextAppointment.scheduledAt).toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <p className="text-xs text-slate-600 truncate mt-0.5">
                {summary.consultationsAndAppointments.nextAppointment.reason}
              </p>
              <div className="mt-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    summary.consultationsAndAppointments.nextAppointment.isServerConfirmed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {summary.consultationsAndAppointments.nextAppointment.isServerConfirmed
                    ? 'Confirmed'
                    : 'Awaiting Confirmation'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-500">
              <p>No upcoming consultation scheduled.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Provenance & Attribution Legend */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2">
        <span className="font-bold text-slate-700">Data Attribution Legend:</span>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Clinical Lab / Doctor Order
          </span>
          <span className="flex items-center gap-1.5 text-blue-700 font-medium">
            <User className="h-3 w-3 text-blue-600" />
            Patient Self-Reported
          </span>
          <span className="flex items-center gap-1.5 text-teal-700 font-medium">
            <HeartHandshake className="h-3 w-3 text-teal-600" />
            Caregiver-Assisted
          </span>
          <span className="flex items-center gap-1.5 text-amber-700 font-medium">
            <Sparkles className="h-3 w-3 text-amber-600" />
            AI Statistical Summary
          </span>
        </div>
      </div>

      {/* 4. Verified Health Insights & Doctor Discussion Points */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <span>Calculated Health Insights & Observations</span>
            </h4>
            <p className="text-xs text-slate-500">
              Deterministic observations derived from actual patient records and doctor care plans.
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {['ALL', 'GLUCOSE', 'MEDICATION', 'CARE_PLAN', 'APPOINTMENT'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredInsights.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">No insights in this category.</p>
        ) : (
          <div className="space-y-3">
            {filteredInsights.map((insight) => (
              <div
                key={insight.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        insight.category === 'GLUCOSE'
                          ? 'bg-teal-500'
                          : insight.category === 'MEDICATION'
                          ? 'bg-emerald-500'
                          : insight.category === 'CARE_PLAN'
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    {insight.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      {insight.periodLabel}
                    </span>
                    {insight.isActionable && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Actionable
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{insight.summary}</p>
                {insight.suggestedDiscussion && (
                  <p className="text-xs font-semibold text-teal-800 bg-teal-50 p-2 rounded border border-teal-100">
                    Consultation Discussion Point: {insight.suggestedDiscussion}
                  </p>
                )}
                <div className="text-[10px] text-slate-400">Source: {insight.sourceReference}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Care Journey Milestones */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
        <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Patient Journey Milestones (Achieved Events)</span>
        </h4>
        <p className="text-xs text-slate-500">
          Chronological milestone log backed by verified database records.
        </p>

        {milestones.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">No milestones recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-lg border border-slate-200 bg-white flex items-start gap-3 shadow-xs"
              >
                <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{m.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{m.description}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Achieved:{' '}
                    {new Date(m.achievedAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {m.eventRefType ? ` • ${m.eventRefType}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clinical Disclaimer */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
        <p className="leading-relaxed">
          <span className="font-bold">Clinical Interpretation Notice:</span> Progress metrics and trend deltas are
          computed from logged self-monitoring data and active doctor prescriptions. Clinical diagnosis, insulin titration,
          and therapy modifications remain the sole responsibility of the treating physician.
        </p>
      </div>
    </div>
  );
};
