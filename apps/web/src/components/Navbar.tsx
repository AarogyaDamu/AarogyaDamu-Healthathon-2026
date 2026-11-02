import { type FC, useState, useEffect } from 'react';
import {
  Home,
  Activity,
  CalendarClock,
  CheckSquare,
  FileText,
  MessageSquare,
  User,
  LogOut,
  AlertOctagon,
  Stethoscope,
  Heart,
  Bell,
} from 'lucide-react';
import { apiFetch } from '../api/client';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  isSyntheticDemo: boolean;
  isClinician?: boolean;
  onToggleNotifications?: () => void;
  unreadCount?: number;
}

export const Navbar: FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onLogout,
  isSyntheticDemo,
  isClinician = false,
  onToggleNotifications,
  unreadCount = 0,
}) => {
  const [liveUnread, setLiveUnread] = useState(unreadCount);

  useEffect(() => {
    apiFetch<{ unreadCount: number }>('/coordination/notifications')
      .then((res) => setLiveUnread(res.unreadCount || 0))
      .catch(() => {});
  }, [currentTab]);

  const allNavItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'health', label: 'Sugar Checks', icon: Activity },
    { id: 'journey', label: 'My Journey', icon: CalendarClock },
    { id: 'careplan', label: 'Care Plan', icon: FileText },
    { id: 'tasks', label: 'To-Do', icon: CheckSquare },
    { id: 'consultation', label: 'Visit Prep', icon: User },
    { id: 'ask-damu', label: 'Ask Damu', icon: MessageSquare },
    { id: 'caregiver', label: 'Caregiver', icon: Heart },
    { id: 'emergency', label: 'Hypo Help', icon: AlertOctagon },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  if (isClinician) {
    allNavItems.splice(4, 0, { id: 'doctor', label: 'Doctor Hub', icon: Stethoscope });
  }

  const navItems = allNavItems;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-xs">
      {isSyntheticDemo && (
        <div className="bg-amber-600 py-1 px-4 text-center text-xs font-medium tracking-wide text-white">
          Demonstration Mode: Using sample patient records for Ramesh Deshmukh
        </div>
      )}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onSelectTab('home')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white font-bold text-base shadow-xs">
            A
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">AarogyaDamu</h1>
            <p className="text-[11px] text-teal-700 font-medium">Care Companion</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex items-center gap-0.5 sm:gap-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isUrgent = item.id === 'emergency';
            const isDoctor = item.id === 'doctor';
            const isCaregiver = item.id === 'caregiver';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                  isUrgent
                    ? isActive
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-rose-700 hover:bg-rose-50'
                    : isDoctor
                    ? isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-800 hover:bg-slate-100'
                    : isCaregiver
                    ? isActive
                      ? 'bg-teal-900 text-teal-100'
                      : 'text-teal-900 hover:bg-teal-50'
                    : isActive
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${
                    isUrgent
                      ? 'text-rose-600'
                      : isDoctor
                      ? isActive
                        ? 'text-teal-300'
                        : 'text-slate-700'
                      : isCaregiver
                      ? isActive
                        ? 'text-teal-300'
                        : 'text-teal-700'
                      : isActive
                      ? 'text-teal-700'
                      : 'text-slate-500'
                  }`}
                />
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions: Notifications & Logout */}
        <div className="flex items-center gap-2">
          {onToggleNotifications && (
            <button
              type="button"
              onClick={onToggleNotifications}
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
              title="Care Notifications"
            >
              <Bell className="h-4 w-4" />
              {liveUnread > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white">
                  {liveUnread > 9 ? '9+' : liveUnread}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};