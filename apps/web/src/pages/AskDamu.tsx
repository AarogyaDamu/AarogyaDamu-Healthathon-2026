import { useState, useEffect, useRef, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import {
  Send,
  Mic,
  MicOff,
  User,
  Activity,
  CheckCircle2,
  ShieldCheck,
  Check,
  X,
  Sparkles,
  RotateCcw,
  Bell,
  TrendingUp,
  AlertOctagon,
  Clock,
  Radio,
  Target,
  FileText,
} from 'lucide-react';

interface GlucoseRecord {
  id: string;
  numericValue: number;
  unit: string;
  context: string;
  observedAt: string;
}

interface ProposalData {
  id: string;
  type: string;
  summaryText: string;
  payload: {
    title: string;
    category?: string;
    dueAt?: string;
  };
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'damu';
  text: string;
  timestamp: Date;
  records?: {
    type: string;
    items: GlucoseRecord[];
  };
  proposal?: ProposalData;
  proposalStatus?: 'PENDING' | 'CONFIRMED' | 'DISMISSED';
}

// Resilient Mascot Avatar with Multi-Path Fallback & Vector Backup
function DamuAvatar({ className = 'h-full w-full', isHero = false }: { className?: string; isHero?: boolean }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  const candidateSources = [
    '/damu-mascot.png',
    '/damu.png',
    '/assets/damu.png',
    '/damu.webp',
    '/damu.jpg',
    '/mascot.png',
  ];

  const handleImgError = () => {
    if (candidateIndex + 1 < candidateSources.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  if (allFailed) {
    return (
      <svg viewBox="0 0 100 100" className={className}>
        {/* Hamster Ears */}
        <circle cx="28" cy="28" r="15" fill="#f59e0b" />
        <circle cx="28" cy="28" r="9" fill="#fef3c7" />
        <circle cx="72" cy="28" r="15" fill="#f59e0b" />
        <circle cx="72" cy="28" r="9" fill="#fef3c7" />
        {/* Head & Body */}
        <ellipse cx="50" cy="56" rx="34" ry="32" fill="#fbbf24" />
        <ellipse cx="50" cy="62" rx="24" ry="22" fill="#fffbeb" />
        {/* Nurse Cap */}
        <path d="M 36 24 L 64 24 L 60 12 L 40 12 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 50 14 L 50 22 M 46 18 L 54 18" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
        {/* Cheeks */}
        <circle cx="31" cy="56" r="6" fill="#fca5a5" opacity="0.65" />
        <circle cx="69" cy="56" r="6" fill="#fca5a5" opacity="0.65" />
        {/* Eyes */}
        <circle cx="38" cy="48" r="4.5" fill="#1e293b" />
        <circle cx="39.5" cy="46.5" r="1.5" fill="#ffffff" />
        <circle cx="62" cy="48" r="4.5" fill="#1e293b" />
        <circle cx="63.5" cy="46.5" r="1.5" fill="#ffffff" />
        {/* Nose & Smile */}
        <ellipse cx="50" cy="53" rx="3" ry="2" fill="#f43f5e" />
        <path d="M 46 56 Q 50 60 54 56" fill="none" stroke="#78350f" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <img
      src={candidateSources[candidateIndex]}
      alt="Damu, the AI care assistant mascot"
      className={`${className} object-contain ${isHero ? '' : 'hover:scale-110 transition duration-300'}`}
      onError={handleImgError}
    />
  );
}

export default function AskDamu() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [confirmingProposalId, setConfirmingProposalId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await apiFetch<{
        reply: string;
        records?: { type: string; items: GlucoseRecord[] };
        proposal?: ProposalData;
      }>('/assistant/query', {
        method: 'POST',
        body: JSON.stringify({ prompt: text }),
      });

      const damuMsg: ChatMessage = {
        id: `damu-${Date.now()}`,
        sender: 'damu',
        text: res.reply || 'I processed your request with clinical guardrails.',
        timestamp: new Date(),
        records: res.records,
        proposal: res.proposal,
        proposalStatus: res.proposal ? 'PENDING' : undefined,
      };

      setMessages((prev) => [...prev, damuMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'damu',
        text: `Unable to complete request: ${err.message || 'Connection error'}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleConfirmProposal = async (msgId: string, proposalId: string) => {
    try {
      setConfirmingProposalId(proposalId);
      await apiFetch(`/assistant/proposals/${proposalId}/confirm`, {
        method: 'POST',
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, proposalStatus: 'CONFIRMED' } : m
        )
      );
    } catch (err: any) {
      alert(`Could not confirm care proposal: ${err.message}`);
    } finally {
      setConfirmingProposalId(null);
    }
  };

  const handleDismissProposal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'DISMISSED' } : m
      )
    );
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Brave.');
      return;
    }

    try {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(transcript);
          handleSend(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const quickPrompts = [
    {
      title: 'Explain My Care Plan',
      subtitle: 'Doctor instructions & goals',
      prompt: 'Please explain my approved diabetes care plan',
      icon: Target,
      color: 'bg-teal-50 text-teal-800 border-teal-300',
    },
    {
      title: 'Doctor Review Summary',
      subtitle: 'Prepare summary for visit',
      prompt: 'Prepare a doctor review summary for my upcoming consultation',
      icon: FileText,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    },
    {
      title: 'Recent Glucose Logs',
      subtitle: 'Summarize blood sugar readings',
      prompt: 'Summarize my recent glucose readings',
      icon: Activity,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      title: 'Today’s Care Tasks',
      subtitle: 'Review checklist & progress',
      prompt: 'What is my care plan progress and upcoming activities?',
      icon: CheckCircle2,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 h-[calc(100vh-6rem)] flex flex-col animate-in fade-in duration-300">
      {/* 1. TOP HEADER BAR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-100 via-orange-50 to-teal-50 border border-amber-200/80 p-1 flex items-center justify-center shadow-xs overflow-hidden">
              <DamuAvatar className="h-full w-full" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-200" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 leading-tight">Damu AI Care Assistant</h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-extrabold">
                <Sparkles className="h-3 w-3 text-teal-600" /> Clinical Guardrails Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
              Summarizes verified patient observations. Damu cannot diagnose or alter prescribed medications.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
              title="Reset conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            <span>ABDM FHIR-compliant</span>
          </div>
        </div>
      </div>

      {/* 2. MAIN CHAT / EMPTY STATE CONTAINER */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-y-auto p-4 sm:p-6 space-y-4 relative">
        {messages.length === 0 ? (
          /* EMPTY STATE HERO */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto py-6 text-center space-y-6 animate-in fade-in duration-300">
            {/* Mascot Centerpiece */}
            <div className="relative group cursor-pointer">
              <div className="absolute -inset-2 bg-gradient-to-r from-teal-400 via-amber-300 to-teal-300 rounded-3xl blur-md opacity-30 group-hover:opacity-60 transition duration-500 animate-pulse" />
              <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-b from-orange-50 to-amber-100/70 border border-amber-200/90 p-2 flex items-center justify-center shadow-md">
                <DamuAvatar className="h-full w-full" isHero={true} />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Namaste! How can I assist with your care plan today?
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                You can ask me to summarize blood sugars, check appointment dates, or queue care follow-ups.
              </p>
            </div>

            {/* Bento Quick-Starters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-2">
              {quickPrompts.map((qp, idx) => {
                const Icon = qp.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qp.prompt)}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-teal-300 hover:shadow-xs transition-all duration-200 text-left flex items-start gap-3 group"
                  >
                    <div className={`p-2.5 rounded-xl border ${qp.color} shrink-0 group-hover:scale-105 transition`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-teal-800 transition">
                        {qp.title}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {qp.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 flex flex-wrap justify-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-medium py-1">Quick asks:</span>
              {[
                'How is my fasting sugar?',
                'Explain HbA1c in plain words',
                'What is the Rule of 15 for hypoglycemia?',
              ].map((txt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(txt)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-600 border border-slate-200 transition font-medium text-[11px]"
                >
                  "{txt}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ACTIVE MESSAGES STREAM */
          <div className="space-y-4">
            {messages.map((m) => {
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in duration-200`}
                >
                  {/* Avatar */}
                  <div className="shrink-0">
                    {isUser ? (
                      <div className="h-8 w-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                        <User className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-xl bg-amber-100/90 border border-amber-200 p-0.5 flex items-center justify-center shadow-xs overflow-hidden">
                        <DamuAvatar className="h-full w-full" />
                      </div>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div className={`max-w-[85%] sm:max-w-xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-4 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-teal-700 text-white rounded-tr-xs font-medium'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 rounded-tl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>

                    {/* EMBEDDED GLUCOSE OBSERVATION CARDS */}
                    {m.records?.type === 'OBSERVATIONS' && m.records.items?.length > 0 && (
                      <div className="p-3.5 bg-white border border-teal-200 rounded-2xl shadow-xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Activity className="h-3.5 w-3.5 text-teal-700" /> Verified Recent Checks
                          </span>
                          <span className="text-[10px] text-teal-800 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                            {m.records.items.length} records
                          </span>
                        </div>

                        <div className="grid gap-2">
                          {m.records.items.map((rec) => {
                            const isHigh = rec.numericValue > 180;
                            const isLow = rec.numericValue < 70;

                            return (
                              <div
                                key={rec.id}
                                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                                  isHigh
                                    ? 'bg-rose-50/50 border-rose-200'
                                    : isLow
                                    ? 'bg-blue-50/50 border-blue-200'
                                    : 'bg-emerald-50/40 border-emerald-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`h-9 w-9 rounded-lg flex items-center justify-center font-black text-xs ${
                                      isHigh
                                        ? 'bg-rose-600 text-white'
                                        : isLow
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                    }`}
                                  >
                                    {rec.numericValue}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-900">
                                      {rec.numericValue} {rec.unit}
                                    </p>
                                    <p className="text-[10px] text-slate-400 capitalize">
                                      {rec.context.replace(/_/g, ' ').toLowerCase()} •{' '}
                                      {new Date(rec.observedAt).toLocaleDateString('en-IN', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                </div>

                                <div>
                                  {isHigh ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                      <TrendingUp className="h-3 w-3" /> High
                                    </span>
                                  ) : isLow ? (
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                      Low
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      <Check className="h-3 w-3" /> In Target
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {m.records.items.some((r) => r.numericValue > 180) && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-[11px] text-rose-900">
                            <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>
                              <strong>Clinical Notice:</strong> Readings above 180 mg/dL indicate elevated glucose. Hydrate well and confirm regular mealtime medication.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* EMBEDDED PROPOSAL CONFIRMATION CARD */}
                    {m.proposal && (
                      <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl shadow-xs space-y-3">
                        <div className="flex items-center gap-2 text-amber-900">
                          <Bell className="h-4 w-4 text-amber-600 shrink-0" />
                          <h4 className="font-bold text-xs">Care Plan Follow-up Proposal</h4>
                        </div>

                        <p className="text-xs text-slate-800 leading-relaxed font-medium">
                          {m.proposal.summaryText}
                        </p>

                        {m.proposalStatus === 'CONFIRMED' ? (
                          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span>Confirmed & Added to your Care Schedule!</span>
                          </div>
                        ) : m.proposalStatus === 'DISMISSED' ? (
                          <div className="p-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-medium flex items-center gap-1.5">
                            <X className="h-3.5 w-3.5" />
                            <span>Proposal dismissed</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmProposal(m.id, m.proposal!.id)}
                              disabled={confirmingProposalId === m.proposal!.id}
                              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 hover:scale-[1.02] disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{confirmingProposalId === m.proposal!.id ? 'Adding...' : 'Confirm & Add to Schedule'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDismissProposal(m.id)}
                              className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 rounded-xl text-xs font-semibold transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                      <Clock className="h-2.5 w-2.5" />
                      <span>
                        {m.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-start gap-3 animate-in fade-in duration-200">
                <div className="h-8 w-8 rounded-xl bg-amber-100/90 border border-amber-200 p-0.5 flex items-center justify-center shrink-0">
                  <DamuAvatar className="h-full w-full" />
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs flex items-center gap-2 text-xs text-slate-600">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 ml-1">Damu is reviewing clinical data...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 3. FLOATING DOCK INPUT BAR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs space-y-2 shrink-0">
        {isListening && (
          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 font-bold animate-pulse">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-rose-600" />
              <span>Listening to your voice... Speak your question clearly now.</span>
            </div>
            <button
              type="button"
              onClick={startVoiceInput}
              className="text-rose-700 underline text-[11px]"
            >
              Cancel
            </button>
          </div>
        )}

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={startVoiceInput}
            className={`p-2.5 rounded-xl transition ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-200'
                : 'bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700'
            }`}
            title="Ask by voice"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask Damu about glucose trends, appointments, or schedule reminders..."
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-teal-700 focus:bg-white focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-900 transition"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="p-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white rounded-xl transition shadow-xs shrink-0 flex items-center justify-center hover:scale-[1.02] active:scale-[0.98]"
            title="Send query"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
          <span>Damu answers from your verified health logs. Always follow physician advice.</span>
          <span className="font-semibold text-slate-500">AarogyaDamu v3.0</span>
        </div>
      </div>
    </div>
  );
}