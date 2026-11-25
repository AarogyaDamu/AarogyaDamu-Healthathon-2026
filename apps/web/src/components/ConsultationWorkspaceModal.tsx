import { useState, useEffect, useMemo, type FC } from 'react';
import {
  X,
  Stethoscope,
  Sparkles,
  Plus,
  Trash2,
  FileCheck,
  AlertTriangle,
  FileText,
  TrendingUp,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  Search,
  ChevronRight,
} from 'lucide-react';
import {
  getConsultationTemplates,
  finalizeConsultationWorkspace,
  getCopilotPatientSummary,
  getCopilotSoapDraft,
  getCopilotTrendComparison,
  apiFetch,
} from '../api/client';
import MedicalReportSourcePreview from './MedicalReportSourcePreview';
import type { ReviewableMedicalReport } from './MedicalReportReviewModal';
import type { PrescriptionItem, ClinicalDiagnosisItem } from '@aarogyadamu/contracts';

interface Props {
  patient: {
    id: string;
    fullName: string;
    diabetesType?: string;
    knownAllergies?: string;
  };
  appointmentId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ConsultationWorkspaceModal: FC<Props> = ({
  patient,
  appointmentId,
  onClose,
  onSuccess,
}) => {
  // -------------------------------------------------------------
  // Template & AI Copilot State
  // -------------------------------------------------------------
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [copilotSummary, setCopilotSummary] = useState<any | null>(null);
  const [copilotTrend, setCopilotTrend] = useState<any | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // Patient Medical Reports (Left Column) State
  // -------------------------------------------------------------
  const [documents, setDocuments] = useState<ReviewableMedicalReport[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ReviewableMedicalReport | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [reportViewMode, setReportViewMode] = useState<'SHEET' | 'SOURCE'>('SHEET');

  // -------------------------------------------------------------
  // SOAP Fields (Right Column) State
  // -------------------------------------------------------------
  const [chiefComplaint, setChiefComplaint] = useState(
    'Quarterly diabetes follow-up and glycemic review.'
  );
  const [historyOfPresentIllness, setHistoryOfPresentIllness] = useState(
    'Patient reports adherence to prescribed medications. No symptomatic hypoglycemic episodes over past 60 days. Occasional mild post-prandial fatigue noted.'
  );

  // Point of Care Vitals & Exam
  const [bpSystolic, setBpSystolic] = useState<number | ''>(126);
  const [bpDiastolic, setBpDiastolic] = useState<number | ''>(82);
  const [pulseRate, setPulseRate] = useState<number | ''>(74);
  const [weightKg, setWeightKg] = useState<number | ''>(71.5);
  const [randomBloodSugar, setRandomBloodSugar] = useState<number | ''>(142);
  const [footExam, setFootExam] = useState(
    'Normal 10g monofilament sensation bilaterally. Dorsalis pedis and posterior tibial pulses strong. No signs of fungal infection or calluses.'
  );
  const [generalExam, setGeneralExam] = useState(
    'Conscious, oriented, afebrile, well-hydrated. Normal heart sounds and clear breath sounds.'
  );

  // Diagnoses
  const [diagnoses, setDiagnoses] = useState<ClinicalDiagnosisItem[]>([
    {
      code: 'E11.9',
      display: 'Type 2 diabetes mellitus without complications',
      category: 'CONFIRMED',
    },
    {
      code: 'E78.5',
      display: 'Hyperlipidemia, unspecified',
      category: 'CONFIRMED',
    },
  ]);
  const [newDiagnosisName, setNewDiagnosisName] = useState('');

  // Digital Prescriptions (Rx)
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([
    {
      medicationName: 'Metformin Hydrochloride (Glucophage SR)',
      dosage: '500 mg',
      frequency: '1-0-1',
      timing: 'AFTER_FOOD',
      durationDays: 60,
      instructions: 'Take 1 tablet after breakfast and 1 tablet after dinner with water.',
    },
    {
      medicationName: 'Telmisartan Tablets',
      dosage: '40 mg',
      frequency: '1-0-0',
      timing: 'BEFORE_FOOD',
      durationDays: 60,
      instructions: 'Take 1 tablet in the morning before breakfast.',
    },
  ]);

  // Lab Orders & Lifestyle Advice
  const [labOrders, setLabOrders] = useState<string[]>([
    'HbA1c (Glycated Hemoglobin)',
    'Fasting Lipid Profile',
    'Serum Creatinine & eGFR',
    'Urine Microalbumin/Creatinine Ratio',
  ]);
  const [newLabOrder, setNewLabOrder] = useState('');
  const [lifestyleAdvice, setLifestyleAdvice] = useState(
    '30 minutes of moderate aerobic exercise (brisk walking) 5 days per week. Follow diabetes plate method: 50% low-glycemic vegetables, 25% lean protein, 25% whole grains. Self-monitor fasting glucose twice weekly.'
  );
  const [followUpDays, setFollowUpDays] = useState<number>(60);

  // -------------------------------------------------------------
  // Review & Signing Modal State
  // -------------------------------------------------------------
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [clinicianDeclarationAccepted, setClinicianDeclarationAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // -------------------------------------------------------------
  // Load Templates and Patient Medical Documents on mount
  // -------------------------------------------------------------
  useEffect(() => {
    // 1. Templates
    getConsultationTemplates()
      .then((res) => {
        if (res.success && res.templates) {
          setTemplates(res.templates);
        }
      })
      .catch((err) => console.error('Failed to load templates', err));

    // 2. Patient Documents (Medical Reports)
    setDocsLoading(true);
    setDocsError(null);
    apiFetch<{ documents: any[] }>('/documents', {
      headers: { 'X-Target-Patient-Id': patient.id },
    })
      .then((res) => {
        if (res.documents) {
          const parsed = res.documents.map((d: any) => {
            let extractedData = d.extractedData;
            if (typeof extractedData === 'string') {
              try {
                extractedData = JSON.parse(extractedData);
              } catch {
                extractedData = null;
              }
            }
            return {
              id: d.id,
              title: d.title,
              category: d.category,
              reportDate: d.reportDate,
              issuingFacility: d.issuingFacility,
              mimeType: d.mimeType,
              processingStatus: d.processingStatus,
              doctorReviewStatus: extractedData?.doctorReviewStatus || 'REVIEWED',
              extractedData,
              hasOriginalFile: Boolean(d.fileSizeBytes || d.storagePath),
            };
          });
          setDocuments(parsed);
          // If reports exist, pre-select the first one for clinician immediate review
          if (parsed.length > 0) {
            setSelectedDoc(parsed[0]);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load patient documents:', err);
        setDocsError(err.message || 'Unable to retrieve patient diagnostic documents.');
      })
      .finally(() => {
        setDocsLoading(false);
      });
  }, [patient.id]);

  // Apply template
  const applyTemplate = (templateId: string) => {
    const t = templates.find((item) => item.id === templateId);
    if (!t) return;
    setSelectedTemplateId(templateId);
    if (t.chiefComplaint) setChiefComplaint(t.chiefComplaint);
    if (t.defaultDiagnoses && t.defaultDiagnoses.length > 0) setDiagnoses(t.defaultDiagnoses);
    if (t.defaultPrescriptions && t.defaultPrescriptions.length > 0)
      setPrescriptions(t.defaultPrescriptions);
    if (t.defaultLabOrders && t.defaultLabOrders.length > 0) setLabOrders(t.defaultLabOrders);
    if (t.defaultLifestyleAdvice) setLifestyleAdvice(t.defaultLifestyleAdvice);
  };

  // AI Copilot helpers
  const runCopilotSummary = async () => {
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const res = await getCopilotPatientSummary(patient.id, 90);
      if (res.success) setCopilotSummary(res.summary);
    } catch (err: any) {
      setCopilotError(err.message || 'Unable to retrieve Damu Copilot summary');
    } finally {
      setCopilotLoading(false);
    }
  };

  const runCopilotTrend = async () => {
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const res = await getCopilotTrendComparison(patient.id, 'BLOOD_GLUCOSE', 30);
      if (res.success) setCopilotTrend(res.comparison);
    } catch (err: any) {
      setCopilotError(err.message || 'Unable to compute trend comparison');
    } finally {
      setCopilotLoading(false);
    }
  };

  const runCopilotDraft = async () => {
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const res = await getCopilotSoapDraft(patient.id, chiefComplaint, appointmentId);
      if (res.success && res.draft) {
        const d = res.draft.draftedSoapNote;
        if (d.subjective) setHistoryOfPresentIllness(d.subjective);
        if (d.provisionalAssessment && d.provisionalAssessment.length > 0) {
          setDiagnoses(d.provisionalAssessment);
        }
        if (d.suggestedPlan?.suggestedMedications) {
          setPrescriptions(
            d.suggestedPlan.suggestedMedications.map((m: any) => ({
              medicationName: m.medicationName,
              dosage: m.dosage,
              frequency: m.frequency,
              timing: m.timing || 'AFTER_FOOD',
              durationDays: 30,
              instructions: m.clinicalRationale,
            }))
          );
        }
        if (d.suggestedPlan?.suggestedLabOrders) {
          setLabOrders(d.suggestedPlan.suggestedLabOrders);
        }
        if (d.suggestedPlan?.suggestedLifestyleInstructions) {
          setLifestyleAdvice(d.suggestedPlan.suggestedLifestyleInstructions);
        }
      }
    } catch (err: any) {
      setCopilotError(err.message || 'Unable to draft note with Damu Copilot');
    } finally {
      setCopilotLoading(false);
    }
  };

  // Prescription list operations
  const addPrescriptionItem = () => {
    setPrescriptions((prev) => [
      ...prev,
      {
        medicationName: '',
        dosage: '500 mg',
        frequency: '1-0-1',
        timing: 'AFTER_FOOD',
        durationDays: 30,
        instructions: 'Take after meals with water.',
      },
    ]);
  };

  const updatePrescriptionItem = (index: number, field: keyof PrescriptionItem, value: any) => {
    setPrescriptions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removePrescriptionItem = (index: number) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  };

  // Filtered documents list
  const filteredDocuments = useMemo(() => {
    if (!docSearchQuery.trim()) return documents;
    const q = docSearchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.issuingFacility && d.issuingFacility.toLowerCase().includes(q)) ||
        d.category.toLowerCase().includes(q)
    );
  }, [documents, docSearchQuery]);

  // Validation before opening review modal
  const handleOpenReview = () => {
    if (!chiefComplaint.trim()) {
      setSubmitError('Chief complaint is required before proceeding to prescription authorization.');
      return;
    }
    if (diagnoses.length === 0) {
      setSubmitError('At least one confirmed clinical diagnosis is required.');
      return;
    }
    const validRx = prescriptions.filter((p) => p.medicationName.trim().length > 0);
    if (validRx.length === 0) {
      setSubmitError('At least one valid medication must be prescribed.');
      return;
    }
    setSubmitError(null);
    setClinicianDeclarationAccepted(false);
    setIsReviewModalOpen(true);
  };

  // Finalize consultation & authorize prescription
  const handleFinalizeAndSign = async () => {
    if (!clinicianDeclarationAccepted) {
      setSubmitError('You must review and accept the clinician authorization declaration.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const activeRx = prescriptions.filter((p) => p.medicationName.trim().length > 0);
      const activeLabs = labOrders.filter((l) => l.trim().length > 0);

      await finalizeConsultationWorkspace({
        patientId: patient.id,
        appointmentId,
        chiefComplaint: chiefComplaint.trim(),
        historyOfPresentIllness: historyOfPresentIllness.trim(),
        examination: {
          bpSystolic: typeof bpSystolic === 'number' ? bpSystolic : undefined,
          bpDiastolic: typeof bpDiastolic === 'number' ? bpDiastolic : undefined,
          pulseRate: typeof pulseRate === 'number' ? pulseRate : undefined,
          weightKg: typeof weightKg === 'number' ? weightKg : undefined,
          randomBloodSugar: typeof randomBloodSugar === 'number' ? randomBloodSugar : undefined,
          generalExam: generalExam.trim(),
          footExam: footExam.trim(),
        },
        diagnoses,
        prescriptions: activeRx,
        labOrders: activeLabs,
        lifestyleAdvice: lifestyleAdvice.trim(),
        followUpDays,
        doctorConfirmed: true,
      });

      setSubmitSuccess('Consultation finalized and prescription issued successfully!');
      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to authorize and issue digital prescription.');
      setSubmitting(false);
    }
  };

  // Format date helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Recent';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Patient reference code
  const patientRefCode = `PT-${patient.id.slice(0, 8).toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-modal-title"
    >
      <div className="relative w-full max-w-[96vw] xl:max-w-7xl h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* ========================================================= */}
        {/* TOP MODAL HEADER */}
        {/* ========================================================= */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2
                  id="consultation-modal-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Clinical Consultation &amp; Digital Prescription
                </h2>
                <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 border border-teal-200">
                  Doctor Verified
                </span>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-700">
                  {patientRefCode}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-2">
                <span>
                  Patient: <strong className="text-slate-900">{patient.fullName}</strong>
                </span>
                <span>•</span>
                <span>{patient.diabetesType || 'Type 2 Diabetes Mellitus'}</span>
                <span>•</span>
                <span>Encounter: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                {patient.knownAllergies && patient.knownAllergies !== 'None documented' && (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                    ⚠️ Allergy: {patient.knownAllergies}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Standard Template selector */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Template:</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
              >
                <option value="">-- Choose Standard Template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
              title="Close Consultation Workspace"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ========================================================= */}
        {/* SPLIT-SCREEN WORKSPACE BODY */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* ------------------------------------------------------- */}
          {/* LEFT COLUMN: PATIENT DIAGNOSTIC RECORDS & REPORTS (40%) */}
          {/* ------------------------------------------------------- */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-50 min-h-0 border-r border-slate-200">
            {/* Left Header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Patient Diagnostic Records &amp; Lab Reports
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {documents.length}
                </span>
              </div>
              {selectedDoc && (
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to list
                </button>
              )}
            </div>

            {/* Document Content View */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {docsLoading ? (
                <div className="flex h-64 flex-col items-center justify-center text-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Loading patient's diagnostic history…
                  </p>
                </div>
              ) : docsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                  <AlertTriangle className="h-4 w-4 text-rose-600 mb-1" />
                  {docsError}
                </div>
              ) : selectedDoc ? (
                /* Detail / Preview View of Selected Document */
                <div className="space-y-4">
                  {/* Selected Document Header Bar */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase tracking-wider border border-teal-200">
                          {selectedDoc.category}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 mt-1.5">
                          {selectedDoc.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {selectedDoc.issuingFacility || 'Diagnostic Laboratory'} • {formatDate(selectedDoc.reportDate)}
                        </p>
                      </div>
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 border border-emerald-200 shrink-0">
                        ✓ {selectedDoc.doctorReviewStatus || 'Verified'}
                      </span>
                    </div>

                    {/* Mode Toggle: Formatted Sheet vs Original PDF */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setReportViewMode('SHEET')}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          reportViewMode === 'SHEET'
                            ? 'bg-teal-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Diagnostic Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportViewMode('SOURCE')}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          reportViewMode === 'SOURCE'
                            ? 'bg-teal-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Original Source File
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Formatted Sheet (Structured Lab Findings) */}
                  {reportViewMode === 'SHEET' ? (
                    <div className="space-y-3">
                      {selectedDoc.extractedData?.plainSummary && (
                        <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-xs text-slate-700 leading-relaxed">
                          <strong className="text-teal-900 font-semibold">Laboratory Summary: </strong>
                          {selectedDoc.extractedData.plainSummary}
                        </div>
                      )}

                      {/* Structured Lab Entries */}
                      {selectedDoc.extractedData?.structuredLabs && (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                            Biomarkers &amp; Laboratory Values
                          </div>
                          <div className="divide-y divide-slate-100">
                            {Object.entries(selectedDoc.extractedData.structuredLabs).map(
                              ([key, val]: [string, any]) => {
                                if (!val || typeof val !== 'object') return null;
                                const isHigh = val.status === 'HIGH' || val.status === 'CRITICAL';
                                return (
                                  <div
                                    key={key}
                                    className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/70"
                                  >
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        {val.displayName || key}
                                      </span>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        Reference Range: {val.referenceRange || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <span
                                        className={`inline-block font-mono font-bold text-sm ${
                                          isHigh ? 'text-rose-700' : 'text-slate-900'
                                        }`}
                                      >
                                        {val.extractedValue} {val.unit || ''}
                                      </span>
                                      <div>
                                        <span
                                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            isHigh
                                              ? 'bg-rose-100 text-rose-800'
                                              : 'bg-emerald-100 text-emerald-800'
                                          }`}
                                        >
                                          {val.status || 'NORMAL'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Mode 2: Original File Source Preview */
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                      <MedicalReportSourcePreview
                        documentId={selectedDoc.id}
                        title={selectedDoc.title}
                        mimeType={selectedDoc.mimeType}
                        patientId={patient.id}
                        patientName={patient.fullName}
                        report={selectedDoc}
                      />
                    </div>
                  )}
                </div>
              ) : documents.length === 0 ? (
                /* Empty state when patient has no documents */
                <div className="flex h-64 flex-col items-center justify-center text-center p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    No Previous Medical Reports
                  </p>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    This patient has not uploaded any lab reports, diagnostic scans, or hospital discharge summaries yet.
                  </p>
                </div>
              ) : (
                /* List of Documents */
                <div className="space-y-2.5">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search patient's diagnostic history..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-teal-500 hover:shadow-xs transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase tracking-wider border border-teal-200">
                            {doc.category}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition-colors mt-1 truncate">
                            {doc.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {doc.issuingFacility || 'Diagnostic Facility'} • {formatDate(doc.reportDate)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-teal-600 shrink-0 mt-1" />
                      </div>

                      {doc.extractedData?.structuredLabs && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                          {Object.entries(doc.extractedData.structuredLabs)
                            .slice(0, 3)
                            .map(([k, v]: [string, any]) => (
                              <span
                                key={k}
                                className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700"
                              >
                                {v.displayName || k}: <strong>{v.extractedValue}</strong>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------- */}
          {/* RIGHT COLUMN: CONSULTATION & PRESCRIPTION WORKSPACE (60%) */}
          {/* ------------------------------------------------------- */}
          <div className="lg:col-span-7 flex flex-col h-full bg-white min-h-0">
            {/* Damu AI Copilot Quick Assist Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 bg-teal-50/40 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                <Sparkles className="h-4 w-4 text-teal-600" />
                <span>Damu AI Assistant:</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runCopilotSummary}
                  disabled={copilotLoading}
                  className="rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100/60 transition-all disabled:opacity-50"
                >
                  {copilotLoading ? 'Analyzing…' : '90-Day Briefing'}
                </button>
                <button
                  type="button"
                  onClick={runCopilotDraft}
                  disabled={copilotLoading}
                  className="rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100/60 transition-all disabled:opacity-50"
                >
                  Pre-populate SOAP
                </button>
                <button
                  type="button"
                  onClick={runCopilotTrend}
                  disabled={copilotLoading}
                  className="rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100/60 transition-all disabled:opacity-50"
                >
                  Trend Delta
                </button>
              </div>
            </div>

            {copilotError && (
              <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 shrink-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                {copilotError}
              </div>
            )}

            {/* AI Summary Drawers */}
            {copilotSummary && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-teal-50/60 border border-teal-200 text-xs space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-teal-900 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    Longitudinal Glucose Summary (90 Days)
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopilotSummary(null)}
                    className="font-bold text-slate-500 hover:text-slate-800"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 bg-white rounded-lg border border-teal-100">
                    <div className="text-[10px] text-slate-500 uppercase">Readings</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {copilotSummary.glucoseMetrics.totalReadingsCount}
                    </div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-teal-100">
                    <div className="text-[10px] text-slate-500 uppercase">Fasting Avg</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {copilotSummary.glucoseMetrics.fastingAverageMgDl || 'N/A'} mg/dL
                    </div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-teal-100">
                    <div className="text-[10px] text-slate-500 uppercase">Post-Meal Avg</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {copilotSummary.glucoseMetrics.postMealAverageMgDl || 'N/A'} mg/dL
                    </div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-teal-100">
                    <div className="text-[10px] text-slate-500 uppercase">Hypos</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        copilotSummary.glucoseMetrics.hypoglycemiaEpisodesCount > 0
                          ? 'text-rose-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {copilotSummary.glucoseMetrics.hypoglycemiaEpisodesCount}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {copilotTrend && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-teal-50/60 border border-teal-200 text-xs space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-teal-900 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
                    30-Day Blood Glucose Trend Analysis
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopilotTrend(null)}
                    className="font-bold text-slate-500 hover:text-slate-800"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-slate-700">{copilotTrend.clinicalInterpretation}</p>
              </div>
            )}

            {/* Scrollable Clinical Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* SECTION S: Subjective */}
              <div className="rounded-2xl border border-slate-200 p-5 bg-white shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-white text-[11px] font-bold">
                    S
                  </span>
                  Subjective — Chief Complaint &amp; History of Present Illness
                </h3>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Chief Complaint *
                  </label>
                  <input
                    type="text"
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="e.g. Quarterly diabetes follow-up and review of recent lab reports"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    History of Present Illness (HPI)
                  </label>
                  <textarea
                    rows={2}
                    value={historyOfPresentIllness}
                    onChange={(e) => setHistoryOfPresentIllness(e.target.value)}
                    placeholder="Document clinical history, symptom changes, drug tolerability, and lifestyle compliance..."
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
                  />
                </div>
              </div>

              {/* SECTION O: Objective */}
              <div className="rounded-2xl border border-slate-200 p-5 bg-white shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-white text-[11px] font-bold">
                    O
                  </span>
                  Objective — Point-of-Care Vitals &amp; Physical Examination
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      BP Systolic
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={bpSystolic}
                        onChange={(e) => setBpSystolic(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400">mmHg</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      BP Diastolic
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={bpDiastolic}
                        onChange={(e) => setBpDiastolic(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400">mmHg</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Pulse
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={pulseRate}
                        onChange={(e) => setPulseRate(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400">bpm</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Weight
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value ? parseFloat(e.target.value) : '')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400">kg</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Random Glucose
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={randomBloodSugar}
                        onChange={(e) =>
                          setRandomBloodSugar(e.target.value ? parseInt(e.target.value) : '')
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-teal-700 outline-none focus:border-teal-600"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400">mg/dL</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      General Physical Examination
                    </label>
                    <input
                      type="text"
                      value={generalExam}
                      onChange={(e) => setGeneralExam(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Diabetic Foot Examination
                    </label>
                    <input
                      type="text"
                      value={footExam}
                      onChange={(e) => setFootExam(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION A: Assessment */}
              <div className="rounded-2xl border border-slate-200 p-5 bg-white shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-white text-[11px] font-bold">
                    A
                  </span>
                  Assessment — Clinician-Confirmed Diagnoses *
                </h3>
                <div className="space-y-2">
                  {diagnoses.map((d, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                          {d.code || 'CLINICAL'}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">{d.display}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {d.category}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDiagnoses(diagnoses.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove diagnosis"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add another clinical diagnosis (e.g. Diabetic Peripheral Neuropathy)..."
                      value={newDiagnosisName}
                      onChange={(e) => setNewDiagnosisName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newDiagnosisName.trim()) {
                          e.preventDefault();
                          setDiagnoses([
                            ...diagnoses,
                            { display: newDiagnosisName.trim(), category: 'CONFIRMED' },
                          ]);
                          setNewDiagnosisName('');
                        }
                      }}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newDiagnosisName.trim()) {
                          setDiagnoses([
                            ...diagnoses,
                            { display: newDiagnosisName.trim(), category: 'CONFIRMED' },
                          ]);
                          setNewDiagnosisName('');
                        }
                      }}
                      className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION P: Plan & Digital Prescription */}
              <div className="rounded-2xl border border-slate-200 p-5 bg-white shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-white text-[11px] font-bold">
                      P
                    </span>
                    Plan — Digital Prescription (Rx) &amp; Clinical Orders
                  </h3>
                  <button
                    type="button"
                    onClick={addPrescriptionItem}
                    className="flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Drug
                  </button>
                </div>

                {/* Medication Items Table */}
                <div className="space-y-3">
                  {prescriptions.map((rx, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Medication Name *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Metformin Hydrochloride 500mg"
                            value={rx.medicationName}
                            onChange={(e) => updatePrescriptionItem(idx, 'medicationName', e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Dosage
                          </label>
                          <input
                            type="text"
                            placeholder="500 mg"
                            value={rx.dosage}
                            onChange={(e) => updatePrescriptionItem(idx, 'dosage', e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Frequency
                          </label>
                          <select
                            value={rx.frequency}
                            onChange={(e) => updatePrescriptionItem(idx, 'frequency', e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-600"
                          >
                            <option value="1-0-1">1-0-1 (Twice Daily)</option>
                            <option value="1-0-0">1-0-0 (Morning)</option>
                            <option value="0-0-1">0-0-1 (Night)</option>
                            <option value="1-1-1">1-1-1 (Thrice Daily)</option>
                            <option value="AS_NEEDED">SOS (As needed)</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Timing
                          </label>
                          <select
                            value={rx.timing}
                            onChange={(e) => updatePrescriptionItem(idx, 'timing', e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-600"
                          >
                            <option value="AFTER_FOOD">After Food</option>
                            <option value="BEFORE_FOOD">Before Food</option>
                            <option value="WITH_FOOD">With Food</option>
                            <option value="EMPTY_STOMACH">Empty Stomach</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Days
                          </label>
                          <input
                            type="number"
                            value={rx.durationDays}
                            onChange={(e) =>
                              updatePrescriptionItem(idx, 'durationDays', parseInt(e.target.value) || 30)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="sm:col-span-1 flex items-end justify-center">
                          <button
                            type="button"
                            onClick={() => removePrescriptionItem(idx)}
                            className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remove drug"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Plain-English directions for patient (e.g. Take immediately after meals with a full glass of water. Do not skip meals)."
                          value={rx.instructions || ''}
                          onChange={(e) => updatePrescriptionItem(idx, 'instructions', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-600"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Laboratory Investigations Checklist */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Laboratory Investigations Ordered
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {labOrders.map((lab, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 border border-slate-200"
                      >
                        {lab}
                        <button
                          type="button"
                          onClick={() => setLabOrders(labOrders.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add another investigation (e.g. Serum Electrolytes, ECG)..."
                      value={newLabOrder}
                      onChange={(e) => setNewLabOrder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newLabOrder.trim()) {
                          e.preventDefault();
                          setLabOrders([...labOrders, newLabOrder.trim()]);
                          setNewLabOrder('');
                        }
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 outline-none flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newLabOrder.trim()) {
                          setLabOrders([...labOrders, newLabOrder.trim()]);
                          setNewLabOrder('');
                        }
                      }}
                      className="rounded-xl bg-slate-200 hover:bg-slate-300 px-4 py-2 text-xs font-bold text-slate-800 transition-colors"
                    >
                      Add Lab
                    </button>
                  </div>
                </div>

                {/* Lifestyle Advice & Follow-Up */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Diet &amp; Lifestyle Guidance
                    </label>
                    <textarea
                      rows={2}
                      value={lifestyleAdvice}
                      onChange={(e) => setLifestyleAdvice(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Follow-up Timeline
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={followUpDays}
                        onChange={(e) => setFollowUpDays(parseInt(e.target.value) || 30)}
                        className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-teal-600"
                      />
                      <span className="text-xs font-medium text-slate-600">days</span>
                    </div>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  {submitError}
                </div>
              )}
            </div>

            {/* Bottom Action Bar */}
            <footer className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                <span>Prescriptions are digitally signed with clinical provenance and permanent audit record.</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOpenReview}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  <FileCheck className="h-4 w-4" />
                  Review &amp; Sign Prescription
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* CLINICIAN APPROVAL & SIGNING CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {isReviewModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Review &amp; Authorize Digital Prescription
                  </h3>
                  <p className="text-xs text-slate-500">
                    Patient: {patient.fullName} ({patientRefCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {submitSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-bold text-emerald-900">
                    Prescription Successfully Issued &amp; Delivered
                  </h4>
                  <p className="text-xs text-emerald-800">
                    The clinical encounter has been finalized. The patient can now view their official prescription document in the AarogyaDamu Patient Companion application.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary of Diagnoses */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Confirmed Diagnoses:
                    </span>
                    <ul className="mt-1 list-disc list-inside text-slate-900 font-medium">
                      {diagnoses.map((d, i) => (
                        <li key={i}>{d.display}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Summary of Prescribed Medications */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-3.5 py-2 bg-slate-100 font-bold text-slate-800 text-[11px]">
                      Prescribed Medications ({prescriptions.filter((p) => p.medicationName.trim()).length} Items)
                    </div>
                    <div className="divide-y divide-slate-100">
                      {prescriptions
                        .filter((p) => p.medicationName.trim())
                        .map((rx, i) => (
                          <div key={i} className="p-3 bg-white">
                            <div className="flex items-center justify-between font-bold text-slate-900">
                              <span>{rx.medicationName}</span>
                              <span className="font-mono text-teal-700">
                                {rx.dosage} • {rx.frequency} ({rx.timing.replace('_', ' ')})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              Duration: {rx.durationDays} days • Instructions: {rx.instructions || 'As advised.'}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Ordered Labs & Follow-up */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-700 uppercase text-[10px]">Ordered Labs:</span>
                      <p className="text-slate-900 mt-1">
                        {labOrders.length > 0 ? labOrders.join(', ') : 'None ordered.'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-700 uppercase text-[10px]">Follow-Up Review:</span>
                      <p className="text-slate-900 mt-1 font-semibold">{followUpDays} days</p>
                    </div>
                  </div>

                  {/* Clinician Declaration Statement */}
                  <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-teal-900">
                      <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                      <span>Formal Clinician Authorization Declaration</span>
                    </div>
                    <p className="text-[11px] text-teal-950 leading-relaxed">
                      "I hereby certify that I have conducted a clinical evaluation of this patient, personally reviewed their diagnostic findings, and authorized the medications and care plan specified above in accordance with clinical guidelines."
                    </p>
                    <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={clinicianDeclarationAccepted}
                        onChange={(e) => setClinicianDeclarationAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                      />
                      <span className="text-xs font-bold text-slate-900">
                        I approve this consultation and authorize the immediate delivery of this digital prescription to the patient.
                      </span>
                    </label>
                  </div>
                </>
              )}
            </div>

            {!submitSuccess && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  disabled={submitting}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  ← Edit Consultation
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeAndSign}
                  disabled={submitting || !clinicianDeclarationAccepted}
                  className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  <FileCheck className="h-4 w-4" />
                  {submitting ? 'Signing & Delivering…' : 'Sign & Send Prescription'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsultationWorkspaceModal;
