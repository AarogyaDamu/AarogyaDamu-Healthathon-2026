import type {
  AgentProposalsResponse,
  AgentProposalReviewPayload,
  AgentProposalReviewResponse,
  AgentPlanResponse,
  AgentActionResponse,
  DoctorAppointmentItem,
  AppointmentStatus,
  DoctorAvailabilitySlot,
  DoctorScheduleSetting,
  DoctorTimeOffItem,
  JourneyProgressSummary,
  HealthInsight,
  JourneyMilestoneItem,
} from './types';

const viteEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const configuredApiBase = viteEnv.VITE_API_URL?.trim();
if (viteEnv.PROD && (viteEnv.VITE_APP_ENV === 'staging' || viteEnv.VITE_APP_ENV === 'production')) {
  if (!configuredApiBase) {
    throw new Error('Production web builds require VITE_API_URL to be configured.');
  }
  let parsedApiBase: URL;
  try {
    parsedApiBase = new URL(configuredApiBase);
  } catch {
    throw new Error('Production web builds require VITE_API_URL to be a valid HTTPS URL.');
  }
  if (
    parsedApiBase.protocol !== 'https:' ||
    parsedApiBase.username.length > 0 ||
    parsedApiBase.password.length > 0 ||
    ['localhost', '127.0.0.1'].includes(parsedApiBase.hostname.toLowerCase())
  ) {
    throw new Error('Staging and production web builds require a credential-free, reachable HTTPS API URL.');
  }
}
export function resolveApiBaseUrl(rawUrl?: string): string {
  const configured = (rawUrl || viteEnv.VITE_API_URL || 'http://localhost:4000/api')
    .trim()
    .replace(/\/+$/, '');
  return configured.endsWith('/api') ? configured : `${configured}/api`;
}

export const API_BASE = resolveApiBaseUrl(configuredApiBase);
const TOKEN_KEY = 'aarogyadamu_token';
const REFRESH_TOKEN_KEY = 'aarogyadamu_refresh_token';
const TARGET_PATIENT_KEY = 'aarogyadamu_target_patient_id';
const SESSION_ACTIVE_KEY = 'aarogyadamu_session_active';
const CSRF_STORAGE_KEY = 'aarogyadamu_csrf_token';

// Short-lived access token held strictly in memory to resist XSS exfiltration
let inMemoryAccessToken: string | null = null;
let refreshInProgress: Promise<string | null> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function getCsrfToken(): string | null {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)aarogyadamu_csrf_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  try {
    return sessionStorage.getItem(CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasExistingSession(): boolean {
  if (inMemoryAccessToken) return true;
  if (getAuthToken()) return true;
  if (getStoredRefreshToken()) return true;
  if (getCsrfToken()) return true;
  try {
    return localStorage.getItem(SESSION_ACTIVE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getAuthToken(): string | null {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export const getStoredToken = getAuthToken;

export function setAuthToken(token: string | null): void {
  inMemoryAccessToken = token;
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(SESSION_ACTIVE_KEY);
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_ACTIVE_KEY, 'true');
    }
  } catch (err) {
    console.error('Failed to update auth token storage', err);
  }
}
export const setStoredToken = setAuthToken;

export function clearAuthToken(): void {
  inMemoryAccessToken = null;
  if (typeof document !== 'undefined') {
    try {
      document.cookie = 'aarogyadamu_csrf_token=; Max-Age=0; path=/; SameSite=Lax';
    } catch {}
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SESSION_ACTIVE_KEY);
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear authentication token storage', err);
  }
}
export const removeStoredToken = clearAuthToken;

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Stores the short-lived access token in memory while ensuring the refresh token
 * is managed via HttpOnly cookies and purged from localStorage.
 */
export function setAuthSession(token: string, _refreshToken?: string, csrfToken?: string): void {
  void _refreshToken;
  inMemoryAccessToken = token;
  try {
    // Purge legacy refresh token from localStorage (migration security enforcement)
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(SESSION_ACTIVE_KEY, 'true');
    if (csrfToken) {
      sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
    }
  } catch (err) {
    console.error('Failed to update authentication session storage', err);
  }
}

export function getActiveTargetPatientId(): string | null {
  try {
    return localStorage.getItem(TARGET_PATIENT_KEY);
  } catch {
    return null;
  }
}

export function setActiveTargetPatientId(patientId: string | null): void {
  try {
    if (patientId) {
      localStorage.setItem(TARGET_PATIENT_KEY, patientId);
    } else {
      localStorage.removeItem(TARGET_PATIENT_KEY);
    }
  } catch (err) {
    console.error('Failed to update target patient storage', err);
  }
}

export interface WebApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  responseType?: 'json' | 'blob';
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!hasExistingSession()) {
    return null;
  }
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const csrfToken = getCsrfToken();
    const legacyRefreshToken = getStoredRefreshToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Aarogyadamu-Environment': viteEnv.VITE_APP_ENV || 'development',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: legacyRefreshToken ? JSON.stringify({ refreshToken: legacyRefreshToken }) : JSON.stringify({}),
        signal: controller.signal,
      });
    } catch (error) {
      // Network failure, offline, or timeout - distinguish from confirmed expired session
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 || response.status === 403) {
      // Confirmed session expired or revoked on server
      const hadSession = hasExistingSession();
      clearAuthToken();
      if (hadSession) {
        window.dispatchEvent(
          new CustomEvent('aarogyadamu:session_expired', {
            detail: { message: 'Your session has expired. Please sign in again.' },
          })
        );
      }
      return null;
    }

    if (response.status === 400) {
      // No refresh token available (initial visit / Incognito / clean state)
      clearAuthToken();
      return null;
    }

    if (!response.ok) {
      // Temporary server error (500, 502, 503, etc.) - do not wipe session
      throw new ApiError(response.status, `Server returned ${response.status} during session refresh.`);
    }

    const csrfHeader = response.headers?.get?.('x-csrf-token') || null;
    const session = await response.json() as { token?: string; refreshToken?: string; csrfToken?: string };
    if (!session.token) {
      clearAuthToken();
      return null;
    }
    const newCsrf = csrfHeader || session.csrfToken;
    setAuthSession(session.token, session.refreshToken, newCsrf);
    return session.token;
  })();

  try {
    return await refreshInProgress;
  } finally {
    refreshInProgress = null;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: WebApiFetchOptions = {}
): Promise<T> {
  // If a silent refresh is already in-flight, await its completion before dispatching
  if (refreshInProgress) {
    try {
      await refreshInProgress;
    } catch {
      // Fall through to let request execute or handle 401
    }
  }

  const token = getAuthToken();
  const targetPatientId = getActiveTargetPatientId();
  const csrfToken = getCsrfToken();

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'X-Aarogyadamu-Environment': viteEnv.VITE_APP_ENV || 'development',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (targetPatientId && !headers['X-Target-Patient-Id']) {
    headers['X-Target-Patient-Id'] = targetPatientId;
  }
  if (csrfToken && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const normalizedEndpoint = cleanEndpoint.replace(/^\/api(\/|$)/i, '$1');
  const targetPath = normalizedEndpoint.startsWith('/') ? normalizedEndpoint : `/${normalizedEndpoint}`;

  // Standard 15-second request timeout; 60 seconds for long uploads/audio
  const isLongRunning = targetPath.includes('/recordings') || isFormData;
  const timeoutMs = options.timeoutMs ?? (isLongRunning ? 60000 : 15000);

  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let signal = options.signal;

  if (!signal) {
    controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => {
      controller?.abort();
    }, timeoutMs);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${targetPath}`, {
      ...options,
      credentials: 'include',
      headers,
      signal,
    });
  } catch (error: unknown) {
    if ((error as any)?.name === 'AbortError' || signal?.aborted) {
      throw new ApiError(408, `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please check your connection and try again.`);
    }
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown network failure';
    window.dispatchEvent(
      new CustomEvent('aarogyadamu:offline', {
        detail: { message: errorMsg },
      })
    );
    throw new ApiError(0, 'Unable to connect to the AarogyaDamu server.');
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (response.status === 401) {
    const isAuthEndpoint = [
      '/auth/login',
      '/auth/doctor/register',
      '/auth/refresh',
      '/auth/forgot-password',
      '/auth/reset-password',
    ].includes(targetPath);

    const canRefresh = !isAuthEndpoint && hasExistingSession();

    if (canRefresh) {
      let refreshedToken: string | null = null;
      try {
        if (token && inMemoryAccessToken && token !== inMemoryAccessToken) {
          // Token was already refreshed by another concurrent request while this request was in flight
          refreshedToken = inMemoryAccessToken;
        } else {
          refreshedToken = await refreshAccessToken();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown network failure';
        window.dispatchEvent(new CustomEvent('aarogyadamu:offline', { detail: { message } }));
        throw new ApiError(0, 'Unable to refresh the AarogyaDamu session.');
      }

      if (refreshedToken) {
        try {
          response = await fetch(`${API_BASE}${targetPath}`, {
            ...options,
            credentials: 'include',
            headers: { ...headers, Authorization: `Bearer ${refreshedToken}` },
            signal,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown network failure';
          window.dispatchEvent(new CustomEvent('aarogyadamu:offline', { detail: { message } }));
          throw new ApiError(0, 'Unable to connect to the AarogyaDamu server.');
        }
      }
    }
  }

  if (response.status === 401) {
    const isAuthEndpoint = [
      '/auth/login',
      '/auth/doctor/register',
      '/auth/refresh',
      '/auth/forgot-password',
      '/auth/reset-password',
    ].includes(targetPath);

    let errorData: any = null;
    try {
      errorData = await response.json();
    } catch {
      // Body not JSON
    }

    if (isAuthEndpoint) {
      const authErrorMessage =
        (typeof errorData?.error === 'string'
          ? errorData.error
          : typeof errorData?.error?.message === 'string'
            ? errorData.error.message
            : typeof errorData?.message === 'string'
              ? errorData.message
              : 'Invalid email or password.');
      throw new ApiError(401, authErrorMessage, errorData);
    }

    const hadSession = hasExistingSession();
    clearAuthToken();
    if (hadSession) {
      window.dispatchEvent(
        new CustomEvent('aarogyadamu:session_expired', {
          detail: { message: 'Your session has expired. Please sign in again.' },
        })
      );
    }
    throw new ApiError(401, 'Your session has expired. Please sign in again.', errorData);
  }

  if (response.status === 403) {
    let errorData: any = null;
    try {
      errorData = await response.json();
    } catch {
      // Body not JSON
    }
    const message =
      (typeof errorData?.error === 'string'
        ? errorData.error
        : typeof errorData?.error?.message === 'string'
          ? errorData.error.message
          : typeof errorData?.message === 'string'
            ? errorData.message
            : 'Access denied for this patient view.');
    window.dispatchEvent(
      new CustomEvent('aarogyadamu:permission_denied', {
        detail: { message },
      })
    );
    throw new ApiError(403, message, errorData);
  }

  if (!response.ok) {
    let errorData: any = null;
    try {
      errorData = await response.json();
    } catch {
      // Body not JSON
    }

    const politeStatusDefaults: Record<number, string> = {
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have authorization to access or perform this clinical action.',
      404: 'The requested clinical record was not found.',
      429: 'The clinic system is currently busy. Please wait a moment and try again.',
      500: 'A temporary service issue occurred. Please try again shortly.',
    };

    let rawMessage =
      (typeof errorData?.error === 'string'
        ? errorData.error
        : typeof errorData?.error?.message === 'string'
          ? errorData.error.message
          : typeof errorData?.message === 'string'
            ? errorData.message
            : typeof errorData === 'string'
              ? errorData
              : politeStatusDefaults[response.status] || `Unable to complete request (${response.status})`);

    // Soften hard error language
    if (rawMessage.toLowerCase().includes('too many requests') || rawMessage.includes('429')) {
      rawMessage = 'The clinic system is currently busy. Please pause a moment before retrying.';
    } else if (rawMessage.toLowerCase().includes('access denied') || rawMessage.toLowerCase().includes('authorization')) {
      rawMessage = 'Notice: Active authorization is required to perform actions for this patient.';
    } else if (rawMessage.toLowerCase().includes('forbidden') || rawMessage.includes('403')) {
      rawMessage = 'You do not have permission to access this clinical record.';
    }

    throw new ApiError(response.status, rawMessage, errorData);
  }

  if (options.responseType === 'blob') {
    return response.blob() as Promise<T>;
  }
  return response.json();
}

/** Fetches a protected binary such as a private medical report preview. */
export async function apiFetchBlob(endpoint: string, options: WebApiFetchOptions = {}): Promise<Blob> {
  return apiFetch<Blob>(endpoint, { ...options, responseType: 'blob' });
}

/**
 * P0.7.6 Governed Agentic Proposals & Action Client APIs
 */

export async function getAgentProposals(params?: {
  patientId?: string;
  status?: string;
  limit?: number;
}): Promise<AgentProposalsResponse> {
  const query = new URLSearchParams();
  if (params?.patientId) query.set('patientId', params.patientId);
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();
  return apiFetch<AgentProposalsResponse>(`/agent/proposals${queryString ? `?${queryString}` : ''}`);
}

export async function reviewAgentProposal(
  actionId: string,
  payload: AgentProposalReviewPayload,
  patientId?: string
): Promise<AgentProposalReviewResponse> {
  const headers: Record<string, string> = {};
  if (patientId) {
    headers['X-Target-Patient-Id'] = patientId;
  }
  return apiFetch<AgentProposalReviewResponse>(`/agent/proposals/${actionId}/clinician-review`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function getAgentPlan(planId: string): Promise<AgentPlanResponse> {
  return apiFetch<AgentPlanResponse>(`/agent/plans/${planId}`);
}

export async function getAgentAction(actionId: string): Promise<AgentActionResponse> {
  return apiFetch<AgentActionResponse>(`/agent/actions/${actionId}`);
}

/**
 * Phase 4: Doctor Appointment Management & Availability APIs
 */
export async function getDoctorAppointments(params?: {
  status?: string;
  patientId?: string;
  visitType?: string;
  filter?: string;
  date?: string;
}): Promise<{ appointments: DoctorAppointmentItem[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.patientId) query.set('patientId', params.patientId);
  if (params?.visitType) query.set('visitType', params.visitType);
  if (params?.filter) query.set('filter', params.filter);
  if (params?.date) query.set('date', params.date);
  const qs = query.toString();
  return apiFetch<{ appointments: DoctorAppointmentItem[] }>(
    `/coordination/appointments${qs ? `?${qs}` : ''}`
  );
}

export async function updateAppointmentStatus(
  appointmentId: string,
  payload: {
    status: AppointmentStatus;
    rejectionReason?: string;
    cancellationReason?: string;
    newScheduledAt?: string;
    newDurationMinutes?: number;
  }
): Promise<{ appointment: DoctorAppointmentItem }> {
  return apiFetch<{ appointment: DoctorAppointmentItem }>(
    `/coordination/appointments/${encodeURIComponent(appointmentId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function getDoctorAvailability(
  doctorId: string,
  date: string
): Promise<{
  date: string;
  doctorId: string;
  doctorName: string;
  clinicName: string;
  slotDurationMinutes?: number;
  isWorkingDay: boolean;
  message?: string;
  slots: DoctorAvailabilitySlot[];
}> {
  return apiFetch(
    `/coordination/doctors/${encodeURIComponent(doctorId)}/availability?date=${encodeURIComponent(date)}`
  );
}

export async function getDoctorScheduleSettings(): Promise<{
  availabilities: DoctorScheduleSetting[];
  timeOffs: DoctorTimeOffItem[];
}> {
  return apiFetch('/coordination/doctor/availability');
}

export async function updateDoctorScheduleSettings(
  schedules: DoctorScheduleSetting[]
): Promise<{ success: boolean; message: string }> {
  return apiFetch('/coordination/doctor/availability', {
    method: 'PUT',
    body: JSON.stringify({ schedules }),
  });
}

export async function createDoctorTimeOff(payload: {
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<{ timeOff: DoctorTimeOffItem }> {
  return apiFetch('/coordination/doctor/time-off', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteDoctorTimeOff(
  id: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/coordination/doctor/time-off/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getQuestionnaireDefinition(): Promise<{
  protocol: string;
  version: string;
  alignment: string;
  disclaimer: string;
  totalQuestions: number;
  questions: any[];
}> {
  return apiFetch('/coordination/questionnaire');
}

// ==========================================
// Phase 7: Health Journey & Progress Insights
// ==========================================

export async function getPatientJourneySummary(
  patientId: string
): Promise<JourneyProgressSummary> {
  return apiFetch(`/journey/summary?patientId=${encodeURIComponent(patientId)}`);
}

export async function getPatientJourneyInsights(
  patientId: string
): Promise<{ patientId: string; totalInsights: number; insights: HealthInsight[] }> {
  return apiFetch(`/journey/insights?patientId=${encodeURIComponent(patientId)}`);
}

export async function getPatientJourneyMilestones(
  patientId: string
): Promise<{ patientId: string; totalMilestones: number; milestones: JourneyMilestoneItem[] }> {
  return apiFetch(`/journey/milestones?patientId=${encodeURIComponent(patientId)}`);
}

// ==========================================
// Commercial Practice & Doctor Platform API
// ==========================================

export async function getCurrentPractice(): Promise<{
  hasPractice: boolean;
  membershipId?: string;
  role?: string;
  practice?: any;
  activeStaffCount?: number;
}> {
  return apiFetch('/practice/current');
}

export async function onboardPractice(payload: any): Promise<any> {
  return apiFetch('/practice/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePracticeProfile(payload: any): Promise<any> {
  return apiFetch('/practice/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getPracticeStaff(): Promise<{ success: boolean; staff: any[] }> {
  return apiFetch('/practice/staff');
}

export async function addPracticeStaff(email: string, role: string = 'RECEPTIONIST'): Promise<any> {
  return apiFetch('/practice/staff', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function getConsultationTemplates(): Promise<{ success: boolean; templates: any[] }> {
  return apiFetch('/consultations/workspace/templates');
}

export async function getPatientConsultations(patientId: string): Promise<{ success: boolean; notes: any[] }> {
  return apiFetch(`/consultations/patient/${patientId}`);
}

export async function finalizeConsultationWorkspace(payload: any): Promise<any> {
  return apiFetch('/consultations/workspace/finalize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCopilotPatientSummary(patientId: string, timeframeDays: number = 90): Promise<any> {
  return apiFetch('/consultations/copilot/summarize-history', {
    method: 'POST',
    body: JSON.stringify({ patientId, timeframeDays }),
  });
}

export async function getCopilotSoapDraft(patientId: string, chiefComplaint: string, appointmentId?: string): Promise<any> {
  return apiFetch('/consultations/copilot/draft-note', {
    method: 'POST',
    body: JSON.stringify({ patientId, chiefComplaint, appointmentId }),
  });
}

export async function getCopilotTrendComparison(patientId: string, metric: string = 'BLOOD_GLUCOSE', periodDays: number = 30): Promise<any> {
  return apiFetch('/consultations/copilot/compare-trends', {
    method: 'POST',
    body: JSON.stringify({ patientId, metric, periodDays }),
  });
}

export async function getCopilotMissingDocumentation(overdueDays: number = 90): Promise<any> {
  return apiFetch(`/consultations/copilot/missing-documentation?overdueDays=${overdueDays}`);
}

export async function recordEncounterBilling(payload: any): Promise<any> {
  return apiFetch('/billing/encounters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getDailyCollectionsSummary(date?: string): Promise<{ success: boolean; summary: any }> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch(`/billing/daily-collections${query}`);
}

export async function listEncounterBillings(params?: { patientId?: string; paymentStatus?: string }): Promise<{ success: boolean; billings: any[] }> {
  const q = new URLSearchParams();
  if (params?.patientId) q.append('patientId', params.patientId);
  if (params?.paymentStatus) q.append('paymentStatus', params.paymentStatus);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiFetch(`/billing/encounters${qs}`);
}

export async function updateEncounterBillingStatus(
  billingId: string,
  payload: {
    paymentStatus: 'PAID' | 'CANCELLED' | 'REFUNDED';
    paymentMethod?: string;
    transactionReference?: string;
    notes?: string;
  },
): Promise<{ success: boolean; billing: any }> {
  return apiFetch(`/billing/encounters/${billingId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ==========================================
// CGM & WEARABLES CLIENT APIS
// ==========================================

export async function getCgmAnalytics(patientId: string, days: number = 14, isPregnant: boolean = false): Promise<any> {
  return apiFetch(`/cgm/analytics/${patientId}?days=${days}&isPregnant=${isPregnant}`);
}

export async function getCgmDevices(patientId: string): Promise<{ success: boolean; devices: any[] }> {
  return apiFetch(`/cgm/devices/${patientId}`);
}

export async function disconnectCgmDevice(deviceId: string): Promise<any> {
  return apiFetch(`/cgm/devices/${deviceId}/disconnect`, {
    method: 'POST',
  });
}

export async function connectCgmDevice(payload: {
  patientId: string;
  provider: string;
  deviceModel?: string;
  serialNumber?: string;
  dataSharingConsent: boolean;
}): Promise<any> {
  return apiFetch('/cgm/devices/connect', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadCgmCsv(patientId: string, csvContent: string, providerName?: string): Promise<any> {
  return apiFetch('/cgm/readings/upload-csv', {
    method: 'POST',
    body: JSON.stringify({ patientId, csvContent, providerName }),
  });
}

export async function getCgmAgpReport(patientId: string, days: number = 14): Promise<any> {
  return apiFetch(`/cgm/agp-report/${patientId}?days=${days}`);
}

// ==========================================
// CLINICAL REVIEW CHECKLIST CLIENT APIS
// ==========================================

export async function getActiveClinicalReview(patientId: string): Promise<{ success: boolean; encounter: any }> {
  return apiFetch(`/clinical-review/active/${patientId}`);
}

export async function updateChecklistItem(
  encounterId: string,
  payload: {
    itemKey: string;
    status: 'PENDING' | 'REVIEWED' | 'NEEDS_ATTENTION';
    clinicalNotes?: string;
    needsAttentionReason?: string;
  },
): Promise<{ success: boolean; encounter: any }> {
  return apiFetch(`/clinical-review/${encounterId}/item`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function submitReviewToDoctor(encounterId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/clinical-review/${encounterId}/submit-to-doctor`, {
    method: 'POST',
  });
}

export async function finalizeDoctorReview(
  encounterId: string,
  payload?: {
    overallImpression?: string;
    nextReviewDueDays?: number;
    managementChangesSummary?: string;
  },
): Promise<{ success: boolean; encounter: any }> {
  return apiFetch(`/clinical-review/${encounterId}/finalize-doctor-approval`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

// ==========================================
// CARE TEAM & MULTIDISCIPLINARY COLLABORATION
// ==========================================

export async function getCareTeamMembers(patientId: string): Promise<{ success: boolean; members: any[] }> {
  return apiFetch(`/coordination/care-team/${patientId}`);
}

export async function addCareTeamMember(
  patientId: string,
  payload: {
    role: string;
    fullName: string;
    email?: string;
    phone?: string;
    organization?: string;
    notes?: string;
  },
): Promise<{ success: boolean; member: any }> {
  return apiFetch(`/coordination/care-team/${patientId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ==========================================
// SARVAM AI OCR ENGINE
// ==========================================

export async function processOcrDocument(documentId: string): Promise<any> {
  return apiFetch('/ocr/process-document', {
    method: 'POST',
    body: JSON.stringify({ documentId }),
  });
}

export async function getOcrJob(jobId: string): Promise<{ success: boolean; job: any }> {
  return apiFetch(`/ocr/jobs/${jobId}`);
}

export async function reviewOcrJob(
  jobId: string,
  payload: {
    status: 'CONFIRMED' | 'REJECTED';
    correctedValues?: Record<string, any>;
    clinicianNotes?: string;
  },
): Promise<{ success: boolean; job: any }> {
  return apiFetch(`/ocr/jobs/${jobId}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

