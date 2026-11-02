import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token missing or invalid' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);
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
    const session = await prisma.authSession.findFirst({
      where: {
        id: decoded.sessionId,
        userId: decoded.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, email: true, isSyntheticDemo: true, isClinician: true } },
      },
    });

    if (!session) {
      res.status(401).json({ error: 'Session has been revoked or expired. Please sign in again.' });
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
    next();
  } catch (error) {
    next(error);
  }
}