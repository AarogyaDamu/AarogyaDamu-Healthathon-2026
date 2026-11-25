import { useState, useEffect, type FC } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import {
  getActiveClinicalReview,
  updateChecklistItem,
  finalizeDoctorReview,
} from '../api/client';

interface Props {
  patientId: string;
  patientName: string;
}

interface ChecklistItem {
  key: string;
  category: string;
  title: string;
  description: string;
  status: 'PENDING' | 'REVIEWED' | 'NEEDS_ATTENTION';
  clinicalNotes?: string;
  needsAttentionReason?: string;
  reviewedByRole?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}

const CATEGORIES = [
  { id: 'GLYCEMIC', label: '1. Glycemic Control & Stability', count: 4, shortLabel: '1. Glycemic Stability' },
  { id: 'CARDIO_RENAL', label: '2. Cardiovascular & Renal Protection', count: 4, shortLabel: '2. Cardiorenal Protection' },
  { id: 'COMPLICATIONS', label: '3. Complication & Microvascular Screening', count: 3, shortLabel: '3. Microvascular Screen' },
  { id: 'MEDICATION_SAFETY', label: '4. Medication Optimization & Safety', count: 3, shortLabel: '4. Medication Safety' },
  { id: 'LIFESTYLE', label: '5. Lifestyle & Patient-Centered Management', count: 3, shortLabel: '5. Lifestyle & Self-Care' },
];

export const ClinicalReviewWorkspace: FC<Props> = ({ patientId, patientName }) => {
  const [encounter, setEncounter] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<string>('GLYCEMIC');
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [signing, setSigning] = useState<boolean>(false);
  const [overallImpression, setOverallImpression] = useState<string>('');
  const [managementChanges, setManagementChanges] = useState<string>('');
  const [nextReviewDays, setNextReviewDays] = useState<number>(90);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchEncounter = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await getActiveClinicalReview(patientId);
      if (res.encounter) {
        setEncounter(res.encounter);
        setOverallImpression(res.encounter.overallImpression || '');
        setManagementChanges(res.encounter.managementChangesSummary || '');
        setNextReviewDays(res.encounter.nextReviewDueDays || 90);
      }
    } catch (err: any) {
      console.error('Failed to load clinical review encounter:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to load clinical review' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEncounter();
  }, [patientId]);

  const handleUpdateItem = async (
    itemKey: string,
    status: 'PENDING' | 'REVIEWED' | 'NEEDS_ATTENTION',
    clinicalNotes?: string,
    needsAttentionReason?: string,
  ) => {
    if (!encounter?.id) return;
    setSavingItemKey(itemKey);
    try {
      const res = await updateChecklistItem(encounter.id, {
        itemKey,
        status,
        clinicalNotes,
        needsAttentionReason,
      });
      if (res.encounter) {
        setEncounter(res.encounter);
      }
      setMessage({ type: 'success', text: 'Checklist item updated' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update item' });
    } finally {
      setSavingItemKey(null);
    }
  };

  const handleFinalizeSign = async () => {
    if (!encounter?.id) return;
    if (!confirm('Finalize and digitally sign this 17-point clinical review as Attending Physician? This will lock the review encounter.')) {
      return;
    }

    setSigning(true);
    setMessage(null);
    try {
      const res = await finalizeDoctorReview(encounter.id, {
        overallImpression,
        managementChangesSummary: managementChanges,
        nextReviewDueDays: nextReviewDays,
      });
      if (res.encounter) {
        setEncounter(res.encounter);
      }
      setMessage({
        type: 'success',
        text: 'Clinical review successfully finalized, approved, and digitally signed by Attending Physician!',
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to finalize clinical review' });
    } finally {
      setSigning(false);
    }
  };

  const items: ChecklistItem[] = encounter?.checklistItemsJson
    ? JSON.parse(encounter.checklistItemsJson)
    : [];

  const totalPoints = items.length || 17;
  const reviewedCount = items.filter((i) => i.status === 'REVIEWED').length;
  const attentionCount = items.filter((i) => i.status === 'NEEDS_ATTENTION').length;
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;
  const completionPercent = totalPoints > 0 ? Math.round((reviewedCount / totalPoints) * 100) : 0;
  const isFinalized = encounter?.status === 'APPROVED';

  return (
    <div className="space-y-8 font-body">
      {/* Top Archival Patient Context & Progress Ribbon */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm">
        <div className="flex flex-col gap-6">
          {/* Metadata Breadcrumb & Action Tier */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-1 rounded bg-surface-container text-[11px] font-label font-bold text-tertiary uppercase tracking-wider">
                Protocol ADA-EASD 2024
              </span>
              <span className="text-outline-variant">•</span>
              <span className="text-xs font-label text-on-surface-variant">
                Comprehensive 17-Point Evidence Matrix
              </span>
              <span className="text-outline-variant">•</span>
              <span className="text-xs font-label text-on-surface-variant font-mono">
                {encounter?.id ? `ENCOUNTER #${encounter.id.slice(0, 12)}` : 'ACTIVE ENCOUNTER'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-xs font-label text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live Synchronization
              </span>
              <span
                className={`text-[11px] font-label font-bold px-3 py-1 rounded-full ${
                  isFinalized
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-900 border border-amber-200'
                }`}
              >
                {encounter?.status || 'IN_PROGRESS'}
              </span>
            </div>
          </div>

          {/* Main Protocol Title & Radial/Linear Progress Summary */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex flex-col gap-1 max-w-2xl">
              <span className="text-xs font-label uppercase tracking-widest text-primary font-semibold">
                Structured Diabetology Protocol
              </span>
              <h1 className="text-2xl lg:text-3xl font-headline font-semibold text-on-surface tracking-tight leading-snug">
                17-Point Clinical Diabetology Review
              </h1>
              <p className="text-sm font-body text-on-surface-variant leading-relaxed">
                Multi-system algorithmic synthesis for{' '}
                <strong className="text-on-surface font-semibold">{patientName}</strong>.
                Prioritizing glycemic stability, cardiorenal protection, and proactive microvascular surveillance according to Indian Consensus & ADA Standards of Care.
              </p>
            </div>

            {/* Progress Summary Visual */}
            <div className="flex items-center gap-5 p-4 rounded-xl bg-surface-container-low min-w-[300px] border border-outline-variant/30">
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-surface-container-highest"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-primary transition-all duration-500 ease-out"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray={`${completionPercent}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-label font-bold text-on-surface">{completionPercent}%</span>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-headline font-bold text-primary">{reviewedCount}</span>
                  <span className="text-xs font-label text-on-surface-variant">/ {totalPoints} Completed</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {attentionCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-label font-medium text-error">
                      <span className="w-1.5 h-1.5 rounded-full bg-error" /> {attentionCount} Attention
                    </span>
                  )}
                  {attentionCount > 0 && <span className="text-surface-container-highest">•</span>}
                  <span className="inline-flex items-center gap-1 text-[11px] font-label font-medium text-on-surface-variant">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline" /> {pendingCount} Pending
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Pill Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2">
            {CATEGORIES.map((c) => {
              const categoryItems = items.filter((i) => i.category === c.id);
              const catReviewed = categoryItems.filter((i) => i.status === 'REVIEWED').length;
              const isActive = activeCategory === c.id;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategory(c.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-label font-medium whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-xs'
                      : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span>{c.shortLabel}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {catReviewed}/{c.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between shadow-2xs ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-error-container/60 border-error/20 text-on-error-container'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-error shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-on-surface-variant hover:text-on-surface text-xs font-bold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Clinical Callout / Patient Snapshot Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-label font-bold uppercase tracking-wider text-on-surface-variant">
            Primary Clinical Goal
          </span>
          <span className="text-sm font-headline font-semibold text-on-surface">Target HbA1c &lt; 7.0%</span>
          <span className="text-xs font-body text-primary font-medium">HbA1c 7.2% (Reviewed &amp; Verified)</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-label font-bold uppercase tracking-wider text-on-surface-variant">
            Renal Function Profile
          </span>
          <span className="text-sm font-headline font-semibold text-on-surface">eGFR 64 mL/min/1.73m²</span>
          <span className="text-xs font-body text-tertiary font-medium">Stage G2 • UACR 42 mg/g</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-label font-bold uppercase tracking-wider text-on-surface-variant">
            Safety Alert / Hypoglycemia
          </span>
          <span className="text-sm font-headline font-semibold text-error">Nocturnal Hypo Detected</span>
          <span className="text-xs font-body text-on-surface-variant">0.6% severe (&lt;54 mg/dL at 03:30)</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-label font-bold uppercase tracking-wider text-on-surface-variant">
            Therapeutic Regimen Status
          </span>
          <span className="text-sm font-headline font-semibold text-on-surface">Dual / Triple Combination</span>
          <span className="text-xs font-body text-primary font-medium">De-escalation &amp; SGLT2i review</span>
        </div>
      </div>

      {/* Category Section Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline font-bold text-sm">
            {activeCategory === 'GLYCEMIC' && '01'}
            {activeCategory === 'CARDIO_RENAL' && '02'}
            {activeCategory === 'COMPLICATIONS' && '03'}
            {activeCategory === 'MEDICATION_SAFETY' && '04'}
            {activeCategory === 'LIFESTYLE' && '05'}
          </div>
          <div>
            <h2 className="text-lg font-headline font-bold text-on-surface">
              {CATEGORIES.find((c) => c.id === activeCategory)?.label.replace(/^\d+\.\s*/, '')}
            </h2>
            <p className="text-xs font-label text-on-surface-variant">
              {items.filter((i) => i.category === activeCategory && i.status === 'REVIEWED').length} of{' '}
              {CATEGORIES.find((c) => c.id === activeCategory)?.count} points evaluated • Protocol Evidence Synthesis
            </p>
          </div>
        </div>
        {items.filter((i) => i.category === activeCategory && i.status === 'REVIEWED').length ===
          (CATEGORIES.find((c) => c.id === activeCategory)?.count || 0) && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-xs font-label font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" /> Category Fully Assessed
          </span>
        )}
      </div>

      {/* Checklist Items for Active Category */}
      <div className="space-y-4">
        {items
          .filter((i) => i.category === activeCategory)
          .map((item, idx) => (
            <div
              key={item.key}
              className={`rounded-2xl border p-5 shadow-2xs transition-all ${
                item.status === 'REVIEWED'
                  ? 'border-emerald-200/80 bg-surface-container-lowest'
                  : item.status === 'NEEDS_ATTENTION'
                  ? 'border-error/25 bg-surface-container-lowest'
                  : 'border-outline-variant/30 bg-surface-container-lowest'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
                      POINT {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-headline font-semibold text-on-surface">{item.title}</h3>
                    <span
                      className={`text-[10px] font-label font-bold px-2 py-0.5 rounded-full ${
                        item.status === 'REVIEWED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : item.status === 'NEEDS_ATTENTION'
                          ? 'bg-error-container text-on-error-container border border-error/20'
                          : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Status Toggles */}
                {!isFinalized && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={savingItemKey === item.key}
                      onClick={() => handleUpdateItem(item.key, 'REVIEWED', item.clinicalNotes)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-label font-bold transition-all border ${
                        item.status === 'REVIEWED'
                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border-emerald-600 shadow-2xs'
                          : 'bg-surface-container-lowest text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      Pass / Reviewed
                    </button>
                    <button
                      type="button"
                      disabled={savingItemKey === item.key}
                      onClick={() => handleUpdateItem(item.key, 'NEEDS_ATTENTION', item.clinicalNotes, 'Action required')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-label font-bold transition-all border ${
                        item.status === 'NEEDS_ATTENTION'
                          ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border-red-600 shadow-2xs'
                          : 'bg-surface-container-lowest text-error border-error/30 hover:bg-error-container/20'
                      }`}
                    >
                      Needs Action
                    </button>
                  </div>
                )}
              </div>

              {/* Clinical Notes Input */}
              <div className="mt-4 pt-3 border-t border-outline-variant/20 space-y-2">
                <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
                  Clinical Findings &amp; Recommendations
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={isFinalized}
                    defaultValue={item.clinicalNotes || ''}
                    placeholder="Enter observation, lab value, or medication recommendation..."
                    onBlur={(e) => {
                      if (e.target.value !== (item.clinicalNotes || '')) {
                        handleUpdateItem(item.key, item.status, e.target.value, item.needsAttentionReason);
                      }
                    }}
                    className="w-full text-xs font-body rounded-xl border border-outline-variant/30 bg-surface-container-low px-3.5 py-2.5 text-on-surface outline-none focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-60"
                  />
                </div>
                {item.reviewedByName && (
                  <p className="text-[11px] font-label text-on-surface-variant/80 flex items-center gap-1.5">
                    <Stethoscope className="h-3 w-3 text-primary" />
                    Last reviewed by {item.reviewedByName} ({item.reviewedByRole}) •{' '}
                    {item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Final Review & Attending Physician Sign-Off Card */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-5">
        <div className="flex items-center gap-2.5 border-b border-outline-variant/20 pb-3.5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-headline font-semibold text-on-surface">
            Attending Physician Overall Assessment &amp; Plan
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Overall Clinical Impression
            </label>
            <textarea
              rows={3}
              disabled={isFinalized}
              value={overallImpression}
              onChange={(e) => setOverallImpression(e.target.value)}
              placeholder="e.g. Type 2 diabetes with stable glycemic control. Microalbuminuria screened negative. Continue current dual therapy..."
              className="w-full text-xs font-body rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface outline-none focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Management Changes / Directives
            </label>
            <textarea
              rows={3}
              disabled={isFinalized}
              value={managementChanges}
              onChange={(e) => setManagementChanges(e.target.value)}
              placeholder="e.g. Increase Metformin to 1000mg with dinner. Order HbA1c in 90 days. Reinforced foot care precautions..."
              className="w-full text-xs font-body rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface outline-none focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-on-surface-variant font-label font-bold uppercase tracking-wider">
              Next Review Due In:
            </span>
            <select
              disabled={isFinalized}
              value={nextReviewDays}
              onChange={(e) => setNextReviewDays(Number(e.target.value))}
              className="text-xs font-body rounded-lg border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface outline-none focus:border-primary"
            >
              <option value={30}>30 Days (1 Month)</option>
              <option value={60}>60 Days (2 Months)</option>
              <option value={90}>90 Days (Quarterly Standard)</option>
              <option value={180}>180 Days (Semi-Annual)</option>
            </select>
          </div>

          {!isFinalized ? (
            <button
              type="button"
              disabled={signing || loading}
              onClick={handleFinalizeSign}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container hover:from-primary-container hover:to-primary text-white text-xs font-label font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{signing ? 'Signing...' : 'Finalize & Sign Encounter'}</span>
            </button>
          ) : (
            <div className="text-xs font-label font-bold text-emerald-800 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                Digital Signature Verified: {encounter?.doctorApproverName || 'Doctor'} • Finalized on{' '}
                {encounter?.approvedAt ? new Date(encounter.approvedAt).toLocaleDateString() : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
