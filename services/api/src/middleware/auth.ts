import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { runWithTenantContext } from '../db/tenantContext';

export interface AuthTokenPayload {
  id: string;
  email: string;
  isSyntheticDemo: boolean;
  isClinician: boolean;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  } else if (typeof req.query.token === 'string' && req.query.token.length > 10) {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication token missing or invalid' });
    return;
  }
  let decoded: AuthTokenPayload;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string') {
      res.status(401).json({ error: 'Session token expired or corrupted' });
      return;
    }
    decoded = payload as AuthTokenPayload;
    if (!decoded.id || !decoded.sessionId) {
      res.status(401).json({ error: 'Session token expired or corrupted' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Session token expired or corrupted' });
    return;
  }

  try {
    const session = await runWithTenantContext({ userId: decoded.id }, async () => {
      return prisma.authSession.findFirst({
        where: {
          id: decoded.sessionId,
          userId: decoded.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          user: { select: { id: true, email: true, isSyntheticDemo: true, isClinician: true, isActive: true } },
        },
      });
    });

    if (!session) {
      res.status(401).json({ error: 'Session has been revoked or expired. Please sign in again.' });
      return;
    }

    if (session.user.isActive === false) {
      res.status(401).json({ error: 'Account has been deactivated. Access denied.' });
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      isSyntheticDemo: session.user.isSyntheticDemo,
      isClinician: session.user.isClinician,
      sessionId: session.id,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    runWithTenantContext(
      {
        userId: session.user.id,
        role: session.user.isClinician ? 'DOCTOR' : 'PATIENT',
      },
      async () => {
        next();
      }
    );
  } catch (error) {
    next(error);
  }
}
