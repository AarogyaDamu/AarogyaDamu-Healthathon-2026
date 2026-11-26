import { useState, type FormEvent } from 'react';
import { AlertCircle, Lock, Mail, ShieldCheck, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login, authenticating, sessionNotice, clearSessionNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

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

    try {
      await login(normalizedEmail, password);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to authenticate.');
    }
  };

  const busy = authenticating;

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

        <div className="mb-5">
          <h2 className="text-base font-semibold text-white">Doctor Login</h2>
          <p className="mt-1 text-xs text-slate-400">
            Access is restricted to verified doctor accounts provisioned by an administrator.
          </p>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-4" noValidate>
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
                autoComplete="current-password"
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
            {authenticating ? 'Verifying account…' : 'Sign in to Doctor Workstation'}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-2 border-t border-slate-800 pt-4 text-[11px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
          <span>Only accounts verified by the AarogyaDamu API as doctors can access this application.</span>
        </div>
      </section>
    </main>
  );
}
