import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

export function safeStringEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

export function createDoctorInvitation(email: string, id: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({
    id,
    email,
    role: 'DOCTOR',
    expiresAt,
  })).toString('base64url');
  const signature = createHmac('sha256', env.DOCTOR_INVITATION_SECRET).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt };
}

export function verifyDoctorInvitation(token: string, email: string): { id: string; tokenHash: string } | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expectedSignature = createHmac('sha256', env.DOCTOR_INVITATION_SECRET).update(payload).digest('base64url');
  if (!safeStringEqual(signature, expectedSignature)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id?: unknown;
      email?: unknown;
      role?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof claims.id === 'string' &&
      claims.email === email &&
      claims.role === 'DOCTOR' &&
      typeof claims.expiresAt === 'number' &&
      claims.expiresAt > Date.now()
    ) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      return { id: claims.id, tokenHash };
    }
    return null;
  } catch {
    return null;
  }
}

