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
if (viteEnv.PROD) {
  if (viteEnv.VITE_APP_ENV !== 'staging' && viteEnv.VITE_APP_ENV !== 'production') {
    throw new Error('Production web builds require VITE_APP_ENV=staging or production.');
  }
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
const API_BASE = configuredApiBase || 'http://localhost:4000/api';
const TOKEN_KEY = 'aarogyadamu_token';
const REFRESH_TOKEN_KEY = 'aarogyadamu_refresh_token';
const TARGET_PATIENT_KEY = 'aarogyadamu_target_patient_id';

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
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)aarogyadamu_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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
    }
  } catch (err) {
    console.error('Failed to update auth token storage', err);
  }
}
export const setStoredToken = setAuthToken;

export function clearAuthToken(): void {
  inMemoryAccessToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
export function setAuthSession(token: string, _refreshToken?: string): void {
  void _refreshToken;
  inMemoryAccessToken = token;
  try {
    // Purge legacy refresh token from localStorage (migration security enforcement)
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
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
      clearAuthToken();
      window.dispatchEvent(
        new CustomEvent('aarogyadamu:session_expired', {
          detail: { message: 'Your session has expired. Please sign in again.' },
        })
      );
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

    const session = await response.json() as { token?: string; refreshToken?: string };
    if (!session.token) return null;
    setAuthSession(session.token, session.refreshToken);
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
  if (targetPatientId) {
    headers['X-Target-Patient-Id'] = targetPatientId;
  }
  if (csrfToken && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Standard 15-second request timeout; 60 seconds for long uploads/audio
  const isLongRunning = cleanEndpoint.includes('/recordings') || isFormData;
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
    response = await fetch(`${API_BASE}${cleanEndpoint}`, {
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
    const canRefresh = ![
      '/auth/login',
      '/auth/doctor/register',
      '/auth/refresh',
      '/auth/forgot-password',
      '/auth/reset-password',
    ].includes(cleanEndpoint);

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
          response = await fetch(`${API_BASE}${cleanEndpoint}`, {
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
    clearAuthToken();
    window.dispatchEvent(
      new CustomEvent('aarogyadamu:session_expired', {
        detail: { message: 'Your session has expired. Please sign in again.' },
      })
    );
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
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
    const message =
      (typeof errorData?.error === 'string'
        ? errorData.error
        : typeof errorData?.error?.message === 'string'
          ? errorData.error.message
          : typeof errorData?.message === 'string'
            ? errorData.message
            : typeof errorData === 'string'
              ? errorData
              : `Request failed with status ${response.status}`);
    throw new ApiError(response.status, message, errorData);
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
  payload: AgentProposalReviewPayload
): Promise<AgentProposalReviewResponse> {
  return apiFetch<AgentProposalReviewResponse>(`/agent/proposals/${actionId}/clinician-review`, {
    method: 'POST',
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
