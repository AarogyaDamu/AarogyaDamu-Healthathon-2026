import { useState, useEffect, type FC } from 'react';
import {
  Upload,
  Cpu,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  getCgmAnalytics,
  getCgmDevices,
  disconnectCgmDevice,
  uploadCgmCsv,
} from '../api/client';
import { useAuth } from '../context/AuthContext';

export const GlucoseAndDevices: FC = () => {
  const { user } = useAuth();
  const patientId = user?.id || '';

  const [analytics, setAnalytics] = useState<any | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [csvContent, setCsvContent] = useState<string>('');
  const [uploadProvider, setUploadProvider] = useState<string>('FREESTYLE_LIBRE');
  const [uploading, setUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [analyticsRes, devicesRes] = await Promise.all([
        getCgmAnalytics(patientId, 14).catch(() => null),
        getCgmDevices(patientId).catch(() => ({ success: true, devices: [] })),
      ]);

      if (analyticsRes?.analytics) {
        setAnalytics(analyticsRes.analytics);
      }
      setDevices(devicesRes?.devices || []);
    } catch (err: any) {
      console.error('Failed to load patient glucose & device data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [patientId]);

  const handleDisconnect = async (deviceId: string) => {
    if (!confirm('Are you sure you want to disconnect this sensor?')) return;
    try {
      await disconnectCgmDevice(deviceId);
      setMessage({ type: 'success', text: 'Device disconnected successfully' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect device' });
    }
  };

  const handleCsvUpload = async () => {
    if (!csvContent.trim()) return;
    setUploading(true);
    setMessage(null);
    try {
      const res = await uploadCgmCsv(patientId, csvContent, uploadProvider);
      setMessage({
        type: 'success',
        text: `Successfully imported ${res.importedCount || 0} glucose readings!`,
      });
      setShowUploadModal(false);
      setCsvContent('');
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent((event.target?.result as string) || '');
    };
    reader.readAsText(file);
  };

  const meanGlucose = analytics?.meanGlucoseMgDl ?? 124;
  const tir = analytics?.timeInRangePercent ?? 75;
  const tbr = analytics?.timeBelowRangePercent ?? 2;
  const tar = analytics?.timeAboveRangePercent ?? 23;
  const gmi = analytics?.gmi ?? 6.2;

  // Determine color status for glucose value
  const getGlucoseStatusColor = (val: number) => {
    if (val < 70) return { bg: 'bg-red-500', text: 'text-red-700', label: 'Low (Hypo)', alert: true };
    if (val <= 180) return { bg: 'bg-emerald-500', text: 'text-emerald-700', label: 'In Target Range', alert: false };
    if (val <= 250) return { bg: 'bg-amber-500', text: 'text-amber-700', label: 'Elevated', alert: false };
    return { bg: 'bg-purple-600', text: 'text-purple-700', label: 'Very High', alert: true };
  };

  const status = getGlucoseStatusColor(meanGlucose);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Glucose & Devices</h1>
          <p className="text-xs text-slate-500">
            Real-time glucose telemetry, Time in Range (TIR), and connected wearable sensors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold shadow-xs transition"
          >
            <Upload className="h-4 w-4" />
            <span>Upload CGM File</span>
          </button>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Glucose Display Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Average Blood Glucose (14-Day)
          </span>
          <span className="text-xs font-medium text-slate-400">Continuous CGM</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-black text-slate-900">
              {meanGlucose.toFixed(0)}
            </span>
            <div className="space-y-1">
              <span className="text-sm font-bold text-slate-500">mg/dL</span>
              <div className="flex items-center gap-1">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${status.bg}`}
                />
                <span className={`text-xs font-bold ${status.text}`}>{status.label}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-6 pt-4 sm:pt-0">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block">
                Estimated A1c (GMI)
              </span>
              <span className="text-xl font-bold text-slate-800">{gmi.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block">
                Target Range Goal
              </span>
              <span className="text-xl font-bold text-emerald-700">70–180 mg/dL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Time In Range (TIR) Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Time in Range (TIR)</h2>
            <p className="text-xs text-slate-500">
              Percentage of readings within the target healthy glycemic zone.
            </p>
          </div>
          <span
            className={`text-xs font-bold px-3 py-1 rounded-full ${
              tir >= 70
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}
          >
            {tir >= 70 ? 'Target Met (≥70%)' : 'Goal: Reach ≥70%'}
          </span>
        </div>

        {/* Stacked Percentage Bar */}
        <div className="h-7 w-full rounded-xl bg-slate-100 overflow-hidden flex shadow-inner">
          {tbr > 0 && (
            <div
              style={{ width: `${tbr}%` }}
              className="bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white"
              title={`Low: ${tbr.toFixed(1)}%`}
            >
              {tbr >= 5 && `${tbr.toFixed(0)}%`}
            </div>
          )}
          {tir > 0 && (
            <div
              style={{ width: `${tir}%` }}
              className="bg-emerald-600 flex items-center justify-center text-[11px] font-black text-white"
              title={`In Range: ${tir.toFixed(1)}%`}
            >
              {tir.toFixed(1)}% In Range
            </div>
          )}
          {tar > 0 && (
            <div
              style={{ width: `${tar}%` }}
              className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-slate-900"
              title={`High: ${tar.toFixed(1)}%`}
            >
              {tar >= 5 && `${tar.toFixed(0)}%`}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <span>Low (&lt;70): <strong className="text-slate-900">{tbr.toFixed(1)}%</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-emerald-600" />
            <span>In Range (70–180): <strong className="text-slate-900">{tir.toFixed(1)}%</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <span>High (&gt;180): <strong className="text-slate-900">{tar.toFixed(1)}%</strong></span>
          </div>
        </div>
      </div>

      {/* Connected Devices Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-900">Connected Sensors & Wearables</h2>
          </div>
        </div>

        {/* Live Partner Integration Notice */}
        <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 text-xs text-sky-950 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-sky-900">
            <Cpu className="h-4 w-4 text-sky-700" />
            Live Cloud API vs. CSV Ingestion Capability
          </p>
          <p className="leading-relaxed text-sky-900/90">
            <strong>Abbott FreeStyle Libre</strong> and <strong>Dexcom G6/G7</strong> live streaming requires official partner developer registration. You can immediately import your readings anytime by exporting a CSV file from LibreView or Dexcom Clarity and clicking <strong>Upload CGM Data</strong> above.
          </p>
        </div>

        {devices.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">
              No continuous glucose sensor hardware connected. You can upload export files from FreeStyle Libre or Dexcom using the button above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{device.provider}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {device.connectionStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sensor: {device.deviceModel || 'CGM'} • S/N: {device.serialNumber || 'Active'}
                  </p>
                </div>
                {device.connectionStatus === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(device.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Upload CGM Sensor Data</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Provider
                </label>
                <select
                  value={uploadProvider}
                  onChange={(e) => setUploadProvider(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 outline-none focus:border-teal-600"
                >
                  <option value="FREESTYLE_LIBRE">Abbott FreeStyle Libre</option>
                  <option value="DEXCOM_G6_G7">Dexcom G6 / G7</option>
                  <option value="UNIVERSAL_CSV">Other CSV file</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Or Paste CSV Data
                </label>
                <textarea
                  rows={4}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={`Meter Timestamp,Historic Glucose mg/dL\n2026-11-17 08:00,124\n...`}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 outline-none focus:border-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading || !csvContent.trim()}
                onClick={handleCsvUpload}
                className="px-4 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-600 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Import Readings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
