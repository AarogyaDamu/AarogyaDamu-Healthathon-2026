import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient, User } from '@prisma/client';
import { env } from '../config/env';

const REFRESH_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user: Pick<User, 'id' | 'email' | 'isSyntheticDemo' | 'isClinician'>, sessionId: string): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      isSyntheticDemo: user.isSyntheticDemo,
      isClinician: user.isClinician,
      sessionId,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );
}

export async function createAuthSession(
  prisma: PrismaClient,
  user: Pick<User, 'id' | 'email' | 'isSyntheticDemo' | 'isClinician'>
): Promise<{ token: string; refreshToken: string }> {
  const sessionId = randomBytes(16).toString('hex');
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_SESSION_LIFETIME_MS);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      expiresAt,
      tokens: { create: { tokenHash: hashToken(refreshToken), expiresAt } },
    },
  });

  return { token: createAccessToken(user, sessionId), refreshToken };
}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  rawRefreshToken: string
): Promise<{ token: string; refreshToken: string } | null> {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { session: { include: { user: true } } },
  });
  if (!stored) return null;

  const now = new Date();
  if (stored.usedAt) {
    await prisma.authSession.updateMany({
      where: { id: stored.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    await prisma.refreshToken.updateMany({
      where: { sessionId: stored.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    return null;
  }
  if (
    stored.revokedAt ||
    stored.session.revokedAt ||
    stored.expiresAt <= now ||
    stored.session.expiresAt <= now
  ) {
    return null;
  }

  const nextRefreshToken = randomBytes(32).toString('base64url');
  const nextTokenHash = hashToken(nextRefreshToken);
  const claimed = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.refreshToken.updateMany({
      where: {
        id: stored.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now, successorHash: nextTokenHash },
    });
    if (updated.count !== 1) return false;

    const activeSession = await transaction.authSession.findFirst({
      where: {
        id: stored.sessionId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!activeSession) {
      throw new Error('Refresh session was revoked during rotation.');
    }

    await transaction.refreshToken.create({
      data: {
        sessionId: stored.sessionId,
        tokenHash: nextTokenHash,
        expiresAt: stored.session.expiresAt,
      },
    });
    return true;
  });

  if (!claimed) {
    const racedToken = await prisma.refreshToken.findUnique({ where: { id: stored.id } });
    if (racedToken?.usedAt) {
      await prisma.authSession.updateMany({
        where: { id: stored.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await prisma.refreshToken.updateMany({
        where: { sessionId: stored.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return null;
  }

  return {
    token: createAccessToken(stored.session.user, stored.sessionId),
    refreshToken: nextRefreshToken,
  };
}

export async function revokeAuthSession(
  prisma: PrismaClient,
  sessionId: string,
  userId: string
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

export async function revokeAllAuthSessions(prisma: PrismaClient, userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { session: { userId }, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}
