import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileImage, FileText, Loader2, CheckCircle2, ShieldCheck, Eye } from 'lucide-react';
import { apiFetchBlob } from '../api/client';
import type { ReviewableMedicalReport } from './MedicalReportReviewModal';

interface MedicalReportSourcePreviewProps {
  documentId: string;
  title: string;
  mimeType?: string | null;
  patientId?: string;
  patientName?: string;
  report?: ReviewableMedicalReport;
}

export default function MedicalReportSourcePreview({
  documentId,
  title,
  mimeType,
  patientId,
  patientName,
  report,
}: MedicalReportSourcePreviewProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawEmbed, setShowRawEmbed] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSourceUrl(null);

    const headers: Record<string, string> = {};
    if (patientId) headers['X-Target-Patient-Id'] = patientId;

    void apiFetchBlob(`/documents/${encodeURIComponent(documentId)}/preview`, { headers })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSourceUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'The original file could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, patientId]);

  const isImage =
    mimeType?.startsWith('image/') ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp';
  const isPdf = !isImage && (mimeType === 'application/pdf' || !mimeType || mimeType === 'application/octet-stream');

  const labs = report?.extractedData?.structuredLabs;
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

  const facility = report?.issuingFacility || 'Diagnostic Laboratory Record';
  const displayPatientName = patientName || 'Registered Patient';
  const reportDateDisplay = report?.reportDate
    ? new Date(report.reportDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Date unavailable';

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-low text-xs font-label font-bold text-on-surface-variant">
        <Loader2 className="mr-2.5 h-5 w-5 animate-spin text-primary" /> Loading original source file…
      </div>
    );
  }

  if (error || !sourceUrl) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-low p-8 text-center" data-testid="preview-error">
        <AlertTriangle className="h-7 w-7 text-amber-700" />
        <p className="mt-2.5 text-sm font-headline font-semibold text-on-surface">Original file preview unavailable</p>
        <p className="mt-1 max-w-md text-xs font-body leading-relaxed text-on-surface-variant">
          {error || 'This record was imported from the synthetic ABHA sandbox and has no source file.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      {/* ACTION BAR */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low px-4 py-3">
        <div className="flex items-center gap-2.5 text-xs font-label font-bold text-on-surface">
          {isImage ? <FileImage className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
          <span className="truncate">{title}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
            <ShieldCheck className="h-3 w-3 text-emerald-600" /> Verified Diagnostic Source
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPdf && labEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRawEmbed(!showRawEmbed)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5 text-xs font-label font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
            >
              <Eye className="h-3.5 w-3.5" /> {showRawEmbed ? 'Show Extracted Table' : 'View Original PDF'}
            </button>
          )}
          <a
            href={sourceUrl}
            download={title.endsWith('.pdf') ? title : `${title}.pdf`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5 text-xs font-label font-bold text-on-surface hover:bg-surface-container transition-all"
          >
            <Download className="h-3.5 w-3.5" /> Download original
          </a>
        </div>
      </header>

      {/* MAIN DOCUMENT VIEW */}
      {isImage ? (
        <img
          src={sourceUrl}
          alt={`Original uploaded report: ${title}`}
          className="max-h-[60vh] w-full rounded-2xl border border-outline-variant/30 bg-surface-container-low object-contain p-2"
        />
      ) : showRawEmbed || labEntries.length === 0 ? (
        <iframe
          src={sourceUrl}
          title={`Original uploaded PDF: ${title}`}
          className="h-[60vh] w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest"
        />
      ) : (
        /* EXTRACTED CLINICAL LAB SUMMARY VIEW (FROM VERIFIED OCR PAYLOAD ONLY) */
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-sm text-slate-800 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-sm font-headline font-bold text-primary tracking-tight">
                {facility}
              </h3>
              <p className="text-[11px] text-slate-500">
                Patient: <span className="font-semibold text-slate-700">{displayPatientName}</span>
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div>Report Date: <span className="font-semibold text-slate-700">{reportDateDisplay}</span></div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Investigation / Test Parameter</th>
                  <th className="py-2.5 px-3">Observed Value</th>
                  <th className="py-2.5 px-3">Reference Range</th>
                  <th className="py-2.5 px-3 text-right">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labEntries.map(([key, val]: [string, any]) => (
                  <tr key={key} className={val.isAbnormal ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'}>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{val.displayName}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{val.extractedValue}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{val.referenceRange || 'Not specified'}</td>
                    <td className="py-2.5 px-3 text-right">
                      {val.isAbnormal ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          Out of range
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Within range
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
            <span>Rendered strictly from OCR structured fields extracted for this document.</span>
            <span className="font-mono text-[10px] text-primary flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Compare with Original PDF
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
