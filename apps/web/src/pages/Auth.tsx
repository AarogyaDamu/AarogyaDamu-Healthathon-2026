import { useState, type FormEvent } from 'react';
import { AlertCircle, Lock, Mail, ShieldCheck, Stethoscope, User } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'LOGIN' | 'REGISTER';

export default function AuthPage() {
  const { login, register, authenticating, sessionNotice, clearSessionNotice } = useAuth();
  const initialResetToken = new URLSearchParams(window.location.hash.slice(1)).get('resetToken') ?? '';
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(Boolean(initialResetToken));
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    clearSessionNotice();
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (mode === 'REGISTER' && fullName.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (mode === 'REGISTER' && !invitationToken.trim()) {
      setError('A valid doctor invitation is required to register.');
      return;
    }

    try {
      if (mode === 'REGISTER') {
        await register(normalizedEmail, password, fullName.trim(), invitationToken.trim());
      } else {
        await login(normalizedEmail, password);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to authenticate.');
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResetMessage('');
    setResetLoading(true);
    try {
      const response = await apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setResetMessage(response.message);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to request a password reset.');
    } finally {
      setResetLoading(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResetLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });
      setResetMessage('Password updated. Sign in with your new password.');
      setShowReset(false);
      setMode('LOGIN');
      setPassword('');
      setNewPassword('');
      setResetToken('');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Password reset failed.');
    } finally {
      setResetLoading(false);
    }
  };

  const busy = authenticating || resetLoading;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl sm:p-9">
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white shadow-lg shadow-teal-950/50">
            <Stethoscope className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-teal-300">AarogyaDamu</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Doctor Workstation</h1>
          <p className="mt-2 text-sm text-slate-400">
            Secure access for approved clinical accounts.
          </p>
        </div>

        {sessionNotice && !error && (
          <div
            role="status"
            className="mb-5 flex items-start justify-between gap-2 rounded-lg border border-amber-900 bg-amber-950/60 p-3 text-sm text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{sessionNotice}</span>
            </div>
            <button
              type="button"
              onClick={clearSessionNotice}
              className="text-xs text-amber-400 hover:text-amber-200 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resetMessage && (
          <p role="status" className="mb-5 rounded-lg border border-teal-900 bg-teal-950/50 p-3 text-sm text-teal-200">
            {resetMessage}
          </p>
        )}

        {showReset ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Reset password</h2>
              <p className="mt-1 text-xs text-slate-400">
                Request a one-time reset link or enter the token from your registered email.
              </p>
            </div>
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="reset-email">Doctor email</label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {resetLoading ? 'Requesting…' : 'Email reset link'}
              </button>
            </form>

            <form onSubmit={handlePasswordReset} className="space-y-3 border-t border-slate-800 pt-4">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="reset-token">Reset token</label>
              <input
                id="reset-token"
                type="text"
                required
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500"
              />
              <label className="block text-xs font-semibold text-slate-300" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {resetLoading ? 'Updating…' : 'Update password'}
              </button>
            </form>
            <button type="button" onClick={() => setShowReset(false)} className="w-full text-xs font-semibold text-slate-400 hover:text-white">
              Return to Doctor Login
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-950 p-1" role="tablist" aria-label="Doctor account access">
              {(['LOGIN', 'REGISTER'] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  role="tab"
                  aria-selected={mode === nextMode}
                  onClick={() => {
                    setMode(nextMode);
                    setError(null);
                    clearSessionNotice();
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                    mode === nextMode ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {nextMode === 'LOGIN' ? 'Doctor Login' : 'Doctor Registration'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4" noValidate>
              {mode === 'REGISTER' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="doctor-name">Doctor name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
                      <input
                        id="doctor-name"
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="doctor-invitation">Invitation token</label>
                    <input
                      id="doctor-invitation"
                      type="text"
                      autoComplete="off"
                      value={invitationToken}
                      onChange={(event) => setInvitationToken(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Doctor registration is invitation-only. Contact your administrator.</p>
                  </div>
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="doctor-email">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
                  <input
                    id="doctor-email"
                    name="doctor-email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="doctor@hospital.org"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearSessionNotice();
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="doctor-password">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
                  <input
                    id="doctor-password"
                    name="doctor-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'LOGIN' ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearSessionNotice();
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-950/40 transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {authenticating ? 'Verifying account…' : mode === 'LOGIN' ? 'Sign in to Doctor Workstation' : 'Create Doctor Account'}
              </button>
            </form>

            {mode === 'LOGIN' && (
              <button
                type="button"
                onClick={() => {
                  setShowReset(true);
                  setError(null);
                  setResetMessage('');
                }}
                className="mt-4 w-full text-center text-xs font-semibold text-teal-300 hover:text-teal-200"
              >
                Forgot password?
              </button>
            )}
          </>
        )}

        <div className="mt-6 flex items-start gap-2 border-t border-slate-800 pt-4 text-[11px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
          <span>Only accounts verified by the AarogyaDamu API as doctors can access this application.</span>
        </div>
      </section>
    </main>
  );
}
