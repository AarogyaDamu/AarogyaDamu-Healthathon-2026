import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import path from 'path';
import { z } from 'zod';
import multer from 'multer';
import { env } from './config/env';
import { AuthenticatedRequest, requireAuth } from './middleware/auth';
import { AuthorizationError, resolvePatientContext } from './permissions/evaluator';
import { logAuditEvent } from './audit/auditLogger';
import { deletePrivateFile, savePrivateFile } from './services/storageService';
import { extractMedicalReportText, MedicalReportOcrError } from './services/ocrService';
import { createAuthSession, hashToken, revokeAllAuthSessions, revokeAuthSession, rotateRefreshToken } from './services/authSessions';
import { EmailDeliveryError, sendPasswordResetEmail } from './services/emailService';
import { createRateLimitStore } from './services/rateLimitStore';
import coordinationRouter from './routes/coordination.routes';
import consentRouter from './routes/caregivers.routes';
import carePlanRouter from './routes/careplan.routes';
import journeyRouter from './routes/journey.routes';
import medicationsRouter from './routes/medications.routes';
import tasksRouter from './routes/tasks.routes';
import { lifestyleRouter } from './routes/lifestyle.routes';
import { healthTwinRouter } from './routes/healthTwin.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { remindersRouter } from './routes/reminders.routes';
import { emergencyRouter } from './routes/emergency.routes';
import syntheticAbhaRouter from './routes/syntheticAbha.routes';
import damuRouter from './routes/damu.routes';
import agentRouter from './routes/agent.routes';
import { fhirRouter } from './routes/fhir.routes';
import { globalAgentExpiryWorker } from './ai/agent/agentExpiryWorker';
import { evaluateClinicalSafety } from './safety/clinicalSafetyEvaluator';
import { logClinicalAccessEvent, logClinicalMutationEvent, safeClinicalLog } from './audit/clinicalAuditLogger';
import { getAllFeatureFlags, setFeatureFlag } from './features/featureFlags';
import { submitAgentProposal, reviewAgentProposal } from './ai/safety/approvalManager';
import { ensureStagingDemoDoctor } from './services/stagingDemoSeed';
import { prisma } from './db/prisma';

export { prisma } from './db/prisma';
export const app = express();

// Configure reverse-proxy trust for Render deployment:
// Trust exactly one upstream proxy hop so express-rate-limit and req.ip
// reliably resolve the client's actual IP address from X-Forwarded-For
// without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
// Must be set immediately after Express application creation and before any rate-limiting middleware.
// Strictly avoids `app.set('trust proxy', true)` to prevent IP spoofing and rate-limit bypass.
app.set('trust proxy', 1);

export function getAuthErrorStatus(err: any): number {
  if (
    err?.status === 403 ||
    err?.name === 'AuthorizationError' ||
    err?.message?.includes('Forbidden') ||
    err?.message?.includes('Access denied')
  ) {
    return 403;
  }
  if (err?.status === 401 || err?.message?.includes('Authentication required')) {
    return 401;
  }
  return 500;
}

// Built-in Security Headers Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS Configuration with Credentials and Origin Hardening
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
const isDev = env.NODE_ENV !== 'production';

export function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.includes(origin) || (allowedOrigins.includes('*') && isDev)) {
    return true;
  }

  // In development and test environments, automatically permit loopback and private LAN origins
  if (isDev) {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      // Loopback addresses (localhost, 127.0.0.1, [::1], ::1)
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
        return true;
      }
      // Private LAN addresses (RFC 1918) and mDNS .local domains for mobile Expo dev on WiFi
      if (
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
        host.endsWith('.local')
      ) {
        return true;
      }
    } catch {
      // Invalid URL format
    }
  }

  return false;
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Target-Patient-Id',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-CSRF-Token',
    'X-Doctor-Invitation-Admin-Key',
    'X-Aarogyadamu-Environment',
  ],
  exposedHeaders: ['X-CSRF-Token'],
});
app.use(corsMiddleware);
app.options('*', corsMiddleware);

// Rate Limiting (Multi-instance aware)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:global:', 15 * 60 * 1000),
});
app.use(limiter);

// Body Parser with payload ceiling for base64 documents and audio recordings
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const clientEnvironment = req.get('X-Aarogyadamu-Environment');
  if (clientEnvironment && clientEnvironment !== env.APP_ENV) {
    res.status(409).json({
      error: 'Application environment does not match the API environment.',
      code: 'ENVIRONMENT_MISMATCH',
    });
    return;
  }
  next();
});
app.use('/api/coordination', coordinationRouter);
app.use('/api/care-plans', carePlanRouter);
app.use('/api/journey', journeyRouter);

// Health Check
const sendLiveness = (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
};
app.get('/health', sendLiveness);
app.get('/health/live', sendLiveness);
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ready',
      checks: { database: 'available' },
      timestamp: new Date().toISOString(),
    });
  } catch {
    safeClinicalLog('error', 'API readiness check failed: database unavailable');
    res.status(503).json({
      status: 'not_ready',
      checks: { database: 'unavailable' },
      timestamp: new Date().toISOString(),
    });
  }
});

// ==========================================
// 1. AUTHENTICATION ROUTER
// ==========================================
const authRouter = express.Router();

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

import { safeStringEqual, createDoctorInvitation, verifyDoctorInvitation } from './services/doctorInvitations';
export { safeStringEqual, createDoctorInvitation, verifyDoctorInvitation };

async function recordSecurityEvent(action: string, req: Request, subject?: string): Promise<void> {
  await prisma.securityAuditEvent.create({
    data: {
      action,
      subject,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
}

export const REFRESH_COOKIE_NAME = 'aarogyadamu_refresh_token';
export const CSRF_COOKIE_NAME = 'aarogyadamu_csrf_token';

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

export function setAuthCookies(res: Response, refreshToken: string, req: Request): string {
  const isSecure = req.secure || env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  const sameSitePolicy = isSecure ? 'none' : 'lax';
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: sameSitePolicy,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });

  const csrfToken = randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: sameSitePolicy,
    path: '/',
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });
  res.setHeader('X-CSRF-Token', csrfToken);
  return csrfToken;
}

export function clearAuthCookies(res: Response, req?: Request): void {
  const isSecure = req
    ? (req.secure || env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https')
    : (env.NODE_ENV === 'production');
  const sameSitePolicy = isSecure ? 'none' : 'lax';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/api/auth',
    httpOnly: true,
    secure: isSecure,
    sameSite: sameSitePolicy,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    path: '/',
    httpOnly: false,
    secure: isSecure,
    sameSite: sameSitePolicy,
  });
}

const invitationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:invitation:', 60 * 60 * 1000),
  handler: (req, res) => {
    void recordSecurityEvent('DOCTOR_INVITATION_RATE_LIMITED', req).catch(() => {
      console.error('Failed to audit a rate-limited doctor invitation request.');
    });
    res.status(429).json({ error: 'Too many invitation requests. Try again later.' });
  },
});

const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:pwd-reset:', 60 * 60 * 1000),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many password reset requests. Try again later.' });
  },
});

const passwordResetCompletionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:pwd-complete:', 60 * 60 * 1000),
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:login:', 15 * 60 * 1000),
});

authRouter.post('/doctor-invitations', invitationRateLimiter, asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const suppliedKey = req.header('x-doctor-invitation-admin-key') ?? '';
  if (!safeStringEqual(suppliedKey, env.DOCTOR_INVITATION_ADMIN_KEY)) {
    await recordSecurityEvent('DOCTOR_INVITATION_ISSUE_DENIED', req);
    res.status(403).json({ error: 'Doctor invitation provisioning access denied.' });
    return;
  }

  const parsed = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()) }).safeParse(req.body);
  if (!parsed.success) {
    await recordSecurityEvent('DOCTOR_INVITATION_ISSUE_INVALID', req);
    res.status(400).json({ error: 'A valid doctor email is required.' });
    return;
  }

  const id = randomBytes(16).toString('hex');
  const invitation = createDoctorInvitation(parsed.data.email, id);
  const tokenHash = hashToken(invitation.token);
  await prisma.doctorInvitation.create({
    data: {
      id,
      email: parsed.data.email,
      tokenHash,
      expiresAt: new Date(invitation.expiresAt),
    },
  });
  await recordSecurityEvent('DOCTOR_INVITATION_ISSUED', req, parsed.data.email);
  res.status(201).json({
    invitationToken: invitation.token,
    expiresAt: new Date(invitation.expiresAt).toISOString(),
  });
}));

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      email: z.string().email().transform((value) => value.trim().toLowerCase()),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      fullName: z.string().min(2),
    });
    const { email, password, fullName } = schema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        isClinician: false,
        profile: {
          create: {
            fullName,
            diabetesType: 'UNKNOWN',
          },
        },
      },
      include: { profile: true },
    });

    const session = await createAuthSession(prisma, user);

    await logAuditEvent({
      userId: user.id,
      actorId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
    });

    const csrfToken = setAuthCookies(res, session.refreshToken, req);
    res.status(201).json({
      ...session,
      csrfToken,
      user: { id: user.id, email: user.email, isSyntheticDemo: user.isSyntheticDemo, isClinician: user.isClinician },
      profile: user.profile,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post('/doctor/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    email: z.string().email().transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(2),
    invitationToken: z.string().min(1),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'A valid doctor invitation and complete account details are required.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const invitation = verifyDoctorInvitation(parsed.data.invitationToken, email);
  if (!invitation) {
    await recordSecurityEvent('DOCTOR_INVITATION_REDEMPTION_REJECTED', req, email);
    res.status(403).json({ error: 'This doctor invitation is invalid, expired, or for a different email address.' });
    return;
  }

  try {
    const storedInvitation = await prisma.doctorInvitation.findFirst({
      where: {
        id: invitation.id,
        email,
        tokenHash: invitation.tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!storedInvitation) {
      await recordSecurityEvent('DOCTOR_INVITATION_REDEMPTION_REJECTED', req, email);
      res.status(403).json({ error: 'This doctor invitation is invalid, expired, or has already been used.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.$transaction(async (transaction) => {
      const redemption = await transaction.doctorInvitation.updateMany({
        where: {
          id: invitation.id,
          email,
          tokenHash: invitation.tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (redemption.count !== 1) {
        return null;
      }

      return transaction.user.create({
        data: {
          email,
          passwordHash,
          isClinician: true,
          profile: {
            create: {
              fullName: parsed.data.fullName.trim(),
              diabetesType: 'NOT_APPLICABLE',
              primaryClinician: 'Specialist Clinician',
            },
          },
        },
        include: { profile: true },
      });
    });

    if (!user) {
      await recordSecurityEvent('DOCTOR_INVITATION_REDEMPTION_REJECTED', req, email);
      res.status(403).json({ error: 'This doctor invitation is invalid, expired, or has already been used.' });
      return;
    }

    const session = await createAuthSession(prisma, user);
    await recordSecurityEvent('DOCTOR_INVITATION_REDEEMED', req, email);

    await logAuditEvent({
      userId: user.id,
      actorId: user.id,
      action: 'DOCTOR_ACCOUNT_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const csrfToken = setAuthCookies(res, session.refreshToken, req);
    res.status(201).json({
      ...session,
      csrfToken,
      user: { id: user.id, email: user.email, isSyntheticDemo: user.isSyntheticDemo, isClinician: true },
      profile: user.profile,
    });
  } catch (error) {
    console.error('Doctor registration failed:', error);
    res.status(500).json({ error: 'Unable to create the doctor account.' });
  }
});

authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      email: z.string().email().transform((value) => value.trim().toLowerCase()),
      password: z.string().min(1),
    });
    const { email, password } = schema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.isActive === false) {
      await recordSecurityEvent('LOGIN_ATTEMPT_DEACTIVATED_USER', req, email);
      res.status(403).json({ error: 'Account has been deactivated. Please contact your healthcare administrator.' });
      return;
    }

    const session = await createAuthSession(prisma, user);

    await logAuditEvent({
      userId: user.id,
      actorId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
    });

    const csrfToken = setAuthCookies(res, session.refreshToken, req);
    res.json({
      ...session,
      csrfToken,
      user: { id: user.id, email: user.email, isSyntheticDemo: user.isSyntheticDemo, isClinician: user.isClinician },
      profile: user.profile,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post('/demo-session', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!env.ALLOW_DEMO_AUTH || env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Demo authentication is disabled in this environment.' });
      return;
    }

    const requestedRole = (req.body?.role || 'PATIENT').toUpperCase();

    // Security remediation: Clinician/Doctor accounts cannot be issued via unauthenticated demo-session
    if (requestedRole === 'DOCTOR') {
      await recordSecurityEvent('DOCTOR_DEMO_SESSION_DENIED', req);
      res.status(403).json({ error: 'Clinician access is restricted to verified invitation workflows.' });
      return;
    }

    let demoUser: any = null;
    if (requestedRole === 'CAREGIVER') {
      demoUser = await prisma.user.findFirst({
        where: { isSyntheticDemo: true, email: { contains: 'family' } },
        include: { profile: true },
      });
    }

    if (!demoUser) {
      demoUser = await prisma.user.findFirst({
        where: { isSyntheticDemo: true, isClinician: false },
        include: { profile: true },
      });
    }

    if (!demoUser) {
      const passwordHash = await bcrypt.hash('DemoPassword123!', 10);
      demoUser = await prisma.user.create({
        data: {
          email: 'demo.patient1@aarogyadamu.local',
          passwordHash,
          isSyntheticDemo: true,
          isClinician: false,
          profile: {
            create: {
              fullName: 'Ramesh Deshmukh',
              diabetesType: 'TYPE_2_DIABETES',
              diagnosisYear: 2021,
              primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
              targetFastingMin: 80,
              targetFastingMax: 130,
              targetPostMealMax: 180,
            },
          },
        },
        include: { profile: true },
      });
    }

    const session = await createAuthSession(prisma, demoUser);

    setAuthCookies(res, session.refreshToken, req);
    res.json({
      ...session,
      user: { id: demoUser.id, email: demoUser.email, isSyntheticDemo: true, isClinician: demoUser.isClinician },
      profile: demoUser.profile,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user) {
    res.status(404).json({ error: 'User profile not found' });
    return;
  }

  res.json({
    user: { id: user.id, email: user.email, isSyntheticDemo: user.isSyntheticDemo, isClinician: user.isClinician },
    profile: user.profile,
  });
});

authRouter.post('/refresh', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  let rawRefreshToken = req.body?.refreshToken;
  const cookies = parseCookies(req.headers.cookie);

  if (!rawRefreshToken && cookies[REFRESH_COOKIE_NAME]) {
    // Cookie-based refresh (Web client)
    const expectedCsrf = cookies[CSRF_COOKIE_NAME];
    const clientCsrf = req.header('x-csrf-token');

    if (!expectedCsrf || !clientCsrf || !safeStringEqual(clientCsrf, expectedCsrf)) {
      await recordSecurityEvent('CSRF_VALIDATION_FAILED', req);
      res.status(403).json({ error: 'CSRF validation failed for cookie-based session refresh.' });
      return;
    }

    rawRefreshToken = cookies[REFRESH_COOKIE_NAME];
  }

  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    res.status(401).json({ error: 'A valid refresh token is required.' });
    return;
  }

  const session = await rotateRefreshToken(prisma, rawRefreshToken);
  if (!session) {
    clearAuthCookies(res, req);
    res.status(401).json({ error: 'Refresh session is invalid, expired, or revoked. Please sign in again.' });
    return;
  }

  const csrfToken = setAuthCookies(res, session.refreshToken, req);
  res.json({
    ...session,
    csrfToken,
  });
}));

authRouter.post('/logout', requireAuth, asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const authUser = (req as AuthenticatedRequest).user!;
  try {
    await revokeAuthSession(prisma, authUser.sessionId, authUser.id);
  } catch (error) {
    console.error('Failed to revoke session on server during logout:', error);
    res.status(500).json({ error: 'Failed to revoke session on server.' });
    return;
  }
  clearAuthCookies(res, req);
  await logAuditEvent({
    userId: authUser.id,
    actorId: authUser.id,
    action: 'USER_LOGOUT',
    entityType: 'AuthSession',
    entityId: authUser.sessionId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true });
}));

authRouter.post('/logout-all', requireAuth, asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const authUser = (req as AuthenticatedRequest).user!;
  try {
    await revokeAllAuthSessions(prisma, authUser.id);
  } catch (error) {
    console.error('Failed to revoke all sessions on server during logout-all:', error);
    res.status(500).json({ error: 'Failed to revoke sessions on server.' });
    return;
  }
  clearAuthCookies(res, req);
  await logAuditEvent({
    userId: authUser.id,
    actorId: authUser.id,
    action: 'USER_LOGOUT_ALL',
    entityType: 'User',
    entityId: authUser.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true });
}));

authRouter.post('/deactivate', requireAuth, asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const authUser = (req as AuthenticatedRequest).user!;
  const { password, reason } = req.body || {};

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password confirmation is required to deactivate your account.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid password. Account deactivation aborted.' });
    return;
  }

  // Soft-deactivate user account and record timestamp
  await prisma.user.update({
    where: { id: authUser.id },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    },
  });

  // Revoke all active caregiver consents given by patient
  await prisma.caregiverConsent.updateMany({
    where: { patientId: authUser.id, status: 'ACTIVE' },
    data: { status: 'REVOKED' },
  });

  // Revoke all authenticated sessions and refresh tokens
  try {
    await revokeAllAuthSessions(prisma, authUser.id);
  } catch (error) {
    console.error('Failed to revoke sessions during deactivation:', error);
  }

  clearAuthCookies(res, req);

  await logAuditEvent({
    userId: authUser.id,
    actorId: authUser.id,
    action: 'USER_ACCOUNT_DEACTIVATED',
    entityType: 'User',
    entityId: authUser.id,
    metadata: { reason: reason || 'User requested account deactivation' },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    success: true,
    message: 'Your account has been deactivated. In accordance with healthcare data regulations and clinical continuity requirements, existing medical consultation notes and prescription records are archived for clinical audit purposes. Your login credentials and active sharing delegations have been revoked.',
  });
}));

authRouter.post('/forgot-password', passwordResetRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    if (env.EMAIL_PROVIDER === 'disabled' && (env.APP_ENV === 'staging' || process.env.NODE_ENV === 'production')) {
      res.status(503).json({
        error: 'Password reset email delivery is currently disabled or unavailable in this environment. Please contact your clinical administrator.',
      });
      return;
    }

    const { email } = z.object({
      email: z.string().email().transform((value) => value.trim().toLowerCase()),
    }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const resetToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.$transaction(async (transaction) => {
        await transaction.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await transaction.passwordResetToken.create({
          data: { userId: user.id, tokenHash: hashToken(resetToken), expiresAt },
        });
      });

      try {
        await sendPasswordResetEmail(user.email, resetToken);
        await logAuditEvent({
          userId: user.id,
          actorId: user.id,
          action: 'PASSWORD_RESET_REQUESTED',
          entityType: 'User',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } catch (error) {
        await prisma.passwordResetToken.updateMany({
          where: { tokenHash: hashToken(resetToken), usedAt: null },
          data: { usedAt: new Date() },
        });
        await recordSecurityEvent('PASSWORD_RESET_EMAIL_DELIVERY_FAILED', req, user.email);
        console.error('Password reset email delivery failed.');
        if (!(error instanceof EmailDeliveryError)) {
          throw error;
        }
        res.status(503).json({
          error: 'Password reset email delivery failed. Please try again later or contact your clinical administrator.',
        });
        return;
      }
    }

    res.json({ message: 'If the provided email is registered, password reset instructions will be sent.' });
  } catch (error) {
    console.error('Password reset request failed.');
    res.status(500).json({ error: 'Unable to process the password reset request.' });
  }
});

authRouter.post('/reset-password', passwordResetCompletionRateLimiter, asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A valid reset token and password are required.' });
    return;
  }

  const tokenHash = hashToken(parsed.data.token);
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  const now = new Date();
  if (!reset || reset.usedAt || reset.expiresAt <= now) {
    res.status(400).json({ error: 'The password reset token is invalid or expired.' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updated = await prisma.$transaction(async (transaction) => {
    const redeemed = await transaction.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (redeemed.count !== 1) return false;

    await transaction.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    });
    await transaction.passwordResetToken.updateMany({
      where: { userId: reset.userId, usedAt: null },
      data: { usedAt: now },
    });
    await transaction.authSession.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await transaction.refreshToken.updateMany({
      where: { session: { userId: reset.userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });

  if (!updated) {
    res.status(400).json({ error: 'The password reset token is invalid or expired.' });
    return;
  }

  await logAuditEvent({
    userId: reset.userId,
    actorId: reset.userId,
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: reset.userId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({
    success: true,
    message: 'Your password has been updated securely. You may now sign in with your new password.',
  });
}));

app.use('/api/auth', authRouter);

// ==========================================
// 2. DASHBOARD ROUTER
// ==========================================
app.get('/api/dashboard', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

    const [profile, recentObservations, pendingTasks, nextConsultation] = await Promise.all([
      prisma.patientProfile.findUnique({ where: { userId: effectivePatientId } }),
      prisma.healthObservation.findMany({
        where: { userId: effectivePatientId },
        orderBy: { observedAt: 'desc' },
        take: 6,
      }),
      prisma.careTask.findMany({
        where: { userId: effectivePatientId, status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
        take: 5,
      }),
      prisma.consultationPrep.findFirst({
        where: { userId: effectivePatientId, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    res.json({
      profile,
      recentObservations,
      pendingTasks,
      nextAppointment: nextConsultation
        ? {
            id: nextConsultation.id,
            clinicianName: nextConsultation.clinicianName,
            facilityName: nextConsultation.facilityName,
            scheduledAt: nextConsultation.scheduledAt,
            purpose: nextConsultation.concernsAndQuestions.split('\n')[0] || 'Glycemic Continuity Review',
          }
        : null,
      isSyntheticDemo: Boolean((req as any).user.isSyntheticDemo),
    });
  } catch (err: any) {
    res.status(err?.status === 404 ? 404 : getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ==========================================
// 3. HEALTH OBSERVATIONS ROUTER (P0.1 UNIFIED HEALTH JOURNAL)
// ==========================================
const obsRouter = express.Router();

// A. LIST OBSERVATIONS (Paginated, filtered by type, context, and date range)
obsRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 200);
    const typeFilter = req.query.type as string | undefined;
    const contextFilter = req.query.context as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const cursor = req.query.cursor as string | undefined;

    const whereClause: any = { userId: effectivePatientId };
    if (typeFilter && typeFilter !== 'ALL') {
      whereClause.type = typeFilter.toUpperCase();
    }
    if (contextFilter && contextFilter !== 'ALL') {
      whereClause.context = contextFilter.toUpperCase();
    }
    if (startDate || endDate) {
      whereClause.observedAt = {};
      if (startDate) whereClause.observedAt.gte = new Date(startDate);
      if (endDate) whereClause.observedAt.lte = new Date(endDate);
    }

    const [totalCount, observations] = await Promise.all([
      prisma.healthObservation.count({ where: whereClause }),
      prisma.healthObservation.findMany({
        where: whereClause,
        orderBy: { observedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    ]);

    const hasMore = observations.length > limit;
    const resultObservations = hasMore ? observations.slice(0, limit) : observations;

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalAccessEvent({
      userId: effectivePatientId,
      actorId,
      action: 'VIEW_OBSERVATIONS',
      entityType: 'HealthObservation',
      metadata: { count: resultObservations.length, queryLimit: limit, type: typeFilter },
      ipAddress: req.ip,
    });

    res.json({
      observations: resultObservations,
      totalCount,
      hasMore,
      nextCursor: hasMore && resultObservations.length > 0 ? resultObservations[resultObservations.length - 1].id : null,
      pagination: {
        totalCount,
        hasMore,
        limit,
        nextCursor: hasMore && resultObservations.length > 0 ? resultObservations[resultObservations.length - 1].id : null,
      },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// B. AMBULATORY VITAL & GLYCEMIC STATISTICS
obsRouter.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const type = ((req.query.type as string) || 'BLOOD_GLUCOSE').toUpperCase();
    const days = Math.max(1, Math.min(parseInt(req.query.days as string, 10) || 14, 365));
    const cutoffDate = new Date(Date.now() - days * 86400000);

    const observations = await prisma.healthObservation.findMany({
      where: {
        userId: effectivePatientId,
        type,
        observedAt: { gte: cutoffDate },
      },
      orderBy: { observedAt: 'desc' },
    });

    const count = observations.length;
    let stats: Record<string, any> = { count, days, type };

    if (count > 0) {
      const values = observations.map((o) => o.numericValue);
      const sum = values.reduce((acc, v) => acc + v, 0);
      const mean = Math.round((sum / count) * 10) / 10;
      const min = Math.min(...values);
      const max = Math.max(...values);

      stats.mean = mean;
      stats.min = min;
      stats.max = max;

      if (type === 'BLOOD_GLUCOSE') {
        const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / count;
        const standardDeviation = Math.round(Math.sqrt(variance) * 10) / 10;
        const coefficientOfVariation = mean > 0 ? Math.round((standardDeviation / mean) * 1000) / 10 : 0;

        const veryLow = observations.filter((o) => o.numericValue < 54).length;
        const low = observations.filter((o) => o.numericValue >= 54 && o.numericValue < 70).length;
        const target = observations.filter((o) => o.numericValue >= 70 && o.numericValue <= 180).length;
        const high = observations.filter((o) => o.numericValue > 180 && o.numericValue <= 250).length;
        const veryHigh = observations.filter((o) => o.numericValue > 250).length;

        stats = {
          ...stats,
          standardDeviation,
          coefficientOfVariation,
          timeInRange: {
            veryLow: { count: veryLow, percentage: Math.round((veryLow / count) * 1000) / 10 },
            low: { count: low, percentage: Math.round((low / count) * 1000) / 10 },
            target: { count: target, percentage: Math.round((target / count) * 1000) / 10 },
            high: { count: high, percentage: Math.round((high / count) * 1000) / 10 },
            veryHigh: { count: veryHigh, percentage: Math.round((veryHigh / count) * 1000) / 10 },
          },
        };
      } else if (type === 'BLOOD_PRESSURE') {
        const diastolicValues = observations.filter((o) => o.secondaryValue != null).map((o) => o.secondaryValue as number);
        const meanDiastolic = diastolicValues.length > 0
          ? Math.round((diastolicValues.reduce((acc, v) => acc + v, 0) / diastolicValues.length) * 10) / 10
          : null;

        const normal = observations.filter((o) => o.clinicalFlag === 'NORMAL').length;
        const elevated = observations.filter((o) => o.clinicalFlag === 'ELEVATED').length;
        const stage1 = observations.filter((o) => o.clinicalFlag === 'STAGE_1_HYPERTENSION').length;
        const stage2 = observations.filter((o) => o.clinicalFlag === 'STAGE_2_HYPERTENSION').length;
        const crisis = observations.filter((o) => o.clinicalFlag === 'HYPERTENSIVE_CRISIS').length;

        stats = {
          ...stats,
          meanSystolic: mean,
          meanDiastolic,
          minSystolic: min,
          maxSystolic: max,
          distribution: { normal, elevated, stage1, stage2, crisis, hypertensiveCrisis: crisis },
        };
      } else if (type === 'WEIGHT') {
        const earliest = observations[observations.length - 1].numericValue;
        const latest = observations[0].numericValue;
        stats = {
          ...stats,
          latestWeight: latest,
          earliestWeight: earliest,
          weightDelta: Math.round((latest - earliest) * 10) / 10,
        };
      } else if (type === 'HBA1C') {
        stats = {
          ...stats,
          latestHbA1c: observations[0].numericValue,
          latestFlag: observations[0].clinicalFlag,
        };
      }
    }

    res.json({ type, days, stats });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// C. GET SINGLE OBSERVATION
obsRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const { id } = req.params;

    const observation = await prisma.healthObservation.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!observation) {
      res.status(404).json({ error: `HealthObservation with ID ${id} not found.` });
      return;
    }

    res.json({ observation });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// D. INGEST OBSERVATION (Idempotent, Multi-Vital, Deterministic Safety Evaluated)
obsRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId, isDelegated } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const {
      type,
      numericValue,
      secondaryValue,
      unit,
      context,
      notes,
      observedAt,
      provenance,
      sourceProvenance,
      deviceModel,
      idempotencyKey,
    } = req.body;

    const actorId = (req as any).user?.id || effectivePatientId;
    const isClinician = Boolean((req as any).user?.isClinician);

    // Idempotency verification
    if (idempotencyKey) {
      const existing = await prisma.healthObservation.findUnique({
        where: { idempotencyKey: String(idempotencyKey) },
      });
      if (existing) {
        res.status(200).json({
          observation: existing,
          isIdempotentReplay: true,
          replayed: true,
        });
        return;
      }
    }

    const obsType = (type || 'BLOOD_GLUCOSE').toUpperCase();
    const ALLOWED_TYPES = ['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C'];
    if (!ALLOWED_TYPES.includes(obsType)) {
      res.status(400).json({ error: 'Unsupported observation type. Must be BLOOD_GLUCOSE, BLOOD_PRESSURE, WEIGHT, or HBA1C.' });
      return;
    }

    const numVal = Number(numericValue);
    if (isNaN(numVal) || numVal <= 0) {
      res.status(400).json({ error: 'Reading must be a positive number.' });
      return;
    }

    const secVal = secondaryValue !== undefined && secondaryValue !== null ? Number(secondaryValue) : undefined;
    if (secVal !== undefined && (isNaN(secVal) || secVal <= 0)) {
      res.status(400).json({ error: 'Secondary reading must be a positive number.' });
      return;
    }

    // Default units per vital type
    let defaultUnit = 'mg/dL';
    if (obsType === 'BLOOD_PRESSURE') defaultUnit = 'mmHg';
    else if (obsType === 'WEIGHT') defaultUnit = 'kg';
    else if (obsType === 'HBA1C') defaultUnit = '%';

    // Default context per vital type
    let defaultContext = 'FASTING';
    if (obsType === 'BLOOD_PRESSURE' || obsType === 'WEIGHT' || obsType === 'HBA1C') defaultContext = 'GENERAL';

    const obsContext = (context || defaultContext).toUpperCase();

    // Provenance resolution
    let resolvedSource = sourceProvenance;
    if (!resolvedSource) {
      if (isClinician) {
        resolvedSource = 'DOCTOR_CLINICAL';
      } else if (isDelegated) {
        resolvedSource = 'CAREGIVER_INPUT';
      } else {
        resolvedSource = 'MANUAL_PATIENT';
      }
    }

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: effectivePatientId },
      select: {
        targetFastingMin: true,
        targetFastingMax: true,
        targetPostMealMax: true,
      },
    });

    // Clinical Safety Evaluation (Deterministic ADA / ACC-AHA Criteria)
    const safetyEvaluation = evaluateClinicalSafety({
      type: obsType,
      numericValue: numVal,
      secondaryValue: secVal,
      context: obsContext,
      clinicalContext: {
        hasSevereSymptoms: Boolean(req.body.hasSevereSymptoms),
        requiresAssistance: Boolean(req.body.requiresAssistance),
        isRepeatMeasurement: Boolean(req.body.isRepeatMeasurement),
        symptoms: Array.isArray(req.body.symptoms) ? req.body.symptoms : undefined,
      },
      individualizedTargets: profile
        ? {
            targetFastingMin: profile.targetFastingMin,
            targetFastingMax: profile.targetFastingMax,
            targetPostMealMax: profile.targetPostMealMax,
          }
        : undefined,
    });

    const obs = await prisma.healthObservation.create({
      data: {
        userId: effectivePatientId,
        type: obsType,
        numericValue: numVal,
        secondaryValue: secVal,
        unit: unit || defaultUnit,
        context: obsContext,
        clinicalFlag: safetyEvaluation.clinicalFlag,
        notes: notes || undefined,
        observedAt: observedAt ? new Date(observedAt) : new Date(),
        provenance: provenance || (isClinician ? 'DOCTOR_ENTERED' : isDelegated ? 'CAREGIVER_ENTERED' : 'PATIENT_ENTERED'),
        sourceProvenance: resolvedSource,
        deviceModel: deviceModel || undefined,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      },
    });

    void logClinicalMutationEvent({
      userId: effectivePatientId,
      actorId,
      action: 'OBSERVATION_CREATED',
      entityType: 'HealthObservation',
      entityId: obs.id,
      after: {
        type: obs.type,
        numericValue: obs.numericValue,
        secondaryValue: obs.secondaryValue,
        clinicalFlag: obs.clinicalFlag,
        sourceProvenance: obs.sourceProvenance,
      },
      metadata: {
        safetyEvaluation,
        deviceModel: obs.deviceModel,
        isCritical: safetyEvaluation.isCritical,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      observation: obs,
      safetyEvaluation,
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// E. AMEND / CORRECT OBSERVATION (Audited clinical correction)
obsRouter.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const { id } = req.params;
    const { numericValue, secondaryValue, notes, reasonForCorrection } = req.body;

    if (!reasonForCorrection || String(reasonForCorrection).trim().length < 2) {
      res.status(400).json({ error: 'A valid reasonForCorrection (at least 2 characters) is mandatory to amend clinical records.' });
      return;
    }

    const existing = await prisma.healthObservation.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!existing) {
      res.status(404).json({ error: `HealthObservation with ID ${id} not found for this patient.` });
      return;
    }

    let updatedNumVal = existing.numericValue;
    if (numericValue !== undefined && numericValue !== null) {
      const parsed = Number(numericValue);
      if (isNaN(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'Reading must be a positive number.' });
        return;
      }
      updatedNumVal = parsed;
    }

    let updatedSecVal = existing.secondaryValue;
    if (secondaryValue !== undefined && secondaryValue !== null) {
      const parsed = Number(secondaryValue);
      if (isNaN(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'Secondary reading must be a positive number.' });
        return;
      }
      updatedSecVal = parsed;
    }

    // Re-evaluate clinical safety
    const profile = await prisma.patientProfile.findUnique({
      where: { userId: effectivePatientId },
      select: { targetFastingMin: true, targetFastingMax: true, targetPostMealMax: true },
    });

    const safetyEvaluation = evaluateClinicalSafety({
      type: existing.type,
      numericValue: updatedNumVal,
      secondaryValue: updatedSecVal,
      context: existing.context,
      individualizedTargets: profile
        ? {
            targetFastingMin: profile.targetFastingMin,
            targetFastingMax: profile.targetFastingMax,
            targetPostMealMax: profile.targetPostMealMax,
          }
        : undefined,
    });

    const amended = await prisma.healthObservation.update({
      where: { id: existing.id },
      data: {
        numericValue: updatedNumVal,
        secondaryValue: updatedSecVal,
        clinicalFlag: safetyEvaluation.clinicalFlag,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalMutationEvent({
      userId: effectivePatientId,
      actorId,
      action: 'OBSERVATION_AMENDED',
      entityType: 'HealthObservation',
      entityId: amended.id,
      before: {
        numericValue: existing.numericValue,
        secondaryValue: existing.secondaryValue,
        clinicalFlag: existing.clinicalFlag,
        notes: existing.notes,
      },
      after: {
        numericValue: amended.numericValue,
        secondaryValue: amended.secondaryValue,
        clinicalFlag: amended.clinicalFlag,
        notes: amended.notes,
      },
      metadata: {
        reasonForCorrection: String(reasonForCorrection).trim(),
        safetyEvaluation,
      },
      ipAddress: req.ip,
    });

    res.json({
      observation: amended,
      safetyEvaluation,
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/observations', obsRouter);

// ==========================================
// FEATURE FLAGS ROUTER (P0.0)
// ==========================================
const featuresRouter = express.Router();

featuresRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const flags = await getAllFeatureFlags();
    res.json({ success: true, features: flags });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

featuresRouter.post('/:key/toggle', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.isClinician && process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Only authorized clinical operators may toggle system feature flags.' });
      return;
    }
    const { key } = req.params;
    const { isEnabled, rolloutTier, metadata } = req.body;
    const updated = await setFeatureFlag(
      key as any,
      Boolean(isEnabled),
      rolloutTier,
      metadata
    );
    res.json({ success: true, feature: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use('/api/features', featuresRouter);

// ==========================================
// AI AGENT SAFETY & PROPOSALS ROUTER (P0.0)
// ==========================================
const aiSafetyRouter = express.Router();

/**
 * Resolve the patient scope for the legacy proposal API from the authenticated
 * actor, never from an untrusted body/query value alone. The shared evaluator
 * keeps patient, caregiver-consent, and assigned-clinician boundaries aligned
 * with the newer agent API.
 */
async function resolveAiProposalPatient(req: Request, requestedPatientId?: string): Promise<string> {
  const actor = (req as AuthenticatedRequest).user;
  if (!actor) {
    throw new AuthorizationError('Authentication required');
  }

  if (!requestedPatientId || requestedPatientId === actor.id) {
    return actor.id;
  }

  const scopedRequest = Object.create(req) as Request;
  scopedRequest.headers = {
    ...req.headers,
    'x-target-patient-id': requestedPatientId,
  };

  const { effectivePatientId } = await resolvePatientContext(scopedRequest, 'VIEW_CARE_PLAN');
  return effectivePatientId;
}

aiSafetyRouter.post('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { actionType, summary, payload, targetPatientId } = req.body;
    const patientId = await resolveAiProposalPatient(req, targetPatientId);

    const result = await submitAgentProposal({
      userId: patientId,
      agentName: 'Damu',
      actionType,
      summary: summary || actionType,
      payload: payload || {},
    });

    res.status(result.status === 'REJECTED' ? 400 : 201).json(result);
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

aiSafetyRouter.get('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const targetPatientId = await resolveAiProposalPatient(req, req.query.patientId as string | undefined);
    const records = await prisma.agentAuditRecord.findMany({
      where: { userId: targetPatientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ proposals: records });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

aiSafetyRouter.post('/proposals/:id/review', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      res.status(400).json({ error: 'Review decision must be either APPROVED or REJECTED.' });
      return;
    }

    const proposal = await prisma.agentAuditRecord.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!proposal) {
      res.status(404).json({ error: 'Agent proposal not found.' });
      return;
    }

    // A clinician may review only proposals belonging to an actively assigned
    // patient. This also prevents the legacy endpoint from trusting the
    // isClinician claim as a substitute for patient-scoped authorization.
    await resolveAiProposalPatient(req, proposal.userId);

    const updated = await reviewAgentProposal({
      proposalId: id,
      reviewerId: user.id,
      isClinician: Boolean(user.isClinician),
      decision,
      notes,
    });

    res.json({ success: true, proposal: updated });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(err.message.includes('requires authorization by a licensed doctor') ? 403 : 400).json({ error: err.message });
  }
});

app.use('/api/ai', aiSafetyRouter);

// ==========================================
// 4. CARE TASKS ROUTER (Phase 2.5 Doctor-Led Tasks)
// ==========================================
app.use('/api/tasks', tasksRouter);

// ==========================================
// 5. DOCUMENTS & CLINICAL OCR / SUMMARY ROUTER
// ==========================================
const docRouter = express.Router();

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    callback(null, acceptedTypes.includes(file.mimetype));
  },
});

function hasValidReportSignature(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') {
    return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  }
  return false;
}

async function processMedicalReportOcr(
  documentId: string,
  userId: string,
  actorId: string,
  file: Express.Multer.File,
): Promise<void> {
  try {
    const result = await extractMedicalReportText(file.buffer, file.mimetype);
    const hasText = result.text.trim().length > 0;
    const extractedData = {
      provider: result.provider,
      status: hasText ? 'COMPLETED' : 'NO_TEXT',
      text: result.text,
    };

    await prisma.healthDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: hasText ? 'NEEDS_REVIEW' : 'OCR_NO_TEXT',
        extractedData: JSON.stringify(extractedData),
      notes: hasText ? null : `${result.provider} completed but found no readable text.`,
      },
    });
    try {
      await logAuditEvent({
        userId,
        actorId,
        action: 'DOCUMENT_OCR_EXTRACTED',
        entityType: 'HealthDocument',
        entityId: documentId,
        metadata: { provider: result.provider, status: extractedData.status },
      });
    } catch {
      safeClinicalLog('error', 'Medical report OCR audit event could not be recorded');
    }
  } catch (error) {
    const message = error instanceof MedicalReportOcrError
      ? error.message
      : 'Medical report OCR could not process this report. Please try again later.';
    try {
      await prisma.healthDocument.update({
        where: { id: documentId },
        data: {
          processingStatus: 'EXTRACTION_FAILED',
          notes: message,
          extractedData: JSON.stringify({
            provider: env.MEDICAL_REPORT_OCR_PROVIDER === 'synthetic' ? 'SYNTHETIC_DEMO_OCR' : 'GOOGLE_CLOUD_VISION',
            status: 'FAILED',
            error: message,
          }),
        },
      });
      await logAuditEvent({
        userId,
        actorId,
        action: 'DOCUMENT_OCR_FAILED',
        entityType: 'HealthDocument',
        entityId: documentId,
        metadata: { error: message },
      });
    } catch {
      safeClinicalLog('error', 'Medical report OCR result could not be saved');
    }
  }
}

docRouter.post('/upload-report', requireAuth, reportUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  let savedFile: { storagePath: string; fileSizeBytes: number } | undefined;
  let documentCreated = false;
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
    if (!req.file || !hasValidReportSignature(req.file)) {
      res.status(400).json({ error: 'Upload a valid PDF, JPEG, PNG, or WebP medical report.' });
      return;
    }

    if (env.MEDICAL_REPORT_OCR_PROVIDER === 'google_vision' && req.file.mimetype === 'application/pdf' && !env.GOOGLE_CLOUD_STORAGE_BUCKET) {
      res.status(503).json({
        code: 'PDF_OCR_NOT_CONFIGURED',
        error: 'PDF text extraction is not configured. Set GOOGLE_CLOUD_STORAGE_BUCKET on the API server, restart it, and upload the PDF again, or use MEDICAL_REPORT_OCR_PROVIDER=synthetic for the local showcase.',
      });
      return;
    }

    savedFile = await savePrivateFile(effectivePatientId, req.file.originalname, req.file.buffer);
    const requestedTitle = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const title = (requestedTitle || req.file.originalname.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).slice(0, 160);
    const issuingFacility = typeof req.body.issuingFacility === 'string'
      ? req.body.issuingFacility.trim().slice(0, 160)
      : '';
    const document = await prisma.healthDocument.create({
      data: {
        userId: effectivePatientId,
        title: title || 'Uploaded medical report',
        category: 'LAB_REPORT',
        issuingFacility: issuingFacility || undefined,
        storagePath: savedFile.storagePath,
        fileSizeBytes: savedFile.fileSizeBytes,
        mimeType: req.file.mimetype,
        processingStatus: 'PENDING',
      },
    });
    documentCreated = true;

    const actorId = (req as any).user.id as string;
    try {
      await logAuditEvent({
        userId: effectivePatientId,
        actorId,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'HealthDocument',
        entityId: document.id,
        metadata: { category: document.category, extractionStatus: 'PENDING' },
      });
    } catch {
      safeClinicalLog('error', 'Medical report upload audit event could not be recorded');
    }

    void processMedicalReportOcr(document.id, effectivePatientId, actorId, req.file);
    res.status(202).json({
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        processingStatus: document.processingStatus,
        issuingFacility: document.issuingFacility,
        reportDate: document.reportDate,
        fileSizeBytes: document.fileSizeBytes,
        mimeType: document.mimeType,
        createdAt: document.createdAt,
      },
      extraction: {
        provider: env.MEDICAL_REPORT_OCR_PROVIDER === 'synthetic' ? 'SYNTHETIC_DEMO_OCR' : 'GOOGLE_CLOUD_VISION',
        status: 'PENDING',
        message: env.MEDICAL_REPORT_OCR_PROVIDER === 'synthetic'
          ? 'Report securely saved. Synthetic demo OCR is preparing a clearly labelled sample result.'
          : 'Report securely saved. Google Cloud Vision is extracting text.',
      },
    });
  } catch (err: any) {
    if (savedFile && !documentCreated) await deletePrivateFile(savedFile.storagePath);
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// 1. Get all stored documents with parsed data
docRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const documents = await prisma.healthDocument.findMany({
      where: { userId: effectivePatientId },
      orderBy: { reportDate: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        issuingFacility: true,
        reportDate: true,
        notes: true,
        processingStatus: true,
        extractedData: true,
        fileSizeBytes: true,
        mimeType: true,
        createdAt: true,
      },
    });
    res.json({
      documents: documents.map((doc) => ({
        ...doc,
        extractedData: doc.extractedData ? JSON.parse(doc.extractedData) : null,
      })),
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

docRouter.get('/:id/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const document = await prisma.healthDocument.findFirst({
      where: { id: req.params.id, userId: effectivePatientId },
      select: { storagePath: true, title: true, mimeType: true },
    });
    if (!document?.storagePath) {
      res.status(404).json({ error: 'Original report not found.' });
      return;
    }
    res.type(document.mimeType ?? 'application/octet-stream');
    const extensionByMimeType: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const extension = extensionByMimeType[document.mimeType ?? ''] ?? '';
    res.download(
      document.storagePath,
      `${document.title.replace(/[^a-zA-Z0-9_-]/g, '_')}${extension}`,
    );
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// Inline preview endpoint used by the OCR review screens. It has the same
// patient-scope check as download, but deliberately keeps Content-Disposition
// inline so PDFs and images can be compared with extracted text in-app.
docRouter.get('/:id/preview', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const document = await prisma.healthDocument.findFirst({
      where: { id: req.params.id, userId: effectivePatientId },
      select: { storagePath: true, title: true, mimeType: true },
    });
    if (!document?.storagePath) {
      res.status(404).json({ error: 'Original report not found.' });
      return;
    }

    const resolvedPath = path.resolve(document.storagePath);
    const storageRoot = `${path.resolve(env.STORAGE_DIR)}${path.sep}`;
    if (!resolvedPath.startsWith(storageRoot)) {
      res.status(404).json({ error: 'Original report not found.' });
      return;
    }

    res.type(document.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    // This route is only reachable after authentication and is consumed as a
    // blob/embedded viewer by the trusted app. The global DENY header would
    // prevent the PDF viewer from rendering inside the report-review modal.
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `default-src 'none'; frame-ancestors ${env.WEB_APP_URL}`);
    res.sendFile(resolvedPath);
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

docRouter.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
    const { id } = req.params;
    await prisma.healthDocument.deleteMany({ where: { id, userId: effectivePatientId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/documents', docRouter);

// ==========================================
// 6. CONSULTATIONS ROUTER
// ==========================================
const consultRouter = express.Router();

consultRouter.post('/prepare', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_CONSULTATIONS');
    const { concernsAndQuestions, personalNotes } = req.body;

    const prep = await prisma.consultationPrep.create({
      data: {
        userId: effectivePatientId,
        concernsAndQuestions,
        personalNotes,
      },
    });

    res.status(201).json({ consultationPrep: prep });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/consultations', consultRouter);

// ==========================================
// 7. CAREGIVER CONSENTS ROUTER
// ==========================================
app.use('/api/consents', consentRouter);
app.use('/api/caregivers', consentRouter);

// ==========================================
// 8. DAMU AI ASSISTANT ROUTER
// ==========================================
const assistantRouter = express.Router();

assistantRouter.post('/query', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const { prompt } = req.body;
    const lower = (prompt || '').toLowerCase();

    // 1. Clinical Safety Guardrail: Prevent independent diagnosis, prescription or dosage alteration
    if (
      lower.includes('diagnose') ||
      lower.includes('prescribe') ||
      lower.includes('change dose') ||
      lower.includes('change my dose') ||
      lower.includes('modify dose') ||
      lower.includes('alter dose') ||
      lower.includes('increase dose') ||
      lower.includes('decrease dose') ||
      lower.includes('insulin dose') ||
      (lower.includes('dose') && (lower.includes('increase') || lower.includes('decrease') || lower.includes('change') || lower.includes('unit')))
    ) {
      res.json({
        reply:
          'Clinical Guardrail Notice: As your care companion, Damu cannot independently diagnose conditions, prescribe medications, or alter clinical treatment dosages. Any modifications to your diabetes care plan or prescriptions must be authorized directly by your treating clinician. Please consult your doctor or schedule an appointment.',
        guardrailTriggered: true,
      });
      return;
    }

    // 2. Prepare Doctor-Review Summary
    if (
      lower.includes('doctor review') ||
      lower.includes('review summary') ||
      lower.includes('consultation summary') ||
      lower.includes('prepare review') ||
      lower.includes('doctor summary')
    ) {
      const [activePlan, recentObs, recentTasks] = await Promise.all([
        prisma.carePlan.findFirst({
          where: { patientId: effectivePatientId, status: 'ACTIVE' },
          include: {
            goals: true,
            activities: true,
            doctor: { select: { profile: { select: { fullName: true } } } },
          },
          orderBy: { version: 'desc' },
        }),
        prisma.healthObservation.findMany({
          where: { userId: effectivePatientId, type: 'BLOOD_GLUCOSE' },
          orderBy: { observedAt: 'desc' },
          take: 5,
        }),
        prisma.careTask.findMany({
          where: { userId: effectivePatientId },
          orderBy: { dueAt: 'desc' },
          take: 10,
        }),
      ]);

      const doctorName = activePlan?.doctor?.profile?.fullName || 'Treating Clinician';
      const goalsList = activePlan?.goals?.length
        ? activePlan.goals.map((g) => `${g.title} (${g.targetValue} ${g.unit || ''})`).join('; ')
        : 'Maintain fasting blood sugar 80-130 mg/dL';
      const obsSummary = recentObs.length
        ? recentObs.map((o) => `${o.numericValue} ${o.unit} (${o.context.toLowerCase()})`).join(', ')
        : 'No recent readings logged';

      const completedCount = recentTasks.filter((t) => t.status === 'COMPLETED').length;
      const adherenceRate = recentTasks.length
        ? Math.round((completedCount / recentTasks.length) * 100)
        : 100;

      const reviewDateStr = activePlan?.reviewDate
        ? new Date(activePlan.reviewDate).toLocaleDateString('en-IN')
        : 'Next checkup';

      res.json({
        reply:
          `Here is your Doctor-Review Summary prepared for Dr. ${doctorName}:\n\n` +
          `• Active Plan: ${activePlan?.title || 'Shared Diabetes Care Plan'} (v${activePlan?.version || 1})\n` +
          `• Review Target Date: ${reviewDateStr}\n` +
          `• Glycemic Targets: ${goalsList}\n` +
          `• Recent Blood Glucose Logs: ${obsSummary}\n` +
          `• Task Adherence Rate: ${adherenceRate}% (${completedCount}/${recentTasks.length} tasks completed)\n` +
          `• Clinician Instructions: ${activePlan?.doctorInstructions || activePlan?.summary || 'Follow daily scheduled activities'}\n\n` +
          `This summary is compiled from your verified logs and ready for your doctor's review.`,
        summaryType: 'DOCTOR_REVIEW',
      });
      return;
    }

    // 3. Summarize Progress / Incomplete Tasks / Upcoming Activities
    if (
      lower.includes('progress') ||
      lower.includes('completion') ||
      lower.includes('incomplete') ||
      lower.includes('upcoming') ||
      lower.includes('activity') ||
      lower.includes('activities') ||
      lower.includes('pending task') ||
      lower.includes('what to do')
    ) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [activePlan, todayTasks] = await Promise.all([
        prisma.carePlan.findFirst({
          where: { patientId: effectivePatientId, status: 'ACTIVE' },
          include: { activities: true, goals: true },
          orderBy: { version: 'desc' },
        }),
        prisma.careTask.findMany({
          where: {
            userId: effectivePatientId,
            dueAt: { gte: todayStart, lte: todayEnd },
          },
          orderBy: { dueAt: 'asc' },
        }),
      ]);

      const total = todayTasks.length;
      const completed = todayTasks.filter((t) => t.status === 'COMPLETED');
      const incomplete = todayTasks.filter((t) => t.status !== 'COMPLETED');
      const percentage = total > 0 ? Math.round((completed.length / total) * 100) : 100;

      let replyMsg = `Care Plan Progress Update: You have completed ${completed.length} of ${total} scheduled tasks today (${percentage}%).`;

      if (incomplete.length > 0) {
        const incompleteList = incomplete.map((t, idx) => `${idx + 1}. ${t.title}`).join(', ');
        replyMsg += ` Incomplete tasks remaining for today: ${incompleteList}.`;
      } else if (total > 0) {
        replyMsg += ` Excellent work! All scheduled tasks for today are completed.`;
      }

      if (activePlan?.activities?.length) {
        const upcomingList = activePlan.activities
          .map((a) => `${a.title} (${a.frequency.toLowerCase()}, ${a.timing || 'scheduled'})`)
          .join('; ');
        replyMsg += ` Upcoming care plan activities: ${upcomingList}.`;
      }

      res.json({
        reply: replyMsg,
        progress: {
          total,
          completed: completed.length,
          incomplete: incomplete.length,
          percentage,
        },
      });
      return;
    }

    // 4. Explain Approved Care Plan Instructions & Goals
    if (
      lower.includes('care plan') ||
      lower.includes('careplan') ||
      lower.includes('instruction') ||
      lower.includes('goal') ||
      lower.includes('my plan')
    ) {
      const activePlan = await prisma.carePlan.findFirst({
        where: { patientId: effectivePatientId, status: 'ACTIVE' },
        include: {
          goals: true,
          activities: true,
          doctor: { select: { profile: { select: { fullName: true } } } },
        },
        orderBy: { version: 'desc' },
      });

      if (!activePlan) {
        res.json({
          reply:
            'You do not have an active approved care plan yet. Once your doctor creates and approves your shared diabetes care plan, I will explain your instructions, goals, and daily schedule here.',
        });
        return;
      }

      const doctorName = activePlan.doctor?.profile?.fullName || 'Your Doctor';
      const goalsDesc = activePlan.goals.length
        ? activePlan.goals
            .map((g) => `• ${g.title}: Target ${g.targetValue} ${g.unit || ''} (${g.timeframe || 'Daily'})`)
            .join('\n')
        : '• Keep fasting glucose within 80-130 mg/dL';

      const activitiesDesc = activePlan.activities.length
        ? activePlan.activities
            .map(
              (a) =>
                `• ${a.title} [${a.frequency.toLowerCase()} - ${a.timing || 'routine'}]: ${a.instructions || 'Follow doctor guidance'}`
            )
            .join('\n')
        : '• Follow daily glucose checks and prescribed medication';

      const instructions = activePlan.doctorInstructions || activePlan.summary || 'Follow scheduled activities.';

      res.json({
        reply:
          `Here is an explanation of your approved Diabetes Care Plan (v${activePlan.version}), managed by Dr. ${doctorName}:\n\n` +
          `Clinical Instructions:\n"${instructions}"\n\n` +
          `Health Goals:\n${goalsDesc}\n\n` +
          `Daily Care Activities:\n${activitiesDesc}\n\n` +
          `Note: Damu explains your clinician-approved plan. Damu does not independently prescribe or modify medical treatment.`,
        records: {
          type: 'CARE_PLAN',
          items: activePlan.activities.map((a) => ({
            id: a.id,
            title: a.title,
            details: a.instructions || undefined,
          })),
        },
      });
      return;
    }

    if (lower.includes('sugar') || lower.includes('glucose') || lower.includes('reading')) {
      const readings = await prisma.healthObservation.findMany({
        where: { userId: effectivePatientId },
        orderBy: { observedAt: 'desc' },
        take: 3,
      });

      if (readings.length === 0) {
        res.json({ reply: 'No blood sugar logs are currently on record.' });
        return;
      }

      res.json({
        reply: `Here are your recent blood sugar records:`,
        records: {
          type: 'OBSERVATIONS',
          items: readings.map((r) => ({
            id: r.id,
            numericValue: r.numericValue,
            unit: r.unit,
            context: r.context,
            observedAt: r.observedAt.toISOString(),
          })),
        },
      });
      return;
    }

    // 5. Journey Stage & Milestone Progress Intelligence
    if (
      lower.includes('journey') ||
      lower.includes('stage') ||
      lower.includes('milestone') ||
      lower.includes('where am i') ||
      lower.includes('current step')
    ) {
      const [profile, firstObs, consultations, activePlan, recentObs, allPlans, appointments] = await Promise.all([
        prisma.patientProfile.findUnique({ where: { userId: effectivePatientId } }),
        prisma.healthObservation.findFirst({ where: { userId: effectivePatientId }, orderBy: { observedAt: 'asc' } }),
        prisma.consultationNote.findMany({ where: { userId: effectivePatientId, status: 'APPROVED' }, take: 1 }),
        prisma.carePlan.findFirst({ where: { patientId: effectivePatientId, status: 'ACTIVE' }, orderBy: { version: 'desc' } }),
        prisma.healthObservation.findMany({ where: { userId: effectivePatientId }, orderBy: { observedAt: 'desc' }, take: 5 }),
        prisma.carePlan.findMany({ where: { patientId: effectivePatientId } }),
        prisma.appointment.findMany({ where: { patientId: effectivePatientId }, orderBy: { scheduledAt: 'asc' } }),
      ]);

      const completedMilestones: string[] = [];
      if (profile) completedMilestones.push('Patient Onboarding');
      if (firstObs) completedMilestones.push('Initial Health Assessment');
      if (consultations.length > 0) completedMilestones.push('Doctor Consultation');
      if (activePlan || allPlans.some((p) => p.status === 'SUPERSEDED')) completedMilestones.push(`Care Plan Approval (v${activePlan?.version || 1})`);
      if (recentObs.length > 0) completedMilestones.push('Daily Health Monitoring');
      if (recentObs.length >= 3) completedMilestones.push('Progress Evaluation');
      if (allPlans.length > 1 && allPlans.some((p) => p.version > 1 && p.status === 'ACTIVE')) completedMilestones.push('Care Plan Revision');

      let currentStage = 'Daily Health Monitoring & Routine Activities';
      if (!profile) currentStage = 'Patient Onboarding';
      else if (!firstObs) currentStage = 'Initial Health Assessment';
      else if (consultations.length === 0) currentStage = 'Doctor Consultation';
      else if (!activePlan) currentStage = 'Care Plan Approval';

      const upcomingAppt = appointments.find((a) => new Date(a.scheduledAt).getTime() >= Date.now());
      const reviewDateStr = activePlan?.reviewDate ? new Date(activePlan.reviewDate).toLocaleDateString('en-IN') : null;

      res.json({
        reply:
          `Your Diabetes Care Journey Overview:\n\n` +
          `• Current Stage: ${currentStage}\n` +
          `• Completed Milestones (${completedMilestones.length} of 9): ${completedMilestones.join(', ')}\n` +
          (reviewDateStr ? `• Next Clinical Review Date: ${reviewDateStr}\n` : '') +
          (upcomingAppt ? `• Next Appointment: ${new Date(upcomingAppt.scheduledAt).toLocaleDateString('en-IN')} (${upcomingAppt.status === 'CONFIRMED' ? 'Confirmed by Clinic' : 'Request Pending'})\n` : '') +
          `\nKeep logging your morning glucose and completing your routine tasks to maintain steady glycemic control.`,
        journey: {
          currentStage,
          completedMilestonesCount: completedMilestones.length,
          totalMilestones: 9,
        },
      });
      return;
    }

    // 6. Identify Missing Health Records & Screening Gaps
    if (
      lower.includes('missing') ||
      lower.includes('gap') ||
      lower.includes('overdue record') ||
      lower.includes('what records') ||
      lower.includes('missing records')
    ) {
      const now = Date.now();
      const ninetyDaysAgo = new Date(now - 90 * 86400000);
      const sevenDaysAgo = new Date(now - 7 * 86400000);

      const [recentGlucose, recentHba1c, recentBp, pendingDocs] = await Promise.all([
        prisma.healthObservation.findFirst({ where: { userId: effectivePatientId, type: 'BLOOD_GLUCOSE', observedAt: { gte: sevenDaysAgo } } }),
        prisma.healthObservation.findFirst({ where: { userId: effectivePatientId, type: 'HBA1C', observedAt: { gte: ninetyDaysAgo } } }),
        prisma.healthObservation.findFirst({ where: { userId: effectivePatientId, type: { startsWith: 'BLOOD_PRESSURE' }, observedAt: { gte: ninetyDaysAgo } } }),
        prisma.healthDocument.findMany({ where: { userId: effectivePatientId, processingStatus: 'PENDING' } }),
      ]);

      const missingGaps: string[] = [];
      if (!recentGlucose) missingGaps.push('Recent self-monitored blood glucose (none logged in the past 7 days)');
      if (!recentHba1c) missingGaps.push('Quarterly laboratory HbA1c test (no record in the past 90 days)');
      if (!recentBp) missingGaps.push('Blood pressure screening reading (recommended periodically)');
      if (pendingDocs.length > 0) missingGaps.push(`${pendingDocs.length} health report document(s) pending processing`);

      if (missingGaps.length === 0) {
        res.json({
          reply: 'Great news! Your diabetes health records are fully up to date. You have regular glucose logs, an active HbA1c reading on file, and no missing documentation.',
          missingRecords: [],
        });
        return;
      }

      res.json({
        reply:
          `Here is an audit of your health record status and upcoming screening recommendations:\n\n` +
          missingGaps.map((gap, idx) => `${idx + 1}. ${gap}`).join('\n') +
          `\n\nMaintaining complete longitudinal records helps your treating clinician optimize your care plan.`,
        missingRecords: missingGaps,
      });
      return;
    }

    if (lower.includes('reminder') || lower.includes('task')) {
      const proposal = await prisma.assistantProposal.create({
        data: {
          userId: effectivePatientId,
          type: 'SCHEDULE_TASK',
          summaryText: 'Reminder: Check fasting blood glucose tomorrow morning at 8:00 AM',
          payload: JSON.stringify({
            title: 'Check fasting blood glucose',
            category: 'FOLLOW_UP',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
          }),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      res.json({
        reply: 'I prepared a follow-up task. Please confirm to commit it to your schedule:',
        proposal: {
          id: proposal.id,
          type: proposal.type,
          summaryText: proposal.summaryText,
          payload: JSON.parse(proposal.payload),
        },
      });
      return;
    }

    res.json({
      reply:
        'Namaste! I am Damu, your personal care continuity companion. I can explain your current journey stage, summarize completed milestones, explain your approved care plan, identify missing health records, or prepare doctor-review summaries. I do not independently diagnose or alter prescribed dosages.',
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

assistantRouter.post('/proposals/:id/confirm', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
    const { id } = req.params;

    const proposal = await prisma.assistantProposal.findFirst({
      where: { id, userId: effectivePatientId, status: 'PENDING' },
    });

    if (!proposal || proposal.expiresAt <= new Date()) {
      if (proposal) {
        await prisma.assistantProposal.updateMany({
          where: { id: proposal.id, userId: effectivePatientId, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
      }
      res.status(404).json({ error: 'Proposal not found or expired' });
      return;
    }

    const payload = JSON.parse(proposal.payload);

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.assistantProposal.updateMany({
        where: { id, userId: effectivePatientId, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'COMPLETED' },
      });
      if (claimed.count !== 1) {
        throw Object.assign(new Error('Proposal not found or expired'), { status: 404 });
      }

      await tx.careTask.create({
        data: {
          userId: effectivePatientId,
          title: payload.title,
          category: payload.category || 'FOLLOW_UP',
          dueAt: new Date(payload.dueAt),
        },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(err?.status === 404 ? 404 : getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/assistant', assistantRouter);

// ==========================================
// 9. PROFILE & ONBOARDING ROUTER
// ==========================================
const profileRouter = express.Router();

const handleSaveProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Patient session missing.' });
      return;
    }

    const {
      fullName,
      dateOfBirth,
      diabetesType,
      diagnosisYear,
      primaryClinician,
      knownAllergies,
      targetFastingMin,
      targetFastingMax,
      targetPostMealMax,
    } = req.body;

    const profile = await prisma.patientProfile.upsert({
      where: { userId },
      create: {
        userId,
        fullName: fullName || 'Patient',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        diabetesType: diabetesType || 'TYPE_2_DIABETES',
        diagnosisYear: Number(diagnosisYear) || new Date().getFullYear(),
        primaryClinician: primaryClinician || 'Unassigned',
        knownAllergies: knownAllergies || 'None documented',
        targetFastingMin: Number(targetFastingMin) || 80,
        targetFastingMax: Number(targetFastingMax) || 130,
        targetPostMealMax: Number(targetPostMealMax) || 180,
      },
      update: {
        fullName: fullName || undefined,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        diabetesType: diabetesType || undefined,
        diagnosisYear: diagnosisYear ? Number(diagnosisYear) : undefined,
        primaryClinician: primaryClinician || undefined,
        knownAllergies: knownAllergies || undefined,
        targetFastingMin: targetFastingMin ? Number(targetFastingMin) : undefined,
        targetFastingMax: targetFastingMax ? Number(targetFastingMax) : undefined,
        targetPostMealMax: targetPostMealMax ? Number(targetPostMealMax) : undefined,
      },
    });

    res.status(201).json({ profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save clinical profile' });
  }
};

profileRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const profile = await prisma.patientProfile.findUnique({ where: { userId: effectivePatientId } });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

profileRouter.post('/onboarding', requireAuth, handleSaveProfile);
profileRouter.post('/', requireAuth, handleSaveProfile);
profileRouter.put('/', requireAuth, handleSaveProfile);

app.use('/api/profile', profileRouter);
app.use('/profile', profileRouter);

// ==========================================
// 10. ABDM HL7 FHIR R4 ENDPOINT
// ==========================================
app.get('/api/fhir/Observation', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const observations = await prisma.healthObservation.findMany({
      where: { userId: effectivePatientId, type: 'BLOOD_GLUCOSE' },
      orderBy: { observedAt: 'desc' },
      take: 50,
    });

    res.json({
      resourceType: 'Bundle',
      type: 'searchset',
      timestamp: new Date().toISOString(),
      total: observations.length,
      entry: observations.map((obs) => ({
        fullUrl: `https://aarogyadamu.in/api/fhir/Observation/${obs.id}`,
        resource: {
          resourceType: 'Observation',
          id: obs.id,
          status: 'final',
          code: {
            coding: [{ system: 'http://loinc.org', code: '2339-0', display: 'Glucose in Blood' }],
            text: `Blood Glucose (${obs.context})`,
          },
          subject: { reference: `Patient/${obs.userId}` },
          effectiveDateTime: obs.observedAt.toISOString(),
          valueQuantity: {
            value: obs.numericValue,
            unit: obs.unit,
            system: 'http://unitsofmeasure.org',
            code: obs.unit,
          },
        },
      })),
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ==========================================
// 11. TIMELINE & LONGITUDINAL ANALYTICS
// ==========================================
app.get('/api/timeline', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

    const [observations, tasks, consultations, documents] = await Promise.all([
      prisma.healthObservation.findMany({ where: { userId: effectivePatientId }, orderBy: { observedAt: 'desc' }, take: 20 }),
      prisma.careTask.findMany({ where: { userId: effectivePatientId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.consultationPrep.findMany({ where: { userId: effectivePatientId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.healthDocument.findMany({ where: { userId: effectivePatientId }, orderBy: { reportDate: 'desc' }, take: 10 }),
    ]);

    const events = [
      ...observations.map((o) => ({
        id: `obs-${o.id}`,
        eventType: 'OBSERVATION',
        title: `Blood Glucose: ${o.numericValue} ${o.unit}`,
        details: `Context: ${o.context.toLowerCase().replace(/_/g, ' ')}`,
        occurredAt: o.observedAt,
      })),
      ...tasks.map((t) => ({
        id: `task-${t.id}`,
        eventType: 'TASK',
        title: `Task: ${t.title}`,
        details: `Status: ${t.status.toLowerCase()}`,
        occurredAt: t.createdAt,
      })),
      ...consultations.map((c) => ({
        id: `prep-${c.id}`,
        eventType: 'CONSULTATION',
        title: `Doctor Preparation with ${c.clinicianName}`,
        details: c.concernsAndQuestions,
        occurredAt: c.scheduledAt,
      })),
      ...documents.map((d) => ({
        id: `doc-${d.id}`,
        eventType: 'DOCUMENT',
        title: `Document: ${d.title}`,
        details: `Facility: ${d.issuingFacility || 'Saved Report'}`,
        occurredAt: d.reportDate,
      })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    res.json({ events });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.get('/api/analytics/longitudinal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const obs30 = await prisma.healthObservation.findMany({
      where: { userId: effectivePatientId, observedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });

    const avg = obs30.length ? Math.round(obs30.reduce((s, c) => s + c.numericValue, 0) / obs30.length) : null;
    const fasting = obs30.filter((o) => o.context === 'FASTING');
    const postMeal = obs30.filter((o) => o.context === 'POST_MEAL_2HR');

    res.json({
      metrics: {
        adherenceStreakDays: Math.min(obs30.length, 5),
        last30Days: {
          avgOverall: avg,
          avgFasting: fasting.length ? Math.round(fasting.reduce((s, c) => s + c.numericValue, 0) / fasting.length) : null,
          avgPostMeal: postMeal.length ? Math.round(postMeal.reduce((s, c) => s + c.numericValue, 0) / postMeal.length) : null,
          count: obs30.length,
        },
        last90Days: {
          avgOverall: avg,
          estimatedA1c: avg ? parseFloat(((avg + 46.7) / 28.7).toFixed(1)) : null,
          count: obs30.length,
        },
      },
      milestones: [
        { id: 'FOOT_EXAM', title: 'Annual Diabetic Foot Exam', description: 'Screening for neuropathy and circulation.', status: 'DUE', isOverdue: false },
        { id: 'EYE_EXAM', title: 'Annual Dilated Retinal Exam', description: 'Screening for retinopathy.', status: 'DUE', isOverdue: false },
        { id: 'KIDNEY_UACR', title: 'Annual Urine Microalbumin (uACR)', description: 'Early detection of nephropathy.', status: 'DUE', isOverdue: false },
      ],
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ==========================================
// 12. EMERGENCY & NAVIGATION
// ==========================================
app.get('/api/navigation/emergency-contacts', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const consents = await prisma.caregiverConsent.findMany({ where: { patientId: effectivePatientId, status: 'ACTIVE' } });

    res.json({
      hotlines: [
        { id: '1', name: 'National Ambulance Service', phoneNumber: '108', relationship: 'Emergency Medical' },
        { id: '2', name: 'National Emergency Response', phoneNumber: '112', relationship: 'Police & Medical' },
      ],
      caregivers: consents.map((c) => ({
        name: c.caregiverName,
        relationship: c.relationship,
        email: c.caregiverEmail,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/navigation/hypo-incident', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const { glucoseValue, symptoms, actionTaken } = req.body;

    const obs = await prisma.healthObservation.create({
      data: {
        userId: effectivePatientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: Number(glucoseValue),
        unit: 'mg/dL',
        context: 'RANDOM',
        notes: `HYPO EMERGENCY: Symptoms: ${Array.isArray(symptoms) ? symptoms.join(', ') : symptoms}. Action: ${actionTaken}`,
        observedAt: new Date(),
        provenance: 'PATIENT_ENTERED',
      },
    });

    res.status(201).json({ success: true, observation: obs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/medications', medicationsRouter);
app.use('/api/lifestyle', lifestyleRouter);
app.use('/api/health-twin', healthTwinRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/emergency', emergencyRouter);
app.use('/api/abha', syntheticAbhaRouter);
app.use('/api/damu', damuRouter);
app.use('/api/agent', agentRouter);
app.use('/api/fhir/r4', fhirRouter);

app.get('/api/audit-logs', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const logs = await prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 14. GLOBAL ERROR HANDLER & SERVER LISTEN
// ==========================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message && (err.message.includes('CORS') || err.message.includes('Origin not allowed'))) {
    return res.status(403).json({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      error: 'Origin not allowed by CORS policy.',
      timestamp: new Date().toISOString(),
    });
  }

  const incidentId = randomBytes(8).toString('hex');
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error.';
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  safeClinicalLog('error', `[Unhandled Exception] incident=${incidentId} code=${code}: ${message}`, {
    statusCode,
    code,
    incidentId,
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    incidentId,
    timestamp: new Date().toISOString(),
  });
});

// Conditional port binding for test runner isolation
if (process.env.NODE_ENV !== 'test') {
  const startServer = async (): Promise<void> => {
    if (env.NODE_ENV === 'production') {
      await prisma.$connect();
    }

    if (env.APP_ENV === 'staging') {
      try {
        await ensureStagingDemoDoctor(prisma);
      } catch (err: any) {
        console.error('[Staging Demo Seed] Failed to bootstrap staging demo accounts:', err?.message || err);
      }
    }

    const httpServer = app.listen(env.PORT, () => {
      console.log(`AarogyaDamu Core API running on port ${env.PORT} [${env.NODE_ENV}]`);
      if (env.ENABLE_AGENT_EXPIRY_WORKER) {
        globalAgentExpiryWorker.start();
      }
    });

    let shuttingDown = false;
    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; closing AarogyaDamu API.`);
      globalAgentExpiryWorker.stop();

      const shutdownTimeout = setTimeout(() => {
        console.error('API shutdown timed out before active requests completed.');
        process.exit(1);
      }, 10_000);
      shutdownTimeout.unref();

      httpServer.close(() => {
        void prisma.$disconnect().then(
          () => {
            clearTimeout(shutdownTimeout);
            process.exitCode = 0;
          },
          () => {
            clearTimeout(shutdownTimeout);
            console.error('Database client failed to disconnect during shutdown.');
            process.exitCode = 1;
          },
        );
      });
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  };

  void startServer().catch(async (error: unknown) => {
    console.error(
      'API startup failed before listening:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    try {
    await prisma.$disconnect();
    } catch {
    console.error('Database client cleanup failed after startup error.');
    }
    process.exitCode = 1;
  });
}

export default app;
