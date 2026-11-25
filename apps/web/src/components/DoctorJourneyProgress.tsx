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
      <div className="p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 font-body">
        <RefreshCw className="h-7 w-7 text-primary animate-spin mx-auto mb-3" />
        <p className="text-xs font-label font-bold uppercase tracking-wider text-on-surface-variant">
          Loading patient progress data...
        </p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6 bg-error-container/60 border border-error/20 rounded-2xl text-on-error-container font-body">
        <div className="flex items-center gap-2 mb-2 font-headline font-semibold text-sm">
          <AlertTriangle className="h-5 w-5 text-error" />
          <span>Unable to Load Progress Overview</span>
        </div>
        <p className="text-xs font-body">{error || 'No progress records available for this patient.'}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-4 py-2 bg-error text-on-error rounded-xl text-xs font-label font-bold hover:opacity-90 transition-all"
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
    <div className="space-y-6 font-body">
      {/* 1. Header Banner: Journey Stage & Care Plan Status */}
      <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-label font-bold uppercase tracking-wider">
              <Compass className="h-4 w-4" />
              <span>Care Journey Navigator</span>
            </div>
            <h3 className="text-xl font-headline font-semibold text-on-surface mt-1">
              Stage: {summary.overallProgress.currentStageId.replace(/_/g, ' ')}
            </h3>
            <p className="text-xs font-body text-on-surface-variant mt-0.5">
              Patient: <span className="font-semibold text-on-surface">{patientName}</span> • Evaluated:{' '}
              {new Date(summary.evaluationDate).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          <div className="text-right">
            <div className="text-3xl font-headline font-bold text-primary">
              {summary.overallProgress.completionPercentage}%
            </div>
            <p className="text-[11px] font-label text-on-surface-variant">
              {summary.overallProgress.completedStagesCount} of {summary.overallProgress.totalStagesCount} Stages Completed
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-surface-container-high rounded-full h-2.5 mt-5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-primary to-primary-container h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${summary.overallProgress.completionPercentage}%` }}
          />
        </div>
      </div>

      {/* 2. Core Progress Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Glucose Control */}
        <div className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-label font-bold text-on-surface-variant tracking-wider uppercase">
            <span>GLYCEMIC CONTROL (30D)</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-headline font-bold text-on-surface">
              {summary.glucoseProgress.averageGlucose30Days
                ? `${summary.glucoseProgress.averageGlucose30Days} mg/dL`
                : 'No Data'}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-label font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                TIR: {summary.glucoseProgress.timeInRangePercentage}%
              </span>
              <span className="text-[11px] font-body text-on-surface-variant">
                {summary.glucoseProgress.totalReadings30Days} reading(s)
              </span>
            </div>
          </div>
          {summary.glucoseProgress.trendDelta7Days !== null && (
            <div className="mt-3 text-[11px] font-body text-on-surface-variant border-t border-outline-variant/20 pt-2">
              7d Delta:{' '}
              <span
                className={`font-mono font-bold ${
                  summary.glucoseProgress.trendDelta7Days > 5
                    ? 'text-error'
                    : summary.glucoseProgress.trendDelta7Days < -5
                    ? 'text-emerald-700'
                    : 'text-on-surface'
                }`}
              >
                {summary.glucoseProgress.trendDelta7Days > 0 ? '+' : ''}
                {summary.glucoseProgress.trendDelta7Days} mg/dL
              </span>{' '}
              ({summary.glucoseProgress.trendDirection})
            </div>
          )}
        </div>

        {/* Medication Adherence */}
        <div className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-label font-bold text-on-surface-variant tracking-wider uppercase">
            <span>MEDICATION ADHERENCE</span>
            <Pill className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-headline font-bold text-on-surface">
              {summary.medicationAdherence.adherenceRatePercentage}%
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-label font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                7d: {summary.medicationAdherence.weeklyAdherenceRate}%
              </span>
              <span className="text-[11px] font-body text-on-surface-variant">
                {summary.medicationAdherence.prescribedMedicinesCount} Rx active
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] font-mono text-on-surface-variant border-t border-outline-variant/20 pt-2 flex justify-between">
            <span>Taken: {summary.medicationAdherence.takenDosesCount}</span>
            <span>Skipped: {summary.medicationAdherence.skippedDosesCount}</span>
            <span>Unconfirmed: {summary.medicationAdherence.unconfirmedDosesCount}</span>
          </div>
        </div>

        {/* Doctor Care Tasks */}
        <div className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-label font-bold text-on-surface-variant tracking-wider uppercase">
            <span>CARE PLAN TASKS</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-headline font-bold text-on-surface">
              {summary.carePlanProgress.completedTasksCount} / {summary.carePlanProgress.totalTasksAssigned}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-label font-bold text-primary bg-primary-fixed/40 px-2 py-0.5 rounded-full border border-primary/20">
                {summary.carePlanProgress.completionRatePercentage}% Done
              </span>
              {summary.carePlanProgress.overdueTasksCount > 0 ? (
                <span className="text-xs font-label font-bold text-on-error-container bg-error-container px-2 py-0.5 rounded-full border border-error/20">
                  {summary.carePlanProgress.overdueTasksCount} Overdue
                </span>
              ) : (
                <span className="text-[11px] text-emerald-700 font-label font-bold">On Schedule</span>
              )}
            </div>
          </div>
          <div className="mt-3 text-[11px] font-body text-on-surface-variant border-t border-outline-variant/20 pt-2 truncate">
            {summary.carePlanProgress.activePlanTitle
              ? `Plan v${summary.carePlanProgress.planVersion}: ${summary.carePlanProgress.activePlanTitle}`
              : 'No Active Plan'}
          </div>
        </div>

        {/* Follow-up Consultations */}
        <div className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-label font-bold text-on-surface-variant tracking-wider uppercase">
            <span>FOLLOW-UP APPOINTMENT</span>
            <Calendar className="h-4 w-4 text-tertiary" />
          </div>
          {summary.consultationsAndAppointments.nextAppointment ? (
            <div>
              <div className="text-sm font-headline font-bold text-on-surface truncate">
                {new Date(summary.consultationsAndAppointments.nextAppointment.scheduledAt).toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <p className="text-xs font-body text-on-surface-variant truncate mt-0.5">
                {summary.consultationsAndAppointments.nextAppointment.reason}
              </p>
              <div className="mt-2">
                <span
                  className={`text-[10px] font-label font-bold px-2.5 py-0.5 rounded-full ${
                    summary.consultationsAndAppointments.nextAppointment.isServerConfirmed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  {summary.consultationsAndAppointments.nextAppointment.isServerConfirmed
                    ? 'Confirmed'
                    : 'Awaiting Confirmation'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs font-body text-on-surface-variant">
              <p>No upcoming consultation scheduled.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Provenance & Attribution Legend */}
      <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/30 flex flex-wrap items-center justify-between text-xs gap-3">
        <span className="font-label font-bold text-on-surface uppercase tracking-wider text-[11px]">
          Data Attribution Legend:
        </span>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-800 font-label font-medium text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Clinical Lab / Doctor Order
          </span>
          <span className="flex items-center gap-1.5 text-primary font-label font-medium text-xs">
            <User className="h-3.5 w-3.5 text-primary" />
            Patient Self-Reported
          </span>
          <span className="flex items-center gap-1.5 text-teal-800 font-label font-medium text-xs">
            <HeartHandshake className="h-3.5 w-3.5 text-teal-700" />
            Caregiver-Assisted
          </span>
          <span className="flex items-center gap-1.5 text-tertiary font-label font-medium text-xs">
            <Sparkles className="h-3.5 w-3.5 text-tertiary" />
            AI Statistical Summary
          </span>
        </div>
      </div>

      {/* 4. Verified Health Insights & Doctor Discussion Points */}
      <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
          <div>
            <h4 className="font-headline font-semibold text-on-surface text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>Calculated Health Insights & Observations</span>
            </h4>
            <p className="text-xs font-body text-on-surface-variant mt-0.5">
              Deterministic observations derived from actual patient records and doctor care plans.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {['ALL', 'GLUCOSE', 'MEDICATION', 'CARE_PLAN', 'APPOINTMENT'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-label font-bold transition-all ${
                  selectedCategory === cat
                    ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-2xs'
                    : 'text-on-surface-variant bg-surface-container hover:bg-surface-container-high'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredInsights.length === 0 ? (
          <p className="text-xs font-body text-on-surface-variant py-4 text-center">No insights in this category.</p>
        ) : (
          <div className="space-y-3.5">
            {filteredInsights.map((insight) => (
              <div
                key={insight.id}
                className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-headline font-semibold text-on-surface flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        insight.category === 'GLUCOSE'
                          ? 'bg-primary'
                          : insight.category === 'MEDICATION'
                          ? 'bg-emerald-600'
                          : insight.category === 'CARE_PLAN'
                          ? 'bg-indigo-600'
                          : 'bg-tertiary'
                      }`}
                    />
                    {insight.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                      {insight.periodLabel}
                    </span>
                    {insight.isActionable && (
                      <span className="text-[10px] font-label font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                        Actionable
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs font-body text-on-surface leading-relaxed">{insight.summary}</p>
                {insight.suggestedDiscussion && (
                  <p className="text-xs font-body text-primary bg-primary-fixed/20 p-2.5 rounded-xl border border-primary/20">
                    <strong className="font-label font-bold">Consultation Discussion Point:</strong>{' '}
                    {insight.suggestedDiscussion}
                  </p>
                )}
                <div className="text-[10px] font-mono text-on-surface-variant/70">
                  Source: {insight.sourceReference}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Care Journey Milestones */}
      <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
        <div>
          <h4 className="font-headline font-semibold text-on-surface text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>Patient Journey Milestones (Achieved Events)</span>
          </h4>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            Chronological milestone log backed by verified database records.
          </p>
        </div>

        {milestones.length === 0 ? (
          <p className="text-xs font-body text-on-surface-variant py-4 text-center">No milestones recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low flex items-start gap-3.5 shadow-2xs"
              >
                <div className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-headline font-semibold text-on-surface">{m.title}</div>
                  <div className="text-xs font-body text-on-surface-variant mt-0.5">{m.description}</div>
                  <div className="text-[10px] font-mono text-on-surface-variant/70 mt-1.5">
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
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-amber-950 text-xs font-body flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-800 mt-0.5" />
        <p className="leading-relaxed">
          <span className="font-label font-bold">Clinical Interpretation Notice:</span> Progress metrics and trend deltas are
          computed from logged self-monitoring data and active doctor prescriptions. Clinical diagnosis, insulin titration,
          and therapy modifications remain the sole responsibility of the treating physician.
        </p>
      </div>
    </div>
  );
};
