import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import AuthPage from './pages/Auth';
import { DoctorWorkstation } from './components/DoctorWorkstation';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api/client';

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export default function App() {
  const { user, profile, token, loading, accessDenied, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await apiFetch<{
        unreadCount: number;
        notifications: NotificationRecord[];
      }>('/coordination/notifications');
      setNotifications(response.notifications ?? []);
      setUnreadCount(response.unreadCount ?? 0);
    } catch (error) {
      console.error('Unable to load doctor notifications:', error);
    }
  }, []);

  useEffect(() => {
    if (user?.isClinician) {
      void fetchNotifications();
    }
  }, [fetchNotifications, user?.id, user?.isClinician]);

  useEffect(() => {
    if (loading) return;

    const path = window.location.pathname;
    if (token && user?.isClinician) {
      if (path !== '/') {
        window.history.replaceState(null, '', `/${window.location.hash}`);
      }
      return;
    }

    if (path !== '/' && path !== '/login') {
      window.history.replaceState(null, '', '/login');
    }
  }, [loading, token, user?.id, user?.isClinician]);

  const handleLogout = useCallback(async () => {
    await logout();
    setShowNotifications(false);
    setNotifications([]);
    setUnreadCount(0);
  }, [logout]);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/coordination/notifications/read-all', { method: 'POST' });
      await fetchNotifications();
    } catch (error) {
      console.error('Unable to mark doctor notifications as read:', error);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
          <span>Verifying doctor session…</span>
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-rose-900/70 bg-slate-900 p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold">Doctor access required</h1>
          <p className="mt-3 text-sm text-slate-300">
            This account is not authorized to use the Doctor Workstation. Sign in with an approved doctor account.
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            onClick={() => void logout()}
          >
            Go to Doctor Login
          </button>
        </section>
      </main>
    );
  }

  if (!token || !user?.isClinician) {
    return <AuthPage />;
  }

  return (
    <div>
      <DoctorWorkstation
        onLogout={handleLogout}
        doctorName={
          profile?.fullName && !profile.fullName.toLowerCase().includes('kulkarni') && !profile.fullName.toLowerCase().includes('anjali')
            ? profile.fullName
            : (user.email && !user.email.toLowerCase().includes('kulkarni') && !user.email.toLowerCase().includes('anjali')
                ? user.email
                : 'Dr. Rupam Choudhary (Diabetologist)')
        }
        doctorEmail={user.email && !user.email.toLowerCase().includes('kulkarni') ? user.email : 'dr.rc@aarogyadamu.local'}
        isSyntheticDemo={Boolean(user.isSyntheticDemo)}
        onToggleNotifications={() => setShowNotifications(true)}
        unreadCount={unreadCount}
      />

      {showNotifications && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <section
            aria-label="Doctor notifications"
            className="flex h-full w-full max-w-sm flex-col bg-white p-5 text-slate-900 shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-bold">Notifications</h2>
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleMarkAllRead()}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close notifications"
                  onClick={() => setShowNotifications(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto py-4">
              {notifications.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No notifications at this time.</p>
              ) : notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`space-y-1 rounded-xl border p-3 text-xs ${
                    notification.isRead
                      ? 'border-slate-200 bg-white text-slate-600'
                      : 'border-teal-200 bg-teal-50 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">{notification.title}</h3>
                    <time className="shrink-0 text-[10px] text-slate-500">
                      {new Date(notification.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{notification.message}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
