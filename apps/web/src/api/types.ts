export type DiabetesType =
  | 'TYPE_1_DIABETES'
  | 'TYPE_2_DIABETES'
  | 'GESTATIONAL_DIABETES'
  | 'PREDIABETES'
  | 'OTHER';

export type GlucoseContext =
  | 'FASTING'
  | 'PRE_MEAL'
  | 'POST_MEAL_2HR'
  | 'BEDTIME'
  | 'RANDOM';

export type TaskCategory = 'MEDICATION' | 'LAB' | 'FOLLOW_UP';
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type DocumentCategory =
  | 'LAB_REPORT'
  | 'PRESCRIPTION'
  | 'DISCHARGE_SUMMARY'
  | 'IMAGING';

export type CaregiverPermission =
  | 'VIEW_OBSERVATIONS'
  | 'VIEW_TASKS'
  | 'VIEW_CONSULTATIONS'
  | 'MANAGE_TASKS';

export interface UserProfile {
  id: string;
  userId: string;
  fullName: string;
  dateOfBirth?: string;
  diabetesType: DiabetesType;
  diagnosisYear?: number;
  primaryClinician?: string;
  knownAllergies?: string;
  targetFastingMin: number;
  targetFastingMax: number;
  targetPostMealMax: number;
  createdAt: string;
  updatedAt: string;
}
export interface AuthUser {
  id: string;
  email: string;
  profile?: UserProfile | null;
  isSyntheticDemo?: boolean;
  isClinician: boolean;
}

export interface HealthObservation {
  id: string;
  userId: string;
  type: 'BLOOD_GLUCOSE' | 'WEIGHT' | 'BLOOD_PRESSURE';
  numericValue: number;
  unit: string;
  context: GlucoseContext;
  observedAt: string;
  notes?: string;
}

export interface CareTask {
  id: string;
  userId: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  dueAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface HealthDocument {
  id: string;
  userId: string;
  title: string;
  category: DocumentCategory;
  issuingFacility?: string;
  reportDate: string;
  notes?: string;
  fileUrl?: string;
  processingStatus: 'READY' | 'PROCESSING' | 'NEEDS_REVIEW' | 'FAILED';
  extractedData?: {
    testName: string;
    value: string;
    unit: string;
    normalRange?: string;
  }[];
}

export interface CaregiverConsent {
  id: string;
  patientId: string;
  patientName?: string;
  caregiverId?: string;
  caregiverName: string;
  caregiverEmail: string;
  relationship: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  permissions: CaregiverPermission[];
  createdAt: string;
  expiresAt?: string;
}

export interface DashboardResponse {
  profile: UserProfile | null;
  recentObservations: HealthObservation[];
  pendingTasks: CareTask[];
  nextAppointment: {
    id: string;
    clinicianName: string;
    facilityName: string;
    scheduledAt: string;
    purpose: string;
  } | null;
  isSyntheticDemo: boolean;
}

export interface DamuAssistantResponse {
  reply: string;
  records?: {
    type: 'OBSERVATIONS' | 'APPOINTMENTS' | 'TASKS' | 'DOCUMENTS' | 'CARE_PLAN';
    items: Array<{
      id: string;
      title?: string;
      numericValue?: number;
      unit?: string;
      context?: string;
      observedAt?: string;
      scheduledAt?: string;
      dueAt?: string;
      details?: string;
    }>;
  };
  proposal?: {
    id: string;
    type: 'SCHEDULE_TASK' | 'APPOINTMENT_REMINDER' | 'LOG_OBSERVATION';
    summaryText: string;
    payload: Record<string, unknown>;
  };
  guardrailTriggered?: boolean;
}

// ==========================================
// SHARED DIABETES CARE PLAN TYPES
// ==========================================
export interface CarePlanGoal {
  id: string;
  carePlanId: string;
  category: string;
  title: string;
  targetValue: string;
  unit?: string | null;
  timeframe?: string;
  status: 'IN_PROGRESS' | 'ACHIEVED' | 'NEEDS_ATTENTION';
  notes?: string | null;
}

export interface CarePlanActivity {
  id: string;
  carePlanId: string;
  category: string;
  title: string;
  frequency: string;
  timing?: string | null;
  instructions?: string | null;
  isCaregiverEligible: boolean;
}

export interface CarePlan {
  id: string;
  patientId: string;
  doctorId: string;
  approvedById?: string | null;
  title: string;
  diagnosis?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
  version: number;
  summary?: string | null;
  doctorInstructions?: string | null;
  reviewDate?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  goals: CarePlanGoal[];
  activities: CarePlanActivity[];
  doctor?: {
    id: string;
    email: string;
    profile?: { fullName: string } | null;
  };
  approver?: {
    id: string;
    email: string;
    profile?: { fullName: string } | null;
  };
}

export interface CarePlanProgress {
  totalTasks: number;
  completedTasks: number;
  percentage: number;
  isAdherent: boolean;
}

export interface CarePlanResponse {
  carePlan: CarePlan | null;
  progress: CarePlanProgress | null;
}

export type JourneyStageStatus = 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'PENDING' | 'OVERDUE';

export interface JourneyStage {
  id: string;
  order: number;
  title: string;
  description: string;
  status: JourneyStageStatus;
  completedAt?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  details?: Record<string, any> | null;
}

export interface JourneyTimelineResponse {
  patientId: string;
  currentStage: string;
  stages: JourneyStage[];
  overallProgress: {
    completedCount: number;
    totalStages: number;
    completionPercentage: number;
  };
}

export interface DailyJourneyResponse {
  patientId: string;
  date: string;
  carePlan: {
    id: string;
    title: string;
    version: number;
    doctorInstructions?: string | null;
    approvedBy: string;
  } | null;
  activities: CarePlanActivity[];
  pendingTasks: Array<{
    id: string;
    title: string;
    category: string;
    dueAt: string;
    isOverdue: boolean;
  }>;
  completedTasks: Array<{
    id: string;
    title: string;
    category: string;
    completedAt?: string | null;
  }>;
  medications: Array<{
    id: string;
    name: string;
    dosage: string;
    timing: string;
    notes?: string | null;
  }>;
  upcomingAppointments: Array<{
    id: string;
    doctorName: string;
    scheduledAt: string;
    reason: string;
    status: string;
    isServerConfirmed: boolean;
  }>;
  summary: {
    totalTasksToday: number;
    completedCount: number;
    pendingCount: number;
    adherencePercentage: number;
  };
}

export interface JourneyProgressResponse {
  patientId: string;
  actualObservations: {
    bloodGlucose: Array<{
      id: string;
      numericValue: number;
      unit: string;
      context: string;
      observedAt: string;
      provenance: string;
      isActualObservation: boolean;
    }>;
    hba1c: Array<{
      id: string;
      numericValue: number;
      unit: string;
      observedAt: string;
      provenance: string;
      isActualObservation: boolean;
    }>;
    bloodPressure: Array<{
      id: string;
      type: string;
      numericValue: number;
      unit: string;
      observedAt: string;
      provenance: string;
      isActualObservation: boolean;
    }>;
    weight: Array<{
      id: string;
      numericValue: number;
      unit: string;
      observedAt: string;
      provenance: string;
      isActualObservation: boolean;
    }>;
  };
  clinicianTargets: {
    fastingMin: number;
    fastingMax: number;
    postMealMax: number;
    goals: CarePlanGoal[];
  };
  estimatedInsights: {
    estimatedA1c: {
      value: number;
      unit: string;
      isActualObservation: boolean;
      isEstimated: boolean;
      provenance: string;
      method: string;
      disclaimer: string;
    } | null;
    glycemicControl: {
      timeInRangePercentage: number;
      inRangeCount: number;
      highCount: number;
      lowCount: number;
      totalReadings: number;
      averageGlucose: number | null;
      isEstimated: boolean;
    };
  };
}

export interface JourneyFollowUpResponse {
  patientId: string;
  nextReviewDate: string | null;
  daysUntilReview: number | null;
  isReviewOverdue: boolean;
  upcomingAppointments: Array<{
    id: string;
    doctorId: string;
    doctorName: string;
    scheduledAt: string;
    durationMinutes: number;
    reason: string;
    visitType: string;
    status: string;
    isServerConfirmed: boolean;
    statusLabel: string;
  }>;
  pendingClinicalReports: Array<{
    id: string;
    title: string;
    category: string;
    uploadedAt: string;
  }>;
  assignedClinician: {
    id: string;
    name: string;
    email: string;
    activatedAt: string | null;
  } | null;
}

export interface JourneyHistoryItem {
  id: string;
  eventType: 'OBSERVATION' | 'TASK' | 'CONSULTATION' | 'CARE_PLAN' | 'APPOINTMENT' | 'DOCUMENT';
  title: string;
  summary: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface JourneyHistoryResponse {
  patientId: string;
  totalEvents: number;
  history: JourneyHistoryItem[];
}

// ==========================================
// PHASE 4: DOCTOR COMMAND CENTER & CAREGIVER CONNECT
// ==========================================

export interface DoctorDashboardPatient {
  patientId: string;
  name: string;
  email: string;
  diabetesType: string;
  diagnosisYear?: number | null;
  targetFastingMin: number;
  targetFastingMax: number;
  targetPostMealMax: number;
  assignedAt: string;
  risk: 'HIGH' | 'LOW' | 'IN_TARGET' | 'UNKNOWN';
  isReviewOverdue: boolean;
  currentStage: string;
  adherenceRate: number;
  latestObservation: {
    id: string;
    numericValue: number;
    unit: string;
    context: string;
    observedAt: string;
    isHigh: boolean;
    isLow: boolean;
  } | null;
  activeCarePlan: {
    id: string;
    title: string;
    version: number;
    reviewDate: string | null;
    goalsCount: number;
    activitiesCount: number;
  } | null;
  nextAppointment: {
    id: string;
    scheduledAt: string;
    visitType: string;
    status: string;
    isServerConfirmed: boolean;
  } | null;
}

export interface DoctorDashboardResponse {
  summary: {
    totalAssignedPatients: number;
    highRiskCount: number;
    overdueFollowUpsCount: number;
    upcomingAppointmentsCount: number;
  };
  patients: DoctorDashboardPatient[];
  upcomingAppointments: Array<{
    id: string;
    patientId: string;
    doctorId: string;
    patientName: string;
    doctorName: string;
    scheduledAt: string;
    durationMinutes: number;
    reason: string;
    visitType: string;
    status: string;
  }>;
}

export interface CaregiverActivity {
  id: string;
  title: string;
  category: string;
  frequency: string;
  description?: string | null;
  targetValue?: string | null;
  isCaregiverEligible: boolean;
}

export interface CaregiverActivitiesResponse {
  patientId: string;
  hasActiveCarePlan: boolean;
  planTitle: string | null;
  permittedActivities: CaregiverActivity[];
  goals: CarePlanGoal[];
}

export interface CaregiverTaskHistoryItem {
  id: string;
  title: string;
  category: string;
  completedAt: string | null;
  completedById: string | null;
  completedByRole: string;
  completedByName: string;
}

export interface CaregiverHistoryResponse {
  history: CaregiverTaskHistoryItem[];
}

export interface CareTeamMessage {
  id: string;
  patientId: string;
  senderId: string;
  senderName: string;
  senderRole: 'PATIENT' | 'DOCTOR' | 'CAREGIVER';
  category: 'QUESTION' | 'DOCTOR_RESPONSE' | 'CAREGIVER_UPDATE' | 'FOLLOW_UP_INSTRUCTION' | 'APPOINTMENT' | 'GENERAL';
  content: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  isOwnMessage: boolean;
}

export interface CareTeamMessagesResponse {
  patientId: string;
  messages: CareTeamMessage[];
}

export interface CareNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface CareNotificationsResponse {
  unreadCount: number;
  notifications: CareNotification[];
}

export interface ActivityFeedItem {
  id: string;
  type: 'OBSERVATION' | 'TASK' | 'CARE_PLAN' | 'APPOINTMENT' | 'CLINICAL' | 'MESSAGE' | 'CAREGIVER';
  title: string;
  details: string;
  timestamp: string;
  actorName: string;
  status: string;
}

export interface ActivityFeedResponse {
  patientId: string;
  totalActivities: number;
  feed: ActivityFeedItem[];
}

// ==========================================
// P0.7 Governed Agentic Proposals & Feeds
// ==========================================

export type AgentProposalType =
  | 'MEDICATION_ADJUSTMENT_REQUEST'
  | 'TARGET_GLUCOSE_RANGE_REVISION'
  | 'LIFESTYLE_GOAL_ADJUSTMENT'
  | 'LAB_WORK_ORDER';

export interface AgentProposalItem {
  actionId: string;
  planId: string;
  planVersion: number;
  patientId: string;
  patientName?: string;
  toolName: string;
  riskTier: 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK';
  status:
    | 'DRAFT'
    | 'AWAITING_CONFIRMATION'
    | 'PENDING_CLINICIAN_APPROVAL'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED';
  parameters: {
    proposalType?: AgentProposalType;
    title?: string;
    rationale?: string;
    proposedDetails?: Record<string, unknown>;
    [key: string]: unknown;
  };
  explanation?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AgentProposalsResponse {
  success: boolean;
  proposals: AgentProposalItem[];
  error?: string;
  errorCode?: string;
}

export interface AgentProposalReviewPayload {
  planId: string;
  planVersion?: number;
  decision: 'APPROVE' | 'REJECT';
  clinicalReviewNotes?: string;
  rejectionReason?: string;
}

export interface AgentProposalReviewResponse {
  success: boolean;
  actionId: string;
  status: string;
  decision: 'APPROVE' | 'REJECT';
  error?: string;
  errorCode?: string;
}

export interface AgentActionFeedItem {
  id: string;
  planId: string;
  toolName: string;
  riskTier: 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK';
  status:
    | 'DRAFT'
    | 'AWAITING_CONFIRMATION'
    | 'PENDING_CLINICIAN_APPROVAL'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED';
  parameters: string | Record<string, unknown>;
  result?: string | Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
  executedAt?: string | null;
  plan?: {
    id: string;
    version: number;
    userIntent: string;
    explanation?: string;
    targetPatientId: string;
    status: string;
    createdAt: string;
    expiresAt?: string;
  };
}

export interface AgentPlanResponse {
  success: boolean;
  plan: {
    id: string;
    version: number;
    userIntent: string;
    explanation?: string;
    targetPatientId: string;
    status: string;
    createdAt: string;
    expiresAt?: string;
    actions: AgentActionFeedItem[];
  };
  error?: string;
  errorCode?: string;
}

export interface AgentActionResponse {
  success: boolean;
  action: AgentActionFeedItem;
  error?: string;
  errorCode?: string;
}

// ----------------------------------------------------
// Phase 4: Appointment Booking & Visit Management
// ----------------------------------------------------
export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'MISSED';

export type VisitType =
  | 'CHECKUP'
  | 'FOLLOW_UP'
  | 'DIABETES_REVIEW'
  | 'EMERGENCY'
  | 'OTHER'
  | 'IN_PERSON'
  | 'VIDEO_CONSULT'
  | 'HOME_VISIT'
  | 'EMERGENCY_TRIAGE';

export interface DoctorAppointmentItem {
  id: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  patientEmail?: string;
  patientDateOfBirth?: string | null;
  patientDiabetesType?: string;
  doctorName: string;
  doctorEmail?: string;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
  visitType: string;
  status: AppointmentStatus;
  clinicName: string;
  clinicFacilityId?: string | null;
  questionnaireResponse?: Record<string, any> | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  rescheduledFromId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorAvailabilitySlot {
  startTime: string;
  endTime: string;
  scheduledAt: string;
  available: boolean;
  reason?: string;
}

export interface DoctorScheduleSetting {
  id?: string;
  doctorId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  clinicName?: string;
}

export interface DoctorTimeOffItem {
  id: string;
  doctorId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdAt?: string;
}

export interface HealthInsight {
  id: string;
  category: 'GLUCOSE' | 'MEDICATION' | 'CARE_PLAN' | 'APPOINTMENT' | 'MILESTONE' | 'LIFESTYLE';
  title: string;
  summary: string;
  periodLabel: string;
  readingCount: number;
  confidence: number;
  dataSufficiency: 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
  isActionable: boolean;
  suggestedDiscussion?: string;
  sourceReference: string;
  createdAt: string;
}

export interface JourneyMilestoneItem {
  id: string;
  userId: string;
  milestoneKey: string;
  title: string;
  description: string;
  achievedAt: string;
  eventRefType?: string | null;
  eventRefId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface JourneyProgressSummary {
  patientId: string;
  evaluationDate: string;
  overallProgress: {
    currentStageId: string;
    completedStagesCount: number;
    totalStagesCount: number;
    completionPercentage: number;
  };
  glucoseProgress: {
    totalReadings30Days: number;
    readings7Days: number;
    readingsPrior7Days: number;
    averageGlucose30Days: number | null;
    averageGlucose7Days: number | null;
    averageGlucosePrior7Days: number | null;
    trendDelta7Days: number | null;
    trendDirection: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    timeInRangePercentage: number;
    fastingAverage: number | null;
    postMealAverage: number | null;
    hypoCount: number;
    hyperCount: number;
    missingMeasurementAlert?: string | null;
    nonCausationDisclaimer: string;
  };
  medicationAdherence: {
    prescribedMedicinesCount: number;
    recordedDoses30Days: number;
    takenDosesCount: number;
    skippedDosesCount: number;
    unconfirmedDosesCount: number;
    adherenceRatePercentage: number;
    weeklyAdherenceRate: number;
  };
  carePlanProgress: {
    activePlanTitle: string | null;
    planVersion: number | null;
    totalTasksAssigned: number;
    completedTasksCount: number;
    pendingTasksCount: number;
    overdueTasksCount: number;
    completionRatePercentage: number;
  };
  consultationsAndAppointments: {
    upcomingAppointmentsCount: number;
    nextAppointment?: {
      id: string;
      scheduledAt: string;
      doctorName: string;
      reason: string;
      isServerConfirmed: boolean;
    } | null;
    recentApprovedConsultationsCount: number;
    latestApprovedConsultation?: {
      id: string;
      clinicianName: string;
      approvedAt: string;
      summarySnippet: string;
    } | null;
  };
  milestones: JourneyMilestoneItem[];
  insights: HealthInsight[];
}
