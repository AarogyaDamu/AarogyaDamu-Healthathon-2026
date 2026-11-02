import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiFetch,
  clearAuthToken,
  getStoredToken,
  setActiveTargetPatientId,
  setAuthSession,
  refreshAccessToken,
} from '../api/client';
import { clearApiCache } from '../api/swrClient';
import type { AuthUser, UserProfile } from '../api/types';

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  token: string | null;
  loading: boolean;
  authenticating: boolean;
  accessDenied: boolean;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, invitationToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
  profile: UserProfile | null;
}

interface MeResponse {
  user: AuthUser;
  profile: UserProfile | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function clearSessionData() {
  clearAuthToken();
  setActiveTargetPatientId(null);
  clearApiCache();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const rejectNonDoctor = useCallback(async () => {
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } catch {
      console.error('Unable to revoke the rejected non-Doctor session on the server.');
    }
    clearSessionData();
    setToken(null);
    setUser(null);
    setProfile(null);
    setAccessDenied(true);
  }, []);

  const refreshSession = useCallback(async () => {
    let storedToken = getStoredToken();
    if (!storedToken) {
      try {
        storedToken = await refreshAccessToken();
      } catch (err) {
        console.warn('Silent refresh network check failed:', err);
        setLoading(false);
        return;
      }
    }
    if (!storedToken) {
      setToken(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch<MeResponse>('/auth/me');
      if (response.user?.isClinician !== true) {
        await rejectNonDoctor();
        return;
      }

      setToken(getStoredToken());
      setUser(response.user);
      setProfile(response.profile ?? null);
      setAccessDenied(false);
    } catch (error) {
      console.error('Unable to verify doctor session:', error);
      clearSessionData();
      setToken(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [rejectNonDoctor]);

  useEffect(() => {
    void refreshSession();

    const handleUnauthorized = () => {
      clearSessionData();
      setToken(null);
      setUser(null);
      setProfile(null);
    };

    const handleSessionExpired = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const notice = customEvent.detail?.message || 'Your session has expired. Please sign in again.';
      clearSessionData();
      setToken(null);
      setUser(null);
      setProfile(null);
      setSessionNotice(notice);
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    };

    window.addEventListener('aarogyadamu:unauthorized', handleUnauthorized);
    window.addEventListener('aarogyadamu:session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('aarogyadamu:unauthorized', handleUnauthorized);
      window.removeEventListener('aarogyadamu:session_expired', handleSessionExpired);
    };
  }, [refreshSession]);

  const acceptDoctorSession = useCallback(async (response: AuthResponse) => {
    if (!response.token || response.user?.isClinician !== true) {
      if (response.token && response.refreshToken) {
        setAuthSession(response.token, response.refreshToken);
        await rejectNonDoctor();
      }
      clearSessionData();
      setToken(null);
      setUser(null);
      setProfile(null);
      throw new Error('Doctor accounts only. This account is not authorized for the Doctor Workstation.');
    }

    setActiveTargetPatientId(null);
    clearApiCache();
    setAuthSession(response.token, response.refreshToken);

    try {
      const verified = await apiFetch<MeResponse>('/auth/me');
      if (verified.user?.isClinician !== true) {
        await rejectNonDoctor();
        throw new Error('Doctor accounts only. This account is not authorized for the Doctor Workstation.');
      }
      setToken(response.token);
      setUser(verified.user);
      setProfile(verified.profile ?? null);
      setAccessDenied(false);
    } catch (error) {
      clearSessionData();
      setToken(null);
      setUser(null);
      setProfile(null);
      throw error;
    }
  }, [rejectNonDoctor]);

  const login = useCallback(async (email: string, password: string) => {
    setAuthenticating(true);
    setAccessDenied(false);
    setSessionNotice(null);
    try {
      const response = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await acceptDoctorSession(response);
    } finally {
      setAuthenticating(false);
    }
  }, [acceptDoctorSession]);

  const register = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    invitationToken: string,
  ) => {
    setAuthenticating(true);
    setAccessDenied(false);
    setSessionNotice(null);
    try {
      const response = await apiFetch<AuthResponse>('/auth/doctor/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, invitationToken }),
      });
      await acceptDoctorSession(response);
    } finally {
      setAuthenticating(false);
    }
  }, [acceptDoctorSession]);

  const logout = useCallback(async () => {
    let logoutError: unknown = null;
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } catch (error) {
      logoutError = error;
      console.error('Server-side logout failed; the session may remain active until it expires.');
    }

    clearSessionData();
    setToken(null);
    setUser(null);
    setProfile(null);
    setAccessDenied(false);
    if (logoutError) {
      setSessionNotice('You are signed out on this device, but the server could not confirm session revocation.');
    } else {
      setSessionNotice(null);
    }
    window.history.replaceState(null, '', '/login');
    if (logoutError) {
      throw new Error('You are signed out on this device, but the server could not confirm session revocation.');
    }
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    token,
    loading,
    authenticating,
    accessDenied,
    sessionNotice,
    clearSessionNotice,
    login,
    register,
    logout,
  }), [user, profile, token, loading, authenticating, accessDenied, sessionNotice, clearSessionNotice, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
