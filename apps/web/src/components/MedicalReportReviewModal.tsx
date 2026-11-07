import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck, X } from 'lucide-react';
import MedicalReportSourcePreview from './MedicalReportSourcePreview';

export interface ReviewableMedicalReport {
  id: string;
  title: string;
  category: string;
  reportDate?: string;
  issuingFacility?: string | null;
  mimeType?: string | null;
  processingStatus: string;
  extractedData?: {
    provider?: string;
    status?: string;
    text?: string;
    error?: string;
    plainSummary?: string;
    doctorAdvice?: string[];
    isSynthetic?: boolean;
  } | null;
}

interface MedicalReportReviewModalProps {
  report: ReviewableMedicalReport;
  patientName?: string;
  onClose: () => void;
}

export default function MedicalReportReviewModal({ report, patientName, onClose }: MedicalReportReviewModalProps) {
  const [tab, setTab] = useState<'ocr' | 'source'>('ocr');
  const extracted = report.extractedData;
  const isSynthetic = extracted?.isSynthetic || extracted?.provider?.includes('SYNTHETIC') || report.category === 'ABHA_IMPORT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="medical-report-review-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-teal-700" />
              <h2 id="medical-report-review-title" className="truncate text-base font-bold text-slate-950">Review medical report</h2>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{report.title}{patientName ? ` · ${patientName}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close medical report review" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSynthetic && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span><strong>Synthetic showcase record.</strong> This OCR/import result is local demo data and is not connected to ABDM or a real patient.</span>
          </div>
        )}

        <div className="flex gap-2 border-b border-slate-200 px-5 py-3">
          <button type="button" onClick={() => setTab('ocr')} className={`rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 ${tab === 'ocr' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>OCR review</button>
          <button type="button" onClick={() => setTab('source')} className={`rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 ${tab === 'source' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Original file</button>
        </div>

        <div className="overflow-y-auto p-5">
          {tab === 'ocr' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-800">Extraction status</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {report.processingStatus.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right text-[11px] text-slate-600"><div>{extracted?.provider || 'OCR provider pending'}</div>{report.reportDate ? <div>{new Date(report.reportDate).toLocaleDateString('en-IN')}</div> : null}</div>
              </div>
              {extracted?.error ? <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><AlertTriangle className="h-4 w-4 shrink-0" />{extracted.error}</div> : null}
              {extracted?.plainSummary ? <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Plain-language summary</p><p className="mt-2 text-sm leading-relaxed text-slate-800">{extracted.plainSummary}</p></div> : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Recognized text</p>
                <pre className="mt-3 max-h-[45vh] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{extracted?.text || 'No OCR text is available yet.'}</pre>
              </div>
              {extracted?.doctorAdvice?.length ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-800">Review notes</p><ul className="mt-2 space-y-1 text-xs text-indigo-950">{extracted.doctorAdvice.map((advice) => <li key={advice}>• {advice}</li>)}</ul></div> : null}
              <p className="text-[11px] leading-relaxed text-slate-500">Always compare the extracted text with the original file before relying on it. OCR is a reading aid, not a diagnosis.</p>
            </div>
          ) : (
            <MedicalReportSourcePreview documentId={report.id} title={report.title} mimeType={report.mimeType} />
          )}
        </div>
      </div>
    </div>
  );
}
