import { useState, useEffect, useRef, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import MedicalReportSourcePreview from '../components/MedicalReportSourcePreview';
import {
  Activity,
  Plus,
  FileText,
  UploadCloud,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Trash2,
  Calendar,
  Building,
  Check,
  FileCheck,
  Mic,
  MicOff,
  AlertTriangle,
  Globe,
  Radio,
  X,
  Pill,
  Info,
  Eye,
  FileDown,
  Sun,
  Moon,
  Utensils,
  HeartPulse,
  AlertOctagon,
} from 'lucide-react';

interface HealthObservation {
  id: string;
  type: string;
  numericValue: number;
  unit: string;
  context: string;
  notes?: string;
  provenance: string;
  observedAt: string;
}

interface MedicineItem {
  name: string;
  timing: string;
  purpose: string;
}

interface BiomarkerItem {
  testName: string;
  value: number;
  unit: string;
  referenceRange: string;
  status: string;
  meaning: string;
}

interface ExtractedDataPayload {
  provider?: string;
  status?: string;
  text?: string;
  error?: string;
  plainSummary?: string;
  doctor?: string;
  medicines?: MedicineItem[];
  biomarkers?: BiomarkerItem[];
  doctorAdvice?: string[];
  fileDataUrl?: string | null;
  isSynthetic?: boolean;
}

interface HealthDocument {
  id: string;
  title: string;
  category: string;
  issuingFacility?: string;
  reportDate: string;
  notes?: string;
  processingStatus: string;
  fileSizeBytes?: number;
  mimeType?: string;
  extractedData?: ExtractedDataPayload | null;
}

export default function Health() {
  const [activeTab, setActiveTab] = useState<'sugar' | 'reports'>('sugar');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Observation (Sugar Checks) States ---
  const [observations, setObservations] = useState<HealthObservation[]>([]);
  const [loadingObs, setLoadingObs] = useState(true);
  const [glucoseValue, setGlucoseValue] = useState('');
  const [glucoseContext, setGlucoseContext] = useState('FASTING');
  const [observationNotes, setObservationNotes] = useState('');
  const [submittingObs, setSubmittingObs] = useState(false);
  const [contextFilter, setContextFilter] = useState<string>('ALL');

  // --- Real Speech-to-Text States ---
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'mr-IN' | 'hi-IN' | 'en-IN'>('mr-IN');
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // --- Clinical Document States ---
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');

  // Reserved for a future explicit review step. The current OCR flow persists
  // provider output directly and never enables this panel.
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCategory, setDraftCategory] = useState<'PRESCRIPTION' | 'LAB_REPORT'>('PRESCRIPTION');
  const [draftFacility, setDraftFacility] = useState('');
  const [draftMedicines] = useState<MedicineItem[]>([]);
  const [draftBiomarkers] = useState<BiomarkerItem[]>([]);
  const [draftAdvice] = useState<string[]>([]);
  const [draftSummary] = useState('');
  const hasExtractedDraft = false;
  const [syncToTimeline, setSyncToTimeline] = useState(true);
  const savingDoc = false;

  // Modal State
  const [selectedDocForViewing, setSelectedDocForViewing] = useState<HealthDocument | null>(null);
  const [docModalTab, setDocModalTab] = useState<'summary' | 'file'>('summary');
  const [abhaBusy, setAbhaBusy] = useState<'export' | 'import' | null>(null);
  const [abhaMessage, setAbhaMessage] = useState<string | null>(null);
  const [abhaSummary, setAbhaSummary] = useState<any | null>(null);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const fetchObservations = async () => {
    try {
      const res = await apiFetch<{ observations: HealthObservation[] }>('/observations');
      setObservations(res.observations || []);
    } catch (e) {
      console.warn('Failed to load observations:', e);
    } finally {
      setLoadingObs(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await apiFetch<{ documents: HealthDocument[] }>('/documents');
      setDocuments(res.documents || []);
    } catch (e) {
      console.warn('Failed to load documents:', e);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchObservations();
    fetchDocuments();
  }, []);

  // Clean raw filenames like "DEMO_PATIENT_LAB_REPORT_1780506390000" for human readability
  const formatDocumentDisplayTitle = (raw: string, cat: string) => {
    if (!raw) return cat === 'PRESCRIPTION' ? "Doctor's Prescription Slip" : 'Blood Test Report';
    let cleaned = raw.replace(/\b\d{10,}\b/g, '').replace(/\.[^/.]+$/, '').trim();
    if (cleaned.length < 3) {
      return cat === 'PRESCRIPTION' ? "Doctor's Prescription Slip" : 'Blood Test Report';
    }
    return cleaned;
  };

  // Helper for medicine timing badges
  const parseMedicineTimingTags = (timingStr: string) => {
    const lower = (timingStr || '').toLowerCase();
    return {
      morning: lower.includes('morning') || lower.includes('breakfast') || lower.includes('सकाळी') || lower.includes('सुबह'),
      night: lower.includes('night') || lower.includes('dinner') || lower.includes('रात्री') || lower.includes('रात') || lower.includes('bedtime'),
      withFood: lower.includes('with food') || lower.includes('after meal') || lower.includes('dinner') || lower.includes('breakfast') || lower.includes('lunch'),
    };
  };

  // =========================================================
  // REAL VOICE LOGGING (Web Speech API)
  // =========================================================
  const parseSpokenText = (rawText: string) => {
    const convertedDigits = rawText.replace(/[०-९]/g, (d) =>
      '०१२३४५६७८९'.indexOf(d).toString()
    );

    const wordMap: Record<string, string> = {
      'शंभर': '100',
      'एकशे दहा': '110',
      'एकशे वीस': '120',
      'एकशे बावीस': '122',
      'एकशे तीस': '130',
      'एकशे चाळीस': '140',
      'एकशे पन्नास': '150',
      'दोनशे': '200',
    };

    let processed = convertedDigits;
    Object.entries(wordMap).forEach(([word, num]) => {
      if (processed.includes(word)) {
        processed = processed.replace(word, num);
      }
    });

    const numMatch = processed.match(/\b([4-9]\d|[1-4]\d{2})\b/);
    if (numMatch) {
      setGlucoseValue(numMatch[1]);
    }

    const lower = rawText.toLowerCase();
    if (
      lower.includes('fasting') ||
      lower.includes('morning') ||
      lower.includes('उपाशी') ||
      lower.includes('सकाळी') ||
      lower.includes('खाली पेट')
    ) {
      setGlucoseContext('FASTING');
    } else if (
      lower.includes('post') ||
      lower.includes('after') ||
      lower.includes('lunch') ||
      lower.includes('dinner') ||
      lower.includes('जेवणानंतर')
    ) {
      setGlucoseContext('POST_MEAL_2HR');
    } else if (lower.includes('before') || lower.includes('जेवणाआधी')) {
      setGlucoseContext('PRE_MEAL');
    } else if (lower.includes('bedtime') || lower.includes('झोपताना')) {
      setGlucoseContext('BEDTIME');
    }

    setObservationNotes(`Voice logged: "${rawText}"`);
  };

  const startVoiceRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Brave.');
      return;
    }

    try {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = selectedLanguage;
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setSpokenTranscript('Listening... Speak now into your microphone');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setSpokenTranscript(transcript);
        parseSpokenText(transcript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        setSpokenTranscript(`Microphone note: ${event.error}. You can also type manually.`);
      };

      recognition.onend = () => {
        setIsListening(false);
        showNotification('Voice captured! Click "Save Reading" to commit.');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      setIsListening(false);
      alert(`Could not start microphone: ${e.message}`);
    }
  };

  const handleLogObservation = async (e: FormEvent) => {
    e.preventDefault();
    const val = parseFloat(glucoseValue);
    if (isNaN(val) || val <= 0 || submittingObs) {
      alert('Please enter or speak a valid blood sugar reading.');
      return;
    }

    try {
      setSubmittingObs(true);
      await apiFetch('/observations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'BLOOD_GLUCOSE',
          numericValue: val,
          unit: 'mg/dL',
          context: glucoseContext,
          notes: observationNotes.trim() || undefined,
          observedAt: new Date().toISOString(),
        }),
      });

      setGlucoseValue('');
      setObservationNotes('');
      setSpokenTranscript('');
      showNotification('Blood glucose check saved successfully.');
      await fetchObservations();
    } catch (err: any) {
      alert(`Could not record reading: ${err.message}`);
    } finally {
      setSubmittingObs(false);
    }
  };

  // =========================================================
  // CLINICAL DOCUMENT OCR
  // =========================================================
  // The original file is uploaded to the API and processed by the configured
  // provider. Synthetic mode is explicit in the UI and never represents a real
  // patient or a clinical interpretation.
  const handleFileUpload = async (file: File) => {
    setIsScanning(true);

    try {
      setScanStep('Uploading the original report securely...');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));

      const uploadResult = await apiFetch<{ document: HealthDocument; extraction: { status: string } }>('/documents/upload-report', {
        method: 'POST',
        body: formData,
      });

      setScanStep('OCR is extracting report text; the original file stays available for comparison...');
      let completed: HealthDocument | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const current = await apiFetch<{ documents: HealthDocument[] }>('/documents');
        setDocuments(current.documents || []);
        completed = (current.documents || []).find((doc) => doc.id === uploadResult.document.id) || null;
        if (completed && completed.processingStatus !== 'PENDING') break;
      }

      if (!completed || completed.processingStatus === 'PENDING') {
        showNotification('Report saved. OCR is still processing; refresh this page to review the result.');
      } else if (completed.processingStatus === 'EXTRACTION_FAILED') {
        throw new Error(completed.notes || 'Google Cloud Vision could not extract text from this report.');
      } else {
        setSelectedDocForViewing(completed);
        setDocModalTab('summary');
        showNotification('Report processed. Review the verified OCR text before using it clinically.');
      }
    } catch (err: any) {
      alert(`Could not process document: ${err.message}`);
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  // The old client-side draft panel is intentionally disabled. Keep its form
  // handler inert so stale UI state can never commit unverified values.
  const handleConfirmAndSave = (e: FormEvent) => {
    e.preventDefault();
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to remove this saved document?')) return;
    try {
      await apiFetch(`/documents/${id}`, { method: 'DELETE' });
      showNotification('Document removed.');
      await fetchDocuments();
    } catch (err: any) {
      alert(`Failed to delete document: ${err.message}`);
    }
  };

  const runSyntheticAbhaExchange = async (operation: 'export' | 'import') => {
    setAbhaBusy(operation);
    setAbhaMessage(null);
    try {
      const result = await apiFetch<{ abhaId: string; summary: any; alreadyImported?: boolean }>(`/abha/${operation}`, {
        method: operation === 'import' ? 'POST' : 'GET',
      });
      setAbhaSummary({ ...result.summary, abhaId: result.abhaId });
      setAbhaMessage(operation === 'import'
        ? result.alreadyImported ? 'Synthetic ABHA data is already imported; your health record is up to date.' : 'Synthetic patient health imported successfully.'
        : 'Synthetic ABHA health summary is ready to review.');
      if (operation === 'import') await fetchDocuments();
    } catch (err) {
      setAbhaMessage(err instanceof Error ? err.message : 'Synthetic ABHA exchange failed.');
    } finally {
      setAbhaBusy(null);
    }
  };

  const filteredObservations = observations.filter((obs) => {
    if (contextFilter === 'ALL') return true;
    return obs.context === contextFilter;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Toast Feedback */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('sugar')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'sugar'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Sugar Checks ({observations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'reports'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Prescriptions & Reports ({documents.length})</span>
          </button>
        </div>

        {activeTab === 'reports' && (
          <span className="hidden sm:inline-flex text-[11px] font-semibold px-3 py-1 bg-teal-50 text-teal-800 rounded-full border border-teal-200 items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-teal-600" /> Smart Medical Scanner Active
          </span>
        )}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SUGAR CHECKS & REAL VOICE SPEECH RECOGNITION       */}
      {/* ========================================================= */}
      {activeTab === 'sugar' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-teal-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Mic className="h-4 w-4 text-teal-700" />
                  Voice Intake (Marathi, Hindi & English)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Tap Speak and say your reading naturally (e.g., "सकाळी उपाशीपोटी साखर 122 आहे" or "Fasting sugar 115")
                </p>
              </div>

              {/* Language Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                <Globe className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
                {[
                  { id: 'mr-IN', label: 'मराठी' },
                  { id: 'hi-IN', label: 'हिंदी' },
                  { id: 'en-IN', label: 'English' },
                ].map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.id as any)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                      selectedLanguage === lang.id
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Microphone Action Area */}
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
              <button
                type="button"
                onClick={startVoiceRecording}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs text-white shadow-xs transition shrink-0 ${
                  isListening
                    ? 'bg-rose-600 hover:bg-rose-700 animate-pulse ring-4 ring-rose-200'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{isListening ? 'Stop Listening' : 'Tap to Speak Now'}</span>
              </button>

              <div className="flex-1 text-xs">
                {isListening ? (
                  <div className="flex items-center gap-2 text-rose-700 font-semibold">
                    <Radio className="h-4 w-4 animate-spin text-rose-600" />
                    <span>Listening to microphone... Speak clearly.</span>
                  </div>
                ) : (
                  <p className="text-slate-600">
                    {spokenTranscript ? (
                      <span className="text-slate-900 font-medium">{spokenTranscript}</span>
                    ) : (
                      'Microphone is ready. Voice recognizes Marathi numbers, English, and meal timings.'
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Log Form */}
            <form onSubmit={handleLogObservation} className="grid sm:grid-cols-4 gap-3 items-end text-xs pt-2" noValidate>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Blood Sugar Level</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="20"
                    max="600"
                    required
                    placeholder="e.g. 110"
                    value={glucoseValue}
                    onChange={(e) => setGlucoseValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 pr-12 pl-3 py-2 text-xs focus:border-teal-700 focus:outline-none bg-white font-bold text-slate-900"
                  />
                  <span className="absolute right-3 top-2 text-[11px] font-semibold text-slate-400">mg/dL</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Timing / Context</label>
                <select
                  value={glucoseContext}
                  onChange={(e) => setGlucoseContext(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none bg-white font-semibold"
                >
                  <option value="FASTING">Fasting (Morning Empty Stomach)</option>
                  <option value="PRE_MEAL">Before Lunch / Dinner</option>
                  <option value="POST_MEAL_2HR">2 Hours After Meal</option>
                  <option value="BEDTIME">Bedtime</option>
                  <option value="RANDOM">Random Check</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Voice transcript or note"
                  value={observationNotes}
                  onChange={(e) => setObservationNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingObs || !glucoseValue}
                className="w-full py-2 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-xs disabled:opacity-50 transition flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>{submittingObs ? 'Saving...' : 'Save Reading'}</span>
              </button>
            </form>
          </div>

          {/* Observations Log History */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Glycemic Check History</h3>
                <p className="text-xs text-slate-500">Historical checks from voice intake, manual logs, and scanned reports</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'FASTING', label: 'Fasting' },
                  { id: 'POST_MEAL_2HR', label: 'Post-Meal' },
                  { id: 'RANDOM', label: 'Random' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setContextFilter(f.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                      contextFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loadingObs ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading blood sugar checks...</div>
            ) : filteredObservations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No readings match the selected filter. Log your first check above.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredObservations.map((obs) => {
                  const isLow = obs.numericValue < 70;
                  const isTarget = obs.numericValue >= 70 && obs.numericValue <= 180;

                  return (
                    <div key={obs.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isLow
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : isTarget
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {obs.numericValue}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {obs.numericValue} {obs.unit}
                            </span>
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {obs.context.replace(/_/g, ' ').toLowerCase()}
                            </span>
                            {obs.provenance === 'EXTRACTED_FROM_REPORT' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                Verified from Report
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(obs.observedAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                            {obs.notes ? ` • ${obs.notes}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
                            <AlertTriangle className="h-3 w-3" /> Low
                          </span>
                        ) : isTarget ? (
                          <span className="text-[11px] font-bold text-emerald-700">In Target</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                            <AlertTriangle className="h-3 w-3" /> High
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PRESCRIPTIONS & REPORTS (SMART DOCUMENT READER)   */}
      {/* ========================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-teal-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Prescriptions & Lab Reports ({documents.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Upload your paper prescription or lab test photo. Our Smart Document Reader automatically translates medical handwriting into plain, simple instructions.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-800">ABHA showcase sandbox</p>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-indigo-950">Use one click to export a patient-health summary or import the bundled synthetic health record. This is a local frontend/backend showcase only — no ABDM connection.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void runSyntheticAbhaExchange('export')} disabled={Boolean(abhaBusy)} className="rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">{abhaBusy === 'export' ? 'Preparing…' : 'Export to ABHA ID'}</button>
                  <button type="button" onClick={() => void runSyntheticAbhaExchange('import')} disabled={Boolean(abhaBusy)} className="rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">{abhaBusy === 'import' ? 'Importing…' : 'Import from ABHA ID'}</button>
                </div>
              </div>
              {abhaMessage && <p role="status" className="mt-3 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-900">{abhaMessage}</p>}
              {abhaSummary && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><div className="col-span-2 rounded-xl border border-indigo-100 bg-white p-2 sm:col-span-1"><p className="text-[10px] uppercase text-slate-500">Synthetic ABHA ID</p><p className="mt-1 text-xs font-black text-indigo-900">{abhaSummary.abhaId}</p></div>{Object.entries(abhaSummary.counts || {}).map(([key, value]) => <div key={key} className="rounded-xl border border-indigo-100 bg-white p-2"><p className="text-[10px] uppercase text-slate-500">{key}</p><p className="mt-1 text-sm font-black text-indigo-900">{String(value)}</p></div>)}</div>}
              {abhaSummary && <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3 text-xs text-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-slate-950">Synthetic patient health summary</span><span className="text-[10px] font-semibold text-indigo-700">{abhaSummary.patient?.fullName || 'Synthetic Demo Patient'}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-500">Recent readings</p><p className="mt-1">{(abhaSummary.observations || []).slice(0, 3).map((item: any) => `${item.type.replace(/_/g, ' ')} ${item.numericValue} ${item.unit}`).join(' · ') || 'No readings in summary'}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-500">Active medicines</p><p className="mt-1">{(abhaSummary.medications || []).slice(0, 3).map((item: any) => item.medicationName || item.medicineName).join(' · ') || 'No active medicines in summary'}</p></div></div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">{abhaSummary.disclaimer}</p></div>}
            </div>

            {/* DOCUMENT UPLOAD ZONE (Clean & No Demo Buttons) */}
            <div className="border-2 border-dashed border-teal-200 bg-teal-50/40 rounded-2xl p-8 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
                <UploadCloud className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Upload Prescription Photo or Lab PDF</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Take a photo of your doctor's slip or choose a PDF. We will organize your medicines, doses, and test results so they are easy to read.
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition hover:scale-[1.01] active:scale-[0.99]">
                  <FileCheck className="h-4 w-4" />
                  <span>Choose Photo or PDF File</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>

              {isScanning && (
                <div className="pt-3 flex items-center justify-center gap-2 text-xs font-semibold text-teal-800 animate-pulse">
                  <RefreshCw className="h-4 w-4 animate-spin text-teal-700" />
                  <span>{scanStep}</span>
                </div>
              )}
            </div>

            {/* DRAFT REVIEW BOX BEFORE SAVING */}
            {hasExtractedDraft && (
              <form onSubmit={handleConfirmAndSave} className="p-6 bg-white border border-teal-200 rounded-2xl shadow-xs space-y-4 text-xs animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-700" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Review Smart Medical Summary</h3>
                      <p className="text-[11px] text-slate-500">Check the extracted medicines and details before saving</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Document Title</label>
                    <input
                      type="text"
                      required
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Document Type</label>
                    <select
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none bg-white font-semibold"
                    >
                      <option value="PRESCRIPTION">Prescription Slip (Doctor's Medicines)</option>
                      <option value="LAB_REPORT">Lab Blood Test Report</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Clinic, Hospital or Lab Name</label>
                    <input
                      type="text"
                      required
                      value={draftFacility}
                      onChange={(e) => setDraftFacility(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Plain-Language Explanation */}
                {draftSummary && (
                  <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl text-slate-800 space-y-1">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                      <Info className="h-4 w-4 text-teal-700" /> In Plain Words:
                    </span>
                    <p className="text-xs leading-relaxed text-slate-700">{draftSummary}</p>
                  </div>
                )}

                {/* Prescribed Medicines (If Prescription) */}
                {draftCategory === 'PRESCRIPTION' && draftMedicines.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5 text-teal-700" /> Prescribed Medicines ({draftMedicines.length})
                    </span>
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {draftMedicines.map((med, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{med.name}</p>
                            <p className="text-[11px] text-teal-800 font-medium mt-0.5">{med.purpose}</p>
                          </div>
                          <div className="bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-800 font-semibold text-[11px]">
                            {med.timing}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lab Biomarkers (If Lab Report) */}
                {draftCategory === 'LAB_REPORT' && draftBiomarkers.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Extracted Test Results
                    </span>
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {draftBiomarkers.map((bio, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-900">{bio.testName}</p>
                            <p className="text-[11px] text-slate-500">{bio.meaning} • Ref: {bio.referenceRange}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-slate-900">
                              {bio.value} {bio.unit}
                            </span>
                            <span
                              className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${
                                bio.status === 'High' || bio.status === 'Above Target'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : bio.status === 'Low'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {bio.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-700">
                      <input
                        type="checkbox"
                        checked={syncToTimeline}
                        onChange={(e) => setSyncToTimeline(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700"
                      />
                      <span className="font-medium">
                        Sync blood sugar values directly to my Sugar Checks timeline
                      </span>
                    </label>
                  </div>
                )}

                {/* Doctor Advice */}
                {draftAdvice.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Doctor's Advice & Instructions:
                    </span>
                    <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {draftAdvice.map((adv, idx) => (
                        <li key={idx}>{adv}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                    }}
                    className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingDoc}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Check className="h-4 w-4" />
                    <span>{savingDoc ? 'Saving...' : 'Confirm & Save to My File'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SAVED DOCUMENTS ON FILE */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Saved Documents on File ({documents.length})
              </h3>

              {loadingDocs ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading stored records...</div>
              ) : documents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No prescriptions or lab reports saved yet. Click "Choose Photo or PDF File" above to add your first document.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {documents.map((doc) => {
                    const isPrescription = doc.category === 'PRESCRIPTION';
                    const medCount = doc.extractedData?.medicines?.length || 0;
                    const bioCount = doc.extractedData?.biomarkers?.length || 0;
                    const displayTitle = formatDocumentDisplayTitle(doc.title, doc.category);

                    return (
                      <div
                        key={doc.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-teal-300 transition-all shadow-2xs space-y-3 text-xs flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  isPrescription
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {isPrescription ? <Pill className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 leading-snug">{displayTitle}</h4>
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Building className="h-3 w-3 text-slate-400" />
                                  {doc.issuingFacility || 'Clinical Facility'}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 transition"
                              title="Delete record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {isPrescription && medCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-900">
                                {medCount} Prescribed Medicine(s)
                              </span>
                            )}
                            {!isPrescription && bioCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[10px] font-bold text-teal-900">
                                {bioCount} Test Result(s) Included
                              </span>
                            )}
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-medium text-slate-600 flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(doc.reportDate).toLocaleDateString('en-GB')}
                            </span>
                          </div>
                        </div>

                        {/* View Button to Open 2-Option Modal */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {isPrescription ? 'Doctor Prescription' : 'Blood Test Report'}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDocForViewing(doc);
                              setDocModalTab('summary');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold transition shadow-2xs hover:scale-[1.02]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View Medical Details</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2-OPTION ENHANCED MODAL (Smart Medical Summary vs File)   */}
      {/* ========================================================= */}
      {selectedDocForViewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                    selectedDocForViewing.category === 'PRESCRIPTION'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {selectedDocForViewing.category === 'PRESCRIPTION' ? (
                    <Pill className="h-6 w-6" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {formatDocumentDisplayTitle(selectedDocForViewing.title, selectedDocForViewing.category)}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5 text-slate-400" />
                    <span>{selectedDocForViewing.issuingFacility || 'Clinical Facility'}</span>
                    <span>•</span>
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{new Date(selectedDocForViewing.reportDate).toLocaleDateString('en-GB')}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDocForViewing(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Two Clear Options Switcher */}
            <div className="flex border-b border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setDocModalTab('summary')}
                className={`flex-1 py-3.5 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition ${
                  docModalTab === 'summary'
                    ? 'border-teal-700 text-teal-800 bg-teal-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                <span>Option 1: Smart Medical Summary (Plain Words)</span>
              </button>

              <button
                type="button"
                onClick={() => setDocModalTab('file')}
                className={`flex-1 py-3.5 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition ${
                  docModalTab === 'file'
                    ? 'border-teal-700 text-teal-800 bg-teal-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Option 2: Prescription PDF or Report Image</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* --- OPTION 1: SMART MEDICAL SUMMARY (Plain Words) --- */}
              {docModalTab === 'summary' && (
                <div className="space-y-5">
                  {/* Summary Box */}
                  <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-1.5 shadow-2xs">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                      <Info className="h-4 w-4 text-teal-700" /> What this means in plain words:
                    </span>
                    <p className="text-slate-700 leading-relaxed text-xs">
                      {selectedDocForViewing.extractedData?.plainSummary ||
                        'This document has been safely cataloged in your health records. Review the details below.'}
                    </p>
                  </div>

                  {selectedDocForViewing.extractedData?.text && (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-bold text-slate-900 text-sm">Verified OCR text</h4>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 border border-slate-200">
                          {selectedDocForViewing.extractedData.provider || 'Configured OCR provider'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        This is the provider output. Review it against the original document before making clinical decisions.
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] leading-relaxed text-slate-700 border border-slate-200">
                        {selectedDocForViewing.extractedData.text}
                      </pre>
                    </div>
                  )}

                  {/* LAB BIOMARKERS WITH VISUAL HEALTH GAUGE / METER */}
                  {selectedDocForViewing.extractedData?.biomarkers &&
                    selectedDocForViewing.extractedData.biomarkers.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-teal-700" /> Test Results & Visual Health Gauge:
                        </h4>

                        <div className="space-y-4">
                          {selectedDocForViewing.extractedData.biomarkers.map((b, idx) => {
                            const isHigh = b.status === 'High' || b.status === 'Above Target' || b.value > 180;
                            const isLow = b.status === 'Low' || b.value < 70;
                            const isNormal = !isHigh && !isLow;

                            // Calculate Gauge Position (Percentage from 40 to 300 mg/dL)
                            const gaugePct = Math.min(Math.max(((b.value - 40) / (320 - 40)) * 100, 4), 96);

                            return (
                              <div
                                key={idx}
                                className={`p-4 rounded-2xl border transition-all ${
                                  isHigh
                                    ? 'bg-rose-50/40 border-rose-200 ring-1 ring-rose-200'
                                    : isLow
                                    ? 'bg-blue-50/40 border-blue-200'
                                    : 'bg-emerald-50/30 border-emerald-200'
                                }`}
                              >
                                {/* Top Line: Test Name & Status */}
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-bold text-slate-900 text-sm">{b.testName}</p>
                                    <p className="text-slate-500 text-[11px] mt-0.5">
                                      {b.meaning} • Ref Target: {b.referenceRange}
                                    </p>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className="flex items-baseline gap-1 justify-end">
                                      <span
                                        className={`text-2xl font-extrabold ${
                                          isHigh ? 'text-rose-700' : isLow ? 'text-blue-700' : 'text-emerald-700'
                                        }`}
                                      >
                                        {b.value}
                                      </span>
                                      <span className="text-xs font-semibold text-slate-500">{b.unit}</span>
                                    </div>

                                    {/* Noticeably Color-Coded Status Badge */}
                                    <span
                                      className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                        isHigh
                                          ? 'bg-rose-600 text-white shadow-2xs'
                                          : isLow
                                          ? 'bg-blue-600 text-white shadow-2xs'
                                          : 'bg-emerald-600 text-white shadow-2xs'
                                      }`}
                                    >
                                      {isHigh ? <AlertOctagon className="h-3 w-3" /> : isLow ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                                      <span>{b.status}</span>
                                    </span>
                                  </div>
                                </div>

                                {/* VISUAL RANGE METER BAR */}
                                <div className="mt-5 pt-3 border-t border-slate-200/60 space-y-1.5">
                                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <span>Low (&lt;70)</span>
                                    <span className="text-emerald-700">Normal Target (70–130)</span>
                                    <span>Elevated (130–180)</span>
                                    <span className="text-rose-700">High (&gt;180)</span>
                                  </div>

                                  <div className="relative h-3 w-full rounded-full bg-slate-200 overflow-visible flex">
                                    <div className="h-full w-[15%] bg-blue-400 rounded-l-full" title="Low" />
                                    <div className="h-full w-[35%] bg-emerald-500" title="Target Range" />
                                    <div className="h-full w-[20%] bg-amber-400" title="Elevated" />
                                    <div className="h-full w-[30%] bg-rose-500 rounded-r-full" title="High" />

                                    {/* Pin Marker on where reading sits */}
                                    <div
                                      style={{ left: `${gaugePct}%` }}
                                      className="absolute -top-1.5 -translate-x-1/2 flex flex-col items-center"
                                    >
                                      <div
                                        className={`h-6 w-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-black text-white ${
                                          isHigh ? 'bg-rose-700 ring-2 ring-rose-300' : isLow ? 'bg-blue-700' : 'bg-emerald-700'
                                        }`}
                                      >
                                        ✓
                                      </div>
                                    </div>
                                  </div>

                                  <p className="text-[11px] text-slate-500 pt-2 text-center font-medium">
                                    {isHigh && (
                                      <span className="text-rose-700 font-bold">
                                        ⚠️ Reading is in the Red High Zone. Make sure to consult your doctor and take prescribed diabetes medication.
                                      </span>
                                    )}
                                    {isLow && (
                                      <span className="text-blue-700 font-bold">
                                        ⚠️ Reading is in the Blue Low Zone. Follow the Rule of 15 (take 15g fast sugar).
                                      </span>
                                    )}
                                    {isNormal && (
                                      <span className="text-emerald-700 font-bold">
                                        ✅ Reading is in your healthy Green Target Zone!
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* PRESCRIBED MEDICINES WITH VISUAL TIMING ORGANIZER */}
                  {selectedDocForViewing.extractedData?.medicines &&
                    selectedDocForViewing.extractedData.medicines.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <Pill className="h-4 w-4 text-amber-600" /> Prescribed Medicines & When to Take Them:
                        </h4>

                        <div className="space-y-2.5">
                          {selectedDocForViewing.extractedData.medicines.map((m, idx) => {
                            const tags = parseMedicineTimingTags(m.timing);

                            return (
                              <div
                                key={idx}
                                className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-teal-200 transition"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-extrabold text-slate-900 text-sm">{m.name}</p>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                      Active Rx
                                    </span>
                                  </div>
                                  <p className="text-xs text-teal-800 font-semibold">{m.purpose}</p>
                                </div>

                                {/* Visual Pill Schedule Badges */}
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  {tags.morning && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-bold text-[11px]">
                                      <Sun className="h-3 w-3 text-amber-600" /> Morning
                                    </span>
                                  )}
                                  {tags.night && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[11px]">
                                      <Moon className="h-3 w-3 text-indigo-600" /> Night / Dinner
                                    </span>
                                  )}
                                  {tags.withFood && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-[11px]">
                                      <Utensils className="h-3 w-3 text-emerald-600" /> With Food
                                    </span>
                                  )}
                                  <span className="bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 text-slate-800 font-bold text-[11px]">
                                    {m.timing}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Doctor's Advice Box */}
                  {selectedDocForViewing.extractedData?.doctorAdvice &&
                    selectedDocForViewing.extractedData.doctorAdvice.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <HeartPulse className="h-4 w-4 text-teal-700" />
                          Doctor's Advice & Instructions:
                        </h4>
                        <ul className="list-disc list-inside space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed text-xs">
                          {selectedDocForViewing.extractedData.doctorAdvice.map((adv, idx) => (
                            <li key={idx} className="font-medium">{adv}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}

              {/* --- OPTION 2: ORIGINAL PRESCRIPTION PDF OR REPORT IMAGE --- */}
              {docModalTab === 'file' && (
                <div className="space-y-4">
                  {selectedDocForViewing.extractedData?.fileDataUrl ? (
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-100 text-center space-y-3">
                      <img src={selectedDocForViewing.extractedData.fileDataUrl} alt="Original Document File" className="max-h-[460px] w-auto mx-auto rounded-xl shadow-xs border border-slate-300" />
                      <div className="flex justify-center pt-2"><a href={selectedDocForViewing.extractedData.fileDataUrl} download={`${selectedDocForViewing.title}.png`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"><FileDown className="h-4 w-4" /> Download Original Document Image</a></div>
                    </div>
                  ) : (
                    <MedicalReportSourcePreview documentId={selectedDocForViewing.id} title={selectedDocForViewing.title} mimeType={selectedDocForViewing.mimeType} />
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDocForViewing(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs hover:scale-[1.02]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
