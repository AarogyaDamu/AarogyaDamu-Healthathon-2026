import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api/client';
import type {
  DoctorDashboardResponse,
  DoctorDashboardPatient,
  ActivityFeedItem,
  CareTeamMessage,
} from '../api/types';
import {
  Users,
  AlertTriangle,
  Calendar,
  Clock,
  Search,
  PlusCircle,
  FileText,
  MessageSquare,
  Activity,
  Send,
  Stethoscope,
  ShieldCheck,
  Compass,
} from 'lucide-react';

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function DoctorDashboard({ onNavigate }: Props) {
  const [data, setData] = useState<DoctorDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'IN_TARGET' | 'LOW'>('ALL');
  const [sortBy, setSortBy] = useState<'NAME' | 'RISK' | 'NEXT_VISIT' | 'RECENT_OBS'>('RISK');

  // Selected Patient Drawer & Sub-views
  const [selectedPatient, setSelectedPatient] = useState<DoctorDashboardPatient | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'OVERVIEW' | 'FOLLOW_UP' | 'CHAT' | 'FEED'>('OVERVIEW');

  // Assign Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<'FOLLOW_UP' | 'BLOOD_SUGAR_CHECK' | 'MEDICATION' | 'LAB_TEST' | 'LIFESTYLE'>('FOLLOW_UP');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null);

  // Clinical Review Form State
  const [reviewNotes, setReviewNotes] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [targetMin, setTargetMin] = useState<number>(80);
  const [targetMax, setTargetMax] = useState<number>(130);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<CareTeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageCategory, setMessageCategory] = useState<'DOCTOR_RESPONSE' | 'FOLLOW_UP_INSTRUCTION' | 'GENERAL'>('DOCTOR_RESPONSE');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Feed State
  const [feedItems, setFeedItems] = useState<ActivityFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const res = await apiFetch<DoctorDashboardResponse>(
        `/coordination/doctor/dashboard?search=${encodeURIComponent(search)}&risk=${riskFilter}&sort=${sortBy}`
      );
      setData(res);
      // Auto-select first patient if none selected
      if (!selectedPatient && res.patients.length > 0) {
        setSelectedPatient(res.patients[0]);
        setTargetMin(res.patients[0].targetFastingMin || 80);
        setTargetMax(res.patients[0].targetFastingMax || 130);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expiration is handled centrally by apiFetch + AuthContext event;
        // do not render a local error screen with retry button
        return;
      }
      setError(err.message || 'Unable to connect to doctor workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [search, riskFilter, sortBy]);

  // Load chat messages when patient or chat tab selected
  useEffect(() => {
    if (selectedPatient && activeDrawerTab === 'CHAT') {
      loadMessages(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'FEED') {
      loadActivityFeed(selectedPatient.patientId);
    }
  }, [selectedPatient?.patientId, activeDrawerTab]);

  const loadMessages = async (patientId: string) => {
    setChatLoading(true);
    try {
      const res = await apiFetch<{ messages: CareTeamMessage[] }>(`/coordination/messages?patientId=${patientId}`);
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadActivityFeed = async (patientId: string) => {
    setFeedLoading(true);
    try {
      const res = await apiFetch<{ feed: ActivityFeedItem[] }>(`/coordination/activity-feed?patientId=${patientId}`);
      setFeedItems(res.feed || []);
    } catch {
      setFeedItems([]);
    } finally {
      setFeedLoading(false);
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !taskTitle.trim() || !taskDueDate) return;

    setTaskSubmitting(true);
    setTaskSuccess(null);
    try {
      await apiFetch('/coordination/doctor/assign-task', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.patientId,
          title: taskTitle.trim(),
          category: taskCategory,
          dueAt: new Date(taskDueDate).toISOString(),
        }),
      });
      setTaskSuccess('Follow-up task assigned and patient notified.');
      setTaskTitle('');
      setTaskDueDate('');
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to assign task.');
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleRecordReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !reviewNotes.trim()) return;

    setReviewSubmitting(true);
    setReviewSuccess(null);
    try {
      await apiFetch('/coordination/doctor/clinical-review', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.patientId,
          reviewNotes: reviewNotes.trim(),
          nextReviewDate: nextReviewDate ? new Date(nextReviewDate).toISOString() : undefined,
          updateTargetFastingMin: targetMin,
          updateTargetFastingMax: targetMax,
        }),
      });
      setReviewSuccess('Clinical review recorded and glycemic targets updated.');
      setReviewNotes('');
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to record review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !newMessage.trim()) return;

    setSendingMessage(true);
    try {
      await apiFetch('/coordination/messages', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.patientId,
          category: messageCategory,
          content: newMessage.trim(),
        }),
      });
      setNewMessage('');
      loadMessages(selectedPatient.patientId);
    } catch (err: any) {
      alert(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div className="h-8 bg-slate-200 animate-pulse rounded-md w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 text-center bg-white border border-rose-200 rounded-2xl shadow-sm space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Unable to Connect to Workspace</h3>
        <p className="text-xs text-slate-600">{error}</p>
        <button
          type="button"
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Banner / Clinical Header */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30 uppercase">
                Doctor Command Center
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified Clinician Access
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black mt-1">Care Coordination & Patient Roster</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Comprehensive glycemic monitoring, assigned patient journey oversight, and care team governance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('journey')}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Patient Journey</span>
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('careplan')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Care Plans</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stat Ribbon */}
      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Assigned Patients</span>
              <Users className="h-4 w-4 text-teal-700" />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">{data.summary.totalAssignedPatients}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Active doctor-patient links</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-rose-700 text-xs font-semibold">
              <span>High Glycemic Risk</span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black text-rose-700 mt-2">{data.summary.highRiskCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">&gt;180 or &lt;70 mg/dL recent</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
              <span>Overdue Follow-ups</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-700 mt-2">{data.summary.overdueFollowUpsCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Care plan review pending</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-indigo-700 text-xs font-semibold">
              <span>Pending Scribe Notes</span>
              <FileText className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-indigo-700 mt-2">{data.summary.pendingConsultationsCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Draft consultations</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-teal-700 text-xs font-semibold">
              <span>Upcoming Visits</span>
              <Calendar className="h-4 w-4 text-teal-600" />
            </div>
            <div className="text-2xl font-black text-teal-800 mt-2">{data.summary.upcomingAppointmentsCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Server-confirmed bookings</div>
          </div>
        </div>
      )}

      {/* Main Content Grid: Patient Roster (Left) & Selected Patient Details (Right) */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Patient Roster List */}
        <div className="lg:col-span-5 space-y-3">
          {/* Search & Risk Filters */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient name, email..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
              />
            </div>
            <div className="flex items-center justify-between text-xs gap-1">
              <div className="flex items-center gap-1">
                {(['ALL', 'HIGH', 'IN_TARGET'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRiskFilter(r)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                      riskFilter === r
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r === 'ALL' ? 'All' : r === 'HIGH' ? 'High Risk' : 'In Target'}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-100 border-none rounded px-2 py-1 text-[11px] font-semibold text-slate-700"
              >
                <option value="RISK">Sort: Risk</option>
                <option value="NAME">Sort: Name</option>
                <option value="RECENT_OBS">Sort: Latest Reading</option>
                <option value="NEXT_VISIT">Sort: Next Visit</option>
              </select>
            </div>
          </div>

          {/* Patient Cards */}
          <div className="space-y-2">
            {data?.patients.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                No assigned patients matching your search criteria.
              </div>
            ) : (
              data?.patients.map((p) => {
                const isSelected = selectedPatient?.patientId === p.patientId;
                const isHighRisk = p.risk === 'HIGH';

                return (
                  <div
                    key={p.patientId}
                    onClick={() => {
                      setSelectedPatient(p);
                      setTargetMin(p.targetFastingMin || 80);
                      setTargetMax(p.targetFastingMax || 130);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-teal-50/70 border-teal-600 shadow-xs ring-1 ring-teal-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                          {isHighRisk && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              HIGH RISK
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">{p.diabetesType.replace(/_/g, ' ')}</p>
                      </div>
                      {p.latestObservation && (
                        <div className="text-right">
                          <div
                            className={`text-xs font-black px-2 py-0.5 rounded-md inline-block ${
                              p.latestObservation.isHigh
                                ? 'bg-rose-100 text-rose-800'
                                : p.latestObservation.isLow
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-teal-100 text-teal-900'
                            }`}
                          >
                            {p.latestObservation.numericValue} {p.latestObservation.unit}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{p.latestObservation.context}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">Stage: {p.currentStage}</span>
                      <span className="font-semibold text-teal-800">{p.adherenceRate}% Adherent</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Patient Command Center Drawer */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          {selectedPatient ? (
            <>
              {/* Patient Banner */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-200 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">{selectedPatient.name}</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {selectedPatient.diabetesType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target Fasting: {selectedPatient.targetFastingMin} – {selectedPatient.targetFastingMax} mg/dL • Post-Meal: &lt;{selectedPatient.targetPostMealMax} mg/dL
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold px-2.5 py-1 bg-teal-50 text-teal-800 rounded-lg border border-teal-200">
                    Journey: {selectedPatient.currentStage}
                  </span>
                </div>
              </div>

              {/* Sub-tab Navigation */}
              <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                {[
                  { id: 'OVERVIEW', label: 'Clinical Overview', icon: Activity },
                  { id: 'FOLLOW_UP', label: 'Follow-up & Tasks', icon: PlusCircle },
                  { id: 'CHAT', label: 'Care Team Chat', icon: MessageSquare },
                  { id: 'FEED', label: 'Activity Feed', icon: FileText },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = activeDrawerTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveDrawerTab(t.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: CLINICAL OVERVIEW */}
              {activeDrawerTab === 'OVERVIEW' && (
                <div className="space-y-4">
                  {/* Active Care Plan Card */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Active Shared Care Plan
                      </span>
                      {selectedPatient.activeCarePlan ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          v{selectedPatient.activeCarePlan.version} Approved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          No Active Plan
                        </span>
                      )}
                    </div>
                    {selectedPatient.activeCarePlan ? (
                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {selectedPatient.activeCarePlan.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-4">
                          <span>{selectedPatient.activeCarePlan.goalsCount} Clinical Goals</span>
                          <span>{selectedPatient.activeCarePlan.activitiesCount} Scheduled Activities</span>
                          <span>
                            Next Review:{' '}
                            {selectedPatient.activeCarePlan.reviewDate
                              ? new Date(selectedPatient.activeCarePlan.reviewDate).toLocaleDateString()
                              : 'Not set'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No approved diabetes care plan exists for this patient yet. Use the Care Plans tool to draft one.
                      </p>
                    )}
                  </div>

                  {/* Latest Observation Detail */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-semibold text-slate-500">Latest Glycemic Reading</span>
                      {selectedPatient.latestObservation ? (
                        <div className="mt-2">
                          <div className="text-2xl font-black text-slate-900">
                            {selectedPatient.latestObservation.numericValue}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              {selectedPatient.latestObservation.unit}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {selectedPatient.latestObservation.context} •{' '}
                            {new Date(selectedPatient.latestObservation.observedAt).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2">No observations logged yet.</p>
                      )}
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-semibold text-slate-500">Upcoming Visit</span>
                      {selectedPatient.nextAppointment ? (
                        <div className="mt-2">
                          <div className="text-sm font-bold text-slate-900">
                            {new Date(selectedPatient.nextAppointment.scheduledAt).toLocaleDateString()} at{' '}
                            {new Date(selectedPatient.nextAppointment.scheduledAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <span>{selectedPatient.nextAppointment.visitType}</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-semibold">
                              {selectedPatient.nextAppointment.status}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2">No future appointment scheduled.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FOLLOW-UP MANAGEMENT & TASK ASSIGNMENT */}
              {activeDrawerTab === 'FOLLOW_UP' && (
                <div className="space-y-6">
                  {/* Form 1: Assign Clinical Task */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                      <PlusCircle className="h-4 w-4 text-teal-700" />
                      Assign Clinical Follow-up Task
                    </h3>
                    {taskSuccess && (
                      <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-medium">
                        {taskSuccess}
                      </div>
                    )}
                    <form onSubmit={handleAssignTask} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Task Title & Instructions
                        </label>
                        <input
                          type="text"
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder="e.g., Schedule annual dilated retinal exam"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Category</label>
                          <select
                            value={taskCategory}
                            onChange={(e) => setTaskCategory(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                          >
                            <option value="FOLLOW_UP">Follow-up</option>
                            <option value="BLOOD_SUGAR_CHECK">Sugar Check</option>
                            <option value="MEDICATION">Medication</option>
                            <option value="LAB_TEST">Lab Test</option>
                            <option value="LIFESTYLE">Lifestyle</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Due Date</label>
                          <input
                            type="datetime-local"
                            value={taskDueDate}
                            onChange={(e) => setTaskDueDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={taskSubmitting || !taskTitle.trim() || !taskDueDate}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                      >
                        {taskSubmitting ? 'Assigning...' : 'Assign Task to Patient'}
                      </button>
                    </form>
                  </div>

                  {/* Form 2: Record Clinical Review Note & Update Targets */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                      <Stethoscope className="h-4 w-4 text-teal-700" />
                      Record Clinical Review & Adjust Glycemic Targets
                    </h3>
                    {reviewSuccess && (
                      <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-medium">
                        {reviewSuccess}
                      </div>
                    )}
                    <form onSubmit={handleRecordReview} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Clinical Progress Review Notes
                        </label>
                        <textarea
                          rows={3}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Document longitudinal glycemic progress, medication tolerance, and follow-up directives..."
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Target Fasting Min
                          </label>
                          <input
                            type="number"
                            value={targetMin}
                            onChange={(e) => setTargetMin(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Target Fasting Max
                          </label>
                          <input
                            type="number"
                            value={targetMax}
                            onChange={(e) => setTargetMax(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Next Review Date
                          </label>
                          <input
                            type="datetime-local"
                            value={nextReviewDate}
                            onChange={(e) => setNextReviewDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={reviewSubmitting || !reviewNotes.trim()}
                        className="px-4 py-2 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                      >
                        {reviewSubmitting ? 'Saving Review...' : 'Save Clinical Review Note'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 3: CARE TEAM CHAT */}
              {activeDrawerTab === 'CHAT' && (
                <div className="space-y-4">
                  <div className="h-64 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2.5">
                    {chatLoading ? (
                      <div className="text-center text-xs text-slate-400 py-8">Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 py-8">
                        No care team messages yet. Send instructions or check in with the patient and caregiver.
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                            m.senderRole === 'DOCTOR'
                              ? 'ml-auto bg-slate-900 text-white'
                              : m.senderRole === 'CAREGIVER'
                              ? 'mr-auto bg-amber-50 text-slate-800 border border-amber-200'
                              : 'mr-auto bg-white text-slate-800 border border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] opacity-75 mb-1">
                            <span className="font-bold">{m.senderName} ({m.senderRole})</span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="leading-relaxed">{m.content}</p>
                          <div className="text-[9px] mt-1 text-right opacity-70">
                            {m.category.replace(/_/g, ' ')} {m.isRead && '• Read'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Send Message Form */}
                  <form onSubmit={handleSendMessage} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={messageCategory}
                        onChange={(e) => setMessageCategory(e.target.value as any)}
                        className="bg-slate-100 border-none rounded px-2 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        <option value="DOCTOR_RESPONSE">Clinical Response</option>
                        <option value="FOLLOW_UP_INSTRUCTION">Follow-up Instruction</option>
                        <option value="GENERAL">General Message</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type clinical advice or response..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-700"
                      />
                      <button
                        type="submit"
                        disabled={sendingMessage || !newMessage.trim()}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: CHRONOLOGICAL ACTIVITY FEED */}
              {activeDrawerTab === 'FEED' && (
                <div className="space-y-3">
                  <div className="h-80 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    {feedLoading ? (
                      <div className="text-center text-xs text-slate-400 py-8">Loading activity feed...</div>
                    ) : feedItems.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 py-8">No recorded activities yet.</div>
                    ) : (
                      feedItems.map((item) => (
                        <div key={item.id} className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{item.title}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px]">{item.details}</p>
                          <div className="text-[10px] text-teal-800 font-semibold pt-0.5">
                            By {item.actorName} • Status: {item.status}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-400 py-16 text-xs">
              Select an assigned patient from the roster to review records.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
