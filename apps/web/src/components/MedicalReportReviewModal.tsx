import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ShieldCheck,
  X,
  Activity,
  Check,
  Stethoscope,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import MedicalReportSourcePreview from './MedicalReportSourcePreview';
import { apiFetch } from '../api/client';

function formatOcrErrorForDisplay(rawError?: string | null): string | null {
  if (!rawError) return null;
  if (/Invalid `prisma\.|ConnectorError|PostgresError|PrismaClient/i.test(rawError)) {
    return 'Previous OCR extraction hit a document encoding error. Click "Retry OCR Extraction" below to reprocess this file.';
  }
  return rawError;
}

export interface ReviewableMedicalReport {
  id: string;
  title: string;
  category: string;
  reportDate?: string;
  issuingFacility?: string | null;
  mimeType?: string | null;
  processingStatus: string;
  ocrStatus?: string;
  doctorReviewStatus?: string;
  hasOriginalFile?: boolean;
  extractedData?: {
    provider?: string;
    engine?: string;
    status?: string;
    text?: string;
    rawOcrText?: string;
    error?: string;
    plainSummary?: string;
    doctorAdvice?: string[];
    isSynthetic?: boolean;
    doctorReviewStatus?: string;
    doctorNotes?: string | null;
    reviewedBy?: string | null;
    reviewedByName?: string | null;
    reviewedAt?: string | null;
    structuredLabs?: Record<string, any>;
  } | null;
}

interface MedicalReportReviewModalProps {
  report: ReviewableMedicalReport;
  patientName?: string;
  patientId?: string;
  onClose: () => void;
  onReviewSaved?: (updatedDoc: any) => void;
}

export default function MedicalReportReviewModal({
  report: initialReport,
  patientName,
  patientId,
  onClose,
  onReviewSaved,
}: MedicalReportReviewModalProps) {
  const [report, setReport] = useState<ReviewableMedicalReport>(initialReport);
  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  const [tab, setTab] = useState<'ocr' | 'source' | 'review'>('ocr');
  const extracted = report.extractedData;
  const isOcrFailed = report.processingStatus === 'FAILED' || extracted?.status === 'FAILED';
  const displayOcrError = formatOcrErrorForDisplay(extracted?.error);
  const isSynthetic =
    extracted?.isSynthetic ||
    extracted?.provider?.includes('SYNTHETIC') ||
    (!isOcrFailed && extracted?.engine === 'LOCAL_FALLBACK') ||
    report.category === 'ABHA_IMPORT';

  const currentReviewStatus =
    extracted?.doctorReviewStatus || report.doctorReviewStatus || 'PENDING';

  // Clinical Review Form State
  const [reviewStatus, setReviewStatus] = useState<'REVIEWED' | 'NEEDS_ATTENTION'>(
    currentReviewStatus === 'NEEDS_ATTENTION' ? 'NEEDS_ATTENTION' : 'REVIEWED'
  );
  const [clinicalNotes, setClinicalNotes] = useState(extracted?.doctorNotes || '');
  const [commitToTimeline, setCommitToTimeline] = useState(true);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [retryingOcr, setRetryingOcr] = useState(false);
  const [retryOcrError, setRetryOcrError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleRetryOcr = async () => {
    setRetryOcrError(null);
    setRetryingOcr(true);
    try {
      const headers: Record<string, string> = {};
      if (patientId) headers['X-Target-Patient-Id'] = patientId;
      const res = await apiFetch<{
        success: boolean;
        document?: ReviewableMedicalReport;
      }>('/ocr/process-document', {
        method: 'POST',
        headers,
        body: JSON.stringify({ documentId: report.id }),
      });
      if (res.document) {
        setReport(res.document);
        onReviewSaved?.(res.document);
      }
    } catch (err) {
      setRetryOcrError(
        err instanceof Error ? err.message : 'Unable to reprocess OCR extraction right now.',
      );
    } finally {
      setRetryingOcr(false);
    }
  };

  const handleSaveReview = async () => {
    setReviewError(null);
    setReviewSuccess(null);

    if (reviewStatus === 'REVIEWED' && !clinicalNotes.trim()) {
      setReviewError('Clinical observations and verification notes are required before approving this medical report.');
      return;
    }

    setSubmittingReview(true);

    try {
      const headers: Record<string, string> = {};
      if (patientId) headers['X-Target-Patient-Id'] = patientId;

      const res = await apiFetch<{
        success: boolean;
        message: string;
        document: any;
      }>(`/documents/${encodeURIComponent(report.id)}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reviewStatus,
          clinicalNotes: clinicalNotes.trim() || undefined,
          commitToTimeline,
        }),
      });

      setReviewSuccess(res.message || 'Clinical review saved successfully.');
      if (onReviewSaved) {
        onReviewSaved(res.document);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to record clinical review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const labs = extracted?.structuredLabs;
  const labEntries = labs
    ? Object.entries(labs).filter(
        ([key, val]) =>
          val &&
          typeof val === 'object' &&
          'displayName' in val &&
          'extractedValue' in val &&
          key !== 'additionalFields'
      )
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4 font-body"
      role="dialog"
      aria-modal="true"
      aria-labelledby="medical-report-review-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white bg-surface-container-lowest shadow-2xl border border-outline-variant/30">
        {/* MODAL HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-6 py-4 bg-surface-container-low/70">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-fixed/50 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h2 id="medical-report-review-title" className="truncate text-base font-headline font-semibold text-on-surface">
                Medical Report Clinical Review
              </h2>
            </div>
            <p className="mt-1 truncate text-xs font-body text-on-surface-variant flex items-center gap-2">
              <span className="font-semibold text-on-surface">{report.title}</span>
              {patientName ? <span>• Patient: {patientName}</span> : ''}
              {report.issuingFacility ? <span>• {report.issuingFacility}</span> : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close medical report review"
            className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSynthetic && (
          <div className="flex items-start gap-2.5 border-b border-outline-variant/20 bg-amber-50/70 px-6 py-2.5 text-xs font-body text-amber-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
            <span>
              <strong>Synthetic showcase report.</strong> Simulated clinical data for demonstration. Not connected to live ABDM or real patient records.
            </span>
          </div>
        )}

        {/* STATUS & TABS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 px-6 py-3 bg-surface-container-low/40">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('ocr')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-label font-bold transition-all ${
                tab === 'ocr'
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-2xs'
                  : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Extracted OCR &amp; Labs
            </button>
            <button
              type="button"
              onClick={() => setTab('source')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-label font-bold transition-all ${
                tab === 'source'
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-2xs'
                  : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Original Uploaded File
            </button>
            <button
              type="button"
              onClick={() => setTab('review')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-label font-bold transition-all ${
                tab === 'review'
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-2xs'
                  : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Record Clinical Review
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* OCR Processing Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-label font-bold ${
                report.processingStatus === 'COMPLETED' || extracted?.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : report.processingStatus === 'FAILED' || extracted?.status === 'FAILED'
                  ? 'bg-error-container text-on-error-container border border-error/20'
                  : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              <Activity className="h-3 w-3" />
              OCR: {report.processingStatus.replace(/_/g, ' ')}
            </span>

            {/* Doctor Clinical Review Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-label font-bold ${
                currentReviewStatus === 'REVIEWED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : currentReviewStatus === 'NEEDS_ATTENTION'
                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                  : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
              }`}
            >
              {currentReviewStatus === 'REVIEWED' ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-700" />
              ) : currentReviewStatus === 'NEEDS_ATTENTION' ? (
                <AlertTriangle className="h-3 w-3 text-amber-700" />
              ) : (
                <Clock className="h-3 w-3 text-on-surface-variant" />
              )}
              Doctor: {currentReviewStatus.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="overflow-y-auto p-6">
          {tab === 'ocr' ? (
            <div className="space-y-5">
              {/* ENGINE AND EXTRACTION META */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5">
                <div>
                  <p className="text-[10px] font-label font-bold uppercase tracking-wider text-primary">
                    OCR Extraction Engine
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-headline font-semibold text-on-surface">
                    {isOcrFailed ? (
                      <AlertTriangle className="h-4 w-4 text-error" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    {isOcrFailed
                      ? 'OCR Extraction Unavailable — Retry or Review Source File'
                      : extracted?.engine === 'SARVAM_DOCUMENT_AI'
                      ? 'Sarvam Document AI V1 (Live Parsing)'
                      : 'Local Resilient Fallback Parser (Offline)'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-[11px] font-label text-on-surface-variant">
                    {report.reportDate ? (
                      <div>Report Date: {new Date(report.reportDate).toLocaleDateString('en-IN')}</div>
                    ) : null}
                    {extracted?.structuredLabs ? <div>Extracted Parameters: {labEntries.length} verified</div> : null}
                  </div>
                  {isOcrFailed && report.hasOriginalFile && (
                    <button
                      type="button"
                      onClick={handleRetryOcr}
                      disabled={retryingOcr}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-container px-3.5 py-2 text-xs font-label font-bold text-white shadow-2xs hover:shadow transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${retryingOcr ? 'animate-spin' : ''}`} />
                      <span>{retryingOcr ? 'Reprocessing…' : 'Retry OCR Extraction'}</span>
                    </button>
                  )}
                </div>
              </div>

              {(displayOcrError || retryOcrError) && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-error/20 bg-error-container/60 p-3.5 text-xs font-body text-on-error-container">
                  <div className="flex gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-error mt-0.5" />
                    <span>{retryOcrError || displayOcrError}</span>
                  </div>
                </div>
              )}

              {/* STRUCTURED CLINICAL LABS GRID */}
              {labEntries.length > 0 && (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3.5 shadow-2xs">
                  <h3 className="text-xs font-label font-bold uppercase tracking-wider text-on-surface">
                    Structured Clinical Parameters (Unverified until Doctor Sign-Off)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {labEntries.map(([key, val]: [string, any]) => (
                      <div
                        key={key}
                        className={`p-4 rounded-xl border ${
                          val.isAbnormal
                            ? 'border-error/25 bg-error-container/20'
                            : 'border-outline-variant/30 bg-surface-container-low'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-label font-bold text-on-surface">{val.displayName}</span>
                          {val.isAbnormal ? (
                            <span className="text-[10px] font-label font-bold text-on-error-container bg-error-container px-2 py-0.5 rounded-full border border-error/20">
                              Abnormal
                            </span>
                          ) : (
                            <span className="text-[10px] font-label font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              Normal
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-base font-headline font-bold text-on-surface">
                          {val.extractedValue}
                        </div>
                        {val.referenceRange && (
                          <div className="mt-0.5 text-[10px] font-mono text-on-surface-variant">
                            Reference: {val.referenceRange}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PLAIN LANGUAGE SUMMARY */}
              {extracted?.plainSummary && (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-2xs">
                  <p className="text-[10px] font-label font-bold uppercase tracking-wider text-primary">
                    Plain-Language Summary
                  </p>
                  <p className="mt-2 text-xs font-body leading-relaxed text-on-surface">{extracted.plainSummary}</p>
                </div>
              )}

              {/* DOCTOR GUIDANCE / ADVICE */}
              {extracted?.doctorAdvice?.length ? (
                <div className="rounded-2xl border border-primary/20 bg-primary-fixed/20 p-5 shadow-2xs">
                  <p className="text-[10px] font-label font-bold uppercase tracking-wider text-primary">
                    Clinical Review Guidance
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs font-body text-on-surface">
                    {extracted.doctorAdvice.map((advice) => (
                      <li key={advice} className="flex items-start gap-2">
                        <span className="text-primary font-bold">•</span>
                        <span>{advice}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* RAW RECOGNIZED OCR TEXT */}
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 space-y-3">
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-on-surface-variant">
                  Recognized OCR Text
                </p>
                <pre className="max-h-[30vh] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-on-surface bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                  {extracted?.text || extracted?.rawOcrText || 'No OCR text is available yet.'}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                <p className="text-[11px] font-body text-on-surface-variant">
                  OCR output is an automated transcription aid. Compare with source file before clinical reliance.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('review')}
                  className="rounded-xl bg-gradient-to-r from-primary to-primary-container px-4 py-2 text-xs font-label font-bold text-white shadow-2xs hover:shadow transition-all flex items-center gap-1.5"
                >
                  <span>Proceed to Sign-Off &amp; Review</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : tab === 'source' ? (
            <MedicalReportSourcePreview
              documentId={report.id}
              title={report.title}
              mimeType={report.mimeType}
              patientId={patientId}
              patientName={patientName}
              report={report}
            />
          ) : (
            /* CLINICAL REVIEW FORM TAB */
            <div className="space-y-5 max-w-2xl mx-auto py-2">
              <div className="rounded-2xl border border-primary/20 bg-primary-fixed/20 p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-on-surface font-headline font-semibold text-sm">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Treating Physician Clinical Sign-Off
                </div>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                  Record your medical evaluation of this report. Unverified OCR results are never automatically converted to confirmed patient observations without explicit clinician verification.
                </p>
              </div>

              {reviewSuccess && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-label font-bold text-emerald-900">
                  <Check className="h-4 w-4 text-emerald-600" />
                  {reviewSuccess}
                </div>
              )}

              {reviewError && (
                <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-container/60 p-3.5 text-xs font-body text-on-error-container">
                  <AlertTriangle className="h-4 w-4 text-error" />
                  {reviewError}
                </div>
              )}

              {/* REVIEW STATUS SELECTION */}
              <div>
                <label className="block text-xs font-label font-bold text-on-surface uppercase tracking-wider mb-2">
                  Clinical Review Decision
                </label>
                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => setReviewStatus('REVIEWED')}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      reviewStatus === 'REVIEWED'
                        ? 'border-primary bg-primary-fixed/30 text-on-surface ring-1 ring-primary'
                        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <CheckCircle2
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        reviewStatus === 'REVIEWED' ? 'text-primary' : 'text-on-surface-variant'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-label font-bold text-on-surface">Reviewed &amp; Verified</div>
                      <div className="text-[11px] font-body text-on-surface-variant mt-0.5">
                        Report verified against patient record and confirmed by doctor.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewStatus('NEEDS_ATTENTION')}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      reviewStatus === 'NEEDS_ATTENTION'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-1 ring-amber-500'
                        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <AlertTriangle
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        reviewStatus === 'NEEDS_ATTENTION' ? 'text-amber-700' : 'text-on-surface-variant'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-label font-bold text-on-surface">Needs Attention / Discrepancy</div>
                      <div className="text-[11px] font-body text-on-surface-variant mt-0.5">
                        Abnormal readings, quality issue, or re-test required.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* CLINICAL NOTES */}
              <div>
                <label htmlFor="doctor-review-notes" className="block text-xs font-label font-bold text-on-surface uppercase tracking-wider mb-1.5">
                  Doctor Clinical Observations &amp; Action Plan
                </label>
                <textarea
                  id="doctor-review-notes"
                  rows={4}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="e.g. HbA1c 7.2% verified against lab slip. Fasting glucose moderately elevated. Titrate Metformin dosage and schedule 3-month glycemic follow-up."
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low p-3.5 text-xs font-body text-on-surface focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              {/* OPTIONAL TIMELINE INGESTION */}
              {reviewStatus === 'REVIEWED' && labEntries.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low">
                  <input
                    type="checkbox"
                    id="commit-to-timeline"
                    checked={commitToTimeline}
                    onChange={(e) => setCommitToTimeline(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                  />
                  <label htmlFor="commit-to-timeline" className="text-xs font-body text-on-surface cursor-pointer">
                    <span className="font-semibold text-on-surface block">
                      Commit verified lab values to patient clinical timeline
                    </span>
                    <span className="block text-[11px] text-on-surface-variant mt-0.5">
                      Ingests HbA1c and glucose parameters as authenticated clinical observations with certified lab provenance.
                    </span>
                  </label>
                </div>
              )}

              {/* EXISTING REVIEW METADATA */}
              {extracted?.reviewedByName && (
                <div className="text-[11px] font-body text-on-surface-variant bg-surface-container-low p-3 rounded-xl border border-outline-variant/20">
                  Previously reviewed by <span className="font-semibold text-on-surface">{extracted.reviewedByName}</span> on{' '}
                  {new Date(extracted.reviewedAt || Date.now()).toLocaleString('en-IN')}.
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-2 text-xs font-label font-bold text-on-surface hover:bg-surface-container transition-all"
                >
                  Close
                </button>
                {!reviewSuccess ? (
                  <button
                    type="button"
                    onClick={handleSaveReview}
                    disabled={submittingReview}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-container hover:from-primary-container hover:to-primary px-5 py-2.5 text-xs font-label font-bold text-white shadow-xs hover:shadow transition-all disabled:opacity-50"
                  >
                    {submittingReview ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving Review…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Save Clinical Review
                      </>
                    )}
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-label font-bold border border-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Review Saved &amp; Verified
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
