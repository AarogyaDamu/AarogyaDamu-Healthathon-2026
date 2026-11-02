import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import type {
  CaregiverActivitiesResponse,
  CaregiverHistoryResponse,
  CareTeamMessage,
  CareNotification,
} from '../api/types';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  Lock,
  Unlock,
  Heart,
  Activity,
  Bell,
} from 'lucide-react';

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function CaregiverConnect({ onNavigate: _onNavigate }: Props) {
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Activities & History
  const [activitiesData, setActivitiesData] = useState<CaregiverActivitiesResponse | null>(null);
  const [historyData, setHistoryData] = useState<CaregiverHistoryResponse | null>(null);

  // Active Pending Tasks (Patient tasks to assist with)
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [caregiverNote, setCaregiverNote] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Messages
  const [messages, setMessages] = useState<CareTeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<CareNotification[]>([]);

  // Request Access Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestPermission, setRequestPermission] = useState('VIEW_DOCUMENTS');
  const [requestReason, setRequestReason] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Active tab in caregiver dashboard
  const [activeTab, setActiveTab] = useState<'TASKS' | 'ACTIVITIES' | 'HISTORY' | 'MESSAGES' | 'NOTICES'>('TASKS');

  useEffect(() => {
    loadCaregiverContext();
  }, []);

  const loadCaregiverContext = async () => {
    try {
      const res = await apiFetch<{ caregivingFor: any[] }>('/caregivers');
      const list = res.caregivingFor || [];
      setDependents(list);
      if (list.length > 0) {
        setSelectedPatientId(list[0].patientId);
      }
    } catch {
      setDependents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadDependentDetails(selectedPatientId);
    }
  }, [selectedPatientId]);

  const loadDependentDetails = async (patientId: string) => {
    try {
      // 1. Permitted Activities
      const acts = await apiFetch<CaregiverActivitiesResponse>(
        `/coordination/caregiver/dependents/${patientId}/activities`
      ).catch(() => null);
      setActivitiesData(acts);

      // 2. Task History
      const hist = await apiFetch<CaregiverHistoryResponse>(
        `/coordination/caregiver/dependents/${patientId}/history`
      ).catch(() => null);
      setHistoryData(hist);

      // 3. Pending tasks for patient
      const tasksRes = await apiFetch<{ tasks: any[] }>(`/tasks`).catch(() => ({ tasks: [] }));
      setPendingTasks(tasksRes.tasks.filter((t) => t.status === 'PENDING'));

      // 4. Messages
      const msgRes = await apiFetch<{ messages: CareTeamMessage[] }>(
        `/coordination/messages?patientId=${patientId}`
      ).catch(() => ({ messages: [] }));
      setMessages(msgRes.messages || []);

      // 5. Notifications
      const notifsRes = await apiFetch<{ notifications: CareNotification[] }>(
        `/coordination/notifications`
      ).catch(() => ({ notifications: [] }));
      setNotifications(notifsRes.notifications || []);
    } catch {
      // Fallback
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await apiFetch(`/care-plans/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          notes: caregiverNote.trim() || 'Completed with family caregiver assistance.',
        }),
      });
      setActionSuccess('Task marked complete with caregiver attribution.');
      setCompletingTaskId(null);
      setCaregiverNote('');
      loadDependentDetails(selectedPatientId);
    } catch (err: any) {
      alert(err.message || 'Failed to complete task.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPatientId) return;

    setSendingMessage(true);
    try {
      await apiFetch('/coordination/messages', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatientId,
          category: 'CAREGIVER_UPDATE',
          content: newMessage.trim(),
        }),
      });
      setNewMessage('');
      const msgRes = await apiFetch<{ messages: CareTeamMessage[] }>(
        `/coordination/messages?patientId=${selectedPatientId}`
      );
      setMessages(msgRes.messages || []);
    } catch (err: any) {
      alert(err.message || 'Failed to send caregiver update.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    setRequestSubmitting(true);
    setRequestSuccess(false);
    try {
      await apiFetch('/coordination/caregiver/request-access', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatientId,
          requestedPermissions: [requestPermission],
          reason: requestReason.trim() || 'Requesting access to help coordinate health records.',
        }),
      });
      setRequestSuccess(true);
      setTimeout(() => {
        setShowRequestModal(false);
        setRequestSuccess(false);
        setRequestReason('');
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to submit access request.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const activeDependent = dependents.find((d) => d.patientId === selectedPatientId) || dependents[0] || null;
  const permissions: string[] = activeDependent?.permissions || [];

  const allPossiblePermissions = [
    { id: 'VIEW_OBSERVATIONS', label: 'View Sugar Readings', desc: 'Inspect glucose observations and longitudinal trends' },
    { id: 'MANAGE_TASKS', label: 'Assist with Tasks', desc: 'Mark scheduled daily diabetes tasks as complete' },
    { id: 'MANAGE_CONSULTATIONS', label: 'Coordinate Appointments', desc: 'Book or reschedule doctor review visits' },
    { id: 'VIEW_CARE_PLAN', label: 'View Shared Care Plan', desc: 'Read doctor treatment instructions and targets' },
    { id: 'VIEW_DOCUMENTS', label: 'View Medical Reports', desc: 'Read diagnostic lab and prescription slips' },
  ];

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-xs">Loading caregiver portal...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Caregiver Portal Hero */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 rounded-2xl p-6 text-white shadow-sm border border-teal-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-teal-400/20 text-teal-300 border border-teal-400/30 uppercase">
                Caregiver Connect Portal
              </span>
              <span className="flex items-center gap-1 text-[11px] text-teal-300 font-medium">
                <Heart className="h-3.5 w-3.5 fill-teal-400 text-teal-400" /> Family Support Mode
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black mt-1">
              Coordinated Care for {activeDependent ? activeDependent.patientName : 'Family Members'}
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Assisting with daily diabetes tasks, care-plan routines, doctor appointments, and medication schedules.
            </p>
          </div>

          {/* Dependent Switcher */}
          {dependents.length > 1 && (
            <div className="bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20">
              <label className="block text-[10px] text-teal-200 font-bold uppercase mb-1">Select Loved One</label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="bg-slate-900 text-white border border-teal-500/50 rounded-lg px-3 py-1.5 text-xs font-bold"
              >
                {dependents.map((d) => (
                  <option key={d.consentId} value={d.patientId}>
                    {d.patientName} ({d.relationship})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {actionSuccess}
          </span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* Consent Permissions Matrix Ribbon */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-700" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Active Consent Permissions for {activeDependent?.patientName || 'Patient'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            className="text-[11px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 underline"
          >
            Request Missing Permission
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {allPossiblePermissions.map((perm) => {
            const hasPerm = permissions.includes(perm.id);
            return (
              <div
                key={perm.id}
                className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                  hasPerm
                    ? 'bg-teal-50/70 border-teal-200 text-teal-900'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px]">{perm.label}</span>
                  {hasPerm ? (
                    <Unlock className="h-3 w-3 text-teal-700" />
                  ) : (
                    <Lock className="h-3 w-3 text-slate-400" />
                  )}
                </div>
                <div className="text-[10px] mt-1 line-clamp-2 leading-tight">{perm.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {[
          { id: 'TASKS', label: "Today's Delegated Tasks", icon: CheckCircle2 },
          { id: 'ACTIVITIES', label: 'Permitted Care Plan Activities', icon: Activity },
          { id: 'HISTORY', label: 'Completion History', icon: Clock },
          { id: 'MESSAGES', label: 'Care Team Messages', icon: MessageSquare },
          { id: 'NOTICES', label: 'Alerts & Reminders', icon: Bell },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: TODAY'S DELEGATED TASKS */}
      {activeTab === 'TASKS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Tasks Awaiting Assistance</h2>
                <p className="text-xs text-slate-500">
                  Tasks you complete will be explicitly marked as completed by authorized family caregiver.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-xs font-bold border border-amber-200">
                {pendingTasks.length} Pending
              </span>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-500 text-xs">
                No pending tasks today. All scheduled diabetes activities are up to date!
              </div>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-teal-300 bg-white transition space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{task.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Category: {task.category.replace(/_/g, ' ')} • Due:{' '}
                          {new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {completingTaskId !== task.id && (
                        <button
                          type="button"
                          onClick={() => setCompletingTaskId(task.id)}
                          className="px-3 py-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition"
                        >
                          Assist & Complete
                        </button>
                      )}
                    </div>

                    {completingTaskId === task.id && (
                      <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg space-y-2">
                        <label className="block text-[11px] font-bold text-teal-900">
                          Caregiver Observation / Assistance Note
                        </label>
                        <input
                          type="text"
                          value={caregiverNote}
                          onChange={(e) => setCaregiverNote(e.target.value)}
                          placeholder="e.g., Assisted with glucometer reading (114 mg/dL)"
                          className="w-full bg-white border border-teal-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCompletingTaskId(null)}
                            className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompleteTask(task.id)}
                            className="px-4 py-1.5 bg-teal-800 text-white text-xs font-bold rounded-lg hover:bg-teal-700"
                          >
                            Confirm Completion
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PERMITTED CARE PLAN ACTIVITIES */}
      {activeTab === 'ACTIVITIES' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Approved Care-Plan Activities for {activeDependent?.patientName}
            </h2>
            <p className="text-xs text-slate-500">
              Only clinician-approved activities flagged for family caregiver participation are displayed.
            </p>
          </div>

          {activitiesData?.permittedActivities && activitiesData.permittedActivities.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {activitiesData.permittedActivities.map((act) => (
                <div key={act.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">{act.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                      {act.frequency.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Category: {act.category.replace(/_/g, ' ')}</div>
                  {act.targetValue && (
                    <div className="text-[11px] text-teal-800 font-semibold">Target: {act.targetValue}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
              No caregiver-eligible activities configured in the current approved care plan.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPLETION HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Caregiver Assistance Audit Trail</h2>
            <p className="text-xs text-slate-500">
              Chronological log of tasks completed on behalf of the patient with explicit attribution.
            </p>
          </div>

          {historyData?.history && historyData.history.length > 0 ? (
            <div className="space-y-2">
              {historyData.history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Completed: {item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Recently'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.completedByRole === 'CAREGIVER'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-teal-100 text-teal-900'
                      }`}
                    >
                      {item.completedByName} ({item.completedByRole})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
              No completed task history recorded yet.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CARE TEAM MESSAGES */}
      {activeTab === 'MESSAGES' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Care Team Discussion Thread</h2>
            <p className="text-xs text-slate-500">
              Communicate updates or questions directly with the attending clinician and family members.
            </p>
          </div>

          <div className="h-64 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2.5">
            {messages.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-8">
                No messages yet. Send an update about medication tolerance or activities.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                    m.senderRole === 'CAREGIVER'
                      ? 'ml-auto bg-teal-800 text-white'
                      : m.senderRole === 'DOCTOR'
                      ? 'mr-auto bg-slate-900 text-white'
                      : 'mr-auto bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 mb-1">
                    <span className="font-bold">{m.senderName} ({m.senderRole})</span>
                    <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="leading-relaxed">{m.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Send an update to the doctor (e.g. walk completed, medication taken)..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-700"
            />
            <button
              type="submit"
              disabled={sendingMessage || !newMessage.trim()}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: ALERTS & REMINDERS */}
      {activeTab === 'NOTICES' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Care Notifications & Reminders</h2>
            <p className="text-xs text-slate-500">
              Timely notifications regarding appointment schedule confirmations and doctor directives.
            </p>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
              No unread notifications at this time.
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="p-3 rounded-xl border border-slate-200 bg-white space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{n.title}</span>
                    <span className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Request Access Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              Request Additional Caregiver Permission
            </h3>
            <p className="text-xs text-slate-600">
              Ask {activeDependent?.patientName} to grant additional permissions for care coordination.
            </p>

            {requestSuccess && (
              <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">
                Access request delivered to patient's notification inbox.
              </div>
            )}

            <form onSubmit={handleRequestAccess} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Permission Scope</label>
                <select
                  value={requestPermission}
                  onChange={(e) => setRequestPermission(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                >
                  <option value="VIEW_DOCUMENTS">View Medical Reports & Slips</option>
                  <option value="MANAGE_TASKS">Manage & Complete Daily Tasks</option>
                  <option value="MANAGE_CONSULTATIONS">Coordinate Doctor Appointments</option>
                  <option value="VIEW_OBSERVATIONS">View Health Observations</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Request</label>
                <textarea
                  rows={3}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="e.g., Need to view laboratory test results to discuss with attending doctor..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestSubmitting}
                  className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {requestSubmitting ? 'Sending Request...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
