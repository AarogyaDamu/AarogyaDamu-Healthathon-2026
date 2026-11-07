import { useState, useEffect, type FC } from 'react';
import {
  Stethoscope,
  LogOut,
  Bell,
  ShieldCheck,
  ChevronDown,
  UserCircle,
  X,
} from 'lucide-react';
import DoctorDashboard from '../pages/DoctorDashboard';
import { apiFetch } from '../api/client';

interface DoctorWorkstationProps {
  onLogout: () => Promise<void>;
  doctorName: string;
  doctorEmail: string;
  isSyntheticDemo: boolean;
  onToggleNotifications: () => void;
  unreadCount?: number;
}

export type DoctorTab = 'overview';

export const DoctorWorkstation: FC<DoctorWorkstationProps> = ({
  onLogout,
  doctorName,
  doctorEmail,
  isSyntheticDemo: _isSyntheticDemo,
  onToggleNotifications,
  unreadCount = 0,
}) => {
  const sanitizeDoctorName = (rawName?: string | null) => {
    if (!rawName) return 'Dr. Rupam Choudhary (Diabetologist)';
    const lower = rawName.toLowerCase();
    if (lower.includes('kulkarni') || lower.includes('anjali')) {
      return 'Dr. Rupam Choudhary (Diabetologist)';
    }
    return rawName;
  };

  const sanitizeDoctorEmail = (rawEmail?: string | null) => {
    if (!rawEmail) return 'dr.rc@aarogyadamu.local';
    const lower = rawEmail.toLowerCase();
    if (lower.includes('kulkarni') || lower.includes('anjali')) {
      return 'dr.rc@aarogyadamu.local';
    }
    return rawEmail;
  };

  const [clinicianInfo, setClinicianInfo] = useState<{ name: string; title: string; facility: string }>({
    name: sanitizeDoctorName(doctorName),
    title: 'Verified Doctor',
    facility: 'AarogyaDamu',
  });
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    setClinicianInfo((current) => ({
      ...current,
      name: sanitizeDoctorName(doctorName || current.name),
    }));
  }, [doctorName]);

  // Fetch clinician profile
  useEffect(() => {
    apiFetch<{ profile?: { fullName?: string; primaryClinician?: string } }>('/profile/me')
      .then((res) => {
        if (res.profile?.fullName) {
          setClinicianInfo((prev) => ({
            ...prev,
            name: sanitizeDoctorName(res.profile?.fullName || prev.name),
            facility: res.profile?.primaryClinician || prev.facility,
          }));
        }
      })
      .catch((error) => {
        console.error('Unable to load doctor profile details:', error);
      });
  }, []);

  const confirmLogout = async () => {
    setLogoutPending(true);
    setLogoutError('');
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out.');
      setLogoutPending(false);
    }
  };

  const displayName = sanitizeDoctorName(clinicianInfo.name || doctorName);
  const displayEmail = sanitizeDoctorEmail(doctorEmail);

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900 flex flex-col font-sans">
      {/* Top Clinical Enterprise Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand & Specialty */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-700 flex items-center justify-center text-white font-bold shadow-xs">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white tracking-tight leading-tight">AarogyaDamu</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mt-0.5">
                  <span>{displayName}</span>
                  <span>•</span>
                  <span>{clinicianInfo.facility}</span>
                </div>
              </div>
            </div>

            {/* Session Indicator */}

          </div>

          {/* Quick Actions & Clinician Menu */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleNotifications}
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
              title="Care Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                onClick={() => setShowAccountMenu((open) => !open)}
                className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-750"
              >
                <div className="h-6 w-6 rounded-full bg-teal-800 flex items-center justify-center text-teal-200 font-bold text-[11px]">
                  RC
                </div>
                <span className="truncate max-w-[220px]">{displayName}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
              {showAccountMenu && (
                <div
                  role="menu"
                  aria-label="Doctor account"
                  className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg"
                >
                  <div className="border-b border-slate-800 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-white">{displayName}</p>
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                    </div>
                    <p className="truncate text-xs text-slate-400 mt-0.5">{displayEmail}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowProfile(true);
                    }}
                    className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <UserCircle className="h-4 w-4 text-teal-400" />
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowLogoutConfirmation(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-300 hover:bg-rose-950/50 transition-colors"
                  >
                    <LogOut className="h-4 w-4 text-rose-400" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        <DoctorDashboard />
      </main>

      {/* Profile Modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowProfile(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-profile-title"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-400">Doctor Account</p>
                <h2 id="doctor-profile-title" className="mt-1 text-xl font-bold">Profile</h2>
              </div>
              <button
                type="button"
                aria-label="Close profile"
                onClick={() => setShowProfile(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800">
                <dt className="text-xs font-medium text-slate-400">Name</dt>
                <dd className="mt-1 font-semibold text-white">{displayName}</dd>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800">
                <dt className="text-xs font-medium text-slate-400">Email</dt>
                <dd className="mt-1 font-semibold text-white">{displayEmail}</dd>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800">
                <dt className="text-xs font-medium text-slate-400">Facility</dt>
                <dd className="mt-1 font-semibold text-white">{clinicianInfo.facility}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="doctor-logout-title"
            aria-describedby="doctor-logout-description"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl"
          >
            <h2 id="doctor-logout-title" className="text-lg font-bold">Sign out?</h2>
            <p id="doctor-logout-description" className="mt-2 text-sm text-slate-300">
              You will need to sign in again to access the Doctor Workstation.
            </p>
            {logoutError && <p role="alert" className="mt-3 text-xs text-rose-300">{logoutError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={logoutPending}
                onClick={() => setShowLogoutConfirmation(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={logoutPending}
                onClick={() => void confirmLogout()}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >
                {logoutPending ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Clinician Footer */}
      <footer className="border-t border-slate-200 bg-white py-3.5 text-center text-xs text-slate-500 font-medium">
        AarogyaDamu Healthcare Platform • Clinician Workstation v3.0 • ABDM & FHIR R4 Compliant Clinical Safety
      </footer>
    </div>
  );
};
export default DoctorWorkstation;
