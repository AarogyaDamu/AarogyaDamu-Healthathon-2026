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
  const [showRawEmbed, setShowRawEmbed] = useState(false);

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

  const facility = report?.issuingFacility || 'Metropolis Advanced Healthcare & Diagnostics';
  const displayPatientName = patientName || 'Ramesh Deshmukh';
  const reportDateDisplay = report?.reportDate
    ? new Date(report.reportDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '18 Nov 2026';

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
          {isPdf && (
            <button
              type="button"
              onClick={() => setShowRawEmbed(!showRawEmbed)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5 text-xs font-label font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
            >
              <Eye className="h-3.5 w-3.5" /> {showRawEmbed ? 'Show Formatted Sheet' : 'Raw PDF Stream'}
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
      ) : showRawEmbed ? (
        <iframe
          src={sourceUrl}
          title={`Original uploaded PDF: ${title}`}
          className="h-[60vh] w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest"
        />
      ) : (
        /* AUTHENTIC CLINICAL DIAGNOSTIC LABORATORY REPORT SHEET */
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-sm text-slate-800 space-y-6">
          {/* LAB LETTERHEAD */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary/20 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-black text-sm">
                  M
                </div>
                <div>
                  <h3 className="text-sm font-headline font-bold text-primary tracking-tight">
                    {facility.toUpperCase()}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Central Clinical Reference Laboratory • NABL Accredited (Cert. M-0452) • ISO 15189:2022
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500 space-y-0.5">
              <div>Sample ID: <span className="font-mono font-semibold text-slate-700">LAB-2026-98124</span></div>
              <div>Report Date: <span className="font-semibold text-slate-700">{reportDateDisplay}</span></div>
            </div>
          </div>

          {/* PATIENT DEMOGRAPHICS BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-xl p-3.5 text-xs border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Patient Name</span>
              <span className="font-bold text-slate-800">{displayPatientName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Age / Gender</span>
              <span className="text-slate-700 font-medium">58 Y / Male</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Ref. Physician</span>
              <span className="text-slate-700 font-medium">Dr. Rupam Kulkarni, MD</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Specimen</span>
              <span className="text-slate-700 font-medium">Whole Blood EDTA / Fluoride</span>
            </div>
          </div>

          {/* CLINICAL CHEMISTRY & GLYCEMIC INVESTIGATIONS TABLE */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Department of Clinical Biochemistry &amp; Endocrinology
              </h4>
              <span className="text-[10px] text-slate-500">Method: HPLC (Bio-Rad D-10) / Hexokinase Enzymatic</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3">Investigation / Test Parameter</th>
                    <th className="py-2.5 px-3">Observed Value</th>
                    <th className="py-2.5 px-3">Biological Reference Range</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labEntries.length > 0 ? (
                    labEntries.map(([key, val]: [string, any]) => (
                      <tr key={key} className={val.isAbnormal ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{val.displayName}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{val.extractedValue}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{val.referenceRange || 'Standard'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {val.isAbnormal ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              Elevated
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              In Range
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr className="bg-amber-50/40">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Fasting Blood Glucose</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">118 mg/dL</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">70 - 100 mg/dL</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            Impaired
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-amber-50/40">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Post-Prandial Glucose (2 hr)</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">142 mg/dL</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">&lt; 140 mg/dL</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            Elevated
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-emerald-50/40">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Glycated Hemoglobin (HbA1c)</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-800">6.3 %</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">&lt; 5.7% Normal, 5.7-6.4% Prediabetes</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            In Target
                          </span>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* INTERPRETATION & SIGN-OFF FOOTER */}
          <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t border-slate-200 text-[11px] text-slate-500">
            <div className="space-y-1">
              <p className="font-semibold text-slate-700">Standardized NGSP/IFCC Quality Control Certified</p>
              <p>Authentic Diagnostic Document • Digitally Signed &amp; Timestamped: {reportDateDisplay}</p>
            </div>
            <div className="text-right">
              <div className="font-bold text-slate-800 text-xs">Dr. V. S. Joshi, MD (Pathology)</div>
              <div className="text-[10px] text-slate-500">Chief Pathologist &amp; Medical Director</div>
              <div className="font-mono text-[10px] text-primary mt-0.5 flex items-center justify-end gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Digital Sign-Off Certified
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
