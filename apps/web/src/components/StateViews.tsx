import {
  WifiOff,
  Clock,
  Search,
  ShieldAlert,
  Lock,
  Inbox,
  CheckCircle2,
} from 'lucide-react';

/* -------------------------------------------------------------
 * 1. LOADING SKELETON (NO LAYOUT SHIFT)
 * ------------------------------------------------------------- */
export function SkeletonBlock({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`space-y-2.5 animate-pulse ${className}`}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 bg-slate-200 rounded"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/* -------------------------------------------------------------
 * 2. EMPTY STATE
 * ------------------------------------------------------------- */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-300 bg-white">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-3">
        <Inbox className="h-5 w-5" />
      </div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------
 * 3. NO SEARCH RESULTS
 * ------------------------------------------------------------- */
export function NoSearchResults({
  query,
  onClear,
}: {
  query: string;
  onClear?: () => void;
}) {
  return (
    <div className="py-10 text-center bg-white rounded-xl border border-slate-200 p-6">
      <Search className="h-8 w-8 text-slate-400 mx-auto mb-2" />
      <h4 className="text-sm font-semibold text-slate-900">No records found</h4>
      <p className="mt-1 text-xs text-slate-500">
        No health logs or entries matching{' '}
        <span className="font-semibold text-slate-800">"{query}"</span>.
      </p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 text-xs font-semibold text-teal-700 hover:underline"
        >
          Reset search filter
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------
 * 4. NO INTERNET / OFFLINE PAGE
 * ------------------------------------------------------------- */
export function OfflineBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs shadow-xs">
      <div className="flex items-center gap-2.5">
        <WifiOff className="h-4 w-4 text-rose-600 shrink-0" />
        <div>
          <span className="font-semibold">Network connection offline.</span>{' '}
          <span className="text-rose-700">Displaying cached patient observations and local tasks.</span>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-3 shrink-0 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold transition"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------
 * 5. SLOW NETWORK PAGE / BANNER
 * ------------------------------------------------------------- */
export function SlowNetworkNotice() {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
      <span>High latency detected. Synchronizing clinical verification records with the server...</span>
    </div>
  );
}

/* -------------------------------------------------------------
 * 6. PERMISSION DENIED (403 CAREGIVER SCOPE)
 * ------------------------------------------------------------- */
export function PermissionDeniedView({
  requiredPermission,
  onBackToSelf,
}: {
  requiredPermission?: string;
  onBackToSelf: () => void;
}) {
  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-xl border border-slate-200 text-center space-y-4 shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <Lock className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-slate-900">Access Restricted</h3>
      <p className="text-xs text-slate-600 leading-relaxed">
        Your active caregiver delegation consent does not include authorization for{' '}
        <span className="font-semibold text-slate-800">
          {requiredPermission || 'this clinical module'}
        </span>.
      </p>
      <div className="pt-2">
        <button
          type="button"
          onClick={onBackToSelf}
          className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
        >
          Switch back to my own profile
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * 7. SESSION EXPIRED (401 DIALOG)
 * ------------------------------------------------------------- */
export function SessionExpiredModal({ onReauth }: { onReauth: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200 space-y-4 shadow-lg text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-700">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Session Expired</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your security session has expired. To maintain clinical record integrity, please authenticate again.
        </p>
        <button
          type="button"
          onClick={onReauth}
          className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
        >
          Authenticate Again
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * 8. SUCCESS STATE BANNER
 * ------------------------------------------------------------- */
export function SuccessNotification({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="font-medium">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-sm leading-none"
          aria-label="Dismiss notification"
        >
          &times;
        </button>
      )}
    </div>
  );
}