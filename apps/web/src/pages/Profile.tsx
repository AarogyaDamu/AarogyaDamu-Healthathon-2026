import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, setActiveTargetPatientId, getActiveTargetPatientId } from '../api/client';
import { SuccessNotification, SkeletonBlock } from '../components/StateViews';
import type { CaregiverConsent, UserProfile } from '../api/types';
import { User, UserPlus, Lock, AlertCircle } from 'lucide-react';

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [consents, setConsents] = useState<CaregiverConsent[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invite Caregiver Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [caregiverEmail, setCaregiverEmail] = useState('');
  const [caregiverName, setCaregiverName] = useState('');
  const [relationship, setRelationship] = useState('DAUGHTER');
  const [permissions, setPermissions] = useState<string[]>([
    'VIEW_OBSERVATIONS',
    'VIEW_TASKS',
    'VIEW_CONSULTATIONS',
  ]);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const loadProfileData = async () => {
    try {
      setErrorMsg(null);
      const [profRes, consentRes, auditRes] = await Promise.all([
        apiFetch<{ profile: UserProfile }>('/profile'),
        apiFetch<{ consents: CaregiverConsent[] }>('/consents'),
        apiFetch<{ logs: any[] }>('/audit-logs').catch(() => ({ logs: [] })),
      ]);
      setProfile(profRes.profile || null);
      setConsents(consentRes.consents || []);
      setAuditLogs(auditRes.logs || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load profile and consent records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  const handleTogglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleInviteCaregiver = async (e: FormEvent) => {
    e.preventDefault();
    if (!caregiverEmail.trim() || !caregiverName.trim() || submittingInvite) return;

    try {
      setSubmittingInvite(true);
      await apiFetch('/consents', {
        method: 'POST',
        body: JSON.stringify({
          caregiverEmail: caregiverEmail.trim(),
          caregiverName: caregiverName.trim(),
          relationship,
          permissions,
        }),
      });
      setSuccessMsg(`Access invitation successfully extended to ${caregiverEmail}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setShowInviteModal(false);
      setCaregiverEmail('');
      setCaregiverName('');
      await loadProfileData();
    } catch (err: any) {
      alert(`Could not invite caregiver: ${err.message}`);
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRevokeConsent = async (consentId: string) => {
    if (!confirm('Are you sure you want to revoke this caregiver access?')) return;
    try {
      await apiFetch(`/consents/${consentId}`, { method: 'DELETE' });
      setSuccessMsg('Caregiver consent authorization revoked.');
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadProfileData();
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (errorMsg || !profile) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-xl text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">Profile Error</h3>
        <p className="text-xs text-slate-600">{errorMsg || 'Profile records could not be retrieved.'}</p>
        <button
          onClick={loadProfileData}
          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentActiveTarget = getActiveTargetPatientId();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {successMsg && <SuccessNotification message={successMsg} onDismiss={() => setSuccessMsg(null)} />}

      {/* Patient Profile Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 border border-teal-100 text-teal-700">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{profile.fullName}</h2>
            <p className="text-xs text-slate-500">Patient-Controlled Master Record</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Diabetes Diagnosis</span>
            <p className="font-bold text-slate-900 mt-0.5">{profile.diabetesType.replace(/_/g, ' ')}</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Primary Clinician</span>
            <p className="font-bold text-slate-900 mt-0.5">{profile.primaryClinician || 'Unassigned'}</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Target Glucose Limits</span>
            <p className="font-bold text-slate-900 mt-0.5">
              Fasting: {profile.targetFastingMin}–{profile.targetFastingMax} mg/dL • Post-Meal: &lt;{profile.targetPostMealMax} mg/dL
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Known Allergies</span>
            <p className="font-bold text-slate-900 mt-0.5">{profile.knownAllergies || 'None recorded'}</p>
          </div>
        </div>
      </div>

      {/* Caregiver Delegation Management */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Family Caregivers & Delegated Consent</h3>
            <p className="text-xs text-slate-500">Authorize family members to view observations and assist in appointment coordination</p>
          </div>
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition shadow-xs"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite Caregiver
          </button>
        </div>

        <div className="space-y-3 pt-1">
          {consents.map((c) => (
            <div key={c.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{c.caregiverName}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-slate-500 mt-0.5">{c.caregiverEmail} • {c.relationship}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.permissions?.map((p: string) => (
                    <span key={p} className="px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200 text-[10px]">
                      {p.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {c.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTargetPatientId(c.patientId);
                      setSuccessMsg(`Switched view to patient record.`);
                      setTimeout(() => window.location.reload(), 1200);
                    }}
                    className="px-3 py-1.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold transition"
                  >
                    View Record
                  </button>
                )}
                {c.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleRevokeConsent(c.id)}
                    className="px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition"
                  >
                    Revoke Consent
                  </button>
                )}
              </div>
            </div>
          ))}

          {consents.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">No active family caregiver delegations on record.</p>
          )}

          {currentActiveTarget && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
              <span className="font-medium text-amber-900">Currently operating under delegated caregiver scope.</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPatientId(null);
                  window.location.reload();
                }}
                className="px-2.5 py-1 rounded bg-amber-700 text-white font-semibold hover:bg-amber-800 transition"
              >
                Return to My Profile
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Security Audit Log Trail */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">Security & Access Audit Trail</h3>
        </div>

        <div className="space-y-2 text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="p-2.5 rounded bg-slate-50 border border-slate-200 flex justify-between">
              <div>
                <span className="font-bold text-slate-800">{log.action}</span>
                <span className="text-slate-400 ml-2">({log.entityType})</span>
              </div>
              <span className="text-slate-400 text-[11px]">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <p className="text-xs text-slate-400 py-2 text-center">No recent security events.</p>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Grant Delegated Caregiver Access
            </h3>

            <form onSubmit={handleInviteCaregiver} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Caregiver Full Name</label>
                <input
                  type="text"
                  required
                  value={caregiverName}
                  onChange={(e) => setCaregiverName(e.target.value)}
                  placeholder="e.g. Meera Joshi"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">Caregiver Email Address</label>
                <input
                  type="email"
                  required
                  value={caregiverEmail}
                  onChange={(e) => setCaregiverEmail(e.target.value)}
                  placeholder="e.g. meera@example.com"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">Relationship</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-teal-700 focus:outline-none bg-white"
                >
                  <option value="DAUGHTER">Daughter</option>
                  <option value="SON">Son</option>
                  <option value="SPOUSE">Spouse</option>
                  <option value="PRIMARY_CAREGIVER">Primary Caregiver</option>
                  <option value="TREATING_CLINICIAN">Treating Clinician</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Permissions Granted</label>
                <div className="space-y-1 bg-slate-50 p-2.5 rounded border border-slate-200">
                  {[
                    { id: 'VIEW_OBSERVATIONS', label: 'Read Blood Sugar Logs' },
                    { id: 'VIEW_TASKS', label: 'Read Care Reminders' },
                    { id: 'VIEW_CONSULTATIONS', label: 'Read Doctor Visit Summaries' },
                  ].map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={permissions.includes(p.id)}
                        onChange={() => handleTogglePermission(p.id)}
                        className="rounded border-slate-300 text-teal-700"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded px-3 py-1.5 text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="rounded bg-teal-700 px-4 py-1.5 text-white font-semibold hover:bg-teal-800 disabled:opacity-50 transition"
                >
                  {submittingInvite ? 'Authorizing...' : 'Grant Consent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}