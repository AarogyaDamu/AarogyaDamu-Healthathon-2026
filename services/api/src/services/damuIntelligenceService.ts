import { DamuAnswerBasis, DamuAvatarMode, DamuInteractResponse, DamuSourceReference, DamuTransparency } from '@aarogyadamu/contracts';
import { getAggregatedPatientHealthContext, PatientHealthContextData } from './damuHealthContextService';
import { classifyDamuIntent, DamuNluAnalysis } from '../ai/agent/damuNluService';
import { parseSpokenOrNumericGlucose } from './damuVoiceService';
import {
  getPatientHealthSummary,
  getGlucoseReadings,
  compareGlucosePeriods,
  getPrescribedMedications,
  getMedicationAdherence,
  getCarePlan,
  getPendingTasks,
  getAppointmentDetails,
  getApprovedConsultationSummaries,
  explainMedicalReport,
  searchApprovedHealthKnowledge,
  getJourneyProgressSummaryTool,
  getDoctorDiscussionPointsTool,
  explainReminderTool,
  ToolExecutionOutput,
} from '../ai/agent/readOnlyTools';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { prisma } from '../db/prisma';

export interface ProcessDamuInteractionParams {
  patientId: string;
  userQuery: string;
  language?: string;
  conversationId?: string;
  isCaregiver?: boolean;
  actorId?: string;
  actorRole?: string;
  reportId?: string;
  filterPermissions?: {
    canViewHealthSummary?: boolean;
    canViewMedications?: boolean;
    canViewTasks?: boolean;
    canViewConsultations?: boolean;
  };
}

function redactSensitiveTextForConversationStorage(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1: [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]')
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[PHONE REDACTED]')
    .slice(0, 2000);
}

function buildTransparency(
  intent: string,
  nluConfidence: number,
  sources: DamuSourceReference[],
  isCaregiver: boolean,
  emergencyEscalation: boolean,
  isProhibited: boolean,
): DamuTransparency {
  let answerBasis: DamuAnswerBasis = 'INSUFFICIENT_DATA';
  if (emergencyEscalation) answerBasis = 'EMERGENCY_RULE';
  else if (isProhibited) answerBasis = 'SAFETY_REFUSAL';
  else if (sources.some((source) => source.type === 'CLINICAL_SUMMARY')) answerBasis = 'CLINICIAN_APPROVED_RECORDS';
  else if (sources.some((source) => source.type === 'PATIENT_RECORD') && sources.some((source) => source.type === 'EDUCATIONAL_KNOWLEDGE')) answerBasis = 'PATIENT_RECORDS_AND_APPROVED_KNOWLEDGE';
  else if (sources.some((source) => source.type === 'PATIENT_RECORD' || source.type === 'CARE_PLAN')) answerBasis = 'PATIENT_RECORDS';
  else if (sources.some((source) => source.type === 'EDUCATIONAL_KNOWLEDGE')) answerBasis = 'APPROVED_KNOWLEDGE';

  const confidence = emergencyEscalation || isProhibited || (sources.length > 0 && nluConfidence >= 0.85)
    ? 'HIGH'
    : sources.length > 0
    ? 'MODERATE'
    : 'LOW';

  const limitations = [
    'Damu summarizes verified records and approved educational material; it does not diagnose or prescribe.',
    'A trend is not proof of cause and does not replace clinician review.',
  ];
  if (sources.length === 0) limitations.unshift('No verified source matched this question; Damu will not guess.');
  if (intent === 'MEDICAL_REPORT_EXPLAIN') limitations.unshift('Only values explicitly recognized in verified OCR text are explained; unrecognized report content is not inferred.');

  return {
    answerBasis,
    confidence,
    confidenceReason: confidence === 'HIGH'
      ? 'The response is bound to a deterministic safety rule or verified source records.'
      : confidence === 'MODERATE'
      ? 'The response has at least one verified source, but the available data is limited.'
      : 'The available evidence is insufficient for a reliable answer.',
    sourceCount: sources.length,
    dataScope: isCaregiver ? 'AUTHORIZED_DELEGATE' : 'PATIENT_SELF',
    dataWindow: 'Current patient-scoped records; glucose and adherence summaries use the last 30 days unless stated otherwise.',
    limitations,
    privacy: {
      patientScoped: true,
      rawAudioStored: false,
      storageMode: 'MINIMIZED_CONVERSATION_METADATA',
    },
  };
}

/**
 * Main intelligence orchestration pipeline for Damu Health Intelligence & Patient Agent.
 */
export async function processDamuInteraction(
  params: ProcessDamuInteractionParams
): Promise<DamuInteractResponse> {
  const {
    patientId,
    userQuery,
    language = 'en-IN',
    isCaregiver = false,
    actorId,
    actorRole,
    reportId,
    filterPermissions,
  } = params;

  // 1. Fetch Aggregated Patient Context
  const contextData: PatientHealthContextData = await getAggregatedPatientHealthContext(
    patientId,
    filterPermissions
  );

  const recentGlucose = contextData.glucoseMetrics.recentReadings.length > 0
    ? contextData.glucoseMetrics.recentReadings[0].value
    : null;

  // 2. Perform NLU and Safety Analysis
  const reportedGlucose = parseSpokenOrNumericGlucose(userQuery);
  const nlu: DamuNluAnalysis = classifyDamuIntent(
    userQuery,
    reportedGlucose ?? recentGlucose
  );

  let textResponse = '';
  let spokenText = '';
  let avatarMode: DamuAvatarMode = 'speaking';
  const sources: DamuSourceReference[] = [];
  let suggestedFollowUps: string[] = [];
  let emergencyNotice: string | undefined = undefined;
  let emergencyEscalation = false;
  let isProhibited = false;

  // 3. Handle Special Safety Paths
  if (nlu.hasEmergency) {
    emergencyEscalation = true;
    emergencyNotice = nlu.emergencyNotice;
    avatarMode = 'speaking';
    textResponse = `${nlu.emergencyNotice}\n\nPlease dial 112 (India National Emergency) immediately. Your safety is the highest priority.`;
    spokenText = `Emergency alert. Critical condition detected. Please call 112 immediately.`;
    suggestedFollowUps = ['Call 112 Emergency', 'Notify emergency contact', 'View hypoglycemia guidance'];
  } else if (nlu.isProhibited) {
    isProhibited = true;
    avatarMode = 'idle';
    textResponse = `${nlu.refusalReason}\n\nDamu is designed to help you understand your doctor's recommendations and track your health journey, but cannot prescribe drugs, adjust dosages, or diagnose conditions.`;
    spokenText = nlu.refusalReason || 'I cannot prescribe or change medications. Please consult your doctor.';
    suggestedFollowUps = ['View my current prescriptions', 'Book doctor consultation', 'Prepare questions for doctor'];
  } else {
    // 4. Execute Intent-Specific Tooling & Synthesis
    let toolOutput: ToolExecutionOutput | null = null;

    switch (nlu.intent) {
      case 'GREETING': {
        avatarMode = 'speaking';
        textResponse = `Hello ${contextData.fullName}! I'm Damu, your diabetes care companion. I can help you review your blood sugar logs, check your doctor-prescribed medications, view upcoming checkups, or answer general diabetes self-care questions. How can I support you today?`;
        spokenText = `Hello ${contextData.fullName}! I'm Damu, your diabetes companion. How can I help you today?`;
        suggestedFollowUps = [
          'How is my blood sugar doing?',
          'What medicines should I take?',
          'What did the doctor advise in my last visit?',
        ];
        break;
      }

      case 'GLUCOSE_SUMMARY': {
        toolOutput = await getGlucoseReadings(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nRemember, regular testing as prescribed by your physician helps keep you in your target range.`;
        spokenText = `Over the last 30 days, your overall average glucose is ${contextData.glucoseMetrics.overallAverage ? `${contextData.glucoseMetrics.overallAverage} milligrams per deciliter` : 'not yet recorded'}, and your time-in-range is ${contextData.glucoseMetrics.timeInRangePercent} percent.`;
        suggestedFollowUps = [
          'Compare this week to last week',
          'What is the Rule of 15 for low sugar?',
          'Show my prescribed medications',
        ];
        break;
      }

      case 'GLUCOSE_COMPARISON': {
        toolOutput = await compareGlucosePeriods(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nClinical reminder: Trends show historical patterns and do not replace personalized guidance from your physician.`;
        spokenText = toolOutput.summary;
        suggestedFollowUps = [
          'How is my overall time-in-range?',
          'What are my care plan goals?',
          'What should I eat to steady my glucose?',
        ];
        break;
      }

      case 'JOURNEY_PROGRESS': {
        toolOutput = await getJourneyProgressSummaryTool(patientId);
        avatarMode = 'speaking';
        textResponse = toolOutput.summary;
        spokenText = `Here is your care journey progress summary.`;
        suggestedFollowUps = [
          'What should I discuss with my doctor?',
          'How is my medication adherence?',
          'What tasks do I have pending?',
        ];
        break;
      }

      case 'DOCTOR_DISCUSSION_POINTS': {
        toolOutput = await getDoctorDiscussionPointsTool(patientId);
        avatarMode = 'speaking';
        textResponse = toolOutput.summary;
        spokenText = `I have summarized your key progress points to discuss with your doctor.`;
        suggestedFollowUps = [
          'When is my next appointment?',
          'How has my diabetes journey progressed?',
          'Show my recent glucose summary',
        ];
        break;
      }

      case 'REMINDER_EXPLANATION': {
        toolOutput = await explainReminderTool(patientId, userQuery);
        avatarMode = 'speaking';
        textResponse = toolOutput.summary;
        spokenText = `Care reminders help you follow doctor-prescribed medication schedules and care tasks.`;
        suggestedFollowUps = [
          'What tasks do I have pending?',
          'Show my prescribed medications',
          'How do I change notification preferences?',
        ];
        break;
      }

      case 'MEDICATION_SCHEDULE': {
        toolOutput = await getPrescribedMedications(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nNote: All prescriptions are managed directly by your treating doctor in the Med Vault. Damu displays your doctor's exact instructions.`;
        spokenText = toolOutput.summary;
        suggestedFollowUps = [
          'How is my medication adherence?',
          'What did the doctor say in my last consultation?',
          'Schedule a checkup with my doctor',
        ];
        break;
      }

      case 'MEDICATION_ADHERENCE': {
        toolOutput = await getMedicationAdherence(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nTaking your medications consistently as directed helps maintain healthy glucose stability and long-term vitality.`;
        spokenText = `Your medication adherence rate over the last 30 days is ${contextData.medicationAdherence.adherenceRatePercent} percent.`;
        suggestedFollowUps = [
          'Show my prescribed medications',
          'What tasks do I have pending?',
          'When is my next doctor appointment?',
        ];
        break;
      }

      case 'CARE_PLAN_TARGETS': {
        toolOutput = await getCarePlan(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nYour care plan is created by your doctor to guide your targets and daily habits.`;
        spokenText = toolOutput.summary;
        suggestedFollowUps = [
          'How is my current glucose average?',
          'What tasks are scheduled for me?',
          'Show diet recommendations',
        ];
        break;
      }

      case 'TASKS_AND_REMINDERS': {
        toolOutput = await getPendingTasks(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nCompleting doctor-assigned tasks keeps your care team informed on your progress.`;
        spokenText = toolOutput.summary;
        suggestedFollowUps = [
          'Show my prescribed medications',
          'When is my next appointment?',
          'What are my care plan targets?',
        ];
        break;
      }

      case 'APPOINTMENTS_SCHEDULE': {
        toolOutput = await getAppointmentDetails(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nYou can manage or book follow-up visits anytime in the Appointment Center.`;
        spokenText = toolOutput.summary;
        suggestedFollowUps = [
          'How do I prepare for my doctor visit?',
          'Show my recent glucose summary',
          'What did the doctor say in my last visit?',
        ];
        break;
      }

      case 'CONSULTATION_SUMMARY': {
        toolOutput = await getApprovedConsultationSummaries(patientId, contextData);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nNote: These notes are finalized and approved by your clinician. Incomplete or unapproved drafts are never shown.`;
        spokenText = contextData.approvedConsultations.length > 0
          ? `Here is the summary approved by Dr. ${contextData.approvedConsultations[0].clinicianName}.`
          : 'No doctor-approved consultation notes have been shared yet.';
        suggestedFollowUps = [
          'Show my prescribed medications',
          'When is my next appointment?',
          'What are my care plan goals?',
        ];
        break;
      }

      case 'MEDICAL_REPORTS_SUMMARY': {
        avatarMode = 'speaking';
        if (contextData.medicalReports.length === 0) {
          textResponse = 'No medical reports or lab documents have been uploaded to your Health Vault yet.';
        } else {
          const list = contextData.medicalReports
            .map(r => `• ${r.title} (${r.category}, ${new Date(r.reportDate).toLocaleDateString()})`)
            .join('\n');
          textResponse = `Here are your recent medical documents:\n${list}\n\nYou can view full document scans and laboratory values in the Health Vault.`;
        }
        spokenText = `You have ${contextData.medicalReports.length} report(s) in your Health Vault.`;
        sources.push({
          type: 'PATIENT_RECORD',
          title: 'Health Vault Medical Reports',
          reference: `HealthDocument:${patientId}`,
          content: `${contextData.medicalReports.length} document(s) on file.`,
        });
        suggestedFollowUps = [
          'How is my blood sugar doing?',
          'Show my prescribed medications',
          'Prepare questions for my doctor visit',
        ];
        break;
      }

      case 'MEDICAL_REPORT_EXPLAIN': {
        toolOutput = await explainMedicalReport(patientId, reportId);
        avatarMode = 'speaking';
        textResponse = toolOutput.summary;
        spokenText = toolOutput.summary.slice(0, 240);
        suggestedFollowUps = [
          'Show my glucose trend',
          'Prepare questions for my doctor',
          'Show my care journey progress',
        ];
        break;
      }

      case 'LIFESTYLE_GUIDANCE':
      case 'DIABETES_EDUCATION':
      default: {
        toolOutput = await searchApprovedHealthKnowledge(userQuery);
        avatarMode = 'speaking';
        textResponse = `${toolOutput.summary}\n\nClinical Disclaimer: This educational information is aligned with recognized diabetes guidelines (ADA/RSSDI) and is for self-management education. It is not a substitute for clinical advice from your doctor.`;
        spokenText = toolOutput.summary.slice(0, 240);
        suggestedFollowUps = [
          'What is the Rule of 15 for low sugar?',
          'Explain the Diabetes Plate Method',
          'What should my blood glucose targets be?',
        ];
        break;
      }
    }

    if (toolOutput && toolOutput.sources) {
      sources.push(...toolOutput.sources);
    }
  }

  const transparency = buildTransparency(
    nlu.intent,
    nlu.confidence,
    sources,
    isCaregiver,
    emergencyEscalation,
    isProhibited,
  );

  // 5. Manage Conversation Continuity & Persistence
  let conversationId = params.conversationId;
  let messageId: string | undefined = undefined;

  try {
    let conversation = conversationId
      ? await prisma.damuConversation.findUnique({ where: { id: conversationId } })
      : null;

    // A conversation id is untrusted client input. Never append a patient's
    // question to another patient's persisted thread.
    if (conversation && conversation.userId !== patientId) {
      conversation = null;
      conversationId = undefined;
    }

    if (!conversation) {
      conversation = await prisma.damuConversation.create({
        data: {
          userId: patientId,
          title: userQuery.slice(0, 40) || 'Health Discussion',
          language,
        },
      });
      conversationId = conversation.id;
    }

    // Save user message
    await prisma.damuMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'USER',
        content: redactSensitiveTextForConversationStorage(userQuery),
        avatarMode: 'listening',
        actorId,
        actorRole: actorRole || (isCaregiver ? 'CAREGIVER' : 'PATIENT'),
        dataClassification: 'CLINICAL_PHI',
        retentionPolicy: 'PATIENT_CONTROLLED',
        redactedForStorage: true,
        metadata: JSON.stringify({
          patientScope: patientId,
          storageMode: 'MINIMIZED_CONVERSATION_METADATA',
          reportId: reportId || null,
        }),
      },
    });

    // Save Damu response message
    const damuMsg = await prisma.damuMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'DAMU',
        content: textResponse,
        intent: nlu.intent,
        sources: JSON.stringify(sources),
        suggestedFollowUps: JSON.stringify(suggestedFollowUps),
        avatarMode,
        emergencyNotice: emergencyEscalation,
        isProhibited,
        actorId,
        actorRole: actorRole || (isCaregiver ? 'CAREGIVER' : 'PATIENT'),
        dataClassification: 'CLINICAL_PHI',
        retentionPolicy: 'PATIENT_CONTROLLED',
        redactedForStorage: true,
        transparency: JSON.stringify(transparency),
        metadata: JSON.stringify({
          patientScope: patientId,
          storageMode: 'MINIMIZED_CONVERSATION_METADATA',
        }),
      },
    });

    messageId = damuMsg.id;
  } catch (error) {
    safeClinicalLog('warn', 'Failed to persist Damu conversation message', { error: String(error) });
  }

  return {
    conversationId,
    messageId,
    transcript: userQuery,
    textResponse,
    spokenText,
    detectedLanguage: language,
    intent: nlu.intent,
    avatarMode,
    sources,
    suggestedFollowUps,
    emergencyNotice,
    emergencyEscalation,
    isProhibited,
    audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
    isMock: false,
    transparency,
  };
}
