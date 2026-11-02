import { useState, useEffect, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { SuccessNotification } from '../components/StateViews';
import {
  AlertOctagon,
  PhoneCall,
  Timer,
  MapPin,
  RotateCcw,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

export default function EmergencyNav() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [caregivers, setCaregivers] = useState<any[]>([]);

  // 15-Minute Recovery Timer
  const [timerSeconds, setTimerSeconds] = useState(15 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Form State
  const [glucoseReading, setGlucoseReading] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>(['Shakiness', 'Sweating']);
  const [actionTaken, setActionTaken] = useState('Had 3 glucose tablets (15 grams fast sugar)');
  const [logSuccess, setLogSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ hotlines: any[]; caregivers: any[] }>('/navigation/emergency-contacts')
      .then((res) => {
        setContacts(res.hotlines || []);
        setCaregivers(res.caregivers || []);
      })
      .catch((e) => console.warn('Could not load emergency contacts:', e));
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  const toggleSymptom = (sym: string) => {
    setSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const handleWhatsAppSos = () => {
    const val = glucoseReading ? `${glucoseReading} mg/dL` : 'dangerously low';
    const text = encodeURIComponent(
      `URGENT EMERGENCY ALERT: Blood sugar is ${val}. Symptoms noted: ${symptoms.join(', ')}. Rule of 15 recovery protocol initiated. Please check in or call immediately.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleLogIncident = async (e: FormEvent) => {
    e.preventDefault();
    if (!glucoseReading) return;
    try {
      setIsSubmitting(true);
      await apiFetch('/navigation/hypo-incident', {
        method: 'POST',
        body: JSON.stringify({
          glucoseValue: parseFloat(glucoseReading),
          symptoms,
          actionTaken,
        }),
      });
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 5000);
    } catch (err: any) {
      alert(`Could not log event: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {logSuccess && (
        <SuccessNotification
          message="Low sugar episode saved to your health history."
          onDismiss={() => setLogSuccess(false)}
        />
      )}

      {/* Main Urgent Callout */}
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertOctagon className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-rose-900">
              Emergency Help & Low Blood Sugar Guide
            </h2>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              If unconscious, having seizures, or unable to swallow, call an ambulance immediately. Do not force food or drinks.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleWhatsAppSos}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition shrink-0"
        >
          <MessageCircle className="h-4 w-4" /> Send WhatsApp SOS Alert
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column: Rule of 15 & Form */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <Timer className="h-5 w-5 text-teal-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">What to Do When Sugar is Low</h3>
                <p className="text-[11px] text-slate-500">For blood sugar below 70 mg/dL</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 rounded-lg bg-teal-50 border border-teal-100 flex items-start gap-2.5">
                <span className="flex h-5 w-5 rounded-full bg-teal-700 text-white font-bold text-[11px] items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-bold text-slate-900">Eat Fast-Acting Sugar</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Consume 3 to 4 glucose tablets, half a cup of sweet juice, or 1 tablespoon of honey.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="flex h-5 w-5 rounded-full bg-slate-700 text-white font-bold text-[11px] items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">Rest for 15 Minutes</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="font-mono text-2xl font-bold text-slate-900 bg-white px-3 py-1 rounded border border-slate-300">
                      {formatTimer(timerSeconds)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTimerRunning(!timerRunning)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold text-white transition ${
                        timerRunning ? 'bg-amber-700 hover:bg-amber-800' : 'bg-teal-700 hover:bg-teal-800'
                      }`}
                    >
                      {timerRunning ? 'Pause' : 'Start 15 Min Timer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerSeconds(15 * 60);
                      }}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-600"
                      title="Reset Timer"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="flex h-5 w-5 rounded-full bg-slate-700 text-white font-bold text-[11px] items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p className="font-bold text-slate-900">Re-Test Sugar</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    If still below 70 mg/dL, repeat step 1. If symptoms continue, call emergency services.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Record Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Save Low Sugar Event to History
            </h3>

            <form onSubmit={handleLogIncident} className="space-y-3 text-xs" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700">Sugar Level (mg/dL)</label>
                  <input
                    type="number"
                    required
                    value={glucoseReading}
                    onChange={(e) => setGlucoseReading(e.target.value)}
                    placeholder="e.g. 55"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-teal-700 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700">Action Taken</label>
                  <input
                    type="text"
                    required
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-teal-700 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1.5">Symptoms Experienced</label>
                <div className="flex flex-wrap gap-1.5">
                  {['Shakiness', 'Sweating', 'Dizziness', 'Confusion', 'Fast Heartbeat', 'Hunger', 'Headache'].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymptom(sym)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                        symptoms.includes(sym)
                          ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !glucoseReading}
                className="w-full rounded-lg bg-rose-700 py-2.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50 transition shadow-xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Low Sugar Record'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Hotlines & Navigation */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-rose-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Emergency Phone Numbers</h3>
                <p className="text-[11px] text-slate-500">Tap to call right now</p>
              </div>
            </div>

            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">{contact.name}</p>
                    <p className="text-[11px] text-slate-500">{contact.relationship}</p>
                  </div>
                  <a
                    href={`tel:${contact.phoneNumber}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs"
                  >
                    <PhoneCall className="h-3 w-3" /> Call {contact.phoneNumber}
                  </a>
                </div>
              ))}

              {caregivers.map((cg, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg border border-slate-200 bg-teal-50/50 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">{cg.name}</p>
                    <p className="text-[11px] text-slate-500">Family Caregiver ({cg.relationship})</p>
                  </div>
                  <span className="text-[11px] text-slate-500">{cg.email}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-teal-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Find Help Nearby</h3>
                <p className="text-[11px] text-slate-500">Open maps for places close to you</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <a
                href="https://www.google.com/maps/search/nearest+emergency+hospital/"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 transition flex items-center justify-between font-semibold text-slate-800"
              >
                <span>Nearest Hospitals</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>

              <a
                href="https://www.google.com/maps/search/nearest+blood+test+diagnostic+lab/"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 transition flex items-center justify-between font-semibold text-slate-800"
              >
                <span>Blood Test Labs</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>

              <a
                href="https://www.google.com/maps/search/nearest+24+hour+pharmacy+chemist/"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 transition flex items-center justify-between font-semibold text-slate-800"
              >
                <span>24-Hour Chemists</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>

              <a
                href="https://www.google.com/maps/search/diabetes+doctor+clinic+near+me/"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 transition flex items-center justify-between font-semibold text-slate-800"
              >
                <span>Diabetes Clinics</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}