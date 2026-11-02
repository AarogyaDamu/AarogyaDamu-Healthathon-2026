import { useState, useEffect, type FC } from 'react';
import {
  Users,
  Stethoscope,
  FileText,
  Calendar,
  Mic,
  LogOut,
  Bell,
  ShieldCheck,
  ChevronDown,
  UserCircle,
  X,
} from 'lucide-react';
import DoctorDashboard from '../pages/DoctorDashboard';
import ConsultationPrep from '../pages/ConsultationPrep';
import CarePlanPage from '../pages/CarePlan';
import { apiFetch } from '../api/client';

interface DoctorWorkstationProps {
  onLogout: () => Promise<void>;
  doctorName: string;
  doctorEmail: string;
  isSyntheticDemo: boolean;
  onToggleNotifications: () => void;
  unreadCount?: number;
}

export type DoctorTab = 'overview' | 'scribe' | 'careplans' | 'consultations' | 'messages';

export const DoctorWorkstation: FC<DoctorWorkstationProps> = ({
  onLogout,
  doctorName,
  doctorEmail,
  isSyntheticDemo,
  onToggleNotifications,
  unreadCount = 0,
}) => {
  // Sync tab with URL hash for bookmarking and back/forward navigation
  const getInitialTab = (): DoctorTab => {
    const hash = window.location.hash.replace('#', '') as DoctorTab;
    if (['overview', 'scribe', 'careplans', 'consultations', 'messages'].includes(hash)) {
      return hash;
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<DoctorTab>(getInitialTab);
  const [clinicianInfo, setClinicianInfo] = useState<{ name: string; title: string; facility: string }>({
    name: doctorName,
    title: 'Verified Doctor',
    facility: 'AarogyaDamu',
  });
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    setClinicianInfo((current) => ({ ...current, name: doctorName || doctorEmail }));
  }, [doctorName, doctorEmail]);

  const handleSelectTab = (tab: DoctorTab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as DoctorTab;
      if (['overview', 'scribe', 'careplans', 'consultations', 'messages'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Fetch clinician profile
  useEffect(() => {
    apiFetch<{ profile?: { fullName?: string; primaryClinician?: string } }>('/profile/me')
      .then((res) => {
        if (res.profile?.fullName) {
          setClinicianInfo((prev) => ({
            ...prev,
            name: res.profile?.fullName || prev.name,
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

  const navItems = [
    {
      id: 'overview' as DoctorTab,
      label: 'Patient Roster & Vitals',
      subtitle: 'Risk stratification & clinical monitoring',
      icon: Users,
      badge: 'Roster',
    },
    {
      id: 'scribe' as DoctorTab,
      label: 'NEO Ambient Scribe',
      subtitle: 'AI audio consultation & SOAP notes',
      icon: Mic,
      badge: 'AI Clinician Desk',
      isHighlight: true,
    },
    {
      id: 'careplans' as DoctorTab,
      label: 'Care Plans & Goals',
      subtitle: 'Prescribe, revise & approve clinical targets',
      icon: FileText,
      badge: 'Care Plans',
    },
    {
      id: 'consultations' as DoctorTab,
      label: 'Visits & Follow-ups',
      subtitle: 'Schedule & patient consultation preps',
      icon: Calendar,
      badge: 'Appointments',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Clinician Demo Banner */}
      {isSyntheticDemo && (
        <div className="bg-amber-600/90 text-amber-50 text-xs px-4 py-1.5 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2 max-w-6xl mx-auto w-full">
            <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-800 px-1.5 py-0.5 rounded">Pilot Demo</span>
            <span>AarogyaDamu Clinical Workstation: Evaluating Ramesh Deshmukh (Type 2 Diabetes, Diagnosed 2021)</span>
          </div>
        </div>
      )}

      {/* Top Clinical Bar */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand & Specialty */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-teal-900/30 font-black text-lg">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight leading-tight">AarogyaDamu</h1>
                <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Doctor Workstation
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {clinicianInfo.name} • {clinicianInfo.facility}
              </p>
            </div>
          </div>

          {/* Quick Actions & Status */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSelectTab('scribe')}
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                activeTab === 'scribe'
                  ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-teal-800/50'
              }`}
            >
              <Mic className="h-3.5 w-3.5 text-teal-400" />
              <span>Record Consultation (NEO Scribe)</span>
            </button>

            <button
              type="button"
              onClick={onToggleNotifications}
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
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
                className="flex max-w-[190px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <UserCircle className="h-4 w-4 shrink-0 text-teal-300" />
                <span className="truncate">{clinicianInfo.name}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
              {showAccountMenu && (
                <div
                  role="menu"
                  aria-label="Doctor account"
                  className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
                >
                  <div className="border-b border-slate-800 px-3 py-2">
                    <p className="truncate text-sm font-bold text-white">{clinicianInfo.name}</p>
                    <p className="truncate text-xs text-slate-400">{doctorEmail}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowProfile(true);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    <UserCircle className="h-4 w-4 text-teal-300" />
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowLogoutConfirmation(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-300 hover:bg-rose-950/50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace with Sidebar & Content */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row px-4 sm:px-6 py-6 gap-6">
        {/* Clinician Sidebar */}
        <aside className="w-full md:w-64 shrink-0 space-y-4">
          {/* Clinician Info Card */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-sm backdrop-blur-xs">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-slate-700 border-2 border-teal-500/40 flex items-center justify-center font-bold text-teal-400 text-sm">
                AK
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <h2 className="text-sm font-bold text-white truncate">{clinicianInfo.name}</h2>
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                </div>
                <p className="text-[11px] text-teal-300/80 truncate font-medium">Verified Clinician</p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{clinicianInfo.facility}</p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Clinic Session Online
              </span>
              <span className="text-[10px] bg-slate-700/60 px-1.5 py-0.5 rounded text-slate-300">ABDM R4</span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-2 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Clinical Workspace
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-950/50 font-bold'
                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : item.isHighlight ? 'text-teal-400' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <div className="text-xs leading-tight truncate">{item.label}</div>
                      <div className={`text-[10px] leading-tight truncate mt-0.5 ${isActive ? 'text-teal-100' : 'text-slate-400'}`}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {item.isHighlight && !isActive && (
                    <span className="h-2 w-2 rounded-full bg-teal-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Clinical Standards Compliance */}
          <div className="p-3.5 bg-slate-800/30 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center gap-1.5 text-teal-400 font-semibold text-xs">
              <ShieldCheck className="h-4 w-4" />
              <span>Standard Care Thresholds</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Fasting target: <strong className="text-slate-300">80–130 mg/dL</strong> • Post-meal: <strong className="text-slate-300">&lt;180 mg/dL</strong> • Critical Hypo Alert at <strong className="text-rose-400">&lt;70 mg/dL</strong>.
            </p>
          </div>
        </aside>

        {/* Workspace Content Canvas */}
        <main className="flex-1 min-w-0 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-6 backdrop-blur-xs shadow-xl">
          {activeTab === 'overview' && (
            <div>
              <div className="mb-4 pb-3 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Assigned Patients & Glucose Stratification</h2>
                  <p className="text-xs text-slate-400">
                    Real-time clinical monitoring, glycemic risk tiers, and assigned follow-up care tasks.
                  </p>
                </div>
              </div>
              {/* DoctorDashboard in light container for optimal medical chart contrast */}
              <div className="bg-white rounded-xl text-slate-900 overflow-hidden shadow-inner p-4 sm:p-6">
                <DoctorDashboard onNavigate={(t) => {
                  if (t === 'careplan') setActiveTab('careplans');
                  else if (t === 'consultation') setActiveTab('scribe');
                }} />
              </div>
            </div>
          )}

          {activeTab === 'scribe' && (
            <div>
              <div className="mb-4 pb-3 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">NEO Ambient Medical Scribe</h2>
                    <span className="bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      AI Powered
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Patient-consented audio recording, clinical SOAP note generation, and structured diabetes medication drafting.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl text-slate-900 overflow-hidden shadow-inner p-4 sm:p-6">
                <ConsultationPrep />
              </div>
            </div>
          )}

          {activeTab === 'careplans' && (
            <div>
              <div className="mb-4 pb-3 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Diabetes Care Plan Studio</h2>
                  <p className="text-xs text-slate-400">
                    Formulate, review, and approve patient-tailored glycemic goals, medication regimens, and lifestyle targets.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl text-slate-900 overflow-hidden shadow-inner p-4 sm:p-6">
                <CarePlanPage onNavigate={() => setActiveTab('overview')} />
              </div>
            </div>
          )}

          {activeTab === 'consultations' && (
            <div>
              <div className="mb-4 pb-3 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Follow-up Consultations & Visit Prep</h2>
                  <p className="text-xs text-slate-400">
                    Inspect patient-prepared questions, symptom logs, and coordinate upcoming consultation appointments.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl text-slate-900 overflow-hidden shadow-inner p-4 sm:p-6">
                <ConsultationPrep />
              </div>
            </div>
          )}
        </main>
      </div>

      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowProfile(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-profile-title"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-300">Doctor account</p>
                <h2 id="doctor-profile-title" className="mt-1 text-xl font-bold">Profile</h2>
              </div>
              <button
                type="button"
                aria-label="Close profile"
                onClick={() => setShowProfile(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-6 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Name</dt>
                <dd className="mt-1 font-semibold">{clinicianInfo.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Email</dt>
                <dd className="mt-1 font-semibold">{doctorEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Facility</dt>
                <dd className="mt-1 font-semibold">{clinicianInfo.facility}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {showLogoutConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="doctor-logout-title"
            aria-describedby="doctor-logout-description"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
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
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={logoutPending}
                onClick={() => void confirmLogout()}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {logoutPending ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Clinician Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-3 text-center text-xs text-slate-500">
        AarogyaDamu Healthcare Platform • Clinician Workstation v3.0 • ABDM & FHIR R4 Compliant Clinical Safety
      </footer>
    </div>
  );
};
