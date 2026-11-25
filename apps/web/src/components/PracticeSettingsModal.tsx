import { useState, useEffect, type FC } from 'react';
import {
  X,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  getCurrentPractice,
  onboardPractice,
  updatePracticeProfile,
  getPracticeStaff,
  addPracticeStaff,
} from '../api/client';

interface Props {
  onClose: () => void;
  onPracticeUpdated?: () => void;
}

export const PracticeSettingsModal: FC<Props> = ({ onClose, onPracticeUpdated }) => {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'STAFF'>('PROFILE');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Practice state
  const [hasPractice, setHasPractice] = useState(false);

  // Form fields
  const [practiceName, setPracticeName] = useState('AarogyaDamu Diabetes Care Clinic');
  const [registrationNumber, setRegistrationNumber] = useState('KMC-2018-92810');
  const [council, setCouncil] = useState('Karnataka Medical Council');
  const [specialty, setSpecialty] = useState('Diabetology & General Medicine');
  const [consultationFeeInr, setConsultationFeeInr] = useState<number>(600);
  const [phone, setPhone] = useState('9845012345');
  const [address, setAddress] = useState('104, Indiranagar 100ft Road');
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [postalCode, setPostalCode] = useState('560038');
  const [savingProfile, setSavingProfile] = useState(false);

  // Staff state
  const [staff, setStaff] = useState<any[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'RECEPTIONIST' | 'DOCTOR'>('RECEPTIONIST');
  const [addingStaff, setAddingStaff] = useState(false);

  const loadAll = async () => {
    setError(null);
    try {
      const pRes = await getCurrentPractice();
      setHasPractice(pRes.hasPractice);
      if (pRes.hasPractice && pRes.practice) {
        setPracticeName(pRes.practice.name || '');
        setRegistrationNumber(pRes.practice.registrationNumber || '');
        setCouncil(pRes.practice.council || 'Karnataka Medical Council');
        setSpecialty(pRes.practice.specialty || 'Diabetology');
        setConsultationFeeInr(pRes.practice.consultationFeeInr || 600);
        setPhone(pRes.practice.phone || '');
        setAddress(pRes.practice.address || '');
        setCity(pRes.practice.city || 'Bengaluru');
        setState(pRes.practice.state || 'Karnataka');
        setPostalCode(pRes.practice.postalCode || '560038');

        // Load staff
        const staffRes = await getPracticeStaff().catch(() => ({ success: false, staff: [] }));
        if (staffRes.success) setStaff(staffRes.staff);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load practice settings');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (!hasPractice) {
        await onboardPractice({
          fullName: 'Dr. Clinician',
          practiceName,
          registrationNumber,
          council,
          specialty,
          qualifications: 'MBBS, MD',
          consultationFeeInr,
          phone,
          address,
          city,
          state,
          postalCode,
          workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
        });
        setSuccessMessage('Practice onboarded successfully!');
      } else {
        await updatePracticeProfile({
          practiceName,
          registrationNumber,
          council,
          specialty,
          consultationFeeInr,
          phone,
          address,
          city,
          state,
          postalCode,
        });
        setSuccessMessage('Practice profile updated successfully.');
      }
      await loadAll();
      if (onPracticeUpdated) onPracticeUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save practice profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail.trim()) return;
    setAddingStaff(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await addPracticeStaff(newStaffEmail.trim(), newStaffRole);
      setSuccessMessage(`Added ${newStaffRole} account for ${newStaffEmail}`);
      setNewStaffEmail('');
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to add staff member');
    } finally {
      setAddingStaff(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white bg-surface-container-lowest shadow-2xl border border-outline-variant/30 overflow-hidden my-8 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-4 bg-surface-container-low/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-headline font-bold text-on-surface">Practice & Staff Management</h2>
              <p className="text-xs font-body text-on-surface-variant">Clinician onboarding, practice details, and clinic staff access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-low/50 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-label font-bold transition ${
              activeTab === 'PROFILE'
                ? 'border-primary text-primary bg-surface-container-lowest rounded-t-xl'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Building2 className="h-4 w-4" /> Practice Profile
          </button>
          <button
            onClick={() => setActiveTab('STAFF')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-label font-bold transition ${
              activeTab === 'STAFF'
                ? 'border-primary text-primary bg-surface-container-lowest rounded-t-xl'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Users className="h-4 w-4" /> Staff Accounts ({staff.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-error-container/40 border border-error/30 rounded-xl text-xs font-body text-error flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-body text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              {successMessage}
            </div>
          )}

          {/* TAB 1: PRACTICE PROFILE */}
          {activeTab === 'PROFILE' && (
            <form onSubmit={handleSaveProfile} className="space-y-4 font-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">
                    Clinic / Practice Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">
                    Medical Council Registration No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="e.g. KMC-2018-92810"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Medical Council *</label>
                  <input
                    type="text"
                    required
                    value={council}
                    onChange={(e) => setCouncil(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Clinical Specialty *</label>
                  <input
                    type="text"
                    required
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">
                    Default Consultation Fee (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={consultationFeeInr}
                    onChange={(e) => setConsultationFeeInr(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Clinic Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Mobile / Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">PIN Code</label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary px-6 py-2.5 text-xs font-label font-bold hover:opacity-95 shadow-md shadow-primary/20 transition-all disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : hasPractice ? 'Update Practice Profile' : 'Complete Onboarding'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: STAFF MANAGEMENT */}
          {activeTab === 'STAFF' && (
            <div className="space-y-5">
              {/* Add Staff Member Form */}
              <form onSubmit={handleAddStaff} className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/70 space-y-3 font-body">
                <h4 className="text-sm font-headline font-bold text-on-surface">Add Staff Account</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">
                      Staff Member Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="receptionist@aarogyadamu.local"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Role</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                      className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body font-medium text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    >
                      <option value="RECEPTIONIST">Receptionist (Admin & Billing Only)</option>
                      <option value="DOCTOR">Associate Doctor (Full Clinical)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={addingStaff}
                    className="rounded-xl bg-primary text-on-primary px-4 py-2 text-xs font-label font-bold hover:bg-primary-container transition disabled:opacity-50 shadow-sm"
                  >
                    {addingStaff ? 'Adding...' : 'Grant Practice Access'}
                  </button>
                </div>
              </form>

              {/* Current Staff List */}
              <div className="rounded-2xl border border-outline-variant/30 overflow-hidden font-body shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container-low font-label font-bold text-on-surface-variant uppercase tracking-wider text-[11px] border-b border-outline-variant/20">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    {staff.map((s) => (
                      <tr key={s.membershipId} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-on-surface">{s.fullName}</td>
                        <td className="px-4 py-2.5 text-on-surface-variant">{s.email}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-label font-bold text-[10px] ${
                              s.role === 'OWNER'
                                ? 'bg-amber-100 text-amber-800'
                                : s.role === 'DOCTOR'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'bg-surface-container-highest text-on-surface-variant'
                            }`}
                          >
                            {s.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-on-surface-variant font-mono">
                          {new Date(s.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/20 px-6 py-4 bg-surface-container-low/50 flex items-center justify-between font-body">
          <div className="text-xs text-on-surface-variant">
            AarogyaDamu Healthcare Practice Platform • Synthetic-Data Pilot Ready
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-1.5 text-xs font-label font-semibold text-on-surface hover:bg-surface-container transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
export default PracticeSettingsModal;
