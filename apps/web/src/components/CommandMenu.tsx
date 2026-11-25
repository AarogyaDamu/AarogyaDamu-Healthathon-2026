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
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-xs flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 p-4 border-b border-outline-variant/20">
          <Search className="h-5 w-5 text-on-surface-variant shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search commands, pages, or clinical actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none text-xs font-body text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 font-body">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-on-surface-variant">
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
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low hover:text-primary text-on-surface transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-surface-container group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center text-on-surface-variant transition">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-headline font-bold">{cmd.label}</p>
                      <span className="text-[10px] font-label text-on-surface-variant font-semibold">{cmd.cat}</span>
                    </div>
                  </div>

                  {/* Shortcut Hint */}
                  <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-container border border-outline-variant/30 text-[10px] font-mono font-bold text-on-surface-variant group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:text-primary">
                    {cmd.shortcut}
                  </kbd>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/20 text-[11px] text-on-surface-variant font-mono">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded text-on-surface">Esc</kbd> Close
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded text-on-surface">↵</kbd> Select
          </span>
        </div>
      </div>
    </div>
  );
}