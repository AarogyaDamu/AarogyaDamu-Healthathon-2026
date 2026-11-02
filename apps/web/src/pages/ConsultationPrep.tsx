import { useState, useEffect, useRef, type FormEvent } from 'react';
import { apiFetch, setActiveTargetPatientId } from '../api/client';
import {
  Stethoscope,
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Check,
  Pill,
  Edit3,
  ShieldCheck,
  Radio,
  FileCheck,
  Send,
} from 'lucide-react';

interface SpeakerSegment {
  speaker: 'Doctor' | 'Patient';
  text: string;
  timestamp?: string;
}

interface StructuredClinicalNote {
  chiefComplaint: string;
  symptoms: string[];
  historyOfPresentIllness: string;
  relevantMedicalHistory: string[];
  currentMedications: Array<{ name: string; dose?: string; frequency?: string }>;
  allergies: string[];
  examinationFindings: string[];
  clinicalAssessment: string;
  investigationsOrdered: string[];
  treatmentPlan: string[];
  followUpInstructions: string;
  uncertainOrMissingInformation: string[];
}

interface AuthorizedConsultation {
  id: string;
  scheduledAt: string;
  clinicianName: string;
  facilityName: string;
}

interface AuthorizedPatient {
  id: string;
  fullName: string;
  diabetesType: string;
  consultations: AuthorizedConsultation[];
}

export default function ConsultationPrep() {
  const [activeTab, setActiveTab] = useState<'scribe' | 'prep'>('scribe');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Patient Context
  const [authorizedPatients, setAuthorizedPatients] = useState<AuthorizedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [consultationId, setConsultationId] = useState('');
  const [patientLoadError, setPatientLoadError] = useState('');

  // Scribe State
  const [consentObtained, setConsentObtained] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState('');

  // Scribe Outputs
  const [draftId, setDraftId] = useState<string | null>(null);
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [clinicalNote, setClinicalNote] = useState<StructuredClinicalNote | null>(null);
  const [editableAssessment, setEditableAssessment] = useState('');
  const [editablePlan, setEditablePlan] = useState('');
  const [savingApproval, setSavingApproval] = useState(false);
  const [processingError, setProcessingError] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  // Patient Visit Prep State
  const [concerns, setConcerns] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);
  const recordingSecondsRef = useRef(0);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4500);
  };

  const selectedPatient = authorizedPatients.find((patient) => patient.id === selectedPatientId);
  const selectedConsultation = selectedPatient?.consultations.find((item) => item.id === consultationId);

  useEffect(() => {
    apiFetch<{ patients: AuthorizedPatient[] }>('/scribe/patients')
      .then((response) => {
        setAuthorizedPatients(response.patients);
        setSelectedPatientId(response.patients[0]?.id ?? '');
        setConsultationId(response.patients[0]?.consultations[0]?.id ?? '');
      })
      .catch((error: unknown) => {
        setPatientLoadError(error instanceof Error ? error.message : 'Authorized patient list could not be loaded.');
      });
  }, []);

  useEffect(() => {
    setActiveTargetPatientId(selectedPatientId || null);
    setConsultationId(selectedPatient?.consultations[0]?.id ?? '');
    setConsentObtained(false);
    setDraftId(null);
    setClinicalNote(null);
    setSegments([]);
  }, [selectedPatientId]);

  // Timer for recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const processRecording = async (blob: Blob, mimeType: string, durationSeconds: number, sessionId: string) => {
    if (blob.size > 10 * 1024 * 1024) {
      setProcessingError('This recording exceeds the 10 MB upload limit. It was not uploaded; start a shorter recording.');
      setCanRetry(false);
      return;
    }

    setProcessing(true);
    setProcessingError('');
    setCanRetry(false);
    setProcessStep('Uploading the recording securely to the configured clinical transcription provider...');

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The recording could not be read for upload.'));
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('The recording could not be encoded for upload.'));
            return;
          }
          resolve(reader.result.slice(reader.result.indexOf(',') + 1));
        };
        reader.readAsDataURL(blob);
      });

      const response = await apiFetch<{ session: {
        id: string;
        status: string;
        transcript: string;
        segments: SpeakerSegment[];
        structuredNote: StructuredClinicalNote;
      } }>(`/scribe/sessions/${sessionId}/process`, {
        method: 'POST',
        body: JSON.stringify({ audioBase64: base64, mimeType, durationSeconds }),
      });

      setDraftId(response.session.id);
      setSegments(response.session.segments);
      setClinicalNote(response.session.structuredNote);
      setEditableAssessment(response.session.structuredNote.clinicalAssessment || '');
      setEditablePlan(response.session.structuredNote.treatmentPlan.join('\n'));
      setCanRetry(false);
      showNotification('AI-generated draft is ready for clinician review. It has not been approved or added to the timeline.');
    } catch (error: unknown) {
      setProcessingError(error instanceof Error ? error.message : 'Transcription failed. No clinical note was approved.');
      setCanRetry(true);
    } finally {
      setProcessing(false);
      setProcessStep('');
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (!consentObtained) {
      alert('Obtain the patient’s explicit consent before starting any recording.');
      return;
    }
    if (!selectedPatient || !selectedConsultation) {
      alert('Select an authorized patient and consultation before recording.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setProcessingError('This browser does not support secure audio recording. No recording was started.');
      return;
    }

    let sessionId: string | null = null;
    try {
      const created = await apiFetch<{ session: { id: string } }>('/scribe/sessions', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.id,
          consultationId: selectedConsultation.id,
          consentObtained: true,
          consentVersion: 'scribe-consent-v1',
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      sessionId = created.session.id;
      sessionIdRef.current = sessionId;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      cancelRequestedRef.current = false;
      audioBlobRef.current = null;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setProcessingError('Recording was interrupted. The audio has not been uploaded.');
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const duration = Math.max(1, Math.ceil((Date.now() - (recordingStartedAtRef.current ?? Date.now())) / 1000));
        recordingStartedAtRef.current = null;
        setIsRecording(false);
        if (cancelRequestedRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          setProcessingError('No audio was captured. The session remains an unsaved draft.');
          return;
        }
        audioBlobRef.current = blob;
        recordingSecondsRef.current = duration;
        void processRecording(blob, recorder.mimeType || 'audio/webm', duration, sessionId as string);
      };
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start(1000);
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setProcessingError('');
      setIsRecording(true);
    } catch (error: unknown) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (sessionId) {
        await apiFetch(`/scribe/sessions/${sessionId}/cancel`, { method: 'POST' }).catch(() => undefined);
      }
      setProcessingError(error instanceof Error ? error.message : 'Microphone access failed; no recording was started.');
    }
  };

  const cancelRecording = async () => {
    cancelRequestedRef.current = true;
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await apiFetch(`/scribe/sessions/${sessionId}/cancel`, { method: 'POST' });
      setProcessingError('Recording cancelled. No audio was uploaded.');
    } catch (error: unknown) {
      setProcessingError(error instanceof Error ? error.message : 'Recording stopped, but cancellation could not be confirmed by the server.');
    }
  };

  const retryProcessing = () => {
    const blob = audioBlobRef.current;
    const sessionId = sessionIdRef.current;
    if (blob && sessionId) {
      void processRecording(blob, blob.type || 'audio/webm', recordingSecondsRef.current, sessionId);
    }
  };

  // Speaker label correction
  const handleToggleSpeaker = (index: number) => {
    const updated = [...segments];
    updated[index].speaker = updated[index].speaker === 'Doctor' ? 'Patient' : 'Doctor';
    setSegments(updated);
  };

  // Spoken text correction
  const handleTextChange = (index: number, newText: string) => {
    const updated = [...segments];
    updated[index].text = newText;
    setSegments(updated);
  };

  // Doctor Approval: Commits to patient database and timeline
  const handleApproveNote = async () => {
    if (!draftId || !clinicalNote) return;

    try {
      setSavingApproval(true);
      setActiveTargetPatientId(selectedPatientId);
      const updatedNote: StructuredClinicalNote = {
        ...clinicalNote,
        clinicalAssessment: editableAssessment,
        treatmentPlan: editablePlan.split('\n').filter(Boolean),
      };

      await apiFetch(`/scribe/${draftId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          editedStructuredNote: updatedNote,
          editedSegments: segments,
        }),
      });

      showNotification('Consultation Note APPROVED and permanently added to Patient Health Timeline.');
      setClinicalNote(null);
      setDraftId(null);
      setSegments([]);
    } catch (err: any) {
      alert(`Approval Failed: ${err.message}`);
    } finally {
      setSavingApproval(false);
    }
  };

  // Doctor Rejection
  const handleRejectNote = async () => {
    if (!draftId) return;
    if (!confirm('Reject this AI Medical Scribe draft? It will not be added to the patient timeline.')) return;

    try {
      await apiFetch(`/scribe/${draftId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Physician rejected draft.' }),
      });
      showNotification('Draft rejected and safely discarded.');
      setClinicalNote(null);
      setDraftId(null);
      setSegments([]);
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    }
  };

  // Patient Visit Prep submission
  const handleSavePrep = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/consultations/prepare', {
        method: 'POST',
        body: JSON.stringify({
          concernsAndQuestions: concerns,
          personalNotes,
        }),
      });
      showNotification('Doctor visit preparation saved successfully.');
    } catch (err: any) {
      alert(`Could not save visit preparation: ${err.message}`);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Toast Notification */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center gap-2 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('scribe')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'scribe'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            <span>AI Medical Scribe (Clinician Desk)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('prep')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'prep'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Patient Visit Preparation</span>
          </button>
        </div>

        <span className="hidden sm:inline-flex text-[11px] font-semibold px-3 py-1 bg-teal-50 text-teal-800 rounded-full border border-teal-200 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-teal-600" /> Gemini Clinical Intelligence
        </span>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: AI MEDICAL SCRIBE (CLINICIAN DESK)                 */}
      {/* ========================================================= */}
      {activeTab === 'scribe' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header & Patient Context */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                Active Consultation Session
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                Patient: {selectedPatient?.fullName || 'No authorized patient selected'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedPatient ? selectedPatient.diabetesType.replace(/_/g, ' ') : 'Select a patient and consultation authorized for your clinician account.'}
              </p>
            </div>

            {/* Informed Consent Requirement Checkbox */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs max-w-sm">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentObtained}
                  onChange={(e) => setConsentObtained(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-teal-700 focus:ring-teal-700"
                />
                <span className="text-amber-950 font-semibold leading-snug">
                  I have explained that audio will be sent securely to the configured server-side transcription provider and used to create an AI-generated draft for my review. I have obtained the patient’s explicit consent before recording.
                </span>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Authorized patient
                <select
                  value={selectedPatientId}
                  onChange={(event) => setSelectedPatientId(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!authorizedPatients.length}
                >
                  <option value="">Select an authorized patient</option>
                  {authorizedPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.fullName}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Consultation
                <select
                  value={consultationId}
                  onChange={(event) => setConsultationId(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!selectedPatient?.consultations.length}
                >
                  <option value="">Select a consultation</option>
                  {selectedPatient?.consultations.map((consultation) => (
                    <option key={consultation.id} value={consultation.id}>
                      {new Date(consultation.scheduledAt).toLocaleString()} — {consultation.clinicianName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {patientLoadError && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                Authorized patient list unavailable: {patientLoadError}
              </div>
            )}
          </div>

          {/* Recording & Processing Station */}
          <div className="rounded-2xl border border-teal-200 bg-teal-50/30 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Mic className="h-4 w-4 text-teal-700" />
                  Live Dialogue Capture & Gemini Transcription
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Recording begins only after consent. Audio is uploaded to the authenticated API and is not retained by this application after processing.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRecording}
                  disabled={processing}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition hover:scale-[1.02] ${
                    isRecording
                      ? 'bg-rose-600 hover:bg-rose-700 animate-pulse ring-4 ring-rose-200'
                      : 'bg-teal-700 hover:bg-teal-800 disabled:opacity-50'
                  }`}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span>{isRecording ? `Stop and upload (${formatSeconds(recordingSeconds)})` : 'Start recording with consent'}</span>
                </button>
                {isRecording && (
                  <button type="button" onClick={() => void cancelRecording()} className="px-3.5 py-2.5 rounded-xl border border-rose-300 bg-white text-rose-700 text-xs font-bold">
                    Cancel without upload
                  </button>
                )}
              </div>
            </div>

            {/* Live Recording Indicator */}
            {isRecording && (
              <div className="p-3 bg-white rounded-xl border border-teal-200 flex items-center gap-3 animate-in fade-in">
                <Radio className="h-4 w-4 text-rose-600 animate-spin" />
                <span className="text-xs font-bold text-slate-800">
                  Recording in progress. Audio is held temporarily in browser memory until you stop or cancel.
                </span>
              </div>
            )}

            {/* Processing Indicator */}
            {processing && (
              <div className="p-3.5 bg-white rounded-xl border border-teal-300 flex items-center gap-2.5 text-xs font-bold text-teal-900 animate-pulse shadow-2xs">
                <Sparkles className="h-4 w-4 text-teal-700 animate-spin" />
                <span>{processStep}</span>
              </div>
            )}
            {processingError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                <span>{processingError}</span>
                {canRetry && audioBlobRef.current && (
                  <button type="button" onClick={retryProcessing} className="rounded-lg bg-rose-700 px-3 py-2 text-white">
                    Retry transcription
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scribe Output Workspace */}
          {(segments.length > 0 || clinicalNote) && (
            <div className="grid lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
              {/* LEFT: Finalized Transcript with Speaker Diarization */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-teal-700" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Consultation Dialogue & Speaker Labels
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">Click speaker badge to switch speaker</span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {segments.map((seg, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                          seg.speaker === 'Doctor'
                            ? 'bg-indigo-50/40 border-indigo-200'
                            : 'bg-emerald-50/40 border-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleToggleSpeaker(idx)}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition shadow-2xs ${
                              seg.speaker === 'Doctor'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-emerald-600 text-white'
                            }`}
                            title="Click to toggle speaker"
                          >
                            {seg.speaker === 'Doctor' ? '👨‍⚕️ Doctor' : '👤 Patient'}
                          </button>
                          <span className="text-[10px] text-slate-400 font-mono">{seg.timestamp || `Turn ${idx + 1}`}</span>
                        </div>

                        <textarea
                          rows={2}
                          value={seg.text}
                          onChange={(e) => handleTextChange(idx, e.target.value)}
                          className="w-full bg-transparent border-0 focus:ring-1 focus:ring-teal-700 rounded p-1 text-slate-800 text-xs leading-relaxed resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                  <span>Raw dialogue is preserved separately from the signed clinical note for medical audit integrity.</span>
                </div>
              </div>

              {/* RIGHT: Structured Clinical Note & Human-in-the-Loop Review */}
              {clinicalNote && (
                <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-teal-700" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Structured Clinical Note Draft
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                      Awaiting Physician Sign-off
                    </span>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 text-xs">
                    {/* 1. Chief Complaint & Symptoms */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">
                        1. Chief Complaint & Stated Symptoms
                      </p>
                      <p className="text-slate-700">{clinicalNote.chiefComplaint}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {clinicalNote.symptoms.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 2. History of Present Illness */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">
                        2. History of Present Illness (HPI)
                      </p>
                      <p className="text-slate-700 leading-relaxed">{clinicalNote.historyOfPresentIllness}</p>
                    </div>

                    {/* 3. Current Medications & Allergies */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                      <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <Pill className="h-3.5 w-3.5 text-amber-600" /> 3. Current Medications on File
                      </p>
                      <div className="space-y-1">
                        {clinicalNote.currentMedications.map((m, i) => (
                          <div key={i} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                            <span className="font-bold text-slate-800">{m.name}</span>
                            <span className="text-slate-500 font-medium">{m.dose} • {m.frequency}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 pt-1">
                        Allergies: <span className="font-bold text-slate-700">{clinicalNote.allergies.join(', ') || 'None reported'}</span>
                      </p>
                    </div>

                    {/* 4. Examination & Assessment (Editable by Clinician) */}
                    <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-teal-950 text-[11px] uppercase tracking-wider flex items-center gap-1">
                          <Edit3 className="h-3 w-3 text-teal-700" /> 4. Clinician Assessment (Editable)
                        </p>
                      </div>
                      <textarea
                        rows={2}
                        value={editableAssessment}
                        onChange={(e) => setEditableAssessment(e.target.value)}
                        className="w-full bg-white rounded-lg border border-teal-300 p-2 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-700"
                      />
                    </div>

                    {/* 5. Treatment Plan & Follow-up (Editable by Clinician) */}
                    <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 space-y-1.5">
                      <p className="font-bold text-teal-950 text-[11px] uppercase tracking-wider flex items-center gap-1">
                        <Edit3 className="h-3 w-3 text-teal-700" /> 5. Treatment Plan & Follow-up Orders
                      </p>
                      <textarea
                        rows={3}
                        value={editablePlan}
                        onChange={(e) => setEditablePlan(e.target.value)}
                        className="w-full bg-white rounded-lg border border-teal-300 p-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-teal-700"
                      />
                      <p className="text-[11px] text-slate-600 font-medium">
                        Follow-up: <span className="font-bold text-slate-800">{clinicalNote.followUpInstructions}</span>
                      </p>
                    </div>

                    {/* 6. Missing or Uncertain Information */}
                    {clinicalNote.uncertainOrMissingInformation?.length > 0 && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1 text-amber-950">
                        <p className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> 6. Missing or Uncertain Information
                        </p>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900">
                          {clinicalNote.uncertainOrMissingInformation.map((info, idx) => (
                            <li key={idx}>{info}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Doctor Approval Action Bar */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleRejectNote}
                      disabled={savingApproval}
                      className="px-4 py-2 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold transition"
                    >
                      Reject Draft
                    </button>

                    <button
                      type="button"
                      onClick={handleApproveNote}
                      disabled={savingApproval}
                      className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 hover:scale-[1.02] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      <span>{savingApproval ? 'Committing to Timeline...' : 'Approve & Save to Health Timeline'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PATIENT VISIT PREPARATION                          */}
      {/* ========================================================= */}
      {activeTab === 'prep' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5 animate-in fade-in duration-300">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Prepare for Your Next Doctor Consultation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Write down your questions, symptoms, or side-effects beforehand so your clinician can address them during OPD visits.
            </p>
          </div>

          <form onSubmit={handleSavePrep} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Concerns & Questions for Doctor
              </label>
              <textarea
                rows={4}
                required
                placeholder="e.g. My fasting blood sugar was above 150 mg/dL for 3 days; feeling lightheaded after afternoon walks; should I continue evening dosage?"
                value={concerns}
                onChange={(e) => setConcerns(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Personal Lifestyle & Diet Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Started morning 20-min walking; taking medication regularly with meals."
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 hover:scale-[1.01]"
              >
                <Send className="h-4 w-4" />
                <span>Save Consultation Preparation</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}