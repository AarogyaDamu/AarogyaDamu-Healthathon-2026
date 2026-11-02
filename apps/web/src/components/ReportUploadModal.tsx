import React, { useState } from 'react';
import { apiFetch } from '../api/client';
import { Upload, X, AlertCircle } from 'lucide-react';

interface ReportUploadModalProps {
  onClose: () => void;
  onUploaded: () => void;
}

export function ReportUploadModal({ onClose, onUploaded }: ReportUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('LAB_REPORT');
  const [facility, setFacility] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a report title.');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      // Submit metadata with genuine processing state flag
      await apiFetch('/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          category,
          issuingFacility: facility.trim() || undefined,
          reportDate: new Date().toISOString(),
          processingStatus: file ? 'READY' : 'NEEDS_REVIEW',
        }),
      });

      onUploaded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Report upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Upload Clinical Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Document (PDF / Image)</label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFile(e.target.files[0]);
                  if (!title) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-teal-50 file:text-teal-800 file:font-semibold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Report Title</label>
            <input
              type="text"
              required
              placeholder="e.g. 3-Month HbA1c Lab Report"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-slate-300 p-2 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-slate-300 p-2 focus:border-teal-700 focus:outline-none bg-white"
              >
                <option value="LAB_REPORT">Lab Blood Test</option>
                <option value="PRESCRIPTION">Prescription Slip</option>
                <option value="DISCHARGE_SUMMARY">Hospital Summary</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Facility Name</label>
              <input
                type="text"
                placeholder="e.g. Metropolis Lab"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full rounded border border-slate-300 p-2 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Uploading...' : 'Save Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}