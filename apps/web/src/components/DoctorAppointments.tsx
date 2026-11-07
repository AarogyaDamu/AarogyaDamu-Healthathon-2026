import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  RotateCcw,
  User,
  MapPin,
  Filter,
  Search,
  ChevronRight,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  getDoctorAppointments,
  updateAppointmentStatus,
  getDoctorScheduleSettings,
  updateDoctorScheduleSettings,
  createDoctorTimeOff,
  deleteDoctorTimeOff,
  getQuestionnaireDefinition,
} from '../api/client';
import type {
  DoctorAppointmentItem,
  AppointmentStatus,
  DoctorScheduleSetting,
  DoctorTimeOffItem,
} from '../api/types';

interface Props {
  onSelectPatient?: (patientId: string) => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function DoctorAppointments({ onSelectPatient }: Props) {
  const [appointments, setAppointments] = useState<DoctorAppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'TODAY' | 'UPCOMING' | 'ALL' | 'HISTORY'>('REQUESTS');
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modals & Panels
  const [selectedQuestionnaireAppt, setSelectedQuestionnaireAppt] = useState<DoctorAppointmentItem | null>(null);
  const [rejectingAppt, setRejectingAppt] = useState<DoctorAppointmentItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [cancellingAppt, setCancellingAppt] = useState<DoctorAppointmentItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [reschedulingAppt, setReschedulingAppt] = useState<DoctorAppointmentItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('10:00');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Schedule & Availability Settings
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedules, setSchedules] = useState<DoctorScheduleSetting[]>([]);
  const [timeOffs, setTimeOffs] = useState<DoctorTimeOffItem[]>([]);
  const [newTimeOffStart, setNewTimeOffStart] = useState('');
  const [newTimeOffEnd, setNewTimeOffEnd] = useState('');
  const [newTimeOffReason, setNewTimeOffReason] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Questionnaire schema
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState<any[]>([]);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDoctorAppointments({
        filter: activeTab === 'ALL' ? undefined : activeTab,
        visitType: visitTypeFilter === 'ALL' ? undefined : visitTypeFilter,
        date: selectedDate || undefined,
      });
      setAppointments(res.appointments || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, visitTypeFilter, selectedDate]);

  const loadScheduleData = useCallback(async () => {
    try {
      const data = await getDoctorScheduleSettings();
      // Ensure all 7 days represented
      const existing = data.availabilities || [];
      const fullWeek: DoctorScheduleSetting[] = [];
      for (let day = 0; day <= 6; day++) {
        const found = existing.find((s) => s.dayOfWeek === day);
        if (found) {
          fullWeek.push(found);
        } else {
          fullWeek.push({
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            slotDurationMinutes: 30,
            isActive: day >= 1 && day <= 5, // Mon-Fri active by default
            clinicName: 'Apollo Sugar Clinic, Pune',
          });
        }
      }
      setSchedules(fullWeek);
      setTimeOffs(data.timeOffs || []);
    } catch (e) {
      console.error('Failed to load doctor schedule settings', e);
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    getQuestionnaireDefinition()
      .then((def) => setQuestionnaireQuestions(def.questions || []))
      .catch((e) => console.error('Failed to load questionnaire def', e));
  }, []);

  const handleConfirm = async (appt: DoctorAppointmentItem) => {
    setSubmittingAction(true);
    setError(null);
    try {
      await updateAppointmentStatus(appt.id, { status: 'CONFIRMED' });
      setSuccessNotice(`Appointment for ${appt.patientName} confirmed.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      await loadAppointments();
    } catch (e: any) {
      setError(e?.message || 'Failed to confirm appointment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeclineSubmit = async () => {
    if (!rejectingAppt) return;
    setSubmittingAction(true);
    setError(null);
    try {
      await updateAppointmentStatus(rejectingAppt.id, {
        status: 'DECLINED',
        rejectionReason: rejectionReason || 'Doctor unavailable at the requested time.',
      });
      setSuccessNotice(`Appointment request declined.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      setRejectingAppt(null);
      setRejectionReason('');
      await loadAppointments();
    } catch (e: any) {
      setError(e?.message || 'Failed to decline appointment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancellingAppt) return;
    setSubmittingAction(true);
    setError(null);
    try {
      await updateAppointmentStatus(cancellingAppt.id, {
        status: 'CANCELLED',
        cancellationReason: cancellationReason || 'Cancelled by clinician.',
      });
      setSuccessNotice(`Appointment cancelled.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      setCancellingAppt(null);
      setCancellationReason('');
      await loadAppointments();
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel appointment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!reschedulingAppt || !rescheduleDate || !rescheduleTime) {
      setError('Please select both a date and time to reschedule.');
      return;
    }
    setSubmittingAction(true);
    setError(null);
    try {
      const combinedIso = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();
      await updateAppointmentStatus(reschedulingAppt.id, {
        status: 'RESCHEDULED',
        newScheduledAt: combinedIso,
      });
      setSuccessNotice(`Appointment rescheduled to ${new Date(combinedIso).toLocaleString()}.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      setReschedulingAppt(null);
      setRescheduleDate('');
      await loadAppointments();
    } catch (e: any) {
      setError(e?.message || 'Failed to reschedule appointment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleMarkMissed = async (appt: DoctorAppointmentItem) => {
    setSubmittingAction(true);
    setError(null);
    try {
      await updateAppointmentStatus(appt.id, { status: 'MISSED' });
      setSuccessNotice(`Appointment for ${appt.patientName} marked missed (no-show).`);
      setTimeout(() => setSuccessNotice(null), 4000);
      await loadAppointments();
    } catch (e: any) {
      setError(e?.message || 'Failed to mark appointment missed.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSaveSchedules = async () => {
    setSavingSchedule(true);
    setError(null);
    try {
      await updateDoctorScheduleSettings(schedules);
      setSuccessNotice('Weekly practice schedule updated successfully.');
      setTimeout(() => setSuccessNotice(null), 4000);
      setShowScheduleModal(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to update schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleAddTimeOff = async () => {
    if (!newTimeOffStart || !newTimeOffEnd) {
      setError('Start date and end date are required for leave.');
      return;
    }
    setSavingSchedule(true);
    setError(null);
    try {
      const res = await createDoctorTimeOff({
        startDate: new Date(`${newTimeOffStart}T00:00:00Z`).toISOString(),
        endDate: new Date(`${newTimeOffEnd}T23:59:59Z`).toISOString(),
        reason: newTimeOffReason || 'Clinician unavailable / leave',
      });
      setTimeOffs([...timeOffs, res.timeOff]);
      setNewTimeOffStart('');
      setNewTimeOffEnd('');
      setNewTimeOffReason('');
      setSuccessNotice('Leave scheduled.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (e: any) {
      setError(e?.message || 'Failed to create time off.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteTimeOff = async (id: string) => {
    setSavingSchedule(true);
    setError(null);
    try {
      await deleteDoctorTimeOff(id);
      setTimeOffs(timeOffs.filter((to) => to.id !== id));
      setSuccessNotice('Leave deleted.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete time off.');
    } finally {
      setSavingSchedule(false);
    }
  };

  // Filtered by local search query
  const filteredAppointments = appointments.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.patientName.toLowerCase().includes(q) ||
      (a.reason && a.reason.toLowerCase().includes(q)) ||
      (a.clinicName && a.clinicName.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Pending Review</span>;
      case 'CONFIRMED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Confirmed</span>;
      case 'RESCHEDULED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200">Rescheduled</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">Completed</span>;
      case 'DECLINED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800 border border-rose-200">Declined</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200">Cancelled</span>;
      case 'MISSED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">Missed / No-Show</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-teal-600" />
            Appointments & Clinical Visits
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Review consultation requests, inspect 18-question intake assessments, manage schedules, and coordinate visits.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            loadScheduleData();
            setShowScheduleModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs"
        >
          <Clock className="h-4 w-4 text-teal-400" />
          <span>Practice Availability & Leave</span>
        </button>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Tab Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'REQUESTS', label: 'Requests', count: appointments.filter((a) => a.status === 'REQUESTED').length },
              { id: 'TODAY', label: "Today's Visits" },
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'ALL', label: 'All' },
              { id: 'HISTORY', label: 'History' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === tab.id ? 'bg-teal-800 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadAppointments}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition"
            title="Refresh appointments"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Secondary Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient, reason, clinic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={visitTypeFilter}
              onChange={(e) => setVisitTypeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Visit Types</option>
              <option value="CHECKUP">Checkup</option>
              <option value="FOLLOW_UP">Follow Up</option>
              <option value="DIABETES_REVIEW">Diabetes Review</option>
              <option value="EMERGENCY">Emergency Triage</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="text-xs text-rose-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Appointment Cards List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <RotateCcw className="h-8 w-8 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading appointments queue...</p>
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No appointments found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {activeTab === 'REQUESTS'
              ? 'There are currently no pending appointment requests requiring clinician review.'
              : 'No appointments match the active filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAppointments.map((appt) => {
            const scheduled = new Date(appt.scheduledAt);
            const hasQuestionnaire = !!appt.questionnaireResponse;

            return (
              <div
                key={appt.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
              >
                {/* Left: Patient & Clinical Visit Details */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-bold text-slate-900">{appt.patientName}</span>
                    {getStatusBadge(appt.status)}
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-teal-50 text-teal-700 border border-teal-100">
                      {appt.visitType}
                    </span>
                    {hasQuestionnaire && (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        18-Question Intake Complete
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-teal-600" />
                      {scheduled.toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      at{' '}
                      {scheduled.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ({appt.durationMinutes} mins)
                    </span>

                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {appt.clinicName}
                    </span>

                    {appt.patientDiabetesType && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        {appt.patientDiabetesType.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  {appt.reason && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-700">Clinical Reason: </span>
                      {appt.reason}
                    </p>
                  )}

                  {appt.rejectionReason && (
                    <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100">
                      <span className="font-semibold">Rejection Reason: </span>
                      {appt.rejectionReason}
                    </p>
                  )}

                  {appt.cancellationReason && (
                    <p className="text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">
                      <span className="font-semibold">Cancellation Note: </span>
                      {appt.cancellationReason}
                    </p>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-3 md:pt-0">
                  {hasQuestionnaire && (
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionnaireAppt(appt)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition flex items-center gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Review Intake</span>
                    </button>
                  )}

                  {appt.status === 'REQUESTED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleConfirm(appt)}
                        disabled={submittingAction}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Confirm</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRejectingAppt(appt)}
                        disabled={submittingAction}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                      >
                        Decline
                      </button>
                    </>
                  )}

                  {(appt.status === 'CONFIRMED' || appt.status === 'RESCHEDULED') && (
                    <>
                      {onSelectPatient && (
                        <button
                          type="button"
                          onClick={() => onSelectPatient(appt.patientId)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
                          title="Open this patient's care roster"
                        >
                          Start consulting
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleMarkMissed(appt)}
                        disabled={submittingAction}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition"
                      >
                        Missed
                      </button>
                    </>
                  )}

                  {['REQUESTED', 'CONFIRMED'].includes(appt.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setReschedulingAppt(appt);
                        setRescheduleDate(appt.scheduledAt.slice(0, 10));
                        setRescheduleTime(
                          new Date(appt.scheduledAt).toTimeString().slice(0, 5)
                        );
                      }}
                      disabled={submittingAction}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Reschedule
                    </button>
                  )}

                  {['REQUESTED', 'CONFIRMED', 'RESCHEDULED'].includes(appt.status) && (
                    <button
                      type="button"
                      onClick={() => setCancellingAppt(appt)}
                      disabled={submittingAction}
                      className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-rose-600 transition"
                      title="Cancel appointment"
                    >
                      Cancel
                    </button>
                  )}

                  {onSelectPatient && (
                    <button
                      type="button"
                      onClick={() => onSelectPatient(appt.patientId)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                      title="Open Longitudinal Patient Chart"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Pre-Visit Questionnaire Review Modal                              */}
      {/* ------------------------------------------------------------------ */}
      {selectedQuestionnaireAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  Pre-Consultation Diabetes Intake Assessment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: {selectedQuestionnaireAppt.patientName} • Visit: {selectedQuestionnaireAppt.visitType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestionnaireAppt(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Disclaimer Alert */}
            <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-start gap-3">
              <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-900 leading-relaxed">
                <strong>Clinical Protocol Notice:</strong> This 18-question screening intake was completed by the patient in accordance with the AarogyaDamu pre-consultation protocol. Answers are for clinical preparation only and do not constitute a diagnostic directive.
              </p>
            </div>

            {/* Questions & Responses Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {questionnaireQuestions.length === 0 ? (
                <div className="space-y-3">
                  {Object.entries(selectedQuestionnaireAppt.questionnaireResponse || {}).map(([key, val]) => (
                    <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700 block mb-1">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                      <span className="text-slate-900">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                questionnaireQuestions.map((q) => {
                  const answer = selectedQuestionnaireAppt.questionnaireResponse?.[q.id];
                  const hasAnswer = answer !== undefined && answer !== null && answer !== '';

                  // Check if clinical flag
                  let isFlagged = false;
                  if (q.options && Array.isArray(answer)) {
                    isFlagged = q.options.some((opt: any) => opt.isClinicalFlag && answer.includes(opt.value));
                  } else if (q.options && typeof answer === 'string') {
                    isFlagged = q.options.some((opt: any) => opt.isClinicalFlag && opt.value === answer);
                  }

                  return (
                    <div
                      key={q.id}
                      className={`p-3.5 rounded-xl border text-xs transition ${
                        isFlagged
                          ? 'bg-amber-50/70 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          Q{q.order}. {q.title}
                        </span>
                        {isFlagged && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white shrink-0 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Clinical Attention
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-sm font-semibold text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200">
                        {hasAnswer ? (
                          Array.isArray(answer) ? answer.join(', ') : String(answer)
                        ) : (
                          <span className="text-slate-400 italic">No answer provided</span>
                        )}
                      </div>

                      {q.clinicalRationale && (
                        <p className="mt-1.5 text-[11px] text-slate-500 italic">
                          Rationale: {q.clinicalRationale}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedQuestionnaireAppt(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Decline Modal with Clinical Reason                                 */}
      {/* ------------------------------------------------------------------ */}
      {rejectingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-rose-600" />
              Decline Appointment Request
            </h3>
            <p className="text-xs text-slate-600">
              Provide a reason to inform {rejectingAppt.patientName} why this appointment cannot be accepted:
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Doctor is unavailable during this time. Please request an alternate slot..."
              className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingAppt(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeclineSubmit}
                disabled={submittingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                {submittingAction ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Cancel Modal with Reason                                           */}
      {/* ------------------------------------------------------------------ */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Cancel Appointment
            </h3>
            <p className="text-xs text-slate-600">
              Reason for cancelling appointment with {cancellingAppt.patientName}:
            </p>

            <textarea
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g., Clinician scheduled for emergency surgery / hospital round..."
              className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingAppt(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancelSubmit}
                disabled={submittingAction}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                {submittingAction ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Reschedule Modal                                                   */}
      {/* ------------------------------------------------------------------ */}
      {reschedulingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              Reschedule Appointment
            </h3>
            <p className="text-xs text-slate-600">
              Select a new consultation date and time for {reschedulingAppt.patientName}:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReschedulingAppt(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRescheduleSubmit}
                disabled={submittingAction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                {submittingAction ? 'Updating...' : 'Reschedule Visit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Practice Availability & Leave Management Modal                     */}
      {/* ------------------------------------------------------------------ */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-teal-600" />
                  Practice Schedule & Availability Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure weekly working hours, slot intervals, and blocked leave dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Weekly Working Days */}
              <div>
                <h4 className="font-bold text-slate-800 text-sm mb-3">Weekly Practice Days & Hours</h4>
                <div className="space-y-2">
                  {schedules.map((sch, idx) => (
                    <div
                      key={sch.dayOfWeek}
                      className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                        sch.isActive ? 'bg-slate-50 border-slate-200' : 'bg-gray-50/70 border-gray-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 w-28">
                        <input
                          type="checkbox"
                          checked={sch.isActive}
                          onChange={(e) => {
                            const updated = [...schedules];
                            updated[idx].isActive = e.target.checked;
                            setSchedules(updated);
                          }}
                          className="h-4 w-4 rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-bold text-slate-800">{DAY_NAMES[sch.dayOfWeek]}</span>
                      </div>

                      {sch.isActive ? (
                        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                          <input
                            type="time"
                            value={sch.startTime}
                            onChange={(e) => {
                              const updated = [...schedules];
                              updated[idx].startTime = e.target.value;
                              setSchedules(updated);
                            }}
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="time"
                            value={sch.endTime}
                            onChange={(e) => {
                              const updated = [...schedules];
                              updated[idx].endTime = e.target.value;
                              setSchedules(updated);
                            }}
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                          <select
                            value={sch.slotDurationMinutes}
                            onChange={(e) => {
                              const updated = [...schedules];
                              updated[idx].slotDurationMinutes = Number(e.target.value);
                              setSchedules(updated);
                            }}
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                          >
                            <option value={15}>15 min slots</option>
                            <option value={30}>30 min slots</option>
                            <option value={45}>45 min slots</option>
                            <option value={60}>60 min slots</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Day off / Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Blocked Leave / Time Off */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 text-sm">Scheduled Leave / Blocked Dates</h4>
                <div className="space-y-2">
                  {timeOffs.length === 0 ? (
                    <p className="text-slate-400 italic p-3 bg-slate-50 rounded-xl">No active leave scheduled.</p>
                  ) : (
                    timeOffs.map((to) => (
                      <div
                        key={to.id}
                        className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-bold text-amber-900 block">
                            {new Date(to.startDate).toLocaleDateString()} to {new Date(to.endDate).toLocaleDateString()}
                          </span>
                          <span className="text-amber-700 text-[11px]">{to.reason || 'Doctor on leave'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTimeOff(to.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                          title="Remove leave"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Time Off */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="font-bold text-slate-700 block">Add Blocked Date Range:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={newTimeOffStart}
                      onChange={(e) => setNewTimeOffStart(e.target.value)}
                      className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={newTimeOffEnd}
                      onChange={(e) => setNewTimeOffEnd(e.target.value)}
                      className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Reason (e.g. Conference, Personal leave)"
                      value={newTimeOffReason}
                      onChange={(e) => setNewTimeOffReason(e.target.value)}
                      className="flex-1 min-w-[150px] p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddTimeOff}
                      disabled={savingSchedule}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Leave
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSchedules}
                disabled={savingSchedule}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                {savingSchedule ? 'Saving...' : 'Save Availability Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
