import { useState, useEffect, type FC } from 'react';
import {
  Activity,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  BarChart2,
  X,
  Radio,
} from 'lucide-react';
import {
  getCgmAnalytics,
  getCgmDevices,
  disconnectCgmDevice,
  uploadCgmCsv,
  getCgmAgpReport,
} from '../api/client';

interface Props {
  patientId: string;
  patientName: string;
}

export const DoctorGlucoseMonitoring: FC<Props> = ({ patientId, patientName }) => {
  const [days, setDays] = useState<number>(14);
  const [loading, setLoading] = useState<boolean>(true);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [agpData, setAgpData] = useState<any | null>(null);
  const [showAgpModal, setShowAgpModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [csvContent, setCsvContent] = useState<string>('');
  const [uploadProvider, setUploadProvider] = useState<string>('FREESTYLE_LIBRE');
  const [uploading, setUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [analyticsRes, devicesRes, agpRes] = await Promise.all([
        getCgmAnalytics(patientId, days, false).catch(() => null),
        getCgmDevices(patientId).catch(() => ({ success: true, devices: [] })),
        getCgmAgpReport(patientId, days).catch(() => null),
      ]);

      if (analyticsRes?.analytics) {
        setAnalytics(analyticsRes.analytics);
      } else {
        setAnalytics(null);
      }

      setDevices(devicesRes?.devices || []);
      setAgpData(agpRes?.report || null);
    } catch (err: any) {
      console.error('Error fetching CGM data:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to load CGM data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [patientId, days]);

  const handleDisconnect = async (deviceId: string) => {
    if (!confirm('Are you sure you want to disconnect this CGM device?')) return;
    try {
      await disconnectCgmDevice(deviceId);
      setMessage({ type: 'success', text: 'Device connection revoked successfully' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect device' });
    }
  };

  const handleCsvUpload = async () => {
    if (!csvContent.trim()) {
      setMessage({ type: 'error', text: 'Please enter or paste CSV content' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const res = await uploadCgmCsv(patientId, csvContent, uploadProvider);
      setMessage({
        type: 'success',
        text: `Successfully imported ${res.importedCount || 0} glucose readings (${res.skippedDuplicates || 0} duplicates skipped)`,
      });
      setShowUploadModal(false);
      setCsvContent('');
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'CSV upload failed' });
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

  const tir = analytics?.timeInRangePercent ?? 0;
  const tbr = analytics?.timeBelowRangePercent ?? 0;
  const tar = analytics?.timeAboveRangePercent ?? 0;
  const veryLow = analytics?.timeVeryLowPercent ?? 0;
  const veryHigh = analytics?.timeVeryHighPercent ?? 0;
  const gmi = analytics?.gmi ?? null;
  const cv = analytics?.glycemicVariabilityCv ?? null;
  const meanGlucose = analytics?.meanGlucoseMgDl ?? null;
  const totalReadings = analytics?.totalReadings ?? 0;
  const activePercent = analytics?.activeTimePercent ?? 0;

  return (
    <div className="space-y-6 font-body">
      {/* Top Controls Bar */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-primary-fixed/50 border border-primary/20 flex items-center justify-center text-primary font-bold">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-headline font-semibold text-on-surface">
                Glucose Monitor Data <span className="sr-only">CGM &amp; Continuous Glucose Telemetry</span>
              </h2>
              <span className="text-[10px] font-label font-bold px-2.5 py-0.5 rounded-full bg-surface-container text-tertiary border border-outline-variant/30">
                ATTD &bull; ADA 2024
              </span>
            </div>
            <p className="text-xs font-body text-on-surface-variant mt-0.5">
              International Consensus on Time-in-Range (TIR) &bull; Ambulatory Glucose Profile for{' '}
              <strong className="text-on-surface font-semibold">{patientName}</strong>
            </p>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Timeframe Selectors */}
          <div className="flex items-center bg-surface-container p-1 rounded-xl border border-outline-variant/30 text-xs font-label font-semibold">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  days === d
                    ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-2xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* AGP Report Button */}
          <button
            type="button"
            onClick={() => setShowAgpModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container text-primary hover:bg-surface-container-high border border-outline-variant/30 text-xs font-label font-bold transition-all"
          >
            <BarChart2 className="h-4 w-4" />
            <span>AGP Report</span>
          </button>

          {/* Upload CSV */}
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-container hover:from-primary-container hover:to-primary text-white text-xs font-label font-bold shadow-xs hover:shadow transition-all"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Glucose Monitor Data</span>
            <span className="sr-only">Upload CGM CSV</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-all"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

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
            className="text-on-surface-variant hover:text-on-surface p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
          <RefreshCw className="h-7 w-7 animate-spin mx-auto text-primary mb-3" />
          <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider">
            Computing glycemic metrics and AGP profile...
          </p>
        </div>
      ) : totalReadings === 0 ? (
        <div className="p-10 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/60 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-surface-container-low mx-auto flex items-center justify-center text-on-surface-variant">
            <Activity className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-headline font-semibold text-on-surface">No CGM Data Ingested Yet</h3>
            <p className="text-xs font-body text-on-surface-variant max-w-md mx-auto mt-1 leading-relaxed">
              Upload CGM readings (FreeStyle Libre, Dexcom, or universal CSV) or connect a hardware sensor to view Time in Range (TIR), GMI, and Ambulatory Glucose Profiles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-white text-xs font-label font-bold shadow-xs hover:shadow transition-all"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Sample / Device CSV</span>
          </button>
        </div>
      ) : (
        <>
          {/* Key Clinical Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* TIR Card */}
            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-2xs space-y-2 relative overflow-hidden">
              <div
                className={`absolute inset-x-0 top-0 h-1 ${
                  tir >= 70 ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                Time in Target Range (TIR)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl lg:text-3xl font-headline font-bold text-on-surface">
                  {tir.toFixed(1)}%
                </span>
                <span
                  className={`text-[10px] font-label font-bold px-2 py-0.5 rounded-full ${
                    tir >= 70
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  {tir >= 70 ? 'Target Achieved (≥70%)' : 'Suboptimal (<70%)'}
                </span>
              </div>
              <p className="text-[11px] font-body text-on-surface-variant">
                Standard Adult Target: 70–180 mg/dL
              </p>
            </div>

            {/* GMI Card */}
            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-2xs space-y-2 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                GMI (Estimated A1c)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl lg:text-3xl font-headline font-bold text-on-surface">
                  {gmi ? `${gmi.toFixed(1)}%` : '--'}
                </span>
                <span className="text-[11px] font-label font-medium text-on-surface-variant">
                  {meanGlucose ? `Mean: ${meanGlucose.toFixed(0)} mg/dL` : ''}
                </span>
              </div>
              <p className="text-[11px] font-body text-on-surface-variant">Glucose Management Indicator</p>
            </div>

            {/* Glycemic Variability (CV) Card */}
            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-2xs space-y-2 relative overflow-hidden">
              <div
                className={`absolute inset-x-0 top-0 h-1 ${
                  cv && cv <= 36 ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              />
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                Glycemic Variability (CV)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl lg:text-3xl font-headline font-bold text-on-surface">
                  {cv ? `${cv.toFixed(1)}%` : '--'}
                </span>
                <span
                  className={`text-[10px] font-label font-bold px-2 py-0.5 rounded-full ${
                    cv && cv <= 36
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-error-container text-on-error-container border border-error/20'
                  }`}
                >
                  {cv && cv <= 36 ? 'Stable (≤36%)' : 'High Fluctuation (>36%)'}
                </span>
              </div>
              <p className="text-[11px] font-body text-on-surface-variant">Target: ≤ 36% for glycemic stability</p>
            </div>

            {/* Active Sensor Time Card */}
            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-2xs space-y-2 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-tertiary" />
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                CGM Sensor Wear Time
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl lg:text-3xl font-headline font-bold text-on-surface">
                  {activePercent.toFixed(0)}%
                </span>
                <span className="text-[11px] font-label font-medium text-on-surface-variant">
                  ({totalReadings.toLocaleString()} readings)
                </span>
              </div>
              <p className="text-[11px] font-body text-on-surface-variant">Valid period: Last {days} days</p>
            </div>
          </div>

          {/* Time in Range Breakdown Bar */}
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-label font-bold text-on-surface uppercase tracking-wider">
                Standard Time in Range Distribution
              </h3>
              <span className="text-xs font-body text-on-surface-variant">
                Consensus Target: &gt;70% in range (70–180), &lt;4% low (&lt;70), &lt;1% very low (&lt;54)
              </span>
            </div>

            {/* Stacked Percentage Bar */}
            <div className="h-9 w-full rounded-xl bg-surface-container-low overflow-hidden flex shadow-inner border border-outline-variant/20">
              {veryLow > 0 && (
                <div
                  style={{ width: `${veryLow}%` }}
                  className="bg-red-700 flex items-center justify-center text-[10px] font-bold text-white transition-all"
                  title={`Very Low (<54 mg/dL): ${veryLow.toFixed(1)}%`}
                >
                  {veryLow >= 4 && `${veryLow.toFixed(0)}%`}
                </div>
              )}
              {tbr > 0 && (
                <div
                  style={{ width: `${tbr}%` }}
                  className="bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white transition-all"
                  title={`Low (54-69 mg/dL): ${tbr.toFixed(1)}%`}
                >
                  {tbr >= 4 && `${tbr.toFixed(0)}%`}
                </div>
              )}
              {tir > 0 && (
                <div
                  style={{ width: `${tir}%` }}
                  className="bg-emerald-600 flex items-center justify-center text-[11px] font-black text-white transition-all"
                  title={`In Range (70-180 mg/dL): ${tir.toFixed(1)}%`}
                >
                  {tir >= 8 && `${tir.toFixed(1)}%`}
                </div>
              )}
              {tar > 0 && (
                <div
                  style={{ width: `${tar}%` }}
                  className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-slate-900 transition-all"
                  title={`High (181-250 mg/dL): ${tar.toFixed(1)}%`}
                >
                  {tar >= 4 && `${tar.toFixed(0)}%`}
                </div>
              )}
              {veryHigh > 0 && (
                <div
                  style={{ width: `${veryHigh}%` }}
                  className="bg-purple-700 flex items-center justify-center text-[10px] font-bold text-white transition-all"
                  title={`Very High (>250 mg/dL): ${veryHigh.toFixed(1)}%`}
                >
                  {veryHigh >= 4 && `${veryHigh.toFixed(0)}%`}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-xs font-label">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-700 shrink-0" />
                <span className="text-on-surface-variant">Very Low (&lt;54):</span>
                <span className="font-bold text-on-surface">{veryLow.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
                <span className="text-on-surface-variant">Low (54–69):</span>
                <span className="font-bold text-on-surface">{tbr.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-on-surface-variant">In Range (70–180):</span>
                <span className="font-bold text-on-surface">{tir.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
                <span className="text-on-surface-variant">High (181–250):</span>
                <span className="font-bold text-on-surface">{tar.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-700 shrink-0" />
                <span className="text-on-surface-variant">Very High (&gt;250):</span>
                <span className="font-bold text-on-surface">{veryHigh.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Connected Devices Section */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-headline font-semibold text-on-surface">
              Connected CGM &amp; Wearable Sensors
            </h3>
          </div>
        </div>

        {/* Live Partner Integration Notice */}
        <div className="p-4 rounded-xl border border-primary/20 bg-primary-fixed/30 text-xs text-on-surface space-y-1.5">
          <p className="font-label font-bold flex items-center gap-2 text-primary">
            <Radio className="h-4 w-4" />
            Continuous Cloud API vs. Direct CSV Ingestion Capability
          </p>
          <p className="leading-relaxed font-body text-on-surface-variant">
            <strong>Abbott FreeStyle Libre</strong> (LibreLinkUp API) and <strong>Dexcom G6/G7</strong> (Dexcom Developer OAuth 2.0) require official manufacturer developer authorization and registered enterprise client credentials for continuous live telemetry.
          </p>
          <p className="text-[11px] font-body text-on-surface-variant">
            <strong className="text-primary font-semibold">Immediate Clinical Ingestion:</strong> Patients and clinics can export standard 14–90 day CSV datasets directly from LibreView or Dexcom Clarity and upload them using the <strong>Upload CGM CSV</strong> action above for full AGP telemetry and TIR analytics.
          </p>
        </div>

        {devices.length === 0 ? (
          <p className="text-xs font-body text-on-surface-variant/80 italic py-2">
            No hardware CGM integrations active for this patient. Readings are currently imported via CSV.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {devices.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-label font-bold text-on-surface">{d.provider}</span>
                    <span
                      className={`text-[10px] font-label font-bold px-2 py-0.5 rounded-full ${
                        d.connectionStatus === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {d.connectionStatus}
                    </span>
                  </div>
                  <p className="text-[11px] font-body text-on-surface-variant mt-1">
                    Model: {d.deviceModel || 'Continuous Sensor'} • S/N: {d.serialNumber || 'N/A'}
                  </p>
                  <p className="text-[10px] font-mono text-on-surface-variant/70 mt-0.5">
                    Connected: {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {d.connectionStatus === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(d.id)}
                    className="text-xs font-label font-bold text-error hover:text-on-error hover:bg-error px-3 py-1.5 rounded-lg border border-error/30 transition-all"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AGP Report Modal */}
      {showAgpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white bg-surface-container-lowest shadow-xl border border-outline-variant/30 p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary-fixed/50 text-primary flex items-center justify-center font-bold">
                  <BarChart2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-headline font-semibold text-on-surface">
                    Ambulatory Glucose Profile (AGP) Report
                  </h3>
                  <p className="text-xs font-body text-on-surface-variant">
                    Patient: {patientName} • Analysis Window: {days} Days
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAgpModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-lg hover:bg-surface-container transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {agpData?.hourlyPercentiles ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-primary-fixed/30 border border-primary/20 rounded-xl text-xs font-body text-on-surface">
                  <span className="font-bold text-primary">AGP Summary:</span> 24-hour modal day profile collapsed across {days} days of data. Displays median (50th percentile) and interquartile range (25th–75th percentiles).
                </div>

                <div className="overflow-x-auto border border-outline-variant/30 rounded-xl">
                  <table className="w-full text-left text-xs font-body border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant font-label font-bold">
                        <th className="py-2.5 px-3.5">Hour (24h)</th>
                        <th className="py-2.5 px-3.5">10th %ile</th>
                        <th className="py-2.5 px-3.5">25th %ile</th>
                        <th className="py-2.5 px-3.5 text-primary font-bold">50th (Median)</th>
                        <th className="py-2.5 px-3.5">75th %ile</th>
                        <th className="py-2.5 px-3.5">90th %ile</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20 bg-surface-container-lowest">
                      {agpData.hourlyPercentiles.map((h: any) => (
                        <tr key={h.hour} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="py-2 px-3.5 font-label font-semibold text-on-surface">
                            {String(h.hour).padStart(2, '0')}:00
                          </td>
                          <td className="py-2 px-3.5 font-mono text-on-surface-variant">{h.p10 ?? '--'}</td>
                          <td className="py-2 px-3.5 font-mono text-on-surface-variant">{h.p25 ?? '--'}</td>
                          <td className="py-2 px-3.5 font-mono font-bold text-primary bg-primary-fixed/20">
                            {h.p50 ?? '--'} mg/dL
                          </td>
                          <td className="py-2 px-3.5 font-mono text-on-surface-variant">{h.p75 ?? '--'}</td>
                          <td className="py-2 px-3.5 font-mono text-on-surface-variant">{h.p90 ?? '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs font-body text-on-surface-variant py-8 text-center">
                Insufficient readings to construct complete 24-hour AGP profile.
              </p>
            )}

            <div className="flex justify-end pt-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowAgpModal(false)}
                className="px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-label font-bold transition-all"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white bg-surface-container-lowest shadow-xl border border-outline-variant/30 p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3.5">
              <div className="flex items-center gap-2.5">
                <Upload className="h-5 w-5 text-primary" />
                <h3 className="text-base font-headline font-semibold text-on-surface">Upload CGM Glucose Data</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-lg hover:bg-surface-container transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Sensor / CGM Provider
                </label>
                <select
                  value={uploadProvider}
                  onChange={(e) => setUploadProvider(e.target.value)}
                  className="w-full text-xs font-body rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface outline-none focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  <option value="FREESTYLE_LIBRE">Abbott FreeStyle Libre 1/2/3</option>
                  <option value="DEXCOM_G6_G7">Dexcom G6 / G7 / ONE</option>
                  <option value="MEDTRONIC_GUARDIAN">Medtronic Guardian Sensor</option>
                  <option value="UNIVERSAL_CSV">Generic CSV (Timestamp, Glucose mg/dL)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Select CSV File from Computer
                </label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="block w-full text-xs font-body text-on-surface-variant file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-label file:font-bold file:bg-primary-fixed/50 file:text-primary hover:file:bg-primary-fixed transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Or Paste CSV Text Directly
                </label>
                <textarea
                  rows={6}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={`Meter Timestamp,Historic Glucose mg/dL\n2026-11-17 08:00,124\n2026-11-17 08:15,130\n...`}
                  className="w-full text-xs font-mono rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface outline-none focus:bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-label font-bold text-on-surface-variant hover:bg-surface-container transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading || !csvContent.trim()}
                onClick={handleCsvUpload}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container hover:from-primary-container hover:to-primary text-white text-xs font-label font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
              >
                {uploading ? 'Ingesting Readings...' : 'Import & Process Readings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
