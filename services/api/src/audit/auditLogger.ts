import { prisma } from '../db/prisma';

export interface AuditLogEntry {
  userId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    let serializedMetadata: string | undefined = undefined;

    if (entry.metadata !== undefined && entry.metadata !== null) {
      serializedMetadata =
        typeof entry.metadata === 'string'
          ? entry.metadata
          : JSON.stringify(entry.metadata);
    }

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || undefined,
        metadata: serializedMetadata,
        ipAddress: entry.ipAddress || undefined,
        userAgent: entry.userAgent || undefined,
      },
    });
  } catch (error) {
    console.warn('[AuditLogger Warning]: Failed to persist audit record:', error);
  }
}
