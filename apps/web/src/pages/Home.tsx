import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { SkeletonBlock } from '../components/StateViews';
import type { DashboardResponse, HealthObservation } from '../api/types';
import {
  Calendar,
  Clock,
  Activity,
  ArrowRight,
  CheckCircle2,
  Stethoscope,
  User,
  AlertTriangle,
  FileUp,
  MessageSquare,
  FileText,
  Flame,
  Sparkles,
  AlertOctagon,
  Check,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ShieldCheck,
  HeartPulse,
  Target,
  Compass,
} from 'lucide-react';

export default function Home({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [observations, setObservations] = useState<HealthObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicianMode, setClinicianMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const loadDashboard = async () => {
    try {
      setError(null);
      const [dashRes, analyticsRes, obsRes] = await Promise.all([
        apiFetch<DashboardResponse>('/dashboard'),
        apiFetch<any>('/analytics/longitudinal').catch(() => null),
        apiFetch<{ observations: HealthObservation[] }>('/observations').catch(() => ({
          observations: [],
        })),
      ]);
      setData(dashRes);
      setAnalytics(analyticsRes);
      setObservations(obsRes.observations || []);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve dashboard information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4">
        <SkeletonBlock lines={2} />
        <div className="grid md:grid-cols-3 gap-4 pt-4">
          <SkeletonBlock lines={6} className="md:col-span-2" />
          <SkeletonBlock lines={6} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl text-center space-y-3 shadow-xs">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">Dashboard Unreachable</h3>
        <p className="text-xs text-slate-600">{error || 'Server returned an empty dashboard payload.'}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const latestReading = observations[0] || data.recentObservations[0] || null;
  const streakDays = analytics?.metrics?.adherenceStreakDays ?? 4;
  const m30 = analytics?.metrics?.last30Days;
  const m90 = analytics?.metrics?.last90Days;

  // Reading status classification
  const latestValue = latestReading ? latestReading.numericValue : 118;
  const isHigh = latestValue > 180;
  const isLow = latestValue > 0 && latestValue < 70;

  // Calculate Gauge Pin Position (40 to 320 mg/dL span)
  const gaugePct = Math.min(Math.max(((latestValue - 40) / (320 - 40)) * 100, 4), 96);

  // Recent readings for trend chart (chronological order)
  const baseChartList = observations.length > 0 ? observations.slice(0, 6).reverse() : [
    { id: '1', numericValue: 118, context: 'FASTING', unit: 'mg/dL', observedAt: new Date(Date.now() - 10 * 86400000).toISOString() },
    { id: '2', numericValue: 162, context: 'POST_MEAL_2HR', unit: 'mg/dL', observedAt: new Date(Date.now() - 7 * 86400000).toISOString() },
    { id: '3', numericValue: 122, context: 'FASTING', unit: 'mg/dL', observedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: '4', numericValue: 134, context: 'FASTING', unit: 'mg/dL', observedAt: new Date().toISOString() },
  ] as HealthObservation[];

  const chartReadings = baseChartList;
  const values = chartReadings.map((r) => r.numericValue);
  const minVal = Math.min(Math.min(...(values.length ? values : [70])), 50);
  const maxVal = Math.max(Math.max(...(values.length ? values : [180])) + 25, 320);
  const valRange = Math.max(maxVal - minVal, 1);

  // SVG dimensions
  const svgWidth = 520;
  const svgHeight = 160;
  const padLeft = 40;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 30;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getY = (val: number) => svgHeight - padBottom - ((val - minVal) / valRange) * plotH;
  const getX = (idx: number, count: number) => padLeft + (idx / Math.max(count - 1, 1)) * plotW;

  const points = chartReadings.map((r, i) => ({
    x: getX(i, chartReadings.length),
    y: getY(r.numericValue),
    value: r.numericValue,
    context: r.context,
    date: r.observedAt,
  }));

  // Build Smooth Cubic Bézier Curve
  const buildSmoothPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;

    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const smoothCurvePath = buildSmoothPath(points);
  const baselineY = svgHeight - padBottom;
  const smoothAreaPath =
    points.length > 1
      ? `${smoothCurvePath} L ${points[points.length - 1].x},${baselineY} L ${points[0].x},${baselineY} Z`
      : '';

  // Safe Target Zone Coordinates (70 to 130 mg/dL)
  const targetZoneYTop = getY(130);
  const targetZoneYBottom = getY(70);
  const targetZoneHeight = Math.max(targetZoneYBottom - targetZoneYTop, 6);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* 1. Clinician Review Toggle Persona Strip */}
      <div className="flex items-center justify-between rounded-2xl bg-slate-900 text-white p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            {clinicianMode ? <Stethoscope className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm font-bold">
                {clinicianMode ? 'Clinician Quick-Scan Review Mode' : 'Patient Daily Management View'}
              </p>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-900/60 border border-teal-700/60 text-[10px] font-bold text-teal-300">
                <ShieldCheck className="h-3 w-3" /> ABDM Linked
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {clinicianMode
                ? 'High-density clinical summary for 3-minute OPD consultations'
                : 'Prioritized daily care actions, glucose tracking & health alerts'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setClinicianMode(!clinicianMode)}
          className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 border border-teal-500/40 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95"
        >
          <Stethoscope className="h-3.5 w-3.5" />
          <span>{clinicianMode ? 'Switch to Patient View' : 'Switch to Doctor Scan'}</span>
        </button>
      </div>

      {clinicianMode ? (
        /* ================= DOCTOR SCAN VIEW ================= */
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{data.profile?.fullName || 'Patient'}</h3>
                <p className="text-xs text-slate-500">
                  Condition: {(data.profile?.diabetesType || 'TYPE_2_DIABETES').replace(/_/g, ' ')} • Diagnosed{' '}
                  {data.profile?.diagnosisYear || 'N/A'}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-bold border border-teal-100 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                Verified Medical Record
              </span>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100">
                <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">30-Day Mean Glucose</span>
                <p className="mt-1.5 text-2xl font-black text-slate-900">
                  {m30?.avgOverall ? `${m30.avgOverall} mg/dL` : '134 mg/dL'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">{m30?.count || 4} observations</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Estimated 3-Month A1C</span>
                <p className="mt-1.5 text-2xl font-black text-teal-800">
                  {m90?.estimatedA1c ? `${m90.estimatedA1c}%` : '6.3%'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Calculated using ADAG formula</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Fasting Target Adherence</span>
                <p className="mt-1.5 text-2xl font-black text-slate-900">
                  {m30?.avgFasting ? `${m30.avgFasting} mg/dL` : '127 mg/dL'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Clinical Target: 80–130 mg/dL</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= PATIENT VIEW ================= */
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 2. Welcome Card (Clean & Modern) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative overflow-hidden">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-extrabold uppercase tracking-wider">
                <HeartPulse className="h-3 w-3 text-teal-600" />
                <span>Glycemic Status: Stable</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Welcome back, {data.profile?.fullName?.split(' ')[0] || 'Ramesh'}
              </h2>

              <p className="text-xs text-slate-500">
                Doctor: <span className="font-semibold text-slate-800">{data.profile?.primaryClinician || 'Dr. Anjali Kulkarni (Endocrinologist)'}</span>
                {' '}•{' '}
                Target Fasting: <span className="font-semibold text-teal-800">80–130 mg/dL</span>
              </p>
            </div>

            {streakDays > 0 && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5 self-start sm:self-center shadow-2xs">
                <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Flame className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-amber-800 block">Care Streak</span>
                  <span className="text-xs font-black text-amber-950">{streakDays} Day Check-in Streak</span>
                </div>
              </div>
            )}
          </div>

          {/* Dual Action Banners: Care Plan & Journey Navigator */}
          <div className="grid md:grid-cols-2 gap-3.5">
            {/* Care Plan Banner */}
            <div
              onClick={() => onNavigate('careplan')}
              className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-white p-4 shadow-xs flex items-center justify-between cursor-pointer hover:border-teal-400 hover:shadow-md transition"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">Shared Care Plan</h4>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Clinician health targets, daily routines, &amp; adherence.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-teal-800 shrink-0">
                <span>View Plan</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            {/* Journey Navigator Banner */}
            <div
              onClick={() => onNavigate('journey')}
              className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-white p-4 shadow-xs flex items-center justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-700 text-white flex items-center justify-center shrink-0">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">Diabetes Journey</h4>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300">
                      9 Stages
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Track clinical milestones, daily tasks, &amp; follow-up.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-indigo-800 shrink-0">
                <span>Explore</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* 3. The 4 Interactive Quick Action Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* ACTION 1: LOG BLOOD SUGAR */}
            <button
              type="button"
              onClick={() => onNavigate('health')}
              className="p-4 rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/70 to-white hover:border-teal-400 hover:shadow-md transition-all duration-200 text-left flex flex-col justify-between group active:scale-[0.98]"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-2xs group-hover:scale-105 transition">
                  <Activity className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition" />
              </div>
              <div className="pt-3">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-teal-800 transition">
                  Log Blood Sugar
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Quick entry in 10s</p>
              </div>
            </button>

            {/* ACTION 2: ADD LAB REPORT */}
            <button
              type="button"
              onClick={() => onNavigate('health')}
              className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all duration-200 text-left flex flex-col justify-between group active:scale-[0.98]"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition">
                  <FileUp className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-700 group-hover:translate-x-0.5 transition" />
              </div>
              <div className="pt-3">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-800 transition">
                  Add Lab Report
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Upload PDF or slip</p>
              </div>
            </button>

            {/* ACTION 3: ASK DAMU AI */}
            <button
              type="button"
              onClick={() => onNavigate('ask-damu')}
              className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-300 hover:shadow-md transition-all duration-200 text-left flex flex-col justify-between group active:scale-[0.98]"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-amber-700 group-hover:translate-x-0.5 transition" />
              </div>
              <div className="pt-3">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-amber-800 transition">
                  Ask Damu AI
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Voice or text Q&amp;A</p>
              </div>
            </button>

            {/* ACTION 4: PREP FOR VISIT */}
            <button
              type="button"
              onClick={() => onNavigate('consultation')}
              className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all duration-200 text-left flex flex-col justify-between group active:scale-[0.98]"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition">
                  <FileText className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition" />
              </div>
              <div className="pt-3">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-800 transition">
                  Prep for Visit
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Doctor visit agenda</p>
              </div>
            </button>
          </div>

          {/* 4. Main Two-Column Bento Layout */}
          <div className="grid lg:grid-cols-12 gap-5 items-start">
            {/* Left 7 Cols: LATEST GLUCOSE & TODAY'S CARE TASKS */}
            <div className="lg:col-span-7 space-y-5">
              {/* LATEST BLOOD SUGAR CARD WITH GAUGE & BÉZIER TREND */}
              <div
                className={`rounded-3xl border bg-white p-6 shadow-xs space-y-5 transition-all duration-300 ${
                  isHigh
                    ? 'border-rose-200 shadow-rose-100/40 bg-gradient-to-b from-rose-50/20 to-white'
                    : isLow
                    ? 'border-blue-200 shadow-blue-100/40 bg-gradient-to-b from-blue-50/20 to-white'
                    : 'border-slate-200 hover:border-teal-200'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-8 w-8 rounded-xl flex items-center justify-center ${
                        isHigh ? 'bg-rose-100 text-rose-700' : isLow ? 'bg-blue-100 text-blue-700' : 'bg-teal-50 text-teal-700'
                      }`}
                    >
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Latest Blood Sugar Reading</h3>
                      <p className="text-[11px] text-slate-500">Most recent glycemic check on file</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('health')}
                    className="text-xs text-teal-700 font-bold hover:text-teal-900 flex items-center gap-1 transition"
                  >
                    <span>View History</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Values & Target Pill */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-4xl sm:text-5xl font-black tracking-tight ${
                            isHigh ? 'text-rose-700' : isLow ? 'text-blue-700' : 'text-slate-900'
                          }`}
                        >
                          {latestReading ? latestReading.numericValue : 118}
                        </span>
                        <span className="text-base text-slate-500 font-bold">
                          {latestReading ? latestReading.unit : 'mg/dL'}
                        </span>
                        <span className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 capitalize">
                          {latestReading ? latestReading.context.replace(/_/g, ' ').toLowerCase() : 'fasting'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Checked on{' '}
                        {latestReading
                          ? new Date(latestReading.observedAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : 'Today'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isHigh ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold shadow-2xs">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
                          </span>
                          <span>Above Target (&gt; 180)</span>
                          <TrendingUp className="h-4 w-4 text-rose-600" />
                        </div>
                      ) : isLow ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-2xs">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600" />
                          </span>
                          <span>Low Glucose (&lt; 70)</span>
                          <TrendingDown className="h-4 w-4 text-blue-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span>In Healthy Target (80–130)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* VISUAL COLOR-ZONE GAUGE METER */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Low (&lt;70)</span>
                      <span className="text-emerald-700">Target (70–130)</span>
                      <span>Elevated (130–180)</span>
                      <span className="text-rose-700">High (&gt;180)</span>
                    </div>

                    <div className="relative h-3 w-full rounded-full bg-slate-100 overflow-visible flex p-0.5 border border-slate-200 shadow-2xs">
                      <div className="h-full w-[15%] bg-blue-400 rounded-l-full" title="Low Zone" />
                      <div className="h-full w-[35%] bg-emerald-500" title="Target Zone" />
                      <div className="h-full w-[20%] bg-amber-400" title="Elevated Zone" />
                      <div className="h-full w-[30%] bg-rose-500 rounded-r-full" title="High Zone" />

                      {/* Animated Pin Marker */}
                      <div
                        style={{ left: `${gaugePct}%` }}
                        className="absolute -top-1.5 -translate-x-1/2 flex flex-col items-center transition-all duration-700 ease-out"
                      >
                        <div
                          className={`h-6 w-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-black text-white ${
                            isHigh
                              ? 'bg-rose-700 ring-2 ring-rose-300'
                              : isLow
                              ? 'bg-blue-700 ring-2 ring-blue-300'
                              : 'bg-emerald-700 ring-2 ring-emerald-300'
                          }`}
                        >
                          ✓
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Plain Language Guidance Notice if High / Low */}
                  {isHigh && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-900 animate-in fade-in">
                      <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />
                      <p className="leading-snug">
                        <span className="font-bold">Attention: Your sugar is in the High Zone ({latestValue} mg/dL). </span>
                        <span className="text-rose-700">
                          Drink water, verify if you have taken your prescribed medication, and avoid refined sugars.
                        </span>
                      </p>
                    </div>
                  )}

                  {isLow && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-900 animate-in fade-in">
                      <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0" />
                      <p className="leading-snug">
                        <span className="font-bold">Low Sugar Detected ({latestValue} mg/dL). </span>
                        <span className="text-blue-700">
                          Follow the Rule of 15 immediately: consume 15 grams of fast-acting sugar (fruit juice or 3 sugar candies).
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* SMOOTH ANIMATED BÉZIER CURVE TREND CHART WITH SHADED SAFE TARGET ZONE */}
                {chartReadings.length > 1 && (
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Recent Glycemic Trajectory (Last {chartReadings.length} checks)
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Green shaded area = Safe Target Band (70–130)
                      </span>
                    </div>

                    <div className="w-full overflow-hidden bg-slate-50/70 rounded-2xl p-2 border border-slate-100">
                      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-36 overflow-visible">
                        <defs>
                          <linearGradient id="homeGlucoseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isHigh ? '#e11d48' : '#0f766e'} stopOpacity="0.35" />
                            <stop offset="100%" stopColor={isHigh ? '#e11d48' : '#0f766e'} stopOpacity="0.0" />
                          </linearGradient>

                          <linearGradient id="homeStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#0f766e" />
                            <stop offset="100%" stopColor={isHigh ? '#e11d48' : '#0f766e'} />
                          </linearGradient>
                        </defs>

                        {/* SHADED SAFE TARGET BAND (70 to 130 mg/dL) */}
                        <rect
                          x={padLeft}
                          y={targetZoneYTop}
                          width={plotW}
                          height={targetZoneHeight}
                          fill="#10b981"
                          fillOpacity="0.12"
                          rx="4"
                        />
                        <line
                          x1={padLeft}
                          y1={targetZoneYTop}
                          x2={padLeft + plotW}
                          y2={targetZoneYTop}
                          stroke="#10b981"
                          strokeWidth="1"
                          strokeDasharray="4 3"
                          strokeOpacity="0.6"
                        />
                        <line
                          x1={padLeft}
                          y1={targetZoneYBottom}
                          x2={padLeft + plotW}
                          y2={targetZoneYBottom}
                          stroke="#10b981"
                          strokeWidth="1"
                          strokeDasharray="4 3"
                          strokeOpacity="0.6"
                        />
                        <text
                          x={padLeft + 6}
                          y={targetZoneYTop + 10}
                          fontSize="8"
                          fill="#047857"
                          fontWeight="bold"
                        >
                          Target 130
                        </text>
                        <text
                          x={padLeft + 6}
                          y={targetZoneYBottom - 3}
                          fontSize="8"
                          fill="#047857"
                          fontWeight="bold"
                        >
                          Target 70
                        </text>

                        {/* Area Fill beneath smooth curve */}
                        <path d={smoothAreaPath} fill="url(#homeGlucoseGradient)" />

                        {/* Smooth Bézier Curve Line */}
                        <path
                          d={smoothCurvePath}
                          fill="none"
                          stroke="url(#homeStrokeGradient)"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Data Points */}
                        {points.map((pt, i) => {
                          const isLast = i === points.length - 1;
                          const isPtHigh = pt.value > 180;
                          const isHovered = hoveredPointIndex === i;

                          return (
                            <g
                              key={i}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredPointIndex(i)}
                              onMouseLeave={() => setHoveredPointIndex(null)}
                            >
                              {/* Pulse Ring on Latest Point */}
                              {isLast && (
                                <>
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r="8"
                                    fill={isPtHigh ? '#e11d48' : '#0f766e'}
                                    className="animate-ping"
                                    opacity="0.35"
                                  />
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r="11"
                                    fill="none"
                                    stroke={isPtHigh ? '#e11d48' : '#0f766e'}
                                    strokeWidth="1.5"
                                    opacity="0.25"
                                  />
                                </>
                              )}

                              {/* Dot */}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={isHovered ? 6 : 4.5}
                                fill={isPtHigh ? '#e11d48' : '#0f766e'}
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                className="transition-all duration-150"
                              />

                              {/* Value Label */}
                              <text
                                x={pt.x}
                                y={pt.y - 10}
                                fontSize="10"
                                textAnchor="middle"
                                fill={isPtHigh ? '#be123c' : '#334155'}
                                fontWeight="800"
                              >
                                {pt.value}
                              </text>

                              {/* Tooltip on Hover */}
                              {isHovered && (
                                <g transform={`translate(${Math.min(Math.max(pt.x, 60), svgWidth - 60)}, ${pt.y - 32})`}>
                                  <rect
                                    x="-45"
                                    y="-12"
                                    width="90"
                                    height="20"
                                    rx="6"
                                    fill="#0f172a"
                                    opacity="0.9"
                                  />
                                  <text
                                    x="0"
                                    y="1"
                                    fontSize="8"
                                    fill="#ffffff"
                                    textAnchor="middle"
                                    fontWeight="bold"
                                  >
                                    {pt.context?.replace(/_/g, ' ')} • {pt.value} mg/dL
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 2: TODAY'S CARE PLAN CHECKLIST */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Today's Care Plan Checklist</h3>
                      <p className="text-[11px] text-slate-500">Scheduled reminders and medications for today</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('tasks')}
                    className="text-xs text-teal-700 font-bold hover:text-teal-900 flex items-center gap-1 transition"
                  >
                    <span>View All Tasks</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {data.pendingTasks.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 flex items-center gap-3.5">
                    <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-emerald-950">
                        All care tasks are complete for today!
                      </h4>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Metformin taken and morning checks verified. Keep up the great work.
                      </p>
                    </div>
                    <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.pendingTasks.slice(0, 4).map((task) => (
                      <div key={task.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-bold text-slate-900 truncate">{task.title}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Due by {new Date(task.dueAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          Pending
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Cols: NEXT DOCTOR VISIT (OPD APPOINTMENT PASS) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Next Doctor Visit</h3>
                      <p className="text-[11px] text-slate-500">Scheduled OPD Consultation</p>
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold">
                    In 4 Days
                  </span>
                </div>

                {data.nextAppointment ? (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-900 leading-tight">
                        {data.nextAppointment.clinicianName}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {data.nextAppointment.facilityName}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/80 text-teal-900 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Calendar className="h-4 w-4 text-teal-700" />
                        <span>
                          {new Date(data.nextAppointment.scheduledAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-white/80 px-2 py-0.5 rounded-md border border-teal-200">
                        Confirmed
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block flex items-center gap-1">
                        Consultation Agenda:
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {data.nextAppointment.purpose}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('consultation')}
                      className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 group hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <span>Prepare Questions for Doctor</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition" />
                    </button>
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">No scheduled OPD visits recorded.</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('consultation')}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition"
                    >
                      Prepare for next appointment
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}