
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'aarogyadamu_mobile_jwt';
const REFRESH_TOKEN_KEY = 'aarogyadamu_mobile_refresh_token';
const ONBOARDING_KEY = 'aarogyadamu_mobile_onboarding_completed';
const SELECTED_ROLE_KEY = 'aarogyadamu_mobile_selected_role';

/* -------------------------------------------------------------------------- */
/* Authentication token storage                                               */
/* -------------------------------------------------------------------------- */

export async function saveMobileToken(token: string, refreshToken?: string): Promise<void> {
  const value = token.trim();

  if (!value) {
    throw new Error('Cannot store an empty authentication token.');
  }
  if (refreshToken !== undefined && !refreshToken.trim()) {
    throw new Error('Cannot store an empty refresh token.');
  }

  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable.');
    }

    localStorage.setItem(TOKEN_KEY, value);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, value);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearMobileToken(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function logoutMobileSession(): Promise<void> {
  try {
    if (await getMobileToken()) {
      await mobileApiFetch('/auth/logout', { method: 'POST' });
    }
  } finally {
    await clearMobileToken();
  }
}

export async function getMobileOnboardingCompleted(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDING_KEY) === 'true';
    }

    return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setMobileOnboardingCompleted(completed: boolean): Promise<void> {
  const value = completed ? 'true' : 'false';

  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ONBOARDING_KEY, value);
    }
    return;
  }

  await SecureStore.setItemAsync(ONBOARDING_KEY, value);
}

export async function getSelectedMobileRole(): Promise<'PATIENT' | 'CAREGIVER' | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof localStorage !== 'undefined' ? localStorage.getItem(SELECTED_ROLE_KEY) : null)
      : await SecureStore.getItemAsync(SELECTED_ROLE_KEY);

    if (raw === 'PATIENT' || raw === 'CAREGIVER') {
      return raw;
    }

    return null;
  } catch {
    return null;
  }
}

export async function setSelectedMobileRole(role: 'PATIENT' | 'CAREGIVER' | null): Promise<void> {
  const value = role ?? '';

  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      if (value) {
        localStorage.setItem(SELECTED_ROLE_KEY, value);
      } else {
        localStorage.removeItem(SELECTED_ROLE_KEY);
      }
    }
    return;
  }

  if (value) {
    await SecureStore.setItemAsync(SELECTED_ROLE_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(SELECTED_ROLE_KEY);
  }
}

export async function getMobileToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined'
        ? localStorage.getItem(TOKEN_KEY)
        : null;
    }

    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getMobileRefreshToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined'
        ? localStorage.getItem(REFRESH_TOKEN_KEY)
        : null;
    }

    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* API helper                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolves API Base URL for mobile environments.
 * If running on Android and the URL uses localhost or 127.0.0.1,
 * it resolves the host to 10.0.2.2 (standard Android emulator virtual loopback).
 * Explicit IPs or production configurations are preserved.
 */
export function resolveApiBaseUrl(rawUrl?: string): string {
  const configured = (rawUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api')
    .trim()
    .replace(/\/+$/, '');

  if (!configured) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api';
  }

  if (Platform.OS === 'android') {
    return configured.replace(/\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i, '://10.0.2.2$2$3');
  }

  return configured;
}

export interface MobileApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

interface RefreshSessionResponse {
  token: string;
  refreshToken: string;
}

let refreshInProgress: Promise<RefreshSessionResponse | null> | null = null;

async function rotateMobileRefreshToken(): Promise<RefreshSessionResponse | null> {
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = (async () => {
    const refreshToken = await getMobileRefreshToken();
    if (!refreshToken) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return null;

    const session = await response.json() as Partial<RefreshSessionResponse>;
    if (!session.token || !session.refreshToken) return null;
    await saveMobileToken(session.token, session.refreshToken);
    return session as RefreshSessionResponse;
  })();

  try {
    return await refreshInProgress;
  } finally {
    refreshInProgress = null;
  }
}

/**
 * Makes an authenticated request to the AarogyaDamu API.
 *
 * Automatically resolves 10.0.2.2 on Android emulators when localhost is configured.
 * Implements standard 15-second request timeouts (60s for long-running scribe/audio uploads).
 */
async function mobileApiFetchInternal<T = unknown>(
  path: string,
  init: MobileApiFetchOptions = {},
  allowRefresh = true,
): Promise<T> {
  const baseUrl = resolveApiBaseUrl();

  if (!path.trim() || /^https?:\/\//i.test(path)) {
    throw new Error('Pass a non-empty relative API path.');
  }

  const normalizedPath = path.trim().replace(/^\/?api(\/|$)/i, '').replace(/^\/+/, '');
  const url = `${baseUrl}/${normalizedPath}`;
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getMobileToken();

  if (token && !headers.has('Authorization')) {
            headers.set('Authorization', 'Bearer ' + token);
  }

  const isLongRunning = path.includes('/scribe/') || path.includes('/recordings') || path.includes('/upload');
  const timeoutMs = init.timeoutMs ?? (isLongRunning ? 60000 : 15000);

  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let signal = init.signal;

  if (!signal) {
    controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => {
      controller?.abort();
    }, timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal,
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError' || signal?.aborted) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please check your network connection and try again.`);
    }
    const message = fetchError?.message || '';
    if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
      throw new Error('Unable to connect to the AarogyaDamu server. Please verify network connectivity.');
    }
    throw fetchError;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (response.status === 401) {
    const refreshExcludedPaths = [
      'auth/login',
      'auth/register',
      'auth/refresh',
      'auth/forgot-password',
      'auth/reset-password',
    ];
    if (allowRefresh && !refreshExcludedPaths.includes(normalizedPath)) {
      const session = await rotateMobileRefreshToken();
      if (session) {
        return mobileApiFetchInternal<T>(path, init, false);
      }
    }
    await clearMobileToken();
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (response.status === 204) {
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}.`);
    }

    return undefined as T;
  }

  const responseText = await response.text();
  let responseData: unknown;

  if (responseText) {
    try {
      responseData = JSON.parse(responseText) as unknown;
    } catch {
      responseData = responseText;
    }
  }

  if (!response.ok) {
    let message = `API request failed with status ${response.status}.`;

    if (
      responseData !== null &&
      typeof responseData === 'object'
    ) {
      const body = responseData as Record<string, unknown>;
      const serverMessage = body.error ?? body.message;

      if (
        typeof serverMessage === 'string' &&
        serverMessage.trim()
      ) {
        message = serverMessage;
      }
    } else if (
      typeof responseData === 'string' &&
      responseData.trim()
    ) {
      message = responseData;
    }

    throw new Error(message);
  }

  return responseData as T;
}

export async function mobileApiFetch<T = unknown>(
  path: string,
  init: MobileApiFetchOptions = {},
): Promise<T> {
  return mobileApiFetchInternal<T>(path, init);
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type GlucoseContext = 'FASTING' | 'POST_MEAL_2HR' | 'RANDOM';

export type GlucoseStatus = 'OPTIMAL' | 'NORMAL' | 'ELEVATED' | 'HIGH';

export type TaskCategory = 'MEDICINE' | 'GLUCOSE' | 'ACTIVITY' | 'CONSULT';

export type ReportSource =
  | 'MANUAL_UPLOAD'
  | 'ABDM_GATEWAY'
  | 'EMR_SYNC'
  | 'LIVE_AI_AGENT';

export type ReportStatus =
  | 'EXTRACTION_REVIEW'
  | 'PENDING_PA_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type MedicalSpecialty =
  | 'DIABETOLOGY'
  | 'CARDIOLOGY'
  | 'NEPHROLOGY'
  | 'GENERAL';

export type SyncStatus =
  | 'ONLINE'
  | 'OFFLINE_CACHE'
  | 'SYNC_ERROR'
  | 'SYNCING';

export interface ExtractedField {
  id: string;
  testName: string;
  loincCode?: string;
  value: string;
  unit: string;
  referenceRange: string;
  testDate: string;
  confidence: number;
  isUncertain: boolean;
  uncertainReason?: string;
  originalSnippet: string;
  edited?: boolean;
}

export interface MedicalReport {
  id: string;
  title: string;
  fileType: 'PDF' | 'IMAGE' | 'AUDIO_SCRIBE';
  fileName: string;
  fileSize: string;
  patientName: string;
  reportDate: string;
  uploadDate: string;
  facility: string;
  specialty: MedicalSpecialty;
  source: ReportSource;
  status: ReportStatus;
  extractedFields: ExtractedField[];
  paReviewer?: string;
  paReviewDate?: string;
  paNotes?: string;
  rejectionReason?: string;
  conciseSummary?: string;
}

export interface GlucoseRecord {
  id: string;
  value: number;
  type: GlucoseContext;
  date: string;
  time: string;
  timestamp: number;
  status: GlucoseStatus;
  source: 'MANUAL' | 'BLUETOOTH' | 'LAB' | 'ABDM';
  notes?: string;
  patientBaseline: number;
  synced: boolean;
  reportId?: string;
}

export interface HbA1cPoint {
  id: string;
  date: string;
  monthLabel: string;
  value: number;
  patientBaseline: number;
  labName: string;
  verified: boolean;
  reportId?: string;
}

export interface StructuredBiomarker {
  id: string;
  testName: string;
  value: number;
  unit: string;
  patientBaseline: number;
  referenceRange: string;
  date: string;
  specialty: MedicalSpecialty;
  source: ReportSource;
  verifiedByPA: boolean;
  paReviewer?: string;
  reportId?: string;
}

export interface CareTask {
  id: string;
  title: string;
  time: string;
  category: TaskCategory;
  recurrence: string;
  completed: boolean;
  dueStatus: 'due_now' | 'upcoming' | 'completed';
  synced: boolean;
  completedAt?: string;
}

export interface Appointment {
  id: string;
  patientName?: string;
  doctorName: string;
  specialty: string;
  date: string;
  time: string;
  mode: string;
  hospital: string;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  prepChecklist: { id: string; text: string; done: boolean }[];
  postVisitNote?: {
    visitDate: string;
    advice: string;
    medChanges: string;
    lifestyleGoals: string;
    nextFollowUpWeeks: number;
    doctorSigned: boolean;
  };
}

export interface CaregiverDependent {
  id: string;
  name: string;
  relation: string;
  ageLabel: string;
  category: 'ELDERLY_CARE' | 'NEWBORN_INFANT';
  active: boolean;
  lastReading: string;
  status: 'STABLE' | 'ATTENTION_NEEDED';
  nextTask: string;
}

export interface DoctorPatient {
  id: string;
  name: string;
  age: number;
  lastVisit: string;
  hba1c: string;
  status: 'STABLE' | 'NEEDS_REVIEW';
}

export interface Caregiver {
  id: string;
  name: string;
  relation: string;
  ageLabel: string;
  category: 'ELDERLY_CARE' | 'NEWBORN_INFANT' | 'ADULT_SUPPORT';
  active: boolean;
  specialInstructions: string;
  permissions: string[];
}

export interface ConsentItem {
  id: string;
  purpose: string;
  dataRecipient: string;
  dpdpClause: string;
  status: 'GRANTED' | 'WITHDRAWN';
  updatedAt: string;
  expiresAt: string;
  scope: string;
}

export interface PatientProfile {
  name: string;
  age: number;
  gender: string;
  bloodGroup: string;
  abhaId: string;
  abhaLinked: boolean;
  condition: string;
  emergencyContact: string;
  lastUpdated: string;
  role: 'PATIENT' | 'CAREGIVER' | 'DOCTOR';
}

export interface TaskProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface PreventiveCheckup {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  date?: string;
  dueDate?: string;
  status?: string;
  completed?: boolean;
  [key: string]: any;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const makeId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const todayLabel = (): string =>
  new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const DEFAULT_PATIENT: PatientProfile = {
  name: 'User',
  age: 0,
  gender: 'Not provided',
  bloodGroup: 'Not provided',
  abhaId: '',
  abhaLinked: false,
  condition: 'Not provided',
  emergencyContact: 'Not provided',
  lastUpdated: 'Not synced',
  role: 'PATIENT',
};

const isMedicalSpecialty = (value: unknown): value is MedicalSpecialty =>
  value === 'DIABETOLOGY' ||
  value === 'CARDIOLOGY' ||
  value === 'NEPHROLOGY' ||
  value === 'GENERAL';

const isReportSource = (value: unknown): value is ReportSource =>
  value === 'MANUAL_UPLOAD' ||
  value === 'ABDM_GATEWAY' ||
  value === 'EMR_SYNC' ||
  value === 'LIVE_AI_AGENT';

const isReportStatus = (value: unknown): value is ReportStatus =>
  value === 'EXTRACTION_REVIEW' ||
  value === 'PENDING_PA_REVIEW' ||
  value === 'APPROVED' ||
  value === 'REJECTED';

const isReportFileType = (
  value: unknown,
): value is MedicalReport['fileType'] =>
  value === 'PDF' || value === 'IMAGE' || value === 'AUDIO_SCRIBE';

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/* -------------------------------------------------------------------------- */
/* Local prototype clinical store                                             */
/* -------------------------------------------------------------------------- */

/**
 * Local prototype state only. It is not the source of truth for appointments,
 * permissions, clinician assignments or shared patient data.
 *
 * Cross-account coordination must use the authenticated backend API.
 */
class ClinicalStore {
  isDemoMode = true;

  syncState: {
    status: SyncStatus;
    lastSyncedAt: string;
    pendingSyncCount: number;
    errorMessage: string | null;
  } = {
    status: 'OFFLINE_CACHE',
    lastSyncedAt: 'Not synced',
    pendingSyncCount: 0,
    errorMessage: 'Backend sync has not been configured.',
  };

  patient: PatientProfile = { ...DEFAULT_PATIENT };

  private realObservations: GlucoseRecord[] = [];
  private realTasks: CareTask[] = [];

  reports: MedicalReport[] = [];
  biomarkers: StructuredBiomarker[] = [];
  hba1cHistory: HbA1cPoint[] = [];
  appointments: Appointment[] = [];
  checkups: PreventiveCheckup[] = [];
  caregiverDependents: CaregiverDependent[] = [];
  doctorPatients: DoctorPatient[] = [];
  caregivers: Caregiver[] = [];
  consents: ConsentItem[] = [];

  private listeners = new Set<() => void>();

  get observations(): GlucoseRecord[] {
    return this.realObservations;
  }

  get tasks(): CareTask[] {
    return this.realTasks;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    this.patient.lastUpdated = new Date().toISOString();
    this.listeners.forEach((listener) => listener());
  }

  setRole(role: PatientProfile['role']): void {
    // UI preference only. This does not grant server permissions.
    this.patient = { ...this.patient, role };
    this.notify();
  }

  setDemoMode(enabled: boolean): void {
    this.isDemoMode = enabled;
    this.notify();
  }

  async syncWithBackend(): Promise<boolean> {
    this.syncState.status = 'SYNC_ERROR';
    this.syncState.errorMessage =
      'Backend synchronization has not been implemented. No records were uploaded.';
    this.notify();
    return false;
  }

  /* ------------------------------ Glucose --------------------------------- */

  addObservation(
    record: Omit<GlucoseRecord, 'id' | 'timestamp' | 'synced'>,
  ): GlucoseRecord {
    const newRecord: GlucoseRecord = {
      ...record,
      id: makeId('glucose'),
      timestamp: Date.now(),
      synced: false,
    };

    this.realObservations = [newRecord, ...this.realObservations];
    this.syncState.pendingSyncCount += 1;
    this.syncState.status = 'OFFLINE_CACHE';
    this.syncState.errorMessage =
      'Record is stored in local memory only.';

    this.notify();
    return newRecord;
  }

  deleteObservation(id: string): void {
    const previousLength = this.realObservations.length;

    this.realObservations = this.realObservations.filter(
      (record) => record.id !== id,
    );

    if (this.realObservations.length !== previousLength) {
      this.notify();
    }
  }

  /* -------------------------------- Tasks --------------------------------- */

  addTask(
    title: string,
    category: TaskCategory,
    time: string,
    recurrence: string,
  ): CareTask {
    const safeTitle = title.trim();

    if (!safeTitle) {
      throw new Error('Task title cannot be empty.');
    }

    const task: CareTask = {
      id: makeId('task'),
      title: safeTitle,
      category,
      time: time.trim() || 'Today',
      recurrence: recurrence.trim() || 'Once',
      completed: false,
      dueStatus: 'due_now',
      synced: false,
    };

    this.realTasks = [task, ...this.realTasks];
    this.syncState.pendingSyncCount += 1;
    this.notify();

    return task;
  }

  toggleTask(id: string): void {
    let changed = false;

    this.realTasks = this.realTasks.map((task) => {
      if (task.id !== id) return task;

      changed = true;
      const completed = !task.completed;

      return {
        ...task,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        dueStatus: completed ? 'completed' : 'due_now',
        synced: false,
      };
    });

    if (changed) {
      this.syncState.pendingSyncCount += 1;
      this.notify();
    }
  }

  deleteTask(id: string): void {
    const previousLength = this.realTasks.length;

    this.realTasks = this.realTasks.filter((task) => task.id !== id);

    if (this.realTasks.length !== previousLength) {
      this.syncState.pendingSyncCount += 1;
      this.notify();
    }
  }

  /* ---------------------------- Appointments ----------------------------- */

  toggleChecklist(appId: string, checkId: string): void {
    const appointment = this.appointments.find((item) => item.id === appId);

    if (!appointment || !Array.isArray(appointment.prepChecklist)) return;

    appointment.prepChecklist = appointment.prepChecklist.map((item) =>
      item.id === checkId ? { ...item, done: !item.done } : item,
    );

    this.notify();
  }

  savePostVisitNote(
    appointmentId: string,
    note: Partial<NonNullable<Appointment['postVisitNote']>> | string = {},
    medChanges = '',
    lifestyleGoals = '',
    nextFollowUpWeeks = 0,
  ): boolean {
    const appointment = this.appointments.find(
      (item) => item.id === appointmentId,
    );

    if (!appointment) return false;

    const noteData =
      typeof note === 'string'
        ? {
            advice: note,
            medChanges,
            lifestyleGoals,
            nextFollowUpWeeks,
          }
        : note;

    appointment.postVisitNote = {
      visitDate: noteData.visitDate ?? new Date().toISOString(),
      advice: noteData.advice ?? '',
      medChanges: noteData.medChanges ?? '',
      lifestyleGoals: noteData.lifestyleGoals ?? '',
      nextFollowUpWeeks: noteData.nextFollowUpWeeks ?? 0,
      doctorSigned: false,
    };

    this.syncState.pendingSyncCount += 1;
    this.notify();

    return true;
  }

  /* ------------------------------ Reports --------------------------------- */

  createUploadedReport(input: any = {}): MedicalReport {
    const currentDate = todayLabel();

    const report: MedicalReport = {
      id: asText(input.id, makeId('report')),
      title: asText(
        input.title,
        asText(input.fileName, 'Uploaded medical report'),
      ),
      fileType: isReportFileType(input.fileType) ? input.fileType : 'PDF',
      fileName: asText(input.fileName, 'uploaded-report'),
      fileSize: asText(input.fileSize, 'Unknown'),
      patientName: asText(input.patientName, this.patient.name || 'Patient'),
      reportDate: asText(input.reportDate, currentDate),
      uploadDate: currentDate,
      facility: asText(input.facility, 'Not specified'),
      specialty: isMedicalSpecialty(input.specialty)
        ? input.specialty
        : 'GENERAL',
      source: isReportSource(input.source)
        ? input.source
        : 'MANUAL_UPLOAD',
      status: isReportStatus(input.status)
        ? input.status
        : 'EXTRACTION_REVIEW',
      extractedFields: Array.isArray(input.extractedFields)
        ? input.extractedFields
        : [],
      conciseSummary:
        typeof input.conciseSummary === 'string'
          ? input.conciseSummary
          : undefined,
    };

    this.reports = [report, ...this.reports];
    this.syncState.pendingSyncCount += 1;
    this.notify();

    return report;
  }

  submitReportToPAQueue(
    reportId: string,
    extractedFields?: ExtractedField[],
  ): boolean {
    const report = this.reports.find((item) => item.id === reportId);

    if (!report || report.status === 'APPROVED') return false;

    if (extractedFields !== undefined) {
      report.extractedFields = extractedFields;
    }

    report.status = 'PENDING_PA_REVIEW';
    report.rejectionReason = undefined;
    report.paNotes = undefined;

    this.syncState.pendingSyncCount += 1;
    this.notify();

    return true;
  }

  approveReportByPA(
    reportId: string,
    reviewer = 'PA Reviewer',
    notes = '',
  ): boolean {
    const report = this.reports.find((item) => item.id === reportId);

    if (!report || !reviewer.trim()) return false;

    report.status = 'APPROVED';
    report.paReviewer = reviewer.trim();
    report.paReviewDate = new Date().toISOString();
    report.paNotes = notes.trim() || undefined;
    report.rejectionReason = undefined;

    this.syncState.pendingSyncCount += 1;
    this.notify();

    return true;
  }

  rejectReportByPA(
    reportId: string,
    reason = 'Rejected during review',
    reviewer = 'PA Reviewer',
  ): boolean {
    const report = this.reports.find((item) => item.id === reportId);

    if (!report) return false;

    const safeReason = reason.trim();

    if (!safeReason) {
      throw new Error('A rejection reason is required.');
    }

    report.status = 'REJECTED';
    report.paReviewer = reviewer.trim() || 'PA Reviewer';
    report.paReviewDate = new Date().toISOString();
    report.rejectionReason = safeReason;
    report.paNotes = safeReason;

    this.syncState.pendingSyncCount += 1;
    this.notify();

    return true;
  }

  saveAmbientScribe(
    appointmentId: string,
    transcriptSummary: string,
    meds: string,
    goals: string,
  ): MedicalReport {
    const appointment = this.appointments.find(
      (item) => item.id === appointmentId,
    );

    const formattedDate = todayLabel();

    const report: MedicalReport = {
      id: makeId('scribe'),
      title: 'AI-Generated Consultation Note — Draft',
      fileType: 'AUDIO_SCRIBE',
      fileName: 'consultation-note-draft',
      fileSize: 'Not generated',
      patientName: appointment?.patientName || 'Patient',
      reportDate: formattedDate,
      uploadDate: formattedDate,
      facility: appointment?.hospital || 'Not specified',
      specialty: 'DIABETOLOGY',
      source: 'LIVE_AI_AGENT',
      status: 'PENDING_PA_REVIEW',
      extractedFields: [],
      conciseSummary: transcriptSummary.trim(),
    };

    this.reports = [report, ...this.reports];

    if (appointment) {
      appointment.postVisitNote = {
        visitDate: new Date().toISOString(),
        advice: transcriptSummary.trim(),
        medChanges: meds.trim(),
        lifestyleGoals: goals.trim(),
        nextFollowUpWeeks: 0,
        doctorSigned: false,
      };
    }

    this.syncState.pendingSyncCount += 1;
    this.notify();

    return report;
  }

  /* ------------------------------- Consent -------------------------------- */

  toggleConsent(id: string): boolean {
    const consent = this.consents.find((item) => item.id === id);
    if (!consent) return false;

    consent.status =
      consent.status === 'GRANTED' ? 'WITHDRAWN' : 'GRANTED';
    consent.updatedAt = new Date().toISOString();

    this.notify();
    return true;
  }

  /* ----------------------------- Caregivers ------------------------------- */

  switchActiveCaregiver(id: string): boolean {
    const caregiverExists = this.caregivers.some((item) => item.id === id);
    const dependentExists = this.caregiverDependents.some(
      (item) => item.id === id,
    );

    if (!caregiverExists && !dependentExists) return false;

    if (caregiverExists) {
      this.caregivers = this.caregivers.map((item) => ({
        ...item,
        active: item.id === id,
      }));
    }

    if (dependentExists) {
      this.caregiverDependents = this.caregiverDependents.map((item) => ({
        ...item,
        active: item.id === id,
      }));
    }

    this.notify();
    return true;
  }

  /* ----------------------------- Calculations ----------------------------- */

  calculateStreak(): number {
    const completedDates = new Set<string>();

    for (const task of this.realTasks) {
      if (!task.completed || !task.completedAt) continue;

      const date = new Date(task.completedAt);

      if (!Number.isNaN(date.getTime())) {
        completedDates.add(dateKey(date));
      }
    }

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!completedDates.has(dateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;

    while (completedDates.has(dateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  calculateTaskProgress(): TaskProgress {
    const tasks = Array.isArray(this.realTasks) ? this.realTasks : [];
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;

    return {
      completed,
      total,
      percentage:
        total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export const clinicalStore = new ClinicalStore();

export function subscribeToClinicalStore(
  listener: () => void,
): () => void {
  return clinicalStore.subscribe(listener);
}
