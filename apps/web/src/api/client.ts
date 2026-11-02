const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:4000/api';
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
  const isLongRunning = cleanEndpoint.includes('/scribe/') || cleanEndpoint.includes('/recordings') || isFormData;
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
    const message = errorData?.error || errorData?.message || 'Access denied for this patient view.';
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
      errorData?.error || errorData?.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, errorData);
  }

  return response.json();
}
