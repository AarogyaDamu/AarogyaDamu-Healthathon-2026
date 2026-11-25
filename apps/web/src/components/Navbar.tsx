import { type FC, useState, useEffect } from 'react';
import {
  Home,
  Activity,
  FileText,
  MessageSquare,
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

  // 5 Canonical Primary Destinations per Section 4 Information Architecture
  const primaryDestinations = [
    { id: 'home', label: 'Home', icon: Home, aliases: [] },
    { id: 'health', label: 'My Health', icon: Activity, aliases: ['glucose-devices', 'reports'] },
    { id: 'careplan', label: 'Care Plan', icon: FileText, aliases: ['journey'] },
    { id: 'caregiver', label: 'Care Team', icon: Heart, aliases: [] },
    { id: 'ask-damu', label: 'Damu', icon: MessageSquare, aliases: [] },
  ];

  if (isClinician) {
    primaryDestinations.splice(1, 0, { id: 'doctor', label: 'Doctor Hub', icon: Stethoscope, aliases: [] });
  }

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

        {/* 5 Primary Navigation Destinations */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {primaryDestinations.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id || item.aliases.includes(currentTab);
            const isDoctor = item.id === 'doctor';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                  isDoctor
                    ? isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-800 hover:bg-slate-100'
                    : isActive
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${
                    isDoctor
                      ? isActive
                        ? 'text-teal-300'
                        : 'text-slate-700'
                      : isActive
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Quick SOS Action */}
          <button
            type="button"
            onClick={() => onSelectTab('emergency')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              currentTab === 'emergency'
                ? 'bg-rose-600 text-white'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hypo Help</span>
          </button>
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