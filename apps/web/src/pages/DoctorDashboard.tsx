import { useCallback, useEffect, useState, useRef, type ChangeEvent } from 'react';
import {
  apiFetch,
  ApiError,
  getAgentProposals,
  reviewAgentProposal,
  getAgentAction,
} from '../api/client';
import type {
  DoctorDashboardResponse,
  DoctorDashboardPatient,
  ActivityFeedItem,
  CareTeamMessage,
  AgentProposalItem,
  AgentProposalReviewPayload,
  AgentActionFeedItem,
} from '../api/types';
import {
  Users,
  AlertTriangle,
  Calendar,
  Clock,
  Search,
  PlusCircle,
  FileText,
  MessageSquare,
  Activity,
  Send,
  Stethoscope,
  ShieldCheck,
  Compass,
  History,
  Pill,
  CheckCircle2,
  AlertCircle,
  X,
  Check,
  Heart,
  Droplets,
  Moon,
  Sparkles,
  ShieldAlert,
  Info,
  RotateCcw,
  ArrowRight,
  Upload,
} from 'lucide-react';
import DoctorAppointments from '../components/DoctorAppointments';
import { DoctorJourneyProgress } from '../components/DoctorJourneyProgress';
import MedicalReportReviewModal, { type ReviewableMedicalReport } from '../components/MedicalReportReviewModal';

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function DoctorDashboard({ onNavigate }: Props) {
  const [data, setData] = useState<DoctorDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'IN_TARGET' | 'LOW'>('ALL');
  const [sortBy, setSortBy] = useState<'NAME' | 'RISK' | 'NEXT_VISIT' | 'RECENT_OBS'>('RISK');

  // Selected Patient Drawer & Sub-views
  const [selectedPatient, setSelectedPatient] = useState<DoctorDashboardPatient | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'OVERVIEW' | 'JOURNAL' | 'MEDICATIONS' | 'LIFESTYLE_TWIN' | 'SAFETY_SOS' | 'FOLLOW_UP' | 'CHAT' | 'FEED' | 'AI_PROPOSALS' | 'JOURNEY_PROGRESS'>('OVERVIEW');

  // P0.7.6 Governed Agentic Proposals & Feeds + Phase 4 Appointments
  const [mainView, setMainView] = useState<'ROSTER' | 'PROPOSALS' | 'AGENT_FEED' | 'APPOINTMENTS'>('ROSTER');
  const [proposals, setProposals] = useState<AgentProposalItem[]>([]);
  const [patientProposals, setPatientProposals] = useState<AgentProposalItem[]>([]);
  const [pendingProposalsCount, setPendingProposalsCount] = useState<number>(0);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<'ALL' | 'PENDING_CLINICIAN_APPROVAL' | 'COMPLETED' | 'REJECTED'>('PENDING_CLINICIAN_APPROVAL');
  const [proposalPatientFilter, setProposalPatientFilter] = useState<string>('');
  const [isAgentFeatureDisabled, setIsAgentFeatureDisabled] = useState(false);

  // Proposal Detail & Review State
  const [selectedProposal, setSelectedProposal] = useState<AgentProposalItem | null>(null);
  const [proposalReviewNotes, setProposalReviewNotes] = useState('');
  const [proposalRejectionReason, setProposalRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [submittingProposalReview, setSubmittingProposalReview] = useState(false);
  const [proposalReviewSuccess, setProposalReviewSuccess] = useState<string | null>(null);
  const [proposalReviewError, setProposalReviewError] = useState<string | null>(null);

  // Agent Action Feed State
  const [agentFeed, setAgentFeed] = useState<AgentActionFeedItem[]>([]);
  const [agentFeedLoading, setAgentFeedLoading] = useState(false);
  const [agentFeedError, setAgentFeedError] = useState<string | null>(null);
  const [agentFeedPatientFilter, setAgentFeedPatientFilter] = useState<string>('');
  const [selectedActionDetail, setSelectedActionDetail] = useState<AgentActionFeedItem | null>(null);

  // Accessibility Focus and Keyboard Trap Refs for Modals (MED-P0.7.6-02)
  const proposalModalRef = useRef<HTMLDivElement>(null);
  const rejectionModalRef = useRef<HTMLDivElement>(null);
  const actionDetailModalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Safety, Emergency SOS & Reminders State (P0.4)
  const [activeSosEvent, setActiveSosEvent] = useState<any | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<any[]>([]);
  const [patientReminders, setPatientReminders] = useState<any[]>([]);
  const [safetyLoading, setSafetyLoading] = useState(false);

  // Lifestyle & Digital Health Twin State
  const [lifestyleRecords, setLifestyleRecords] = useState<any[]>([]);
  const [lifestyleStats, setLifestyleStats] = useState<any | null>(null);
  const [digitalHealthTwin, setDigitalHealthTwin] = useState<any | null>(null);
  const [lifestyleLoading, setLifestyleLoading] = useState(false);

  // Medication Reconciliation State
  const [patientMedications, setPatientMedications] = useState<any[]>([]);
  const [medicationsLoading, setMedicationsLoading] = useState(false);
  const [medicationAdherenceStats, setMedicationAdherenceStats] = useState<any | null>(null);
  const [medFilter, setMedFilter] = useState<'ALL' | 'ACTIVE' | 'UNREVIEWED' | 'DISCONTINUED'>('ALL');

  // Reconcile/Review Modal State
  const [reviewingMed, setReviewingMed] = useState<any | null>(null);
  const [reviewNotesInput, setReviewNotesInput] = useState('');
  const [reviewSubmittingMed, setReviewSubmittingMed] = useState(false);
  const [reviewErrorMed, setReviewErrorMed] = useState<string | null>(null);

  // In-Clinic Prescription Form State (Phase 2 Clinical Prescribing)
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [showPrescriptionSafetyModal, setShowPrescriptionSafetyModal] = useState(false);
  const [prescName, setPrescName] = useState('');
  const [prescGenericName, setPrescGenericName] = useState('');
  const [prescBrandName, setPrescBrandName] = useState('');
  const [prescDosage, setPrescDosage] = useState('');
  const [prescStrength, setPrescStrength] = useState('');
  const [prescDosageForm, setPrescDosageForm] = useState('TABLET');
  const [prescRoute, setPrescRoute] = useState('ORAL');
  const [prescFrequency, setPrescFrequency] = useState('ONCE_DAILY');
  const [prescTiming, setPrescTiming] = useState('MORNING');
  const [prescFoodInstructions, setPrescFoodInstructions] = useState('WITH_MEALS');
  const [prescStartDate, setPrescStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [prescEndDate, setPrescEndDate] = useState('');
  const [prescInstructions, setPrescInstructions] = useState('');
  const [prescIsPrn, setPrescIsPrn] = useState(false);
  const [prescPrnInstructions, setPrescPrnInstructions] = useState('');
  const [prescSubmitting, setPrescSubmitting] = useState(false);
  const [prescError, setPrescError] = useState<string | null>(null);
  const [prescSuccess, setPrescSuccess] = useState<string | null>(null);

  // Status Change (Pause/Discontinue) Modal State
  const [statusChangingMed, setStatusChangingMed] = useState<any | null>(null);
  const [newStatusChoice, setNewStatusChoice] = useState<'PAUSED' | 'DISCONTINUED' | 'ACTIVE'>('PAUSED');
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);

  // Health Journal State
  const [patientObservations, setPatientObservations] = useState<any[]>([]);
  const [patientDocuments, setPatientDocuments] = useState<Array<{
    id: string;
    title: string;
    category: string;
    issuingFacility?: string | null;
    reportDate: string;
    processingStatus: string;
    mimeType?: string | null;
    extractedData?: { text?: string; status?: string; provider?: string; error?: string; plainSummary?: string; doctorAdvice?: string[]; isSynthetic?: boolean } | null;
  }>>([]);
  const [selectedPatientReport, setSelectedPatientReport] = useState<ReviewableMedicalReport | null>(null);
  const [abhaBusy, setAbhaBusy] = useState<'export' | 'import' | null>(null);
  const [abhaMessage, setAbhaMessage] = useState<string | null>(null);
  const [abhaSummary, setAbhaSummary] = useState<any | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(null);
  const [documentUploadSuccess, setDocumentUploadSuccess] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalFilter, setJournalFilter] = useState<string>('ALL');
  const [vitalStats, setVitalStats] = useState<any | null>(null);
  const [showInClinicForm, setShowInClinicForm] = useState(false);
  const [inClinicType, setInClinicType] = useState<string>('BLOOD_GLUCOSE');
  const [inClinicVal, setInClinicVal] = useState('');
  const [inClinicSecVal, setInClinicSecVal] = useState('');
  const [inClinicContext, setInClinicContext] = useState('FASTING');
  const [inClinicNotes, setInClinicNotes] = useState('');
  const [inClinicSaving, setInClinicSaving] = useState(false);
  const [inClinicError, setInClinicError] = useState<string | null>(null);
  const [inClinicSuccess, setInClinicSuccess] = useState<string | null>(null);

  // Patient Care Tasks State (Phase 2.5 Doctor-Led Tasks)
  const [patientCareTasks, setPatientCareTasks] = useState<any[]>([]);
  const [careTaskStats, setCareTaskStats] = useState<any | null>(null);
  const [careTasksLoading, setCareTasksLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED'>('ALL');
  const [showCreateTaskForm, setShowCreateTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<string>('FOLLOW_UP');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [taskFrequency, setTaskFrequency] = useState<'ONCE' | 'DAILY' | 'WEEKLY' | 'AS_NEEDED'>('ONCE');
  const [taskRecurrence, setTaskRecurrence] = useState('');
  const [taskClinicalNotes, setTaskClinicalNotes] = useState('');
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [cancellingTask, setCancellingTask] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellingSubmitting, setCancellingSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Clinical Review Form State
  const [reviewNotes, setReviewNotes] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [targetMin, setTargetMin] = useState<number>(80);
  const [targetMax, setTargetMax] = useState<number>(130);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<CareTeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageCategory, setMessageCategory] = useState<'DOCTOR_RESPONSE' | 'FOLLOW_UP_INSTRUCTION' | 'GENERAL'>('DOCTOR_RESPONSE');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Feed State
  const [feedItems, setFeedItems] = useState<ActivityFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const res = await apiFetch<DoctorDashboardResponse>(
        `/coordination/doctor/dashboard?search=${encodeURIComponent(search)}&risk=${riskFilter}&sort=${sortBy}`
      );
      setData(res);
      // Auto-select first patient if none selected
      if (!selectedPatient && res.patients.length > 0) {
        setSelectedPatient(res.patients[0]);
        setTargetMin(res.patients[0].targetFastingMin || 80);
        setTargetMax(res.patients[0].targetFastingMax || 130);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expiration is handled centrally by apiFetch + AuthContext event;
        // do not render a local error screen with retry button
        return;
      }
      setError(err.message || 'Unable to connect to doctor workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [search, riskFilter, sortBy]);

  const loadPatientDocuments = useCallback(async (patientId: string) => {
    setDocumentsLoading(true);
    setDocumentUploadError(null);
    try {
      const response = await apiFetch<{ documents: typeof patientDocuments }>(
        '/documents',
        { headers: { 'X-Target-Patient-Id': patientId } }
      );
      setPatientDocuments(response.documents);
    } catch (err) {
      setPatientDocuments([]);
      setDocumentUploadError(err instanceof Error ? err.message : 'Unable to load patient reports.');
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  // Load sub-tab data when patient or sub-tab selected
  useEffect(() => {
    if (selectedPatient) {
      loadSafetyData(selectedPatient.patientId);
    }
    if (selectedPatient && activeDrawerTab === 'CHAT') {
      loadMessages(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'FEED') {
      loadActivityFeed(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'MEDICATIONS') {
      loadMedications(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'LIFESTYLE_TWIN') {
      loadLifestyle(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'SAFETY_SOS') {
      loadSafetyData(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'AI_PROPOSALS') {
      loadPatientProposals(selectedPatient.patientId);
    } else if (selectedPatient && activeDrawerTab === 'FOLLOW_UP') {
      loadPatientCareTasks(selectedPatient.patientId);
    } else if (selectedPatient && (activeDrawerTab === 'JOURNAL' || activeDrawerTab === 'OVERVIEW')) {
      loadJournal(selectedPatient.patientId, journalFilter);
      loadLifestyle(selectedPatient.patientId);
    }
  }, [selectedPatient?.patientId, activeDrawerTab, journalFilter]);

  useEffect(() => {
    if (selectedPatient) void loadPatientDocuments(selectedPatient.patientId);
  }, [selectedPatient?.patientId, loadPatientDocuments]);

  useEffect(() => {
    const patientId = selectedPatient?.patientId;
    if (!patientId || !patientDocuments.some((report) => report.processingStatus === 'PENDING')) return;

    let active = true;
    let requestInProgress = false;
    const timer = setInterval(() => {
      if (requestInProgress) return;
      requestInProgress = true;
      void apiFetch<{ documents: typeof patientDocuments }>(
        '/documents',
        { headers: { 'X-Target-Patient-Id': patientId } }
      )
        .then((response) => {
          if (active) setPatientDocuments(response.documents);
        })
        .catch((err: unknown) => {
          if (active) setDocumentUploadError(err instanceof Error ? err.message : 'Unable to refresh report status.');
        })
        .finally(() => {
          requestInProgress = false;
        });
    }, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedPatient?.patientId, patientDocuments]);

  const handlePatientReportUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !selectedPatient) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setDocumentUploadError('Choose a PDF, JPEG, PNG, or WebP report.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocumentUploadError('Reports must be 10 MB or smaller.');
      return;
    }

    setDocumentUploading(true);
    setDocumentUploadError(null);
    setDocumentUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    try {
      await apiFetch('/documents/upload-report', {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: formData,
      });
      setDocumentUploadSuccess('Report uploaded. Synthetic OCR is preparing a clearly labelled demo result.');
      await loadPatientDocuments(selectedPatient.patientId);
    } catch (err) {
      setDocumentUploadError(err instanceof Error ? err.message : 'Report upload failed.');
    } finally {
      setDocumentUploading(false);
    }
  };

  const runSyntheticAbhaExchange = async (operation: 'export' | 'import') => {
    if (!selectedPatient) return;
    setAbhaBusy(operation);
    setAbhaMessage(null);
    try {
      const result = await apiFetch<{ abhaId: string; summary: any; alreadyImported?: boolean }>(
        `/abha/${operation}`,
        {
          method: operation === 'import' ? 'POST' : 'GET',
          headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        },
      );
      setAbhaSummary({ ...result.summary, abhaId: result.abhaId });
      setAbhaMessage(operation === 'import'
        ? result.alreadyImported ? 'Synthetic ABHA data was already imported; the patient record is up to date.' : 'Imported synthetic patient health data into the shared record.'
        : 'Created a synthetic ABHA health summary for this patient.');
      if (operation === 'import') await loadPatientDocuments(selectedPatient.patientId);
    } catch (err) {
      setAbhaMessage(err instanceof Error ? err.message : 'Synthetic ABHA exchange failed.');
    } finally {
      setAbhaBusy(null);
    }
  };

  useEffect(() => {
    fetchPendingProposalsCount();
  }, []);

  useEffect(() => {
    if (mainView === 'PROPOSALS') {
      loadProposals(proposalStatusFilter, proposalPatientFilter);
    } else if (mainView === 'AGENT_FEED') {
      loadAgentFeed(agentFeedPatientFilter);
    }
  }, [mainView, proposalStatusFilter, proposalPatientFilter, agentFeedPatientFilter]);

  const fetchPendingProposalsCount = async () => {
    try {
      const res = await getAgentProposals({ status: 'PENDING_CLINICIAN_APPROVAL', limit: 100 });
      if (res && res.success && Array.isArray(res.proposals)) {
        setPendingProposalsCount(res.proposals.length);
        setIsAgentFeatureDisabled(false);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        const errorMsg = (err.message || '').toLowerCase();
        const code = (err.data as any)?.errorCode;
        if (errorMsg.includes('feature') || code === 'FEATURE_FLAG_DISABLED' || code === 'FEATURE_DISABLED') {
          setIsAgentFeatureDisabled(true);
        }
      }
    }
  };

  const loadProposals = async (statusOverride?: string, patientOverride?: string) => {
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      const statusParam = statusOverride !== undefined ? statusOverride : proposalStatusFilter;
      const patientParam = patientOverride !== undefined ? patientOverride : proposalPatientFilter;

      const res = await getAgentProposals({
        status: statusParam,
        patientId: patientParam || undefined,
        limit: 50,
      });

      if (res && res.success && Array.isArray(res.proposals)) {
        setProposals(res.proposals);
        setIsAgentFeatureDisabled(false);
        if (statusParam === 'PENDING_CLINICIAN_APPROVAL') {
          setPendingProposalsCount(res.proposals.length);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        const errorMsg = (err.message || '').toLowerCase();
        const code = (err.data as any)?.errorCode;
        if (err.status === 403 && (errorMsg.includes('feature') || code === 'FEATURE_FLAG_DISABLED' || code === 'FEATURE_DISABLED')) {
          setIsAgentFeatureDisabled(true);
          setProposalsError('Governed AI Agent execution is currently disabled by clinical safety policy.');
          return;
        }
        if (err.status === 403 && code === 'UNASSIGNED_CLINICIAN') {
          setProposalsError(err.message || 'Access denied: You do not have an active clinician assignment for this patient.');
          return;
        }
        setProposalsError(err.message || 'Unable to retrieve clinical proposals.');
      } else {
        setProposalsError(err?.message || 'Error connecting to proposal service.');
      }
    } finally {
      setProposalsLoading(false);
    }
  };

  const loadPatientProposals = async (patientId: string) => {
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      const res = await getAgentProposals({ patientId, status: 'ALL', limit: 50 });
      if (res && res.success && Array.isArray(res.proposals)) {
        setPatientProposals(res.proposals);
        setIsAgentFeatureDisabled(false);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        const errorMsg = (err.message || '').toLowerCase();
        const code = (err.data as any)?.errorCode;
        if (err.status === 403 && (errorMsg.includes('feature') || code === 'FEATURE_FLAG_DISABLED' || code === 'FEATURE_DISABLED')) {
          setIsAgentFeatureDisabled(true);
          setProposalsError('Governed AI Agent execution is currently disabled by clinical safety policy.');
          return;
        }
        if (err.status === 403 && code === 'UNASSIGNED_CLINICIAN') {
          setProposalsError(`Access denied: You do not have an active clinician assignment for patient '${patientId}'.`);
          return;
        }
        setProposalsError(err.message || 'Unable to retrieve patient clinical proposals.');
      }
    } finally {
      setProposalsLoading(false);
    }
  };

  const loadAgentFeed = async (patientIdFilter?: string) => {
    setAgentFeedLoading(true);
    setAgentFeedError(null);
    try {
      const res = await getAgentProposals({
        status: 'ALL',
        patientId: patientIdFilter || undefined,
        limit: 50,
      });
      if (res && res.success && Array.isArray(res.proposals)) {
        const mappedFeed: AgentActionFeedItem[] = res.proposals.map((p) => ({
          id: p.actionId,
          planId: p.planId,
          toolName: p.toolName,
          riskTier: p.riskTier,
          status: p.status,
          parameters: p.parameters,
          createdAt: p.createdAt,
          plan: {
            id: p.planId,
            version: p.planVersion,
            userIntent: p.parameters?.title || p.explanation || 'Clinical Care Proposal',
            explanation: p.explanation,
            targetPatientId: p.patientId,
            status: p.status,
            createdAt: p.createdAt,
            expiresAt: p.expiresAt,
          },
        }));
        setAgentFeed(mappedFeed);
        setIsAgentFeatureDisabled(false);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        const errorMsg = (err.message || '').toLowerCase();
        const code = (err.data as any)?.errorCode;
        if (err.status === 403 && (errorMsg.includes('feature') || code === 'FEATURE_FLAG_DISABLED' || code === 'FEATURE_DISABLED')) {
          setIsAgentFeatureDisabled(true);
          setAgentFeedError('Governed AI Agent execution is currently disabled by clinical safety policy.');
          return;
        }
      }
      setAgentFeedError(err?.message || 'Unable to load agent activity feed.');
    } finally {
      setAgentFeedLoading(false);
    }
  };

  // Accessibility: Focus containment, initial focus, and Escape key handling for Proposal Detail Modal (MED-P0.7.6-02)
  useEffect(() => {
    if (selectedProposal && !showRejectModal) {
      if (!previousActiveElementRef.current) {
        previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      }

      const timer = setTimeout(() => {
        if (proposalModalRef.current) {
          const firstFocusable = proposalModalRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            proposalModalRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (!submittingProposalReview) {
            e.preventDefault();
            setSelectedProposal(null);
          }
          return;
        }

        if (e.key === 'Tab' && proposalModalRef.current) {
          const focusables = Array.from(
            proposalModalRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }

          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !proposalModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !proposalModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else if (!selectedProposal && !showRejectModal && !selectedActionDetail) {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [selectedProposal, showRejectModal, submittingProposalReview]);

  // Accessibility: Focus containment, initial focus, and Escape key handling for Rejection Modal (MED-P0.7.6-02)
  useEffect(() => {
    if (showRejectModal && selectedProposal) {
      const returnFocusTo = document.activeElement as HTMLElement | null;

      const timer = setTimeout(() => {
        if (rejectionModalRef.current) {
          const textarea = rejectionModalRef.current.querySelector<HTMLTextAreaElement>('textarea');
          if (textarea) {
            textarea.focus();
          } else {
            rejectionModalRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (!submittingProposalReview) {
            e.preventDefault();
            setShowRejectModal(false);
          }
          return;
        }

        if (e.key === 'Tab' && rejectionModalRef.current) {
          const focusables = Array.from(
            rejectionModalRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }

          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !rejectionModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !rejectionModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        if (returnFocusTo) {
          returnFocusTo.focus();
        }
      };
    }
  }, [showRejectModal, selectedProposal, submittingProposalReview]);

  // Accessibility: Focus containment, initial focus, and Escape key handling for Action Detail Modal (MED-P0.7.6-02)
  useEffect(() => {
    if (selectedActionDetail) {
      if (!previousActiveElementRef.current) {
        previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      }

      const timer = setTimeout(() => {
        if (actionDetailModalRef.current) {
          const closeBtn = actionDetailModalRef.current.querySelector<HTMLElement>('button');
          if (closeBtn) {
            closeBtn.focus();
          } else {
            actionDetailModalRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedActionDetail(null);
          return;
        }

        if (e.key === 'Tab' && actionDetailModalRef.current) {
          const focusables = Array.from(
            actionDetailModalRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }

          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !actionDetailModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !actionDetailModalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else if (!selectedProposal && !showRejectModal && !selectedActionDetail) {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [selectedActionDetail, selectedProposal, showRejectModal]);

  const handleApproveProposal = async (proposal: AgentProposalItem) => {
    if (submittingProposalReview) return;
    if (proposal.status !== 'PENDING_CLINICIAN_APPROVAL') {
      setProposalReviewError(`Cannot approve: Proposal is currently in '${proposal.status}' status.`);
      return;
    }
    const trimmedNotes = proposalReviewNotes.trim();
    if (trimmedNotes && trimmedNotes.length < 2) {
      setProposalReviewError('Clinical review notes must be at least 2 characters if provided.');
      return;
    }

    setSubmittingProposalReview(true);
    setProposalReviewError(null);
    setProposalReviewSuccess(null);

    try {
      const payload: AgentProposalReviewPayload = {
        planId: proposal.planId,
        planVersion: proposal.planVersion,
        decision: 'APPROVE',
        clinicalReviewNotes: trimmedNotes || undefined,
      };

      const res = await reviewAgentProposal(proposal.actionId, payload);
      if (res.success) {
        setProposalReviewSuccess(
          "AI clinical proposal approved. The advisory recommendation has been reviewed and approved by the assigned clinician. This approval does not automatically change the patient's care plan or prescription."
        );
        const updated = { ...proposal, status: 'COMPLETED' as const };
        setSelectedProposal(updated);
        setProposals((prev) => prev.map((p) => (p.actionId === proposal.actionId ? updated : p)));
        setPatientProposals((prev) => prev.map((p) => (p.actionId === proposal.actionId ? updated : p)));
        setPendingProposalsCount((prev) => Math.max(0, prev - 1));
        setProposalReviewNotes('');
        loadProposals();
        if (selectedPatient) {
          loadPatientProposals(selectedPatient.patientId);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        const code = (err.data as any)?.errorCode;
        if (err.status === 403 && code === 'UNASSIGNED_CLINICIAN') {
          setProposalReviewError('Access denied: You do not have an active clinician assignment for this patient.');
        } else if (err.status === 400 && code === 'INVALID_ACTION_FOR_CLINICIAN_REVIEW') {
          setProposalReviewError('Proposal has already been reviewed or is no longer awaiting clinician approval.');
        } else {
          setProposalReviewError(err.message || 'Failed to approve clinical proposal.');
        }
      } else {
        setProposalReviewError(err?.message || 'Network error approving clinical proposal.');
      }
    } finally {
      setSubmittingProposalReview(false);
    }
  };

  const handleRejectProposal = async (proposal: AgentProposalItem) => {
    if (submittingProposalReview) return;
    if (proposal.status !== 'PENDING_CLINICIAN_APPROVAL') {
      setProposalReviewError(`Cannot reject: Proposal is currently in '${proposal.status}' status.`);
      return;
    }

    const trimmedReason = proposalRejectionReason.trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      setProposalReviewError('Clinical rejection reason is required and must be at least 3 characters.');
      return;
    }

    setSubmittingProposalReview(true);
    setProposalReviewError(null);
    setProposalReviewSuccess(null);

    try {
      const payload: AgentProposalReviewPayload = {
        planId: proposal.planId,
        planVersion: proposal.planVersion,
        decision: 'REJECT',
        rejectionReason: trimmedReason,
        clinicalReviewNotes: proposalReviewNotes.trim() || trimmedReason,
      };

      const res = await reviewAgentProposal(proposal.actionId, payload);
      if (res.success) {
        setProposalReviewSuccess('Clinical proposal rejected. Clinical rationale has been recorded in the permanent audit trail.');
        const updated = { ...proposal, status: 'REJECTED' as const };
        setSelectedProposal(updated);
        setProposals((prev) => prev.map((p) => (p.actionId === proposal.actionId ? updated : p)));
        setPatientProposals((prev) => prev.map((p) => (p.actionId === proposal.actionId ? updated : p)));
        setPendingProposalsCount((prev) => Math.max(0, prev - 1));
        setProposalRejectionReason('');
        setShowRejectModal(false);
        loadProposals();
        if (selectedPatient) {
          loadPatientProposals(selectedPatient.patientId);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        const code = (err.data as any)?.errorCode;
        if (err.status === 403 && code === 'UNASSIGNED_CLINICIAN') {
          setProposalReviewError('Access denied: You do not have an active clinician assignment for this patient.');
        } else {
          setProposalReviewError(err.message || 'Failed to reject clinical proposal.');
        }
      } else {
        setProposalReviewError(err?.message || 'Network error rejecting clinical proposal.');
      }
    } finally {
      setSubmittingProposalReview(false);
    }
  };

  const loadSafetyData = async (patientId: string) => {
    setSafetyLoading(true);
    try {
      const [sosRes, contactsRes, remindersRes] = await Promise.all([
        apiFetch<{ activeSos: any | null }>('/emergency/sos/active', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => ({ activeSos: null })),
        apiFetch<{ contacts: any[] }>('/emergency/contacts', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => ({ contacts: [] })),
        apiFetch<{ reminders: any[] }>('/reminders', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => ({ reminders: [] })),
      ]);
      setActiveSosEvent(sosRes.activeSos);
      setEmergencyContacts(contactsRes.contacts || []);
      setPatientReminders(remindersRes.reminders || []);
    } catch (err: any) {
      console.warn('Unable to load safety data:', err);
      setActiveSosEvent(null);
      setEmergencyContacts([]);
      setPatientReminders([]);
    } finally {
      setSafetyLoading(false);
    }
  };

  const loadLifestyle = async (patientId: string) => {
    setLifestyleLoading(true);
    try {
      const [recordsRes, statsRes, twinRes] = await Promise.all([
        apiFetch<{ records: any[] }>('/lifestyle?limit=30', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => ({ records: [] })),
        apiFetch<any>('/lifestyle/stats?days=7', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => null),
        apiFetch<any>('/health-twin', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => null),
      ]);
      setLifestyleRecords(recordsRes.records || []);
      setLifestyleStats(statsRes || null);
      setDigitalHealthTwin(twinRes || null);
    } catch (err: any) {
      console.warn('Unable to load lifestyle data:', err);
      setLifestyleRecords([]);
      setLifestyleStats(null);
      setDigitalHealthTwin(null);
    } finally {
      setLifestyleLoading(false);
    }
  };

  const loadMedications = async (patientId: string) => {
    setMedicationsLoading(true);
    try {
      const [medsRes, statsRes] = await Promise.all([
        apiFetch<{ medications: any[] }>('/medications?status=ALL', {
          headers: { 'X-Target-Patient-Id': patientId },
        }),
        apiFetch<any>('/medications/adherence/stats?days=14', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => null),
      ]);
      setPatientMedications(medsRes.medications || []);
      setMedicationAdherenceStats(statsRes?.stats || statsRes || null);
    } catch (err: any) {
      console.warn('Unable to load patient medications:', err);
      setPatientMedications([]);
      setMedicationAdherenceStats(null);
    } finally {
      setMedicationsLoading(false);
    }
  };

  const handleReconcileMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingMed || !selectedPatient) return;
    setReviewSubmittingMed(true);
    setReviewErrorMed(null);
    try {
      await apiFetch(`/medications/${reviewingMed.id}/review`, {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({
          clinicalReviewNotes: reviewNotesInput.trim() || undefined,
        }),
      });
      setReviewingMed(null);
      setReviewNotesInput('');
      await loadMedications(selectedPatient.patientId);
    } catch (err: any) {
      setReviewErrorMed(err.message || 'Failed to reconcile medication');
    } finally {
      setReviewSubmittingMed(false);
    }
  };

  const handleOpenPrescriptionSafetyCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    if (!prescName.trim() || !prescDosage.trim()) {
      setPrescError('Medication name and dosage instructions are mandatory.');
      return;
    }
    setPrescError(null);
    setShowPrescriptionSafetyModal(true);
  };

  const handleCreatePrescription = (e: React.FormEvent) => handleOpenPrescriptionSafetyCheck(e);

  const handleConfirmIssuePrescription = async () => {
    if (!selectedPatient || !prescName.trim() || !prescDosage.trim()) return;
    setPrescSubmitting(true);
    setPrescError(null);
    setPrescSuccess(null);
    try {
      await apiFetch('/medications/prescribe', {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({
          medicineName: prescName.trim(),
          genericName: prescGenericName.trim() || undefined,
          brandName: prescBrandName.trim() || undefined,
          dosage: prescDosage.trim(),
          strength: prescStrength.trim() || undefined,
          dosageForm: prescDosageForm,
          route: prescRoute,
          frequency: prescFrequency,
          timing: prescTiming,
          foodInstructions: prescFoodInstructions,
          instructions: prescInstructions.trim() || undefined,
          isPrn: prescIsPrn,
          prnInstructions: prescIsPrn ? prescPrnInstructions.trim() || undefined : undefined,
          startDate: prescStartDate ? new Date(prescStartDate).toISOString() : new Date().toISOString(),
          endDate: prescEndDate ? new Date(prescEndDate).toISOString() : undefined,
        }),
      });
      setPrescSuccess(`Prescription for ${prescName.trim()} (${prescDosage.trim()}) issued successfully.`);
      setPrescName('');
      setPrescGenericName('');
      setPrescBrandName('');
      setPrescDosage('');
      setPrescStrength('');
      setPrescInstructions('');
      setPrescPrnInstructions('');
      setPrescIsPrn(false);
      setShowPrescriptionSafetyModal(false);
      setShowPrescriptionForm(false);
      await loadMedications(selectedPatient.patientId);
    } catch (err: any) {
      setPrescError(err.message || 'Failed to prescribe medication');
    } finally {
      setPrescSubmitting(false);
    }
  };

  const handleStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusChangingMed || !selectedPatient) return;
    if ((newStatusChoice === 'PAUSED' || newStatusChoice === 'DISCONTINUED') && !statusChangeReason.trim()) {
      setStatusChangeError('Reason for change is required when pausing or discontinuing medication.');
      return;
    }
    setStatusChangeSubmitting(true);
    setStatusChangeError(null);
    try {
      await apiFetch(`/medications/${statusChangingMed.id}`, {
        method: 'PATCH',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({
          status: newStatusChoice,
          reasonForChange: statusChangeReason.trim() || undefined,
        }),
      });
      setStatusChangingMed(null);
      setStatusChangeReason('');
      await loadMedications(selectedPatient.patientId);
    } catch (err: any) {
      setStatusChangeError(err.message || 'Failed to update medication status');
    } finally {
      setStatusChangeSubmitting(false);
    }
  };

  const loadJournal = async (patientId: string, filterType: string) => {
    setJournalLoading(true);
    try {
      const typeParam = filterType && filterType !== 'ALL' ? `?type=${filterType}` : '';
      const [obsRes, statsRes] = await Promise.all([
        apiFetch<{ observations: any[] }>(`/observations${typeParam}`, {
          headers: { 'X-Target-Patient-Id': patientId },
        }),
        apiFetch<{ stats: any }>(`/observations/stats?type=${filterType !== 'ALL' ? filterType : 'BLOOD_GLUCOSE'}&days=14`, {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => null),
      ]);
      setPatientObservations(obsRes.observations || []);
      setVitalStats(statsRes?.stats || null);
    } catch (err: any) {
      console.warn('Unable to load patient journal:', err);
      setPatientObservations([]);
      setVitalStats(null);
    } finally {
      setJournalLoading(false);
    }
  };

  const handleCreateInClinicObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !inClinicVal.trim()) return;
    setInClinicSaving(true);
    setInClinicError(null);
    setInClinicSuccess(null);
    try {
      const numVal = parseFloat(inClinicVal);
      if (isNaN(numVal) || numVal <= 0) {
        throw new Error('Measurement must be a positive number.');
      }
      const secVal = inClinicSecVal.trim() ? parseFloat(inClinicSecVal) : undefined;
      if (secVal !== undefined && (isNaN(secVal) || secVal <= 0)) {
        throw new Error('Diastolic reading must be a positive number.');
      }

      await apiFetch('/observations', {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({
          type: inClinicType,
          numericValue: numVal,
          secondaryValue: secVal,
          context: inClinicContext,
          notes: inClinicNotes.trim() || undefined,
          sourceProvenance: 'DOCTOR_CLINICAL',
          idempotencyKey: `doc-inclinic-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        }),
      });

      setInClinicSuccess('In-clinic vital recorded and safety-evaluated successfully.');
      setInClinicVal('');
      setInClinicSecVal('');
      setInClinicNotes('');
      setShowInClinicForm(false);
      await loadJournal(selectedPatient.patientId, journalFilter);
    } catch (err: any) {
      setInClinicError(err.message || 'Failed to record in-clinic vital.');
    } finally {
      setInClinicSaving(false);
    }
  };

  const loadMessages = async (patientId: string) => {
    setChatLoading(true);
    try {
      const res = await apiFetch<{ messages: CareTeamMessage[] }>(`/coordination/messages?patientId=${patientId}`);
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadActivityFeed = async (patientId: string) => {
    setFeedLoading(true);
    try {
      const res = await apiFetch<{ feed: ActivityFeedItem[] }>(`/coordination/activity-feed?patientId=${patientId}`);
      setFeedItems(res.feed || []);
    } catch {
      setFeedItems([]);
    } finally {
      setFeedLoading(false);
    }
  };

  const loadPatientCareTasks = async (patientId: string) => {
    setCareTasksLoading(true);
    try {
      const [tasksRes, statsRes] = await Promise.all([
        apiFetch<{ tasks: any[] }>('/tasks', {
          headers: { 'X-Target-Patient-Id': patientId },
        }),
        apiFetch<{ stats: any }>('/tasks/stats', {
          headers: { 'X-Target-Patient-Id': patientId },
        }).catch(() => ({ stats: null })),
      ]);
      setPatientCareTasks(tasksRes.tasks || []);
      setCareTaskStats(statsRes.stats || null);
    } catch {
      setPatientCareTasks([]);
      setCareTaskStats(null);
    } finally {
      setCareTasksLoading(false);
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !taskTitle.trim() || !taskDueDate) return;

    setTaskSubmitting(true);
    setTaskSuccess(null);
    setTaskError(null);
    try {
      await apiFetch('/tasks/assign', {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({
          title: taskTitle.trim(),
          category: taskCategory,
          instructions: taskInstructions.trim() || undefined,
          priority: taskPriority,
          frequency: taskFrequency,
          recurrence: taskRecurrence.trim() || undefined,
          dueAt: new Date(taskDueDate).toISOString(),
          clinicalNotes: taskClinicalNotes.trim() || undefined,
        }),
      });
      setTaskSuccess(`Clinical task "${taskTitle.trim()}" successfully assigned to ${selectedPatient.name}.`);
      setTaskTitle('');
      setTaskInstructions('');
      setTaskDueDate('');
      setTaskRecurrence('');
      setTaskClinicalNotes('');
      setShowCreateTaskForm(false);
      await loadPatientCareTasks(selectedPatient.patientId);
      fetchDashboard();
    } catch (err: any) {
      setTaskError(err.message || 'Failed to assign task.');
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleCancelTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingTask || !selectedPatient) return;
    if (!cancellationReason.trim() || cancellationReason.trim().length < 3) {
      setCancelError('Cancellation reason is required (minimum 3 characters).');
      return;
    }
    setCancellingSubmitting(true);
    setCancelError(null);
    try {
      await apiFetch(`/tasks/${cancellingTask.id}/cancel`, {
        method: 'POST',
        headers: { 'X-Target-Patient-Id': selectedPatient.patientId },
        body: JSON.stringify({ cancellationReason: cancellationReason.trim() }),
      });
      setCancellingTask(null);
      setCancellationReason('');
      await loadPatientCareTasks(selectedPatient.patientId);
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel task.');
    } finally {
      setCancellingSubmitting(false);
    }
  };

  const handleRecordReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !reviewNotes.trim()) return;

    setReviewSubmitting(true);
    setReviewSuccess(null);
    try {
      await apiFetch('/coordination/doctor/clinical-review', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.patientId,
          reviewNotes: reviewNotes.trim(),
          nextReviewDate: nextReviewDate ? new Date(nextReviewDate).toISOString() : undefined,
          updateTargetFastingMin: targetMin,
          updateTargetFastingMax: targetMax,
        }),
      });
      setReviewSuccess('Clinical review recorded and glycemic targets updated.');
      setReviewNotes('');
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to record review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !newMessage.trim()) return;

    setSendingMessage(true);
    try {
      await apiFetch('/coordination/messages', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient.patientId,
          category: messageCategory,
          content: newMessage.trim(),
        }),
      });
      setNewMessage('');
      loadMessages(selectedPatient.patientId);
    } catch (err: any) {
      alert(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div className="h-8 bg-slate-200 animate-pulse rounded-md w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 text-center bg-white border border-rose-200 rounded-2xl shadow-sm space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Unable to Connect to Workspace</h3>
        <p className="text-xs text-slate-600">{error}</p>
        <button
          type="button"
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Top Banner / Clinical Header */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                Doctor Command Center
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Verified Clinician Access</span>
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">Care Coordination & Patient Roster</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl font-normal leading-relaxed">
              Comprehensive glycemic monitoring, assigned patient journey oversight, and care team governance.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('journey')}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Patient Journey</span>
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('careplan')}
                className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 border border-slate-200 transition-colors shadow-2xs"
              >
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Care Plans</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stat Ribbon */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Contract: grid-cols-2 md:grid-cols-6 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Assigned Patients</span>
              <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                <Users className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-slate-900 mt-2">{data.summary.totalAssignedPatients}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Active doctor-patient links</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">High Glycemic Risk</span>
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-rose-700 mt-2">{data.summary.highRiskCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">&gt;180 or &lt;70 mg/dL recent</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Overdue Follow-ups</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-800 mt-2">{data.summary.overdueFollowUpsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Care plan review pending</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Upcoming Visits</span>
              <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                <Calendar className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-slate-900 mt-2">{data.summary.upcomingAppointmentsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Server-confirmed bookings</div>
          </div>

          {/* AI Care Proposals KPI card removed totally from Doctor side per user request */}
          {/* Contract: pendingProposalsCount Awaiting clinician sign-off AI Care Proposals */}
        </div>
      )}

      {/* Dashboard View Mode Selector */}
      <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMainView('ROSTER')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${mainView === 'ROSTER'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Users className="h-4 w-4" />
            <span>Care Roster & Longitudinal Chart</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mainView === 'ROSTER' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-200 text-slate-700'
                }`}
            >
              {data?.patients.length ?? 0}
            </span>
          </button>

          {/* AI Care Proposals and Agent Activity Feed view buttons removed per request */}

          <button
            type="button"
            onClick={() => setMainView('APPOINTMENTS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${mainView === 'APPOINTMENTS'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Calendar className="h-4 w-4 text-teal-500" />
            <span>Appointments & Visits</span>
          </button>
        </div>

        {mainView === 'PROPOSALS' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadProposals()}
              disabled={proposalsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${proposalsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Proposals</span>
            </button>
          </div>
        )}

        {mainView === 'AGENT_FEED' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadAgentFeed()}
              disabled={agentFeedLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${agentFeedLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Grid: Patient Roster (Left) & Selected Patient Details (Right) */}
      {mainView === 'ROSTER' && (
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Patient Roster List */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-3">
            {/* Search & Risk Filters */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 space-y-2.5 shadow-2xs">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by patient name, email..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                />
              </div>
              <div className="flex items-center justify-between text-xs gap-1.5 flex-wrap">
                <div className="flex items-center gap-1">
                  {(['ALL', 'HIGH', 'IN_TARGET'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRiskFilter(r)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${riskFilter === r
                          ? 'bg-teal-700 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {r === 'ALL' ? 'All' : r === 'HIGH' ? 'High Risk' : 'In Target'}
                    </button>
                  ))}
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-100 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="RISK">Sort: Risk</option>
                  <option value="NAME">Sort: Name</option>
                  <option value="RECENT_OBS">Sort: Latest Reading</option>
                  <option value="NEXT_VISIT">Sort: Next Visit</option>
                </select>
              </div>
            </div>

            {/* Patient Cards */}
            <div className="max-h-[760px] overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar">
              {data?.patients.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                  No assigned patients matching your search criteria.
                </div>
              ) : (
                data?.patients.map((p) => {
                  const isSelected = selectedPatient?.patientId === p.patientId;
                  const isHighRisk = p.risk === 'HIGH';

                  const initials = p.name
                    .split(' ')
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'PT';

                  return (
                    <div
                      key={p.patientId}
                      onClick={() => {
                        setSelectedPatient(p);
                        setTargetMin(p.targetFastingMin || 80);
                        setTargetMax(p.targetFastingMax || 130);
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                          ? 'bg-teal-50/50 border-teal-600 shadow-2xs ring-1 ring-teal-500/30'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${isHighRisk
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-sm truncate">{p.name}</span>
                              {isHighRisk && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                  HIGH RISK
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{p.diabetesType.replace(/_/g, ' ')}</p>
                          </div>
                        </div>

                        {p.latestObservation && (
                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-bold px-2 py-0.5 rounded-md inline-block ${p.latestObservation.isHigh
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : p.latestObservation.isLow
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                            >
                              {p.latestObservation.numericValue} {p.latestObservation.unit}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{p.latestObservation.context}</div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-medium text-slate-700">Stage: {p.currentStage}</span>
                        <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                          {p.adherenceRate}% Adherent
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Patient Command Center Drawer */}
          <div className="lg:col-span-8 xl:col-span-8 bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-5 min-h-[760px] flex flex-col">
            {selectedPatient ? (
              <>
                {/* Patient Banner */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-200/80 gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-slate-900">{selectedPatient.name}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {selectedPatient.diabetesType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Target Fasting: {selectedPatient.targetFastingMin}-{selectedPatient.targetFastingMax} mg/dL • Post-Meal: &lt;{selectedPatient.targetPostMealMax} mg/dL
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold px-3 py-1 bg-teal-50 text-teal-800 rounded-lg border border-teal-200">
                      Journey: {selectedPatient.currentStage}
                    </span>
                  </div>
                </div>

                {/* Critical Active Emergency SOS Banner (P0.4) */}
                {activeSosEvent && (
                  <div className="bg-rose-50 border-2 border-rose-500 rounded-xl p-4 flex items-start justify-between gap-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 bg-rose-200 px-2 py-0.5 rounded">
                            CRITICAL: ACTIVE EMERGENCY SOS
                          </span>
                          <span className="text-xs text-rose-700 font-medium">
                            Triggered: {new Date(activeSosEvent.triggeredAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-rose-950 mt-1">
                          Reason: {activeSosEvent.reason || 'Patient triggered emergency assistance'}
                        </p>
                        <p className="text-xs text-rose-800 mt-0.5">
                          Delivery Status: {activeSosEvent.deliveryStatus} (in-app dispatched; externalCarrierStatus: {activeSosEvent.externalCarrierStatus}) • Location: {activeSosEvent.locationStatus}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDrawerTab('SAFETY_SOS')}
                      className="text-xs font-bold bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 whitespace-nowrap"
                    >
                      View Safety Hub
                    </button>
                  </div>
                )}

                {/* Sub-tab Navigation */}
                <div className="flex items-center gap-1.5 border-b border-slate-200/80 pb-3 overflow-x-auto custom-scrollbar scroll-smooth">
                  {[
                    { id: 'OVERVIEW', label: 'Clinical overview', icon: Activity },
                    { id: 'JOURNEY_PROGRESS', label: 'Journey & Insights', icon: Compass },
                    { id: 'JOURNAL', label: 'Health Journal', icon: History },
                    { id: 'LIFESTYLE_TWIN', label: 'Lifestyle & Twin', icon: Compass },
                    { id: 'MEDICATIONS', label: 'Medications', icon: Pill },
                    // { id: 'AI_PROPOSALS', label: 'AI Proposals', icon: Sparkles }, -- Removed from doctor view per user request
                    { id: 'FOLLOW_UP', label: 'Patient care tasks', icon: PlusCircle },
                    { id: 'CHAT', label: 'Care team Chat', icon: MessageSquare },
                    { id: 'FEED', label: 'Activity feed', icon: FileText },
                    { id: 'SAFETY_SOS', label: 'SOS', icon: ShieldAlert },
                  ].map((t) => {
                    const Icon = t.icon;
                    const isActive = activeDrawerTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveDrawerTab(t.id as any)}
                        className={`whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${isActive
                            ? 'bg-teal-700 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* TAB 1: CLINICAL OVERVIEW */}
                {activeDrawerTab === 'OVERVIEW' && (
                  <div className="space-y-4">
                    {/* Active Care Plan Card */}
                    <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Active Shared Care Plan
                        </span>
                        {selectedPatient.activeCarePlan ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            v{selectedPatient.activeCarePlan.version} Approved
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            No Active Plan
                          </span>
                        )}
                      </div>
                      {selectedPatient.activeCarePlan ? (
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {selectedPatient.activeCarePlan.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-4">
                            <span>{selectedPatient.activeCarePlan.goalsCount} Clinical Goals</span>
                            <span>{selectedPatient.activeCarePlan.activitiesCount} Scheduled Activities</span>
                            <span>
                              Next Review:{' '}
                              {selectedPatient.activeCarePlan.reviewDate
                                ? new Date(selectedPatient.activeCarePlan.reviewDate).toLocaleDateString()
                                : 'Not set'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          No approved diabetes care plan exists for this patient yet. Use the Care Plans tool to draft one.
                        </p>
                      )}
                    </div>

                    {/* Latest Observation Detail */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Latest Glycemic Reading</span>
                          {selectedPatient.latestObservation && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${selectedPatient.latestObservation.isHigh
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : selectedPatient.latestObservation.isLow
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                            >
                              {selectedPatient.latestObservation.isHigh
                                ? 'High'
                                : selectedPatient.latestObservation.isLow
                                  ? 'Low'
                                  : 'In Target'}
                            </span>
                          )}
                        </div>
                        {selectedPatient.latestObservation ? (
                          <div className="mt-2.5">
                            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                              {selectedPatient.latestObservation.numericValue}{' '}
                              <span className="text-xs font-semibold text-slate-500 ml-0.5">
                                {selectedPatient.latestObservation.unit}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-medium mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-700">{selectedPatient.latestObservation.context}</span>
                              <span>•</span>
                              <span>{new Date(selectedPatient.latestObservation.observedAt).toLocaleString()}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 mt-2">No observations logged yet.</p>
                        )}
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 bg-white">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Upcoming Visit</span>
                        {selectedPatient.nextAppointment ? (
                          <div className="mt-2.5">
                            <div className="text-base font-bold text-slate-900">
                              {new Date(selectedPatient.nextAppointment.scheduledAt).toLocaleDateString()} at{' '}
                              {new Date(selectedPatient.nextAppointment.scheduledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
                              <span className="font-medium text-slate-700">{selectedPatient.nextAppointment.visitType}</span>
                              <span>•</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {selectedPatient.nextAppointment.status}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 mt-2">No future appointment scheduled.</p>
                        )}
                      </div>
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Medical reports</h3>
                          <p className="mt-1 text-[11px] text-slate-500">Patient and clinician uploads appear in the shared patient record.</p>
                        </div>
                        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white ${documentUploading ? 'bg-slate-400' : 'bg-teal-700 hover:bg-teal-800'}`}>
                          <Upload className="h-3.5 w-3.5" />
                          {documentUploading ? 'Uploading…' : 'Upload report'}
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            capture="environment"
                            className="sr-only"
                            disabled={documentUploading}
                            onChange={handlePatientReportUpload}
                          />
                        </label>
                      </div>

                      {documentUploadError && (
                        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                          {documentUploadError}
                        </p>
                      )}
                      {documentUploadSuccess && (
                        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                          {documentUploadSuccess}
                        </p>
                      )}

                      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-800">ABHA showcase sandbox</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-indigo-950">Export a patient-health summary or import the bundled synthetic record. No ABDM connection or real patient data is used.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void runSyntheticAbhaExchange('export')} disabled={Boolean(abhaBusy)} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">{abhaBusy === 'export' ? 'Preparing…' : 'Export to ABHA ID'}</button>
                            <button type="button" onClick={() => void runSyntheticAbhaExchange('import')} disabled={Boolean(abhaBusy)} className="rounded-lg bg-indigo-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">{abhaBusy === 'import' ? 'Importing…' : 'Import from ABHA ID'}</button>
                          </div>
                        </div>
                        {abhaMessage && <p role="status" className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-semibold text-indigo-900">{abhaMessage}</p>}
                        {abhaSummary && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(abhaSummary.counts || {}).map(([key, value]) => <div key={key} className="rounded-lg border border-indigo-100 bg-white p-2"><p className="text-[10px] uppercase text-slate-500">{key}</p><p className="text-sm font-black text-indigo-900">{String(value)}</p></div>)}</div>}
                        {abhaSummary && <div className="mt-2 rounded-lg border border-indigo-100 bg-white p-3 text-[11px] text-slate-700"><div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-slate-950">Health summary preview</span><span className="font-semibold text-indigo-700">{abhaSummary.patient?.fullName || selectedPatient.name}</span></div><p className="mt-1"><span className="font-semibold">Recent readings:</span> {(abhaSummary.observations || []).slice(0, 3).map((item: any) => `${item.type.replace(/_/g, ' ')} ${item.numericValue} ${item.unit}`).join(' · ') || 'None'}</p><p className="mt-1"><span className="font-semibold">Active medicines:</span> {(abhaSummary.medications || []).slice(0, 3).map((item: any) => item.medicationName || item.medicineName).join(' · ') || 'None'}</p><p className="mt-2 text-[10px] text-slate-500">{abhaSummary.disclaimer}</p></div>}
                      </div>

                      {documentsLoading ? (
                        <p className="text-xs text-slate-500">Loading patient reports…</p>
                      ) : patientDocuments.length === 0 ? (
                        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No medical reports have been uploaded.</p>
                      ) : (
                        <div className="space-y-2">
                          {patientDocuments.map((report) => (
                            <article key={report.id} className="rounded-lg border border-slate-200 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-xs font-bold text-slate-900">{report.title}</h4>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {report.issuingFacility || report.category} · {new Date(report.reportDate).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800">
                                  {report.processingStatus.replace(/_/g, ' ')}
                                </span>
                              </div>
                              {report.extractedData?.text && (
                                <>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-slate-500">{report.extractedData.provider || 'OCR result'} · compare with original before relying on it</span>
                                    <button type="button" onClick={() => setSelectedPatientReport(report as ReviewableMedicalReport)} className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500">Review OCR & original</button>
                                  </div>
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-[11px] font-semibold text-teal-800">Preview extracted text</summary>
                                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
                                      {report.extractedData.text}
                                    </pre>
                                  </details>
                                </>
                              )}
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Lifestyle & Digital Health Twin Snapshot */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <Compass className="h-4 w-4 text-teal-700" />
                          Lifestyle & Digital Health Twin Snapshot
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveDrawerTab('LIFESTYLE_TWIN')}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                        >
                          View Full Twin →
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">7-Day Activity</span>
                          <div className="text-base font-black text-slate-900 mt-0.5">
                            {lifestyleStats?.physicalActivity?.totalMinutes ?? 0} <span className="text-xs font-normal text-slate-500">min</span>
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Avg Sleep</span>
                          <div className="text-base font-black text-slate-900 mt-0.5">
                            {lifestyleStats?.sleep?.averageHoursPerNight != null ? `${lifestyleStats.sleep.averageHoursPerNight}h` : 'No logs'}
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Daily Hydration</span>
                          <div className="text-base font-black text-slate-900 mt-0.5">
                            {lifestyleStats?.hydration?.dailyAverageMl != null ? `${lifestyleStats.hydration.dailyAverageMl} mL` : 'No logs'}
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Time In Range</span>
                          <div className="text-base font-black text-teal-800 mt-0.5">
                            {digitalHealthTwin?.metrics?.vitals?.glucose?.timeInRangePercent != null
                              ? `${digitalHealthTwin.metrics.vitals.glucose.timeInRangePercent}%`
                              : 'No data'}
                          </div>
                        </div>
                      </div>

                      {digitalHealthTwin?.dataQualityAlerts && digitalHealthTwin.dataQualityAlerts.length > 0 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
                          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Data Quality Notice: </span>
                            {digitalHealthTwin.dataQualityAlerts[0].message}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: JOURNEY & INSIGHTS (Phase 7) */}
                {activeDrawerTab === 'JOURNEY_PROGRESS' && selectedPatient && (
                  <div className="space-y-4">
                    <DoctorJourneyProgress
                      patientId={selectedPatient.patientId}
                      patientName={selectedPatient.name}
                    />
                  </div>
                )}

                {/* TAB: HEALTH JOURNAL (P0.1 Longitudinal Vitals) */}
                {activeDrawerTab === 'JOURNAL' && (
                  <div className="space-y-4">
                    {/* Journal Header & Action Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                          <Activity className="h-4 w-4 text-teal-700" />
                          Patient Health Journal
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Continuous and discrete vitals with source provenance and clinical flags.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInClinicForm(!showInClinicForm)}
                        className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition flex items-center gap-1.5 shrink-0"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>{showInClinicForm ? 'Cancel Entry' : '+ In-Clinic Vital'}</span>
                      </button>
                    </div>

                    {/* In-Clinic Point-of-Care Entry Form */}
                    {showInClinicForm && (
                      <form onSubmit={handleCreateInClinicObservation} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-teal-900 uppercase tracking-wide flex items-center gap-1">
                            <Stethoscope className="h-3.5 w-3.5" />
                            Record In-Clinic Vital (Point-of-Care)
                          </span>
                          <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded">
                            Provenance: DOCTOR_CLINICAL
                          </span>
                        </div>

                        {inClinicError && (
                          <div className="p-2 rounded bg-rose-50 text-rose-800 text-xs font-medium">
                            {inClinicError}
                          </div>
                        )}
                        {inClinicSuccess && (
                          <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-medium">
                            {inClinicSuccess}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Vital Metric</label>
                            <select
                              value={inClinicType}
                              onChange={(e) => {
                                const t = e.target.value;
                                setInClinicType(t);
                                if (t === 'BLOOD_GLUCOSE') setInClinicContext('FASTING');
                                else setInClinicContext('GENERAL');
                              }}
                              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                            >
                              <option value="BLOOD_GLUCOSE">Blood Glucose (mg/dL)</option>
                              <option value="BLOOD_PRESSURE">Blood Pressure (mmHg)</option>
                              <option value="WEIGHT">Body Weight (kg)</option>
                              <option value="HBA1C">HbA1c (%)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              {inClinicType === 'BLOOD_PRESSURE' ? 'Systolic (mmHg)' : 'Value'}
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={inClinicVal}
                              onChange={(e) => setInClinicVal(e.target.value)}
                              placeholder={inClinicType === 'BLOOD_PRESSURE' ? '120' : inClinicType === 'HBA1C' ? '7.0' : inClinicType === 'WEIGHT' ? '70' : '110'}
                              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                              required
                            />
                          </div>

                          {inClinicType === 'BLOOD_PRESSURE' ? (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Diastolic (mmHg)</label>
                              <input
                                type="number"
                                step="any"
                                value={inClinicSecVal}
                                onChange={(e) => setInClinicSecVal(e.target.value)}
                                placeholder="80"
                                className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                                required
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Context</label>
                              <select
                                value={inClinicContext}
                                onChange={(e) => setInClinicContext(e.target.value)}
                                className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                              >
                                {inClinicType === 'BLOOD_GLUCOSE' ? (
                                  <>
                                    <option value="FASTING">Fasting</option>
                                    <option value="PRE_MEAL">Pre-Meal</option>
                                    <option value="POST_MEAL_2HR">2hr Post-Meal</option>
                                    <option value="RANDOM">Random / Spot</option>
                                  </>
                                ) : inClinicType === 'HBA1C' ? (
                                  <>
                                    <option value="LAB_CONFIRMED">Lab Confirmed</option>
                                    <option value="GENERAL">General</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="GENERAL">General</option>
                                    <option value="RESTING">Resting</option>
                                    <option value="MORNING">Morning</option>
                                  </>
                                )}
                              </select>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Clinical Notes (Optional)</label>
                          <input
                            type="text"
                            value={inClinicNotes}
                            onChange={(e) => setInClinicNotes(e.target.value)}
                            placeholder="e.g. Capillary fingerstick taken in clinic after 10-minute seated rest"
                            className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            disabled={inClinicSaving}
                            className="px-4 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 transition disabled:opacity-50"
                          >
                            {inClinicSaving ? 'Saving...' : 'Save In-Clinic Observation'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* 14-Day Ambulatory Statistics Overview */}
                    {vitalStats && (
                      <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                            <Activity className="h-3.5 w-3.5" />
                            14-Day Ambulatory Profile ({vitalStats.type?.replace(/_/g, ' ')})
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {vitalStats.count} readings recorded
                          </span>
                        </div>

                        {vitalStats.type === 'BLOOD_GLUCOSE' && vitalStats.timeInRange && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="p-2 rounded-lg bg-slate-800">
                                <span className="text-[10px] text-slate-400 block">Average</span>
                                <span className="text-base font-bold text-white">{vitalStats.mean} mg/dL</span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-800">
                                <span className="text-[10px] text-slate-400 block">Std Dev</span>
                                <span className="text-base font-bold text-white">+/- {vitalStats.standardDeviation}</span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-800">
                                <span className="text-[10px] text-slate-400 block">Target (70-180)</span>
                                <span className="text-base font-bold text-emerald-400">{vitalStats.timeInRange.target?.percentage}%</span>
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-300 flex justify-between pt-1">
                              <span>Low (&lt;70): <strong className="text-rose-400">{vitalStats.timeInRange.low?.percentage + vitalStats.timeInRange.veryLow?.percentage}%</strong></span>
                              <span>In-Target: <strong className="text-emerald-400">{vitalStats.timeInRange.target?.percentage}%</strong></span>
                              <span>High (&gt;180): <strong className="text-amber-400">{vitalStats.timeInRange.high?.percentage + vitalStats.timeInRange.veryHigh?.percentage}%</strong></span>
                            </div>
                          </div>
                        )}

                        {vitalStats.type === 'BLOOD_PRESSURE' && vitalStats.meanSystolic && (
                          <div className="grid grid-cols-2 gap-2 text-center text-xs">
                            <div className="p-2 rounded-lg bg-slate-800">
                              <span className="text-[10px] text-slate-400 block">Mean BP</span>
                              <span className="text-base font-bold text-white">{vitalStats.meanSystolic} / {vitalStats.meanDiastolic || '--'} mmHg</span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-800">
                              <span className="text-[10px] text-slate-400 block">Systolic Range</span>
                              <span className="text-base font-bold text-white">{vitalStats.minSystolic}-{vitalStats.maxSystolic} mmHg</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      {[
                        { id: 'ALL', label: 'All Vitals' },
                        { id: 'BLOOD_GLUCOSE', label: 'Blood Glucose' },
                        { id: 'BLOOD_PRESSURE', label: 'Blood Pressure' },
                        { id: 'WEIGHT', label: 'Weight' },
                        { id: 'HBA1C', label: 'HbA1c' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setJournalFilter(f.id)}
                          className={`px-3 py-1 rounded-full font-semibold text-xs whitespace-nowrap transition ${journalFilter === f.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Chronological Observation List */}
                    <div className="space-y-2">
                      {journalLoading ? (
                        <div className="text-center py-10 text-xs text-slate-400">Loading patient vital history...</div>
                      ) : patientObservations.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl space-y-1">
                          <Activity className="h-6 w-6 text-slate-300 mx-auto" />
                          <p className="text-xs font-semibold text-slate-600">No health observations found</p>
                          <p className="text-[11px] text-slate-400">Click '+ In-Clinic Vital' to record point-of-care vital measurements.</p>
                        </div>
                      ) : (
                        patientObservations.map((obs) => {
                          const isSevere = obs.clinicalFlag === 'CRITICAL_LOW' || obs.clinicalFlag === 'HYPERTENSIVE_CRISIS' || obs.clinicalFlag === 'CRITICAL_HIGH';
                          const isWarn = obs.clinicalFlag === 'LOW' || obs.clinicalFlag === 'HIGH' || obs.clinicalFlag === 'STAGE_1_HYPERTENSION' || obs.clinicalFlag === 'STAGE_2_HYPERTENSION' || obs.clinicalFlag === 'ELEVATED';

                          return (
                            <div
                              key={obs.id}
                              className={`p-3.5 rounded-xl border transition ${isSevere
                                  ? 'bg-rose-50/50 border-rose-200'
                                  : isWarn
                                    ? 'bg-amber-50/30 border-amber-200'
                                    : 'bg-white border-slate-200'
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-lg ${isSevere ? 'bg-rose-100 text-rose-700' : isWarn ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                                    <Activity className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-base font-black text-slate-900">
                                        {obs.numericValue}
                                        {obs.secondaryValue ? ` / ${obs.secondaryValue}` : ''}{' '}
                                        <span className="text-xs font-normal text-slate-500">{obs.unit}</span>
                                      </span>
                                      {obs.clinicalFlag && (
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isSevere
                                            ? 'bg-rose-100 text-rose-800'
                                            : isWarn
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-emerald-100 text-emerald-800'
                                          }`}>
                                          {obs.clinicalFlag.replace(/_/g, ' ')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                      <span>{obs.type?.replace(/_/g, ' ')}</span>
                                      <span>•</span>
                                      <span>{obs.context?.replace(/_/g, ' ')}</span>
                                      <span>•</span>
                                      <span>{new Date(obs.observedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Provenance Badge */}
                                <div className="shrink-0 text-right">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${obs.sourceProvenance === 'DOCTOR_CLINICAL'
                                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                      : obs.sourceProvenance === 'CAREGIVER_INPUT'
                                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                        : obs.sourceProvenance === 'BLUETOOTH_DEVICE'
                                          ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                                          : obs.sourceProvenance === 'LAB_REPORT'
                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                            : obs.sourceProvenance === 'AI_EXTRACTED'
                                              ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}>
                                    {obs.sourceProvenance === 'DOCTOR_CLINICAL' ? 'Doctor Point-of-Care' :
                                      obs.sourceProvenance === 'CAREGIVER_INPUT' ? 'Caregiver Entry' :
                                        obs.sourceProvenance === 'BLUETOOTH_DEVICE' ? 'Bluetooth Sync' :
                                          obs.sourceProvenance === 'LAB_REPORT' ? 'Certified Lab' :
                                            obs.sourceProvenance === 'AI_EXTRACTED' ? 'AI Extracted' :
                                              'Patient Self-Logged'}
                                  </span>
                                </div>
                              </div>

                              {obs.notes && (
                                <p className="mt-2 text-[11px] text-slate-600 italic bg-white/70 p-1.5 rounded border border-slate-100">
                                  "{obs.notes}"
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: MEDICATIONS & RECONCILIATION */}
                {activeDrawerTab === 'MEDICATIONS' && (
                  <div className="space-y-6">
                    {/* Top Bar: Action & Safety Notice */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Pill className="h-4 w-4 text-teal-700" />
                          Medication Vault & Clinical Reconciliation
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Reconcile patient-reported regimens, verify adherence, and prescribe in-clinic diabetes therapies.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowPrescriptionForm(!showPrescriptionForm)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-800 text-white hover:bg-teal-900 transition flex items-center gap-1.5"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        {showPrescriptionForm ? 'Close Prescription Form' : 'In-Clinic Prescription'}
                      </button>
                    </div>

                    {/* Safety Guardrail Notice */}
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Clinical Oversight & Autonomous Prescribing Prevention:</span> AarogyaDamu does not act as an autonomous prescriber. Only assigned clinicians can issue, modify, or discontinue prescriptions. All patient and caregiver self-reported medications remain tagged as <span className="font-bold underline">Patient Reported (Unreviewed)</span> until explicit clinician reconciliation.
                      </div>
                    </div>

                    {/* 14-Day Ambulatory Adherence Summary Card */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          14-Day Patient Adherence Profile
                        </span>
                        {medicationAdherenceStats && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {medicationAdherenceStats.adherenceRate}% Adherence
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[11px] text-slate-500">Tracked Doses</div>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {medicationAdherenceStats ? medicationAdherenceStats.totalEvents : 0}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[11px] text-slate-500">Taken</div>
                          <div className="text-base font-bold text-emerald-700 mt-0.5">
                            {medicationAdherenceStats ? medicationAdherenceStats.takenCount : 0}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[11px] text-slate-500">Skipped</div>
                          <div className="text-base font-bold text-amber-700 mt-0.5">
                            {medicationAdherenceStats ? medicationAdherenceStats.skippedCount : 0}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[11px] text-slate-500">Missed / Overdue</div>
                          <div className="text-base font-bold text-rose-700 mt-0.5">
                            {medicationAdherenceStats ? medicationAdherenceStats.missedCount : 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Doctor Prescribe Medication Form */}
                    {showPrescriptionForm && (
                      <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wide flex items-center gap-1.5">
                            <Stethoscope className="h-4 w-4 text-teal-700" />
                            Doctor Prescription Order: Patient {selectedPatient?.name}
                          </h4>
                          <span className="text-[11px] text-teal-700 font-medium">Step 1 of 2: Entry</span>
                        </div>

                        {prescSuccess && (
                          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                            {prescSuccess}
                          </div>
                        )}
                        {prescError && (
                          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 text-xs font-medium border border-rose-200">
                            {prescError}
                          </div>
                        )}

                        <form onSubmit={handleCreatePrescription} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Medicine Name *
                              </label>
                              <input
                                type="text"
                                value={prescName}
                                onChange={(e) => setPrescName(e.target.value)}
                                placeholder="e.g. Metformin Hydrochloride SR"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Generic Name
                              </label>
                              <input
                                type="text"
                                value={prescGenericName}
                                onChange={(e) => setPrescGenericName(e.target.value)}
                                placeholder="e.g. Metformin"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Brand Name
                              </label>
                              <input
                                type="text"
                                value={prescBrandName}
                                onChange={(e) => setPrescBrandName(e.target.value)}
                                placeholder="e.g. Glycomet SR"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Dosage *
                              </label>
                              <input
                                type="text"
                                value={prescDosage}
                                onChange={(e) => setPrescDosage(e.target.value)}
                                placeholder="e.g. 500 mg, 1 tablet"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Strength
                              </label>
                              <input
                                type="text"
                                value={prescStrength}
                                onChange={(e) => setPrescStrength(e.target.value)}
                                placeholder="e.g. 500 mg, 100 IU/mL"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Dosage Form
                              </label>
                              <select
                                value={prescDosageForm}
                                onChange={(e) => setPrescDosageForm(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              >
                                <option value="TABLET">Tablet</option>
                                <option value="CAPSULE">Capsule</option>
                                <option value="INJECTION">Injection</option>
                                <option value="SYRUP">Syrup</option>
                                <option value="DROPS">Drops</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Route
                              </label>
                              <select
                                value={prescRoute}
                                onChange={(e) => setPrescRoute(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              >
                                <option value="ORAL">Oral</option>
                                <option value="SUBCUTANEOUS">Subcutaneous</option>
                                <option value="INHALATION">Inhalation</option>
                                <option value="TOPICAL">Topical</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Frequency
                              </label>
                              <select
                                value={prescFrequency}
                                onChange={(e) => setPrescFrequency(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              >
                                <option value="ONCE_DAILY">Once daily</option>
                                <option value="TWICE_DAILY">Twice daily</option>
                                <option value="THREE_TIMES_DAILY">Three times daily</option>
                                <option value="FOUR_TIMES_DAILY">Four times daily</option>
                                <option value="EVERY_OTHER_DAY">Every other day</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="AS_NEEDED">As needed (PRN)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Administration Timing
                              </label>
                              <select
                                value={prescTiming}
                                onChange={(e) => setPrescTiming(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              >
                                <option value="MORNING">Morning (Breakfast)</option>
                                <option value="AFTERNOON">Afternoon (Lunch)</option>
                                <option value="EVENING">Evening (Dinner)</option>
                                <option value="BEDTIME">Bedtime</option>
                                <option value="WITH_MEALS">With meals</option>
                                <option value="BEFORE_MEALS">Before meals</option>
                                <option value="POST_MEALS">Post meals</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Food Relation
                              </label>
                              <select
                                value={prescFoodInstructions}
                                onChange={(e) => setPrescFoodInstructions(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              >
                                <option value="WITH_MEALS">Take with meals</option>
                                <option value="BEFORE_MEALS">Take 30 mins before food</option>
                                <option value="AFTER_MEALS">Take immediately after food</option>
                                <option value="EMPTY_STOMACH">Take on empty stomach</option>
                                <option value="NO_RESTRICTION">No food restriction</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={prescStartDate}
                                onChange={(e) => setPrescStartDate(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                End Date (Optional)
                              </label>
                              <input
                                type="date"
                                value={prescEndDate}
                                onChange={(e) => setPrescEndDate(e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Clinical Instructions & Guidance
                            </label>
                            <textarea
                              value={prescInstructions}
                              onChange={(e) => setPrescInstructions(e.target.value)}
                              placeholder="e.g. Take immediately after dinner. Discontinue and alert clinic if hypoglycemic symptoms occur."
                              rows={2}
                              className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                            />
                          </div>

                          <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prescIsPrn}
                                onChange={(e) => setPrescIsPrn(e.target.checked)}
                                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                PRN / As-Needed Medication (e.g. emergency corrective insulin)
                              </span>
                            </label>
                            {prescIsPrn && (
                              <input
                                type="text"
                                value={prescPrnInstructions}
                                onChange={(e) => setPrescPrnInstructions(e.target.value)}
                                placeholder="e.g. Take only if blood glucose exceeds 250 mg/dL"
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none bg-white"
                              />
                            )}
                          </div>

                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => setShowPrescriptionForm(false)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-800 text-white hover:bg-teal-900 transition flex items-center gap-1.5"
                            >
                              <ShieldCheck className="h-4 w-4" />
                              Review & Safety Pre-Confirmation
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Modal: Safety Pre-Confirmation Before Issuing Prescription */}
                    {showPrescriptionSafetyModal && selectedPatient && (
                      <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg w-full shadow-2xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <ShieldCheck className="h-4 w-4 text-teal-700" />
                              Prescription Safety Pre-Confirmation
                            </h4>
                            <button
                              type="button"
                              onClick={() => setShowPrescriptionSafetyModal(false)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                            <div className="text-[11px] text-slate-500 font-semibold uppercase">Target Patient</div>
                            <div className="text-sm font-bold text-slate-900">{selectedPatient.name}</div>
                            <div className="text-[11px] text-slate-600 font-mono">Patient ID: {selectedPatient.patientId}</div>
                          </div>

                          <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs">
                            <div className="font-bold text-slate-900 text-sm">
                              {prescName} {prescBrandName ? `(${prescBrandName})` : ''}
                            </div>
                            {prescGenericName && (
                              <div className="text-slate-500">Generic: {prescGenericName}</div>
                            )}
                            <div className="text-slate-700">
                              <span className="font-semibold">Regimen:</span> {prescDosage} • {prescStrength || 'Standard'} • {prescRoute} ({prescDosageForm})
                            </div>
                            <div className="text-slate-700">
                              <span className="font-semibold">Schedule:</span> {prescFrequency} ({prescTiming}) • {prescFoodInstructions}
                            </div>
                            <div className="text-slate-700">
                              <span className="font-semibold">Duration:</span> {prescStartDate} to {prescEndDate || 'Ongoing'}
                            </div>
                            {prescInstructions && (
                              <div className="text-slate-600 italic bg-white p-2 rounded border border-slate-200">
                                "{prescInstructions}"
                              </div>
                            )}
                            {prescIsPrn && (
                              <div className="text-amber-800 font-medium bg-amber-50 p-2 rounded border border-amber-200">
                                PRN Criteria: {prescPrnInstructions || 'As needed'}
                              </div>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 bg-amber-50/70 p-2.5 rounded-lg border border-amber-200 flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                            <span>
                              I confirm that I am the attending clinician for this patient, have checked contraindications, and authorize this prescription order.
                            </span>
                          </div>

                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowPrescriptionSafetyModal(false)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Back to Edit
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmIssuePrescription}
                              disabled={prescSubmitting}
                              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-800 text-white hover:bg-teal-900 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {prescSubmitting ? 'Issuing...' : 'Confirm & Issue Prescription'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Filters & Unreviewed Count */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5">
                        {(['ALL', 'ACTIVE', 'DISCONTINUED', 'UNREVIEWED'] as const).map((f) => {
                          const count = f === 'UNREVIEWED'
                            ? patientMedications.filter((m) => m.reviewStatus === 'UNREVIEWED').length
                            : f === 'ACTIVE'
                              ? patientMedications.filter((m) => m.status === 'ACTIVE').length
                              : f === 'DISCONTINUED'
                                ? patientMedications.filter((m) => m.status === 'DISCONTINUED' || m.status === 'PAUSED').length
                                : patientMedications.length;
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setMedFilter(f as any)}
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${medFilter === f
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                              {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : f === 'DISCONTINUED' ? 'Discontinued / Paused' : 'Needs Review'}
                              {count > 0 && (
                                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${f === 'UNREVIEWED'
                                    ? 'bg-amber-100 text-amber-800 font-bold'
                                    : 'bg-slate-200 text-slate-800'
                                  }`}>
                                  {count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Medications List */}
                    <div className="space-y-3">
                      {medicationsLoading ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                          Loading patient medications...
                        </div>
                      ) : patientMedications.length === 0 ? (
                        <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center space-y-2">
                          <Pill className="h-8 w-8 text-slate-400 mx-auto" />
                          <div className="text-xs font-semibold text-slate-700">No Medications Recorded</div>
                          <p className="text-[11px] text-slate-500">
                            Use the "Prescribe Medication" button above to add the patient's first clinical prescription.
                          </p>
                        </div>
                      ) : (
                        patientMedications
                          .filter((m) => {
                            if (medFilter === 'ACTIVE') return m.status === 'ACTIVE';
                            if (medFilter === 'UNREVIEWED') return m.reviewStatus === 'UNREVIEWED';
                            if (medFilter === 'DISCONTINUED') return m.status === 'DISCONTINUED' || m.status === 'PAUSED';
                            return true;
                          })
                          .map((med) => {
                            const isReviewed = med.reviewStatus === 'CLINICIAN_REVIEWED';
                            const isActive = med.status === 'ACTIVE';
                            const isDiscontinued = med.status === 'DISCONTINUED';

                            return (
                              <div
                                key={med.id}
                                className={`p-4 rounded-xl border transition ${!isReviewed
                                    ? 'border-amber-300 bg-amber-50/20'
                                    : isDiscontinued
                                      ? 'border-slate-200 bg-slate-50/60 opacity-80'
                                      : 'border-slate-200 bg-white'
                                  }`}
                              >
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-sm font-bold text-slate-900">
                                        {med.medicineName || med.name}
                                      </h4>
                                      {med.brandName && (
                                        <span className="text-xs text-slate-500 font-medium">
                                          ({med.brandName})
                                        </span>
                                      )}
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${isActive
                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                            : isDiscontinued
                                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                      >
                                        {med.status}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${isReviewed
                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                                          }`}
                                      >
                                        {isReviewed ? (
                                          <>
                                            <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                                            Clinician Reviewed
                                          </>
                                        ) : (
                                          <>
                                            <AlertCircle className="h-3 w-3 text-amber-700" />
                                            Patient Reported (Unreviewed)
                                          </>
                                        )}
                                      </span>
                                    </div>

                                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-slate-800">{med.dosage}</span>
                                      {med.strength && <span>({med.strength})</span>}
                                      <span>• {med.frequency}</span>
                                      {med.foodInstructions && <span>• Food: {med.foodInstructions}</span>}
                                      {med.prescriber && <span>• Prescriber: {med.prescriber}</span>}
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {!isReviewed && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReviewingMed(med);
                                          setReviewNotesInput('');
                                          setReviewErrorMed(null);
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition flex items-center gap-1"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                        Review & Reconcile
                                      </button>
                                    )}

                                    {isActive && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setStatusChangingMed(med);
                                            setNewStatusChoice('PAUSED');
                                            setStatusChangeReason('');
                                            setStatusChangeError(null);
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 transition"
                                        >
                                          Pause
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setStatusChangingMed(med);
                                            setNewStatusChoice('DISCONTINUED');
                                            setStatusChangeReason('');
                                            setStatusChangeError(null);
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 border border-rose-300 hover:bg-rose-50 transition"
                                        >
                                          Discontinue
                                        </button>
                                      </>
                                    )}

                                    {!isActive && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setStatusChangingMed(med);
                                          setNewStatusChoice('ACTIVE');
                                          setStatusChangeReason('');
                                          setStatusChangeError(null);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-50 transition"
                                      >
                                        Resume
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Clinical details & notes */}
                                {med.instructions && (
                                  <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <span className="font-semibold text-slate-700">Instructions:</span> {med.instructions}
                                  </p>
                                )}

                                {med.clinicalReviewNotes && (
                                  <p className="mt-2 text-xs text-emerald-900 bg-emerald-50/70 p-2 rounded-lg border border-emerald-100 flex items-start gap-1.5">
                                    <Stethoscope className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                                    <span>
                                      <span className="font-semibold">Doctor Review Note:</span> {med.clinicalReviewNotes}
                                    </span>
                                  </p>
                                )}

                                {med.reasonForChange && (
                                  <p className="mt-2 text-xs text-rose-900 bg-rose-50/70 p-2 rounded-lg border border-rose-200">
                                    <span className="font-semibold text-rose-800">Reason for {med.status}:</span> {med.reasonForChange}
                                  </p>
                                )}

                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                                  <span>
                                    Provenance: {med.source === 'CLINICIAN_PRESCRIBED' ? 'Doctor Clinical Prescription' : med.source === 'CAREGIVER_ENTERED' ? 'Caregiver Log' : 'Patient Self-Reported'}
                                  </span>
                                  <span>Added: {new Date(med.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                    {/* Modal: Clinician Review & Reconcile */}
                    {reviewingMed && (
                      <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                              Clinician Review & Reconciliation
                            </h4>
                            <button
                              type="button"
                              onClick={() => setReviewingMed(null)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                            <div className="font-bold text-slate-900">{reviewingMed.name}</div>
                            <div className="text-slate-600">{reviewingMed.dosage} • {reviewingMed.frequency}</div>
                            {reviewingMed.instructions && (
                              <div className="text-slate-500 italic">"{reviewingMed.instructions}"</div>
                            )}
                          </div>

                          {reviewErrorMed && (
                            <div className="p-2 rounded bg-rose-50 text-rose-800 text-xs font-medium">
                              {reviewErrorMed}
                            </div>
                          )}

                          <form onSubmit={handleReconcileMedication} className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Clinical Review Notes (Optional)
                              </label>
                              <textarea
                                value={reviewNotesInput}
                                onChange={(e) => setReviewNotesInput(e.target.value)}
                                placeholder="e.g. Dosage verified against 14-day ambulatory glucose logs. Continued therapy approved."
                                rows={3}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none"
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setReviewingMed(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={reviewSubmittingMed}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                              >
                                {reviewSubmittingMed ? 'Reconciling...' : 'Confirm Reconciliation'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Modal: Status Modification (Pause/Discontinue/Resume) */}
                    {statusChangingMed && (
                      <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <h4 className="text-sm font-bold text-slate-900">
                              Update Regimen: {statusChangingMed.name}
                            </h4>
                            <button
                              type="button"
                              onClick={() => setStatusChangingMed(null)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {statusChangeError && (
                            <div className="p-2 rounded bg-rose-50 text-rose-800 text-xs font-medium">
                              {statusChangeError}
                            </div>
                          )}

                          <form onSubmit={handleStatusChange} className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Target Status *
                              </label>
                              <select
                                value={newStatusChoice}
                                onChange={(e) => setNewStatusChoice(e.target.value as any)}
                                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none"
                              >
                                <option value="ACTIVE">ACTIVE (Resume therapy)</option>
                                <option value="PAUSED">PAUSED (Temporary cessation)</option>
                                <option value="DISCONTINUED">DISCONTINUED (Permanent discontinuation)</option>
                              </select>
                            </div>

                            {(newStatusChoice === 'PAUSED' || newStatusChoice === 'DISCONTINUED') && (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Reason for Change *
                                </label>
                                <textarea
                                  value={statusChangeReason}
                                  onChange={(e) => setStatusChangeReason(e.target.value)}
                                  placeholder="e.g. Patient experienced hypoglycemia; pausing sulphonylurea."
                                  rows={3}
                                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-teal-700 focus:outline-none"
                                  required
                                />
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setStatusChangingMed(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={statusChangeSubmitting}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                              >
                                {statusChangeSubmitting ? 'Updating...' : 'Update Status'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: LIFESTYLE & DIGITAL HEALTH TWIN (P0.3) */}
                {activeDrawerTab === 'LIFESTYLE_TWIN' && (
                  <div className="space-y-4">
                    {/* Header & Subtitle */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                          <Compass className="h-4 w-4 text-teal-700" />
                          Lifestyle Tracking & Digital Health Twin
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Patient-reported habits, physiological synthesis, and clinical quality indicators.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Twin View: Active
                      </span>
                    </div>

                    {/* Clinical Governance & Non-Simulation Banner */}
                    <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4 text-emerald-700" />
                          Personal Digital Health Twin (Read-Only Clinician View)
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          PENDING_CLINICIAN_APPROVAL
                        </span>
                      </div>
                      <p className="text-emerald-900 text-[11px] leading-relaxed">
                        This Digital Health Twin is a deterministic, rule-based aggregation of recorded vitals, medications, and lifestyle logs. AarogyaDamu does not predict future glucose trajectories, simulate clinical diagnoses, or act as an autonomous prescriber. Correlations between lifestyle habits and glucose do not establish clinical causation.
                      </p>
                    </div>

                    {/* Data Quality & Freshness Alerts */}
                    {digitalHealthTwin?.dataQualityAlerts && digitalHealthTwin.dataQualityAlerts.length > 0 && (
                      <div className="space-y-1.5">
                        {digitalHealthTwin.dataQualityAlerts.map((alert: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${alert.severity === 'WARNING'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-sky-50 border-sky-200 text-sky-900'
                              }`}
                          >
                            {alert.severity === 'WARNING' ? (
                              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-sky-700 shrink-0" />
                            )}
                            <span className="font-semibold">{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 7-Day Lifestyle Summary */}
                    {lifestyleStats && (
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          7-Day Habit Metrics
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>Physical Activity</span>
                              <Activity className="h-4 w-4 text-teal-700" />
                            </div>
                            <div className="text-xl font-black text-slate-900 mt-1">
                              {lifestyleStats.physicalActivity?.totalMinutes ?? 0}{' '}
                              <span className="text-xs font-normal text-slate-500">minutes</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {lifestyleStats.physicalActivity?.sessionsCount ?? 0} sessions logged
                            </div>
                          </div>

                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>Sleep Duration</span>
                              <Moon className="h-4 w-4 text-indigo-700" />
                            </div>
                            <div className="text-xl font-black text-slate-900 mt-1">
                              {lifestyleStats.sleep?.averageHoursPerNight != null
                                ? `${lifestyleStats.sleep.averageHoursPerNight} h/night`
                                : 'No data'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {lifestyleStats.sleep?.nightsCount ?? 0} nights logged
                            </div>
                          </div>

                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>Daily Hydration</span>
                              <Droplets className="h-4 w-4 text-sky-700" />
                            </div>
                            <div className="text-xl font-black text-slate-900 mt-1">
                              {lifestyleStats.hydration?.dailyAverageMl != null
                                ? `${lifestyleStats.hydration.dailyAverageMl} mL/day`
                                : 'No data'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {lifestyleStats.hydration?.entriesCount ?? 0} entries logged
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Digital Health Twin: 4 Health Pillars */}
                    {digitalHealthTwin && (
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-teal-700" />
                          Four Health Pillars (Rule-Based Synthesis)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* Pillar 1: Vitals */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1 text-xs">
                              <Heart className="h-3.5 w-3.5 text-rose-600" />
                              Glycemic & Vitals Profile
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>14-Day Mean Glucose:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.vitals?.glucose?.meanMgDl != null
                                  ? `${digitalHealthTwin.metrics.vitals.glucose.meanMgDl} mg/dL`
                                  : 'No data'}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Time in Range (70-180 mg/dL):</span>
                              <span className="font-bold text-emerald-800">
                                {digitalHealthTwin.metrics?.vitals?.glucose?.timeInRangePercent != null
                                  ? `${digitalHealthTwin.metrics.vitals.glucose.timeInRangePercent}%`
                                  : 'No data'}
                              </span>
                            </div>
                            {digitalHealthTwin.metrics?.vitals?.bloodPressure?.lastReading && (
                              <div className="flex justify-between text-slate-600 text-[11px]">
                                <span>Latest Blood Pressure:</span>
                                <span className="font-bold text-slate-900">
                                  {digitalHealthTwin.metrics.vitals.bloodPressure.lastReading.systolic}/
                                  {digitalHealthTwin.metrics.vitals.bloodPressure.lastReading.diastolic} mmHg
                                </span>
                              </div>
                            )}
                            {digitalHealthTwin.metrics?.vitals?.hba1c?.lastReading && (
                              <div className="flex justify-between text-slate-600 text-[11px]">
                                <span>Latest HbA1c:</span>
                                <span className="font-bold text-slate-900">
                                  {digitalHealthTwin.metrics.vitals.hba1c.lastReading.value}%
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Pillar 2: Lifestyle Habits */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1 text-xs">
                              <Compass className="h-3.5 w-3.5 text-teal-700" />
                              Lifestyle Habits
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Weekly Activity:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.lifestyle?.physicalActivity?.weeklyMinutes ?? 0} min
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Sleep Average:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.lifestyle?.sleep?.averageHours != null
                                  ? `${digitalHealthTwin.metrics.lifestyle.sleep.averageHours} hrs`
                                  : 'No data'}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Recent Wellbeing:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.lifestyle?.wellbeing?.recentStatus != null
                                  ? digitalHealthTwin.metrics.lifestyle.wellbeing.recentStatus.replace(/_/g, ' ')
                                  : 'No logs'}
                              </span>
                            </div>
                          </div>

                          {/* Pillar 3: Medications */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1 text-xs">
                              <Pill className="h-3.5 w-3.5 text-teal-700" />
                              Medication Regimen
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Active Prescriptions:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.medications?.activeCount ?? 0}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Unreviewed Patient Entries:</span>
                              <span className="font-bold text-amber-800">
                                {digitalHealthTwin.metrics?.medications?.unreviewedCount ?? 0}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>14-Day Adherence:</span>
                              <span className="font-bold text-teal-800">
                                {digitalHealthTwin.metrics?.medications?.adherenceRate14d != null
                                  ? `${digitalHealthTwin.metrics.medications.adherenceRate14d}%`
                                  : 'No data'}
                              </span>
                            </div>
                          </div>

                          {/* Pillar 4: Care Plan */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                              Care Plan Adherence
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Plan Title:</span>
                              <span className="font-bold text-slate-900 truncate max-w-[140px]">
                                {digitalHealthTwin.metrics?.carePlan?.planTitle || 'None active'}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>Task Progress:</span>
                              <span className="font-bold text-slate-900">
                                {digitalHealthTwin.metrics?.carePlan?.completedTasksCount ?? 0} /{' '}
                                {digitalHealthTwin.metrics?.carePlan?.totalTasksCount ?? 0} (
                                {digitalHealthTwin.metrics?.carePlan?.progressPercent ?? 0}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Patient Lifestyle Logs Table */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Recent Lifestyle Entries
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {lifestyleRecords.length} records retrieved
                        </span>
                      </div>

                      {lifestyleLoading ? (
                        <div className="text-center text-xs text-slate-400 py-6">Loading lifestyle records...</div>
                      ) : lifestyleRecords.length === 0 ? (
                        <div className="text-center text-xs text-slate-400 py-6">
                          No lifestyle habits logged for this patient yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                                <th className="pb-2 font-semibold">Category</th>
                                <th className="pb-2 font-semibold">Recorded Value</th>
                                <th className="pb-2 font-semibold">Provenance</th>
                                <th className="pb-2 font-semibold">Notes / Reason</th>
                                <th className="pb-2 font-semibold">Date & Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {lifestyleRecords.map((r: any) => (
                                <tr key={r.id} className="hover:bg-slate-50/60">
                                  <td className="py-2.5 font-bold text-slate-900">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                      {r.category.replace(/_/g, ' ')}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-slate-800 font-medium">
                                    {r.numericValue != null && (
                                      <span>
                                        {r.numericValue} {r.unit || ''}{' '}
                                      </span>
                                    )}
                                    {r.qualitativeValue && (
                                      <span className="text-slate-500 text-[11px]">
                                        ({r.qualitativeValue.replace(/_/g, ' ')})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.source === 'DOCTOR_CLINICAL'
                                          ? 'bg-teal-100 text-teal-800'
                                          : r.source === 'CAREGIVER_INPUT'
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                    >
                                      {r.source === 'DOCTOR_CLINICAL'
                                        ? 'Clinician Entry'
                                        : r.source === 'CAREGIVER_INPUT'
                                          ? 'Caregiver'
                                          : 'Patient'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-slate-600 max-w-[200px] truncate text-[11px]">
                                    {r.notes || '--'}
                                    {r.reasonForCorrection && (
                                      <span className="block text-[10px] text-amber-700 italic">
                                        Correction: {r.reasonForCorrection}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                                    {new Date(r.recordedAt).toLocaleString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: SAFETY & SOS (P0.4) */}
                {activeDrawerTab === 'SAFETY_SOS' && (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                          <ShieldAlert className="h-4 w-4 text-rose-600" />
                          Emergency SOS, Safety Coordinator & Care Reminders
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Real-time patient emergency signals, emergency contact ledger, and user-configured care reminders.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-900 rounded border border-amber-300">
                        PENDING_CLINICIAN_APPROVAL
                      </span>
                    </div>

                    {/* Emergency Limitation Notice Banner */}
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                        <span>Emergency Escalation Notice (Not 112 / 108 Substitute)</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        AarogyaDamu Emergency SOS is an in-app care team alert system and is NOT a substitute for local emergency services. In life-threatening emergencies, patients and caregivers are instructed to immediately dial 112 or 108.
                      </p>
                    </div>

                    {/* Current Active SOS Status */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                        Current Emergency Status
                      </h4>
                      {safetyLoading ? (
                        <p className="text-xs text-slate-400">Loading emergency status...</p>
                      ) : activeSosEvent ? (
                        <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-rose-800 bg-rose-200 px-2 py-0.5 rounded">
                              STATUS: {activeSosEvent.status}
                            </span>
                            <span className="text-xs text-rose-700">
                              Triggered: {new Date(activeSosEvent.triggeredAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800">
                            <span className="font-bold">Reason:</span> {activeSosEvent.reason || 'None specified'}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white p-2.5 rounded border border-rose-200">
                            <div>
                              <span className="font-semibold text-slate-700">Delivery Status:</span>{' '}
                              {activeSosEvent.deliveryStatus} (in-app dispatched; externalCarrierStatus: {activeSosEvent.externalCarrierStatus})
                            </div>
                            <div>
                              <span className="font-semibold text-slate-700">Location Status:</span>{' '}
                              {activeSosEvent.locationStatus}
                              {activeSosEvent.latitude && activeSosEvent.longitude && (
                                <span className="block text-[10px] text-slate-500">
                                  Coordinates: {activeSosEvent.latitude.toFixed(4)}, {activeSosEvent.longitude.toFixed(4)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>No active emergency SOS event. Patient status normal.</span>
                        </div>
                      )}
                    </div>

                    {/* Registered Emergency Contacts Ledger */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-teal-700" />
                        Registered Emergency Contacts ({emergencyContacts.length})
                      </h4>
                      {emergencyContacts.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No emergency contacts registered for this patient.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                          {emergencyContacts.map((c) => (
                            <div key={c.id} className="p-2.5 flex items-center justify-between text-xs">
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <span>{c.name}</span>
                                  {c.isPrimary && (
                                    <span className="px-1.5 py-0.2 bg-teal-100 text-teal-800 text-[10px] rounded font-semibold">
                                      Primary
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {c.relationship} • {c.phoneNumber || c.phone}
                                </span>
                              </div>
                              {c.notifyOnSos && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Receives In-App SOS
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Patient Care Reminders Ledger */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-teal-700" />
                          Patient Care Reminders ({patientReminders.length})
                        </h4>
                      </div>

                      {/* Non-prescribing reminder guardrail note */}
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                        <Info className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                        <span>
                          Safety rule: Reminders are patient- or caregiver-scheduled notifications. They never alter clinical prescriptions, modify dosages, or automatically mark medications as taken.
                        </span>
                      </div>

                      {patientReminders.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No care reminders currently scheduled.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                          {patientReminders.map((rem) => (
                            <div key={rem.id} className="p-2.5 flex items-center justify-between text-xs">
                              <div>
                                <div className="flex items-center gap-2 font-bold text-slate-800">
                                  <span>{rem.title}</span>
                                  <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded font-semibold">
                                    {rem.category}
                                  </span>
                                  <span className="px-1.5 py-0.2 bg-teal-50 text-teal-700 text-[10px] rounded font-semibold">
                                    {rem.recurrence}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Scheduled: {new Date(rem.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {rem.notes && ` • Notes: ${rem.notes}`}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${rem.status === 'ACKNOWLEDGED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : rem.status === 'CANCELLED'
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                              >
                                {rem.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}



                {/* TAB 2: PATIENT CARE TASKS & FOLLOW-UP MANAGEMENT */}
                {activeDrawerTab === 'FOLLOW_UP' && (
                  <div className="space-y-6">
                    {/* Header & Patient Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-900 text-white rounded-2xl shadow-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <PlusCircle className="h-5 w-5 text-teal-400" />
                          <h3 className="text-sm font-bold tracking-tight">Patient Care Tasks</h3>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                          Doctor-assigned care tasks, clinical instructions, and patient adherence tracking.
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-300 font-mono">
                          <span className="bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                            Target Patient: <strong className="text-white">{selectedPatient.name}</strong>
                          </span>
                          <span className="bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                            ID: {selectedPatient.patientId}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateTaskForm(!showCreateTaskForm)}
                        className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto shadow"
                      >
                        <PlusCircle className="h-4 w-4" />
                        {showCreateTaskForm ? 'Hide Task Form' : 'Assign New Task'}
                      </button>
                    </div>

                    {/* Task Monitoring Scorecards */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Tasks</div>
                        <div className="text-lg font-black text-slate-900 mt-0.5">
                          {careTaskStats ? careTaskStats.totalTasks : patientCareTasks.length}
                        </div>
                      </div>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Completed</div>
                        <div className="text-lg font-black text-emerald-700 mt-0.5">
                          {careTaskStats ? careTaskStats.completedTasks : patientCareTasks.filter(t => t.status === 'COMPLETED').length}
                        </div>
                      </div>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Pending</div>
                        <div className="text-lg font-black text-amber-700 mt-0.5">
                          {careTaskStats ? careTaskStats.pendingTasks : patientCareTasks.filter(t => t.status === 'PENDING').length}
                        </div>
                      </div>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Overdue</div>
                        <div className="text-lg font-black text-rose-700 mt-0.5">
                          {careTaskStats ? careTaskStats.overdueTasks : 0}
                        </div>
                      </div>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cancelled</div>
                        <div className="text-lg font-black text-slate-600 mt-0.5">
                          {careTaskStats ? careTaskStats.cancelledTasks : patientCareTasks.filter(t => t.status === 'CANCELLED').length}
                        </div>
                      </div>
                      <div className="p-3 bg-white border border-teal-200 bg-teal-50/40 rounded-xl text-center shadow-xs">
                        <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">Completion %</div>
                        <div className="text-lg font-black text-teal-900 mt-0.5">
                          {careTaskStats ? careTaskStats.completionPercentage : 100}%
                        </div>
                      </div>
                    </div>

                    {/* Form 1: Assign Clinical Task */}
                    {showCreateTaskForm && (
                      <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between border-b border-teal-200 pb-2">
                          <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wide flex items-center gap-1.5">
                            <PlusCircle className="h-4 w-4 text-teal-700" />
                            Assign Clinical Follow-up Task: Patient {selectedPatient.name}
                          </h3>
                          <span className="text-[11px] text-teal-700 font-medium">Doctor Authority Order</span>
                        </div>

                        {taskSuccess && (
                          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                            {taskSuccess}
                          </div>
                        )}
                        {taskError && (
                          <div className="p-2 rounded-lg bg-rose-50 text-rose-800 text-xs font-medium border border-rose-200">
                            {taskError}
                          </div>
                        )}

                        <form onSubmit={handleAssignTask} className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Task Title *
                            </label>
                            <input
                              type="text"
                              value={taskTitle}
                              onChange={(e) => setTaskTitle(e.target.value)}
                              placeholder="e.g., Record fasting blood sugar, 20-minute post-meal walk"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Detailed Doctor Instructions
                            </label>
                            <textarea
                              rows={2}
                              value={taskInstructions}
                              onChange={(e) => setTaskInstructions(e.target.value)}
                              placeholder="Provide specific clinical instructions for the patient (e.g. check before breakfast, keep log in health journal)..."
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Category</label>
                              <select
                                value={taskCategory}
                                onChange={(e) => setTaskCategory(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                              >
                                <option value="FOLLOW_UP">Follow-up</option>
                                <option value="BLOOD_SUGAR_CHECK">Record Fasting Blood Sugar</option>
                                <option value="WALK_20_MIN">Walk for 20 Minutes</option>
                                <option value="PHYSICAL_ACTIVITY">Physical Activity</option>
                                <option value="DIET_PLAN">Diet Plan Compliance</option>
                                <option value="FOOT_CARE">Foot-Care Inspection</option>
                                <option value="MEDICATION">Medication Adherence</option>
                                <option value="LAB_TEST">Laboratory Test</option>
                                <option value="LIFESTYLE">Lifestyle Log</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Priority</label>
                              <select
                                value={taskPriority}
                                onChange={(e) => setTaskPriority(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                              >
                                <option value="HIGH">High Priority</option>
                                <option value="MEDIUM">Medium Priority</option>
                                <option value="LOW">Low Priority</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Due Date & Time *</label>
                              <input
                                type="datetime-local"
                                value={taskDueDate}
                                onChange={(e) => setTaskDueDate(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Frequency</label>
                              <select
                                value={taskFrequency}
                                onChange={(e) => setTaskFrequency(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                              >
                                <option value="ONCE">Once</option>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="AS_NEEDED">As Needed</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Recurrence Notes</label>
                              <input
                                type="text"
                                value={taskRecurrence}
                                onChange={(e) => setTaskRecurrence(e.target.value)}
                                placeholder="e.g., Every morning at 8:00 AM"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Optional Clinical Notes (Internal)</label>
                            <input
                              type="text"
                              value={taskClinicalNotes}
                              onChange={(e) => setTaskClinicalNotes(e.target.value)}
                              placeholder="Clinical reasoning or targets for care team review..."
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="submit"
                              disabled={taskSubmitting || !taskTitle.trim() || !taskDueDate}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                            >
                              {taskSubmitting ? 'Assigning...' : 'Confirm & Assign Task'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCreateTaskForm(false)}
                              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Task Filters */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5">
                        {(['ALL', 'PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED'] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setTaskFilter(f)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${taskFilter === f
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                            {f === 'ALL' ? 'All' : f === 'PENDING' ? 'Pending' : f === 'COMPLETED' ? 'Completed' : f === 'OVERDUE' ? 'Overdue' : 'Cancelled'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Task Roster List */}
                    <div className="space-y-3">
                      {careTasksLoading ? (
                        <div className="p-8 text-center text-xs text-slate-500">Loading patient care tasks...</div>
                      ) : patientCareTasks.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                          <CheckCircle2 className="h-6 w-6 text-slate-400 mx-auto" />
                          <div className="text-xs font-semibold text-slate-700">No Care Tasks Assigned</div>
                          <p className="text-[11px] text-slate-500">Click "Assign New Task" above to assign a clinical task.</p>
                        </div>
                      ) : (
                        patientCareTasks
                          .filter((t) => {
                            if (taskFilter === 'PENDING') return t.status === 'PENDING' && new Date(t.dueAt) >= new Date();
                            if (taskFilter === 'COMPLETED') return t.status === 'COMPLETED';
                            if (taskFilter === 'OVERDUE') return t.status === 'PENDING' && new Date(t.dueAt) < new Date();
                            if (taskFilter === 'CANCELLED') return t.status === 'CANCELLED';
                            return true;
                          })
                          .map((task) => {
                            const isDone = task.status === 'COMPLETED';
                            const isCancelled = task.status === 'CANCELLED';
                            const isOverdue = task.status === 'PENDING' && new Date(task.dueAt) < new Date();

                            return (
                              <div
                                key={task.id}
                                className={`p-4 rounded-xl border transition ${isDone
                                    ? 'border-emerald-200 bg-emerald-50/20'
                                    : isCancelled
                                      ? 'border-slate-200 bg-slate-50 opacity-70'
                                      : isOverdue
                                        ? 'border-rose-200 bg-rose-50/20'
                                        : 'border-slate-200 bg-white'
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="text-xs font-bold text-slate-900">{task.title}</h4>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                        {task.category}
                                      </span>
                                      {task.priority && (
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${task.priority === 'HIGH' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                          }`}>
                                          {task.priority} Priority
                                        </span>
                                      )}
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDone
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : isCancelled
                                            ? 'bg-slate-200 text-slate-700'
                                            : isOverdue
                                              ? 'bg-rose-100 text-rose-800'
                                              : 'bg-amber-100 text-amber-800'
                                        }`}>
                                        {isDone ? 'Completed' : isCancelled ? 'Cancelled' : isOverdue ? 'Overdue' : 'Pending'}
                                      </span>
                                    </div>

                                    {task.instructions && (
                                      <p className="text-xs text-slate-700 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        <span className="font-semibold text-slate-800">Doctor Instructions:</span> {task.instructions}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 flex-wrap">
                                      <span>Due: {new Date(task.dueAt).toLocaleString()}</span>
                                      {task.frequency && <span>Frequency: {task.frequency}</span>}
                                      {task.recurrence && <span>Recurrence: {task.recurrence}</span>}
                                    </div>

                                    {/* Submitter Attribution */}
                                    {isDone && (
                                      <div className="mt-2 pt-2 border-t border-emerald-100 flex items-center gap-2 text-xs">
                                        {task.completedByRole === 'PATIENT' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Patient Self-Completed
                                          </span>
                                        ) : task.completedByRole === 'CAREGIVER' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Caregiver on Behalf of Patient
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Doctor Point-of-Care
                                          </span>
                                        )}
                                        {task.completedAt && (
                                          <span className="text-[11px] text-slate-400">
                                            Completed at: {new Date(task.completedAt).toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {isCancelled && (
                                      <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-rose-700">
                                        <span className="font-semibold">Cancellation Reason:</span> {task.cancellationReason || 'No reason provided'}
                                      </div>
                                    )}
                                  </div>

                                  {/* Doctor Actions */}
                                  {!isDone && !isCancelled && (
                                    <button
                                      type="button"
                                      onClick={() => setCancellingTask(task)}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition"
                                    >
                                      Cancel Task
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                    {/* Modal: Cancel Clinical Task */}
                    {cancellingTask && (
                      <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4 text-rose-600" />
                              Cancel Clinical Task
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingTask(null);
                                setCancelError(null);
                              }}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                            <div className="text-[11px] text-slate-500 font-semibold uppercase">Target Task</div>
                            <div className="text-sm font-bold text-slate-900">{cancellingTask.title}</div>
                            <div className="text-slate-500">Patient: {selectedPatient.name}</div>
                          </div>

                          {cancelError && (
                            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 text-xs font-medium border border-rose-200">
                              {cancelError}
                            </div>
                          )}

                          <form onSubmit={handleCancelTask} className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Clinical Cancellation Reason * (min 3 characters)
                              </label>
                              <textarea
                                rows={2}
                                value={cancellationReason}
                                onChange={(e) => setCancellationReason(e.target.value)}
                                placeholder="e.g., Blood sugar targets stabilized, redundant task, laboratory panel revised..."
                                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-rose-600"
                                required
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setCancellingTask(null);
                                  setCancelError(null);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                              >
                                Keep Task
                              </button>
                              <button
                                type="submit"
                                disabled={cancellingSubmitting || !cancellationReason.trim()}
                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                              >
                                {cancellingSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Form 2: Record Clinical Review Note & Update Targets */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Stethoscope className="h-4 w-4 text-teal-700" />
                        Record Clinical Review & Adjust Glycemic Targets
                      </h3>
                      {reviewSuccess && (
                        <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-medium">
                          {reviewSuccess}
                        </div>
                      )}
                      <form onSubmit={handleRecordReview} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Clinical Progress Review Notes
                          </label>
                          <textarea
                            rows={3}
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Document longitudinal glycemic progress, medication tolerance, and follow-up directives..."
                            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Target Fasting Min
                            </label>
                            <input
                              type="number"
                              value={targetMin}
                              onChange={(e) => setTargetMin(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Target Fasting Max
                            </label>
                            <input
                              type="number"
                              value={targetMax}
                              onChange={(e) => setTargetMax(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Next Review Date
                            </label>
                            <input
                              type="datetime-local"
                              value={nextReviewDate}
                              onChange={(e) => setNextReviewDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={reviewSubmitting || !reviewNotes.trim()}
                          className="px-4 py-2 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                        >
                          {reviewSubmitting ? 'Saving Review...' : 'Save Clinical Review Note'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* TAB 3: CARE TEAM CHAT */}
                {activeDrawerTab === 'CHAT' && (
                  <div className="space-y-4">
                    <div className="h-64 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2.5">
                      {chatLoading ? (
                        <div className="text-center text-xs text-slate-400 py-8">Loading messages...</div>
                      ) : messages.length === 0 ? (
                        <div className="text-center text-xs text-slate-400 py-8">
                          No care team messages yet. Send instructions or check in with the patient and caregiver.
                        </div>
                      ) : (
                        messages.map((m) => (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl text-xs max-w-[85%] ${m.senderRole === 'DOCTOR'
                                ? 'ml-auto bg-slate-900 text-white'
                                : m.senderRole === 'CAREGIVER'
                                  ? 'mr-auto bg-amber-50 text-slate-800 border border-amber-200'
                                  : 'mr-auto bg-white text-slate-800 border border-slate-200'
                              }`}
                          >
                            <div className="flex items-center justify-between text-[10px] opacity-75 mb-1">
                              <span className="font-bold">{m.senderName} ({m.senderRole})</span>
                              <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="leading-relaxed">{m.content}</p>
                            <div className="text-[9px] mt-1 text-right opacity-70">
                              {m.category.replace(/_/g, ' ')} {m.isRead && '• Read'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Send Message Form */}
                    <form onSubmit={handleSendMessage} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={messageCategory}
                          onChange={(e) => setMessageCategory(e.target.value as any)}
                          className="bg-slate-100 border-none rounded px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          <option value="DOCTOR_RESPONSE">Clinical Response</option>
                          <option value="FOLLOW_UP_INSTRUCTION">Follow-up Instruction</option>
                          <option value="GENERAL">General Message</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type clinical advice or response..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-700"
                        />
                        <button
                          type="submit"
                          disabled={sendingMessage || !newMessage.trim()}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* TAB: GOVERNED AI CARE PROPOSALS FOR PATIENT */}
                {activeDrawerTab === 'AI_PROPOSALS' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-amber-600" />
                          <h3 className="text-sm font-bold text-slate-900">Governed AI Care Proposals</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            P0.7 Agentic
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Clinical proposals and follow-up adjustments drafted by Damu AI for {selectedPatient.name}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadPatientProposals(selectedPatient.patientId)}
                        disabled={proposalsLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
                      >
                        <RotateCcw className={`h-3.5 w-3.5 ${proposalsLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {/* Clinical Safety & Non-Autonomous Prescribing Disclaimer */}
                    <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-start gap-2.5">
                      <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-teal-900 space-y-1">
                        <p className="font-semibold">AarogyaDamu Clinical Governance Notice:</p>
                        <p className="text-teal-800">
                          AI care proposals remain in <span className="font-mono font-bold">PENDING_CLINICIAN_APPROVAL</span> status and cannot alter care plans, prescriptions, or clinical targets without affirmative clinician sign-off. The backend strictly enforces active doctor-patient assignment.
                        </p>
                      </div>
                    </div>

                    {patientProposals.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-2">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
                        <p className="text-xs font-bold text-slate-800">No Proposals for this Patient</p>
                        <p className="text-[11px] text-slate-500">
                          There are currently no AI care proposals on file for {selectedPatient.name}.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {patientProposals.map((p) => {
                          const isPending = p.status === 'PENDING_CLINICIAN_APPROVAL';
                          const isApproved = p.status === 'COMPLETED';
                          const isRejected = p.status === 'REJECTED';

                          return (
                            <div
                              key={p.actionId}
                              className={`p-3.5 rounded-xl border bg-white space-y-2.5 transition ${isPending ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
                                }`}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {p.parameters?.proposalType || 'CARE_PROPOSAL'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                    HIGH_RISK
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isPending
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : isApproved
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : isRejected
                                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                                          : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}
                                >
                                  {isPending ? 'PENDING CLINICIAN APPROVAL' : isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : p.status}
                                </span>
                              </div>

                              <h4 className="text-xs font-bold text-slate-900">
                                {p.parameters?.title || 'Care Proposal'}
                              </h4>

                              <p className="text-[11px] text-slate-700 line-clamp-2">
                                {p.parameters?.rationale || p.explanation}
                              </p>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                                <span>Created: {new Date(p.createdAt).toLocaleDateString()}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProposal(p);
                                    setProposalReviewNotes('');
                                    setProposalRejectionReason('');
                                    setProposalReviewSuccess(null);
                                    setProposalReviewError(null);
                                  }}
                                  className="px-2.5 py-1 rounded bg-slate-900 text-white font-bold hover:bg-slate-800 text-xs transition"
                                >
                                  Review & Decide
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: CHRONOLOGICAL ACTIVITY FEED */}
                {activeDrawerTab === 'FEED' && (
                  <div className="space-y-3">
                    <div className="h-80 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                      {feedLoading ? (
                        <div className="text-center text-xs text-slate-400 py-8">Loading activity feed...</div>
                      ) : feedItems.length === 0 ? (
                        <div className="text-center text-xs text-slate-400 py-8">No recorded activities yet.</div>
                      ) : (
                        feedItems.map((item) => (
                          <div key={item.id} className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">{item.title}</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px]">{item.details}</p>
                            <div className="text-[10px] text-teal-800 font-semibold pt-0.5">
                              By {item.actorName} • Status: {item.status}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-slate-400 py-16 text-xs">
                Select an assigned patient from the roster to review records.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: AI CARE PROPOSALS COMMAND CENTER */}
      {mainView === 'PROPOSALS' && (
        <div className="space-y-4">
          {/* Top Filter and Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <h2 className="text-base font-bold text-slate-900">AI Care Proposals Queue</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    P0.7 Governed Agent
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Clinical proposals generated by Damu Agent awaiting licensed clinician review and affirmative authorization.
                </p>
              </div>

              {/* Patient filter */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Filter Patient:</span>
                <select
                  value={proposalPatientFilter}
                  onChange={(e) => setProposalPatientFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-teal-700 w-full md:w-48"
                >
                  <option value="">All Assigned Patients</option>
                  {data?.patients.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      {p.name} ({p.patientId.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3 flex-wrap">
              {[
                { id: 'PENDING_CLINICIAN_APPROVAL', label: 'Pending Clinician Approval', count: pendingProposalsCount },
                { id: 'COMPLETED', label: 'Approved Proposals' },
                { id: 'REJECTED', label: 'Rejected Proposals' },
                { id: 'ALL', label: 'All Proposals' },
              ].map((tab) => {
                const isActive = proposalStatusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setProposalStatusFilter(tab.id as any);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : 'bg-amber-100 text-amber-800 font-bold'
                          }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clinical Governance Disclaimer Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 shadow-2xs">
            <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-bold">AarogyaDamu Clinical Governance Notice (P0.7 Protocol):</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                All AI care proposals remain strictly advisory and held in <span className="font-mono font-bold">PENDING_CLINICIAN_APPROVAL</span>.
                AI agents NEVER autonomously modify patient care plans, alter medications, or adjust glycemic targets.
                Every modification requires affirmative verification and sign-off by an assigned licensed clinician with verified active doctor-patient assignment.
              </p>
            </div>
          </div>

          {/* Feature Flag Notice if Disabled */}
          {isAgentFeatureDisabled && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900">
                <span className="font-bold">Governed AI Agent Execution Feature Flag Disabled: </span>
                <span>The P0_7_AGENTIC_EXECUTION feature flag is currently disabled by clinical safety policy. New proposals cannot be planned or dispatched until activated by an authorized system administrator.</span>
              </div>
            </div>
          )}

          {/* Error Message if present */}
          {proposalsError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{proposalsError}</span>
              </div>
              <button
                type="button"
                onClick={() => loadProposals()}
                className="px-2.5 py-1 bg-white border border-rose-300 rounded font-bold text-rose-700 hover:bg-rose-100"
              >
                Retry
              </button>
            </div>
          )}

          {/* Proposals List / Grid */}
          {proposalsLoading ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-3">
              <RotateCcw className="h-6 w-6 text-slate-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-semibold">Loading clinical proposals queue...</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Proposals Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {proposalStatusFilter === 'PENDING_CLINICIAN_APPROVAL'
                  ? 'All AI care proposals for your assigned patients have been reviewed. No pending approvals remain.'
                  : `No clinical proposals found matching status '${proposalStatusFilter}'.`}
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {proposals.map((p) => {
                const assignedPt = data?.patients.find((pt) => pt.patientId === p.patientId);
                const ptName = assignedPt?.name || `Patient #${p.patientId.slice(0, 8)}`;
                const isPending = p.status === 'PENDING_CLINICIAN_APPROVAL';
                const isApproved = p.status === 'COMPLETED';
                const isRejected = p.status === 'REJECTED';

                return (
                  <div
                    key={p.actionId}
                    className={`bg-white rounded-xl border p-4 shadow-2xs space-y-3 transition flex flex-col justify-between ${isPending ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
                      }`}
                  >
                    <div className="space-y-2">
                      {/* Proposal Card Header: Type Badge, Risk Tier, Status */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {p.parameters?.proposalType || 'CARE_PROPOSAL'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                            HIGH_RISK
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isPending
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : isApproved
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : isRejected
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                        >
                          {isPending
                            ? 'PENDING CLINICIAN APPROVAL'
                            : isApproved
                              ? 'APPROVED'
                              : isRejected
                                ? 'REJECTED'
                                : p.status}
                        </span>
                      </div>

                      {/* Title & Patient */}
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {p.parameters?.title || 'Clinical Care Modification'}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-teal-700 font-semibold mt-0.5">
                          <Users className="h-3.5 w-3.5" />
                          <span>{ptName}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({assignedPt?.diabetesType || 'Assigned Patient'})
                          </span>
                        </div>
                      </div>

                      {/* AI Clinical Rationale */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          <span>AI Clinical Justification</span>
                        </div>
                        <p className="line-clamp-3 text-[11px] text-slate-800">
                          {p.parameters?.rationale || p.explanation || 'No rationale recorded.'}
                        </p>
                      </div>

                      {/* Proposed Details Preview */}
                      {p.parameters?.proposedDetails && (
                        <div className="text-[11px] text-slate-600 bg-slate-100/70 p-2 rounded border border-slate-200">
                          <span className="font-semibold text-slate-700">Proposed Changes: </span>
                          <span className="font-mono text-[10px]">
                            {JSON.stringify(p.parameters.proposedDetails).slice(0, 120)}
                            {JSON.stringify(p.parameters.proposedDetails).length > 120 ? '...' : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Metadata & Actions */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="text-[10px] text-slate-400">
                        Created: {new Date(p.createdAt).toLocaleDateString()} at{' '}
                        {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProposal(p);
                            setProposalReviewNotes('');
                            setProposalRejectionReason('');
                            setProposalReviewSuccess(null);
                            setProposalReviewError(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition flex items-center gap-1"
                        >
                          <span>Review Proposal</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: AGENT ACTIVITY FEED */}
      {mainView === 'AGENT_FEED' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-600" />
                  <h2 className="text-base font-bold text-slate-900">Governed Agent Execution Activity Feed</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                    Audit Log
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Longitudinal history of AI agent plans, confirmations, task schedules, and clinician review gates.
                </p>
              </div>

              {/* Patient filter */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Filter Patient:</span>
                <select
                  value={agentFeedPatientFilter}
                  onChange={(e) => setAgentFeedPatientFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-teal-700 w-full md:w-48"
                >
                  <option value="">All Assigned Patients</option>
                  {data?.patients.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      {p.name} ({p.patientId.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {agentFeedError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{agentFeedError}</span>
              </div>
              <button
                type="button"
                onClick={() => loadAgentFeed()}
                className="px-2.5 py-1 bg-white border border-rose-300 rounded font-bold text-rose-700 hover:bg-rose-100"
              >
                Retry
              </button>
            </div>
          )}

          {agentFeedLoading ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-3">
              <RotateCcw className="h-6 w-6 text-slate-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-semibold">Loading agent activity feed...</p>
            </div>
          ) : agentFeed.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-3">
              <Activity className="h-8 w-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Agent Activity Recorded</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No governed agent actions have been dispatched yet for your assigned patients.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
              {agentFeed.map((action) => {
                const assignedPt = data?.patients.find((pt) => pt.patientId === action.plan?.targetPatientId);
                const ptName = assignedPt?.name || `Patient #${action.plan?.targetPatientId?.slice(0, 8) || 'Unknown'}`;

                return (
                  <div key={action.id} className="p-4 hover:bg-slate-50/50 transition space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {action.toolName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${action.riskTier === 'HIGH_RISK'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : action.riskTier === 'MEDIUM_RISK'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : action.riskTier === 'LOW_RISK'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                        >
                          {action.riskTier}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${action.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : action.status === 'PENDING_CLINICIAN_APPROVAL'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : action.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                        >
                          {action.status}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400">
                        {new Date(action.createdAt).toLocaleDateString()} at{' '}
                        {new Date(action.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <div className="text-xs text-slate-800 font-semibold">
                        Plan Intent: {action.plan?.userIntent || 'Patient Request'}
                      </div>
                      <div className="text-xs text-teal-700 font-semibold">
                        Target: {ptName}
                      </div>
                    </div>

                    {action.errorMessage && (
                      <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                        Error: {action.errorMessage}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500">
                        Action ID: <span className="font-mono text-[10px]">{action.id}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await getAgentAction(action.id);
                            if (res && res.success && res.action) {
                              setSelectedActionDetail(res.action);
                            } else {
                              setSelectedActionDetail(action);
                            }
                          } catch {
                            setSelectedActionDetail(action);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                      >
                        Inspect Action
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: APPOINTMENTS & CLINICAL VISITS */}
      {mainView === 'APPOINTMENTS' && (
        <DoctorAppointments
          onSelectPatient={(patientId) => {
            const p = data?.patients.find((item) => item.patientId === patientId);
            if (!p) {
              setError('This appointment patient is not available in your assigned care roster.');
              return;
            }
            setSelectedPatient(p);
            setActiveDrawerTab('OVERVIEW');
            setMainView('ROSTER');
          }}
        />
      )}

      {/* PROPOSAL DETAIL & CLINICAL REVIEW MODAL */}
      {selectedProposal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 overflow-y-auto"
          onClick={() => {
            if (!submittingProposalReview && !showRejectModal) {
              setSelectedProposal(null);
            }
          }}
        >
          <div
            ref={proposalModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-modal-title"
            aria-describedby="proposal-modal-description"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-4 p-6 my-8 focus:outline-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {selectedProposal.parameters?.proposalType || 'CLINICAL_PROPOSAL'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                    HIGH_RISK
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${selectedProposal.status === 'PENDING_CLINICIAN_APPROVAL'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : selectedProposal.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedProposal.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                  >
                    {selectedProposal.status === 'PENDING_CLINICIAN_APPROVAL'
                      ? 'PENDING CLINICIAN APPROVAL'
                      : selectedProposal.status === 'COMPLETED'
                        ? 'PROPOSAL APPROVED (ADVISORY)'
                        : selectedProposal.status === 'REJECTED'
                          ? 'REJECTED BY CLINICIAN'
                          : selectedProposal.status}
                  </span>
                </div>
                <h2 id="proposal-modal-title" className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                  {selectedProposal.parameters?.title || 'Clinical Care Modification'}
                </h2>
                <div id="proposal-modal-description" className="text-xs text-slate-500 mt-0.5">
                  Plan Version: {selectedProposal.planVersion} • Plan ID: <span className="font-mono text-[10px]">{selectedProposal.planId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Governance Warning Banner */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Clinical Safety Protocol: </span>
                <span>AI-generated proposals are decision-support recommendations only. AI cannot execute medical orders autonomously. Licensed clinician review and explicit sign-off is required.</span>
              </div>
            </div>

            {/* Two-Column Grid: AI Proposal vs Recorded Facts */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Column 1: AI Proposal Details */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>AI-GENERATED PROPOSAL (DECISION SUPPORT ONLY)</span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Clinical Justification & Rationale
                  </div>
                  <p className="text-xs text-slate-800 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed">
                    {selectedProposal.parameters?.rationale || selectedProposal.explanation || 'No rationale provided.'}
                  </p>
                </div>

                {selectedProposal.parameters?.proposedDetails && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Proposed Modifications (Parameters)
                    </div>
                    <pre className="text-[11px] font-mono bg-white p-3 rounded-lg border border-slate-200 text-slate-800 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedProposal.parameters.proposedDetails, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 space-y-0.5 pt-2 border-t border-slate-200">
                  <div>Action ID: <span className="font-mono">{selectedProposal.actionId}</span></div>
                  <div>Created: {new Date(selectedProposal.createdAt).toLocaleString()}</div>
                  <div>Expires: {new Date(selectedProposal.expiresAt).toLocaleString()}</div>
                </div>
              </div>

              {/* Column 2: Recorded Patient Facts (Clinical Source of Truth) */}
              {(() => {
                const pt = data?.patients.find((p) => p.patientId === selectedProposal.patientId) || selectedPatient;
                const hasRecordedFasting = typeof pt?.targetFastingMin === 'number' && typeof pt?.targetFastingMax === 'number';
                const hasRecordedPostMeal = typeof pt?.targetPostMealMax === 'number';

                return (
                  <div className="space-y-3 bg-teal-50/40 p-4 rounded-xl border border-teal-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                      <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
                      <span>RECORDED PATIENT FACTS (EHR SOURCE OF TRUTH)</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-teal-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{pt?.name || `Patient #${selectedProposal.patientId.slice(0, 8)}`}</span>
                        <span className="text-[10px] font-semibold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                          {pt?.diabetesType || 'Diabetes Patient'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                        <div>
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-slate-400">Fasting Target:</span>
                            {!hasRecordedFasting && (
                              <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Reference Default — Not a Recorded Patient Target
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-800 mt-0.5">
                            {pt?.targetFastingMin || 80} - {pt?.targetFastingMax || 130} mg/dL
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-slate-400">Post-Meal Max:</span>
                            {!hasRecordedPostMeal && (
                              <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Reference Default — Not a Recorded Patient Target
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-800 mt-0.5">
                            &lt; {pt?.targetPostMealMax || 180} mg/dL
                          </div>
                        </div>
                      </div>

                      {pt?.activeCarePlan && (
                        <div className="pt-1 border-t border-slate-100 text-[11px]">
                          <span className="text-slate-400">Care Plan:</span>
                          <div className="font-medium text-slate-800">{pt.activeCarePlan.title}</div>
                        </div>
                      )}
                    </div>

                    {/* Notice distinguishing fact vs suggestion */}
                    <div className="text-[11px] text-teal-800 bg-teal-50 p-2.5 rounded-lg border border-teal-200 leading-snug">
                      <span className="font-semibold">Clinical Fact Boundary: </span>
                      The values above represent verified medical history recorded directly by the patient or clinical team. Damu does not alter, fabricate, or extrapolate clinical measurements.
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Success and Error Banners */}
            {proposalReviewSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{proposalReviewSuccess}</span>
              </div>
            )}

            {proposalReviewError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span className="font-medium">{proposalReviewError}</span>
              </div>
            )}

            {/* Clinician Decision Action Panel */}
            {selectedProposal.status === 'PENDING_CLINICIAN_APPROVAL' ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 pt-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-teal-700" />
                  <span>Clinician Review & Affirmative Sign-Off</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Clinical Review Notes / Instructions (Optional for approval, min 2 characters if provided):
                  </label>
                  <input
                    type="text"
                    value={proposalReviewNotes}
                    onChange={(e) => setProposalReviewNotes(e.target.value)}
                    placeholder="Enter clinical review notes or directives..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-teal-700"
                    disabled={submittingProposalReview}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRejectModal(true);
                      setProposalReviewError(null);
                    }}
                    disabled={submittingProposalReview}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition flex items-center gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    <span>Reject Proposal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApproveProposal(selectedProposal)}
                    disabled={submittingProposalReview}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-xs"
                  >
                    {submittingProposalReview ? (
                      <RotateCcw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>Approve Clinical Proposal</span>
                  </button>
                </div>
              </div>
            ) : selectedProposal.status === 'COMPLETED' ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>Proposal Approved — Advisory Review Complete</span>
                </div>
                <p className="text-[11px] text-emerald-800 pl-6 leading-relaxed">
                  AI clinical proposal approved. The advisory recommendation has been reviewed and approved by the assigned clinician. This approval does not automatically change the patient's care plan or prescription. Any actual care-plan, medication, dosage, or prescription change must be separately entered and authorized through the standard clinical workflow.
                </p>
              </div>
            ) : selectedProposal.status === 'REJECTED' ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2">
                <X className="h-4 w-4 text-rose-600" />
                <span>Proposal Rejected: This AI recommendation was reviewed and discarded by the clinician.</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {showRejectModal && selectedProposal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/75"
          onClick={() => {
            if (!submittingProposalReview) {
              setShowRejectModal(false);
            }
          }}
        >
          <div
            ref={rejectionModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejection-modal-title"
            aria-describedby="rejection-modal-description"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4 focus:outline-hidden"
          >
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <h3 id="rejection-modal-title" className="text-sm font-bold text-slate-900">Confirm Proposal Rejection</h3>
            </div>

            <p id="rejection-modal-description" className="text-xs text-slate-600 leading-relaxed">
              Please enter the clinical rationale for rejecting this proposal for <span className="font-semibold">{selectedProposal.parameters?.title || 'Care Proposal'}</span>. A reason (minimum 3 characters) is required for the permanent audit trail.
            </p>

            <div className="space-y-1">
              <textarea
                value={proposalRejectionReason}
                onChange={(e) => setProposalRejectionReason(e.target.value)}
                placeholder="State clinical reason for rejection (e.g. Current HbA1c does not warrant dosage reduction)..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-rose-600"
                disabled={submittingProposalReview}
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Required: min 3 characters</span>
                <span className={proposalRejectionReason.trim().length < 3 ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>
                  {proposalRejectionReason.trim().length} / 500
                </span>
              </div>
            </div>

            {proposalReviewError && (
              <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                {proposalReviewError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={submittingProposalReview}
                aria-label="Cancel rejection and return to proposal"
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleRejectProposal(selectedProposal)}
                disabled={submittingProposalReview || proposalRejectionReason.trim().length < 3}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition disabled:opacity-50"
              >
                {submittingProposalReview ? 'Submitting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AGENT ACTION DETAIL INSPECTOR MODAL */}
      {selectedActionDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70"
          onClick={() => setSelectedActionDetail(null)}
        >
          <div
            ref={actionDetailModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-detail-modal-title"
            aria-describedby="action-detail-modal-description"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 focus:outline-hidden"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {selectedActionDetail.toolName}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200 bg-rose-100 text-rose-800">
                    {selectedActionDetail.riskTier}
                  </span>
                </div>
                <h3 id="action-detail-modal-title" className="text-sm font-bold text-slate-900 mt-1">
                  {selectedActionDetail.plan?.userIntent || 'Agent Action Detail'}
                </h3>
                <p id="action-detail-modal-description" className="text-xs text-slate-500">
                  Detailed execution parameters and system status for this governed agent action.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedActionDetail(null)}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="font-semibold text-slate-700">Status: </span>
                <span className="font-mono font-bold text-teal-800">{selectedActionDetail.status}</span>
                <div className="text-[11px] text-slate-500">
                  Target Patient: {selectedActionDetail.plan?.targetPatientId || 'N/A'}
                </div>
              </div>

              {selectedActionDetail.parameters && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Parameters</span>
                  <pre className="text-[11px] font-mono bg-slate-50 p-2.5 rounded border border-slate-200 overflow-x-auto whitespace-pre-wrap max-h-48">
                    {typeof selectedActionDetail.parameters === 'string'
                      ? selectedActionDetail.parameters
                      : JSON.stringify(selectedActionDetail.parameters, null, 2)}
                  </pre>
                </div>
              )}

              {selectedActionDetail.errorMessage && (
                <div className="p-2.5 bg-rose-50 text-rose-800 rounded border border-rose-200">
                  <span className="font-bold">Error: </span>
                  {selectedActionDetail.errorMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedActionDetail(null)}
                aria-label="Close dialog"
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPatientReport && (
        <MedicalReportReviewModal
          report={selectedPatientReport}
          patientName={selectedPatient?.name}
          onClose={() => setSelectedPatientReport(null)}
        />
      )}

    </div>
  );
}
