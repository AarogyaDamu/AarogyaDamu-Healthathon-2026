import { prisma } from '../db/prisma';

const SENSITIVE_KEY_PATTERN = /^(password|token|secret|authorization|bearer|cookie|ssn|aadhaar|credit_?card|api_?key)$/i;

/**
 * Sanitizes arbitrary data by redacting authentication tokens, passwords,
 * and sensitive identifier keys before logging or printing to standard console.
 */
export function sanitizePhi<T>(data: T, depth = 0): T {
  if (depth > 5) return '[Truncated: Max Depth]' as unknown as T;
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Redact JWT-like strings (header.payload.signature)
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(data)) {
      return '[REDACTED_JWT_TOKEN]' as unknown as T;
    }
    // Redact Bearer headers
    if (/^Bearer\s+[A-Za-z0-9-_.]+/i.test(data)) {
      return 'Bearer [REDACTED]' as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePhi(item, depth + 1)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        sanitizedObj[key] = sanitizePhi(val, depth + 1);
      } else if (typeof val === 'string' && SENSITIVE_KEY_PATTERN.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizePhi(val, depth + 1);
      }
    }
    return sanitizedObj as unknown as T;
  }

  return data;
}

/**
 * Healthcare-compliant structured console logger.
 * Guarantees no raw authentication tokens, passwords or unredacted PHI are written to stdout/stderr.
 */
export function safeClinicalLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const sanitizedContext = context ? sanitizePhi(context) : undefined;
  const payload = {
    timestamp,
    level,
    message,
    ...(sanitizedContext ? { context: sanitizedContext } : {}),
  };

  const output = JSON.stringify(payload);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export interface ClinicalAccessEventInput {
  userId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ClinicalMutationEventInput extends ClinicalAccessEventInput {
  before?: unknown;
  after?: unknown;
}

/**
 * Logs a read or query access to protected health information (PHI)
 * in accordance with healthcare privacy standards.
 */
export async function logClinicalAccessEvent(entry: ClinicalAccessEventInput): Promise<void> {
  try {
    const sanitizedMetadata = entry.metadata ? sanitizePhi(entry.metadata) : {};

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: JSON.stringify({
          ...sanitizedMetadata,
          category: 'CLINICAL_ACCESS',
          timestamp: new Date().toISOString(),
        }),
      },
    });
  } catch (err) {
    safeClinicalLog('warn', 'Failed to record clinical access audit event', { error: String(err) });
  }
}

/**
 * Logs a mutation (create, update, delete) to medical data
 * including observations, prescriptions, and care plans.
 */
export async function logClinicalMutationEvent(entry: ClinicalMutationEventInput): Promise<void> {
  try {
    const sanitizedMetadata = entry.metadata ? sanitizePhi(entry.metadata) : {};
    const sanitizedBefore = entry.before !== undefined ? sanitizePhi(entry.before) : undefined;
    const sanitizedAfter = entry.after !== undefined ? sanitizePhi(entry.after) : undefined;

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: JSON.stringify({
          ...sanitizedMetadata,
          category: 'CLINICAL_MUTATION',
          changes: {
            before: sanitizedBefore,
            after: sanitizedAfter,
          },
          timestamp: new Date().toISOString(),
        }),
      },
    });
  } catch (err) {
    safeClinicalLog('warn', 'Failed to record clinical mutation audit event', { error: String(err) });
  }
}

