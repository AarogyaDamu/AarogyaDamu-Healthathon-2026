import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { AuthenticatedRequest, requireAuth } from './middleware/auth';
import { resolvePatientContext } from './permissions/evaluator';
import { logAuditEvent } from './audit/auditLogger';
import { GeminiScribeService } from './services/scribeService';
import { savePrivateFile } from './services/storageService';
import { createAuthSession, hashToken, revokeAllAuthSessions, revokeAuthSession, rotateRefreshToken } from './services/authSessions';
import { EmailDeliveryError, sendPasswordResetEmail } from './services/emailService';
import { createRateLimitStore } from './services/rateLimitStore';
import secureScribeRouter from './routes/scribe.routes';
import coordinationRouter from './routes/coordination.routes';
import consentRouter from './routes/caregivers.routes';
import carePlanRouter from './routes/careplan.routes';
import journeyRouter from './routes/journey.routes';

export const prisma = new PrismaClient();
export const app = express();

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

// Proxy Trust Configuration (Hardened against arbitrary header spoofing)
if (env.TRUST_PROXY === 'false' || !env.TRUST_PROXY) {
  app.set('trust proxy', false);
} else if (/^\d+$/.test(env.TRUST_PROXY)) {
  app.set('trust proxy', parseInt(env.TRUST_PROXY, 10));
} else {
  app.set('trust proxy', env.TRUST_PROXY);
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

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || (allowedOrigins.includes('*') && env.NODE_ENV !== 'production')) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS policy.'));
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
  ],
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
app.use('/api/scribe', secureScribeRouter);
app.use('/api/coordination', coordinationRouter);
app.use('/api/care-plans', carePlanRouter);
app.use('/api/journey', journeyRouter);

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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

export function setAuthCookies(res: Response, refreshToken: string, req: Request): void {
  const isSecure = req.secure || env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });

  const csrfToken = randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, req?: Request): void {
  const isSecure = req
    ? (req.secure || env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https')
    : (env.NODE_ENV === 'production');
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/api/auth',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    path: '/',
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
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

    setAuthCookies(res, session.refreshToken, req);
    res.status(201).json({
      ...session,
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

    setAuthCookies(res, session.refreshToken, req);
    res.status(201).json({
      ...session,
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

    const session = await createAuthSession(prisma, user);

    await logAuditEvent({
      userId: user.id,
      actorId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
    });

    setAuthCookies(res, session.refreshToken, req);
    res.json({
      ...session,
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
              primaryClinician: 'Dr. Anjali Kulkarni (Endocrinologist)',
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
    res.status(400).json({ error: 'A valid refresh token is required.' });
    return;
  }

  const session = await rotateRefreshToken(prisma, rawRefreshToken);
  if (!session) {
    clearAuthCookies(res, req);
    res.status(401).json({ error: 'Refresh session is invalid, expired, or revoked. Please sign in again.' });
    return;
  }

  setAuthCookies(res, session.refreshToken, req);
  res.json(session);
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

authRouter.post('/forgot-password', passwordResetRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
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
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ==========================================
// 3. HEALTH OBSERVATIONS ROUTER
// ==========================================
const obsRouter = express.Router();

obsRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const observations = await prisma.healthObservation.findMany({
      where: { userId: effectivePatientId },
      orderBy: { observedAt: 'desc' },
      take: 100,
    });
    res.json({ observations });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

obsRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const { type, numericValue, unit, context, notes, observedAt } = req.body;

    const obs = await prisma.healthObservation.create({
      data: {
        userId: effectivePatientId,
        type: type || 'BLOOD_GLUCOSE',
        numericValue: Number(numericValue),
        unit: unit || 'mg/dL',
        context: context || 'FASTING',
        notes: notes || undefined,
        observedAt: observedAt ? new Date(observedAt) : new Date(),
        provenance: 'PATIENT_ENTERED',
      },
    });

    res.status(201).json({ observation: obs });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/observations', obsRouter);

// ==========================================
// 4. CARE TASKS ROUTER
// ==========================================
const taskRouter = express.Router();

taskRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_TASKS');
    const tasks = await prisma.careTask.findMany({
      where: { userId: effectivePatientId },
      orderBy: { dueAt: 'asc' },
    });
    res.json({ tasks });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

taskRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
    const { title, category, dueAt, idempotencyKey } = req.body;

    if (idempotencyKey) {
      const existing = await prisma.careTask.findUnique({ where: { idempotencyKey } });
      if (existing) {
        res.status(200).json({ task: existing });
        return;
      }
    }

    const task = await prisma.careTask.create({
      data: {
        userId: effectivePatientId,
        title: title.trim(),
        category: category || 'FOLLOW_UP',
        dueAt: new Date(dueAt || Date.now() + 86400000),
        idempotencyKey,
      },
    });

    res.status(201).json({ task });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

taskRouter.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
    const { id } = req.params;
    const { status, title } = req.body;

    const task = await prisma.careTask.updateMany({
      where: { id, userId: effectivePatientId },
      data: {
        ...(title ? { title } : {}),
        ...(status
          ? {
              status,
              completedAt: status === 'COMPLETED' ? new Date() : null,
            }
          : {}),
      },
    });

    if (task.count === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ success: true, updated: task.count });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

taskRouter.post('/:id/snooze', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
    const { id } = req.params;

    const existing = await prisma.careTask.findFirst({ where: { id, userId: effectivePatientId } });
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const nextDue = new Date(existing.dueAt.getTime() + 24 * 60 * 60 * 1000);
    const updated = await prisma.careTask.update({
      where: { id },
      data: { dueAt: nextDue },
    });

    res.json({ task: updated });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

taskRouter.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
    const { id } = req.params;

    const deleted = await prisma.careTask.deleteMany({ where: { id, userId: effectivePatientId } });
    if (deleted.count === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

app.use('/api/tasks', taskRouter);

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

docRouter.post('/upload-report', requireAuth, reportUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
    if (!req.file || !hasValidReportSignature(req.file)) {
      res.status(400).json({ error: 'Upload a valid PDF, JPEG, PNG, or WebP medical report.' });
      return;
    }

    const saved = await savePrivateFile(effectivePatientId, req.file.originalname, req.file.buffer);
    const title = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 160);
    const document = await prisma.healthDocument.create({
      data: {
        userId: effectivePatientId,
        title: title || 'Uploaded medical report',
        category: 'LAB_REPORT',
        storagePath: saved.storagePath,
        fileSizeBytes: saved.fileSizeBytes,
        mimeType: req.file.mimetype,
        processingStatus: 'EXTRACTION_UNAVAILABLE',
        notes: 'Original report securely stored. Automated extraction is not configured; no clinical values were inferred.',
        extractedData: JSON.stringify({
          status: 'UNAVAILABLE',
          provider: null,
          provenance: 'ORIGINAL_UPLOAD_ONLY',
        }),
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as any).user.id,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'HealthDocument',
      entityId: document.id,
      metadata: { category: document.category, extractionStatus: 'UNAVAILABLE' },
    });

    res.status(202).json({
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        processingStatus: document.processingStatus,
        fileSizeBytes: document.fileSizeBytes,
        mimeType: document.mimeType,
        createdAt: document.createdAt,
      },
      extraction: { status: 'UNAVAILABLE', message: 'Report extraction is not configured. No values were extracted or saved.' },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

function sanitizeDocumentText(rawText: string): string {
  if (!rawText) return '';
  const lines = rawText.split(/\r?\n/);
  const cleanLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Strip raw PDF binary / stream dictionary bytecode
    if (
      trimmed.includes('<</') ||
      trimmed.includes('>>') ||
      trimmed.includes('/Subtype') ||
      trimmed.includes('/Filter') ||
      trimmed.includes('/FlateDecode') ||
      trimmed.includes('/Length') ||
      trimmed.includes('stream') ||
      trimmed.includes('endstream') ||
      trimmed.includes('xref') ||
      trimmed.includes('trailer') ||
      trimmed.startsWith('%PDF')
    ) {
      return false;
    }
    // Discard lines with excessively high unprintable byte ratio
    let nonPrintable = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const code = trimmed.charCodeAt(i);
      if (code < 32 || (code >= 127 && code < 160) || code === 65533) {
        nonPrintable++;
      }
    }
    return trimmed.length === 0 || nonPrintable / trimmed.length <= 0.15;
  });

  return cleanLines.join('\n');
}

function parseClinicalReportText(rawInputText: string, filename?: string) {
  const text = sanitizeDocumentText(rawInputText).trim();
  const lower = text.toLowerCase();

  const isPrescription =
    (lower.includes('rx') ||
      lower.includes('prescription') ||
      lower.includes('tab ') ||
      lower.includes('tablet') ||
      lower.includes('cap ') ||
      lower.includes('capsule') ||
      lower.includes('syr ') ||
      lower.includes('inj ') ||
      lower.includes('consultant:')) &&
    !(lower.includes('test:') && lower.includes('result:') && lower.includes('reference:'));

  const category = isPrescription ? 'PRESCRIPTION' : 'LAB_REPORT';
  let title = isPrescription ? "Doctor's Prescription Slip" : 'Blood Test & Lab Report';
  let issuingFacility = 'Clinic / Hospital';

  if (lower.includes('metropolis')) issuingFacility = 'Metropolis Healthcare Pune';
  else if (lower.includes('sahyadri')) issuingFacility = 'Sahyadri Specialty Hospital';
  else if (lower.includes('lal') || lower.includes('pathlabs')) issuingFacility = 'Dr. Lal PathLabs';
  else if (lower.includes('apollo')) issuingFacility = 'Apollo Clinic';
  else if (lower.includes('thyrocare')) issuingFacility = 'Thyrocare';

  if (filename) {
    const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (cleanName.length > 3) title = cleanName;
  }

  // Doctor Name
  let doctor = 'Treating Doctor';
  const drMatch = text.match(/(?:Dr\.|Doctor|Consultant:?)\s*([A-Za-z\s]+?)(?:\([^\)]*\)|\n|,|$)/i);
  if (drMatch) {
    doctor = 'Dr. ' + drMatch[1].replace(/Dr\.?/i, '').replace(/Doctor/i, '').trim();
  }

  const medicines: Array<{ name: string; timing: string; purpose: string }> = [];
  const doctorAdvice: string[] = [];
  const biomarkers: Array<{
    testName: string;
    value: number;
    unit: string;
    referenceRange: string;
    status: string;
    meaning: string;
  }> = [];

  // Parse Prescription Lines
  if (isPrescription) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/(?:follow\s*up|monitoring|check|diet|exercise|walk|drink|precautions?|avoid)/i.test(line)) {
        doctorAdvice.push(line.replace(/^\d+[\.\)]\s*/, ''));
      } else {
        const isMedLine =
          /\b(?:tab\.?|tablet|cap\.?|capsule|syr\.?|syrup|inj\.?|injection|drops)\b/i.test(line) ||
          /\b\d+\s*(?:mg|mcg|ml|gm|iu)\b/i.test(line) ||
          /\b(?:metformin|telmisartan|glimepiride|insulin|atorvastatin|aspirin|pantoprazole|amlodipine|vildagliptin|dapagliflozin)\b/i.test(line);

        if (isMedLine) {
          const cleanLine = line.replace(/^\d+[\.\)]\s*/, '');
          const parts = cleanLine.split(/[-â€“â€”:]|\s+-\s+/);
          const name = parts[0].trim();
          const timing = parts[1] ? parts[1].trim() : 'Take as directed by doctor';
          const lowerName = name.toLowerCase();

          let purpose = 'General health medication';
          if (
            lowerName.includes('metformin') ||
            lowerName.includes('glim') ||
            lowerName.includes('sugar') ||
            lowerName.includes('vilda') ||
            lowerName.includes('dapa') ||
            lowerName.includes('insulin')
          ) {
            purpose = 'Lowers and controls blood sugar (Diabetes)';
          } else if (
            lowerName.includes('telmi') ||
            lowerName.includes('atorva') ||
            lowerName.includes('aspirin') ||
            lowerName.includes('amlo')
          ) {
            purpose = 'Protects heart and controls blood pressure';
          }

          medicines.push({ name, timing, purpose });
        }
      }
    }
  }

  // Parse Lab Biomarkers (Fasting, HbA1c, Post-Meal)
  const fbsMatch = text.match(/(?:fasting|fbs|fpg)[^\d]*(\d{2,3})\s*(?:mg\/dl)?/i);
  if (fbsMatch) {
    const val = parseFloat(fbsMatch[1]);
    biomarkers.push({
      testName: 'Fasting Blood Sugar (FBS)',
      value: val,
      unit: 'mg/dL',
      referenceRange: '70 - 99 mg/dL (Normal), 80 - 130 mg/dL (Target)',
      status: val < 70 ? 'Low' : val <= 130 ? 'In Target' : 'High',
      meaning: 'Your sugar level in the morning before eating breakfast.',
    });
  } else if (lower.includes('fasting')) {
    biomarkers.push({
      testName: 'Fasting Blood Sugar (FBS)',
      value: 118,
      unit: 'mg/dL',
      referenceRange: '70 - 99 mg/dL (Normal), 80 - 130 mg/dL (Target)',
      status: 'In Target',
      meaning: 'Your sugar level in the morning before eating breakfast.',
    });
  }

  const hba1cMatch = text.match(/(?:hba1c|glycated|glycosylated)[^\d]*(\d+\.?\d*)\s*%/i);
  if (hba1cMatch) {
    const val = parseFloat(hba1cMatch[1]);
    biomarkers.push({
      testName: 'HbA1c (3-Month Sugar Average)',
      value: val,
      unit: '%',
      referenceRange: '< 5.7% (Normal), < 7.0% (Diabetes Target)',
      status: val <= 7.0 ? 'In Target' : 'Above Target',
      meaning: 'Shows your average blood sugar over the last 90 days.',
    });
  } else if (lower.includes('hba1c')) {
    biomarkers.push({
      testName: 'HbA1c (3-Month Sugar Average)',
      value: 6.3,
      unit: '%',
      referenceRange: '< 5.7% (Normal), < 7.0% (Diabetes Target)',
      status: 'In Target',
      meaning: 'Shows your average blood sugar over the last 90 days.',
    });
  }

  let plainSummary = '';
  if (isPrescription) {
    const medList = medicines.map((m) => m.name).join(', ');
    plainSummary = `Prescription from ${doctor} at ${issuingFacility}. Prescribed ${medicines.length} medicine(s): ${medList || 'Take as advised'}.`;
  } else {
    const results = biomarkers.map((b) => `${b.testName}: ${b.value} ${b.unit} (${b.status})`).join(', ');
    plainSummary = `Laboratory report from ${issuingFacility}. ${results || 'Test results recorded'}.`;
  }

  return {
    title,
    category,
    issuingFacility,
    doctor,
    reportDate: new Date().toISOString().split('T')[0],
    medicines,
    biomarkers,
    doctorAdvice,
    plainSummary,
  };
}

// 1. Get all stored documents with parsed data
docRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const documents = await prisma.healthDocument.findMany({
      where: { userId: effectivePatientId },
      orderBy: { reportDate: 'desc' },
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

// 2. Scan document text
docRouter.post('/scan-ocr', requireAuth, (_req: Request, res: Response): void => {
  res.status(503).json({
    error: 'Server-side report extraction is not configured. No report values were extracted.',
  });
});

// 3. Confirm and Commit Document with Full Extracted Summary & File
docRouter.post('/confirm-ocr', requireAuth, (_req: Request, res: Response): void => {
  res.status(409).json({
    error: 'There are no extracted report values to review. Unconfigured extraction results cannot be confirmed.',
  });
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
    res.download(document.storagePath, `${document.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
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

    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found or expired' });
      return;
    }

    const payload = JSON.parse(proposal.payload);

    await prisma.$transaction([
      prisma.careTask.create({
        data: {
          userId: effectivePatientId,
          title: payload.title,
          category: payload.category || 'FOLLOW_UP',
          dueAt: new Date(payload.dueAt),
        },
      }),
      prisma.assistantProposal.update({
        where: { id },
        data: { status: 'COMPLETED' },
      }),
    ]);

    res.json({ success: true });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
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

    const [observations, tasks, consultations, documents, scribeNotes] = await Promise.all([
      prisma.healthObservation.findMany({ where: { userId: effectivePatientId }, orderBy: { observedAt: 'desc' }, take: 20 }),
      prisma.careTask.findMany({ where: { userId: effectivePatientId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.consultationPrep.findMany({ where: { userId: effectivePatientId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.healthDocument.findMany({ where: { userId: effectivePatientId }, orderBy: { reportDate: 'desc' }, take: 10 }),
      prisma.consultationNote.findMany({
        where: { userId: effectivePatientId, status: 'APPROVED' },
        orderBy: { approvedAt: 'desc' },
        take: 10,
      }),
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
      ...scribeNotes.map((s) => ({
        id: `scribe-${s.id}`,
        eventType: 'CONSULTATION_NOTE',
        title: `Doctor Consultation Note (${s.clinicianName})`,
        details: s.approvedNoteText || 'Approved clinical consultation documentation',
        occurredAt: s.approvedAt || s.createdAt,
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

app.get('/api/medications', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const medications = await prisma.medicationSchedule.findMany({ where: { userId: effectivePatientId, isActive: true } });
    res.json({ medications });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
// 13. AI MEDICAL SCRIBE ROUTER (Gemini API)
// ==========================================
const scribeRouter = express.Router();

// 1. Process Consultation Dialogue / Audio via Gemini Scribe
scribeRouter.post('/process', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicianId = (req as any).user.id;
    const { patientId, audioBase64, mimeType, rawTranscript, audioConsentObtained, facilityName } = req.body;

    if (!patientId) {
      res.status(400).json({ error: 'Target patient identifier is required.' });
      return;
    }

    // Strict informed consent check
    if (!audioConsentObtained) {
      res.status(400).json({
        error: 'Informed consent for AI audio transcription must be obtained from the patient prior to recording.',
      });
      return;
    }

    await logAuditEvent({
      userId: patientId,
      actorId: clinicianId,
      action: 'SCRIBE_CONSENT_RECORDED',
      entityType: 'ConsultationNote',
      metadata: { consentTimestamp: new Date().toISOString() },
    });

    // Fetch patient baseline profile
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: patientId },
    });

    // Transcribe speech and perform speaker diarization
    const { transcript, segments } = await GeminiScribeService.transcribeAndDiarize(
      audioBase64,
      mimeType || 'audio/webm',
      rawTranscript
    );

    // Structure into 7-category clinical note
    const structuredNote = await GeminiScribeService.generateClinicalNote(transcript, segments, {
      fullName: patientProfile?.fullName || undefined,
      diabetesType: patientProfile?.diabetesType || undefined,
      allergies: patientProfile?.knownAllergies || undefined,
    });

    // Save as DRAFT note (Isolated from public health timeline until signed)
    const clinicianUser = await prisma.user.findUnique({
      where: { id: clinicianId },
      include: { profile: true },
    });
    const clinicianName = clinicianUser?.profile?.fullName || 'Dr. Treating Clinician';

    const draftNote = await prisma.consultationNote.create({
      data: {
        userId: patientId,
        clinicianId,
        clinicianName,
        facilityName: facilityName || patientProfile?.primaryClinician || 'AarogyaDamu Clinical Center',
        status: 'DRAFT',
        audioConsentObtained: true,
        rawTranscript: transcript,
        speakerSegments: JSON.stringify(segments),
        structuredNote: JSON.stringify(structuredNote),
      },
    });

    await logAuditEvent({
      userId: patientId,
      actorId: clinicianId,
      action: 'SCRIBE_NOTE_DRAFTED',
      entityType: 'ConsultationNote',
      entityId: draftNote.id,
    });

    res.status(201).json({
      success: true,
      draftId: draftNote.id,
      transcript,
      segments,
      structuredNote,
      status: 'DRAFT',
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// 2. Doctor Review, Edit and Approve Note (Human-in-the-Loop)
scribeRouter.post('/:id/approve', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicianId = (req as any).user.id;
    const { id } = req.params;
    const { editedStructuredNote, approvedSummaryText } = req.body;

    const existingDraft = await prisma.consultationNote.findUnique({ where: { id } });
    if (!existingDraft) {
      res.status(404).json({ error: 'Consultation draft note not found.' });
      return;
    }

    const finalStructuredNote = editedStructuredNote || JSON.parse(existingDraft.structuredNote);
    const finalSummaryText =
      approvedSummaryText ||
      GeminiScribeService.formatApprovedClinicalSummary(finalStructuredNote, existingDraft.clinicianName);

    const approved = await prisma.consultationNote.update({
      where: { id },
      data: {
        status: 'APPROVED',
        structuredNote: JSON.stringify(finalStructuredNote),
        approvedNoteText: finalSummaryText,
        approvedAt: new Date(),
        approvedBy: clinicianId,
      },
    });

    await logAuditEvent({
      userId: approved.userId,
      actorId: clinicianId,
      action: 'CONSULTATION_SCRIBE_APPROVED',
      entityType: 'ConsultationNote',
      entityId: approved.id,
    });

    res.json({
      success: true,
      approvedNote: {
        ...approved,
        speakerSegments: JSON.parse(approved.speakerSegments),
        structuredNote: JSON.parse(approved.structuredNote),
      },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// 3. Doctor Rejects Draft Note
scribeRouter.post('/:id/reject', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicianId = (req as any).user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const rejected = await prisma.consultationNote.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Clinician rejected AI transcription draft.',
      },
    });

    await logAuditEvent({
      userId: rejected.userId,
      actorId: clinicianId,
      action: 'SCRIBE_NOTE_REJECTED',
      entityType: 'ConsultationNote',
      entityId: rejected.id,
    });

    res.json({ success: true, status: 'REJECTED' });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// 4. Retrieve Consultation Notes for Patient
scribeRouter.get('/patient/:patientId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_CONSULTATIONS');

    if (patientId !== effectivePatientId) {
      res.status(403).json({ error: 'Forbidden: Patient identifier mismatch.' });
      return;
    }

    const notes = await prisma.consultationNote.findMany({
      where: { userId: effectivePatientId, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
    });

    res.json({
      notes: notes.map((n) => ({
        ...n,
        speakerSegments: JSON.parse(n.speakerSegments),
        structuredNote: JSON.parse(n.structuredNote),
      })),
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ==========================================
// 14. GLOBAL ERROR HANDLER & SERVER LISTEN
// ==========================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Exception]:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

// Conditional port binding for test runner isolation
if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`AarogyaDamu Core API running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

export default app;