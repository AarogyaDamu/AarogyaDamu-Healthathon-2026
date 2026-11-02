import { useState, useEffect } from 'react';
import {
  Search,
  Activity,
  CheckCircle2,
  Calendar,
  MessageSquare,
  FileText,
  Stethoscope,
  X,
} from 'lucide-react';

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export function CommandMenu({ isOpen, onClose, onNavigate }: CommandMenuProps) {
  const [search, setSearch] = useState('');

  // Global Keyboard Listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else window.dispatchEvent(new CustomEvent('app:open-command'));
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    { id: 'home', label: 'Home Dashboard', cat: 'Navigation', icon: Activity, shortcut: 'H' },
    { id: 'health', label: 'Log Blood Sugar / Readings', cat: 'Actions', icon: Activity, shortcut: 'S' },
    { id: 'tasks', label: 'View Today’s Care Checklist', cat: 'Navigation', icon: CheckCircle2, shortcut: 'T' },
    { id: 'timeline', label: 'Glycemic Trajectory & Milestones', cat: 'Analytics', icon: Calendar, shortcut: 'G' },
    { id: 'ask-damu', label: 'Ask Damu AI Care Companion', cat: 'AI Assistant', icon: MessageSquare, shortcut: 'D' },
    { id: 'consultation', label: 'Prepare Doctor Visit Agenda', cat: 'Clinical', icon: FileText, shortcut: 'P' },
    { id: 'clinician', label: 'Switch to Clinician OPD View', cat: 'Clinical', icon: Stethoscope, shortcut: 'C' },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.cat.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string) => {
    // 9. View Transitions API execution
    if ((document as any).startViewTransition) {
      (document as any).startViewTransition(() => {
        onNavigate(id);
      });
    } else {
      onNavigate(id);
    }
    onClose();
    setSearch('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search commands, pages, or clinical actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching commands or actions found.
            </div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => handleSelect(cmd.id)}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-teal-50/70 hover:text-teal-950 text-slate-700 transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-teal-700 group-hover:text-white flex items-center justify-center text-slate-600 transition">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">{cmd.label}</p>
                      <span className="text-[10px] text-slate-400 font-semibold">{cmd.cat}</span>
                    </div>
                  </div>

                  {/* Shortcut Hint */}
                  <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-500 group-hover:bg-teal-100 group-hover:border-teal-200">
                    {cmd.shortcut}
                  </kbd>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600">Esc</kbd> Close
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600">↵</kbd> Select
          </span>
        </div>
      </div>
    </div>
  );
}