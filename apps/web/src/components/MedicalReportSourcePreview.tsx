import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { apiFetchBlob } from '../api/client';

interface MedicalReportSourcePreviewProps {
  documentId: string;
  title: string;
  mimeType?: string | null;
}

export default function MedicalReportSourcePreview({ documentId, title, mimeType }: MedicalReportSourcePreviewProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSourceUrl(null);

    void apiFetchBlob(`/documents/${encodeURIComponent(documentId)}/preview`)
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
  }, [documentId]);

  const isImage = mimeType?.startsWith('image/') || mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
  const isPdf = mimeType === 'application/pdf';

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-teal-700" /> Loading the private original…
      </div>
    );
  }

  if (error || !sourceUrl) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-700" />
        <p className="mt-2 text-sm font-bold text-amber-950">Original file preview unavailable</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-amber-900">{error || 'This record was imported from the synthetic ABHA sandbox and has no source file.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          {isImage ? <FileImage className="h-4 w-4 text-teal-700" /> : <FileText className="h-4 w-4 text-teal-700" />}
          <span className="truncate">{title}</span>
        </div>
        <a href={sourceUrl} download={title} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <Download className="h-3.5 w-3.5" /> Download original
        </a>
      </div>
      {isImage ? (
        <img src={sourceUrl} alt={`Original uploaded report: ${title}`} className="max-h-[60vh] w-full rounded-xl border border-slate-200 bg-slate-100 object-contain" />
      ) : isPdf ? (
        <iframe src={sourceUrl} title={`Original uploaded PDF: ${title}`} className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white" />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-600">Download the original file to view it.</div>
      )}
    </div>
  );
}
