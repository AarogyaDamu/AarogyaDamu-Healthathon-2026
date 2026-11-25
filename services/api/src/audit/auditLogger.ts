import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { runWithTenantContext, setPostgresLocalContext, tenantContextStorage } from '../db/tenantContext';

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

export async function logAuditEvent(
  entry: AuditLogEntry,
  txClient?: Prisma.TransactionClient | any
): Promise<void> {
  const auditId = crypto.randomUUID();
  const isSystem = !entry.actorId || entry.actorId === 'SYSTEM_AUDIT_RECORDER';
  const effectiveActorId = isSystem ? 'SYSTEM_AUDIT_RECORDER' : entry.actorId;

  return runWithTenantContext(
    {
      userId: isSystem ? undefined : effectiveActorId,
      isSystemWorker: true,
      workerScope: 'AUDIT_RECORDER',
      patientId: entry.userId || undefined,
      auditEventId: auditId,
    },
    async () => {
      try {
        let serializedMetadata: string | undefined = undefined;

        if (entry.metadata !== undefined && entry.metadata !== null) {
          serializedMetadata =
            typeof entry.metadata === 'string'
              ? entry.metadata
              : JSON.stringify(entry.metadata);
        }

        const dbClient = txClient || prisma;
        if (txClient) {
          const ctx = tenantContextStorage.getStore();
          if (ctx) {
            await setPostgresLocalContext(txClient, ctx);
          }
        }
        await dbClient.auditLog.create({
          data: {
            id: auditId,
            userId: entry.userId,
            actorId: effectiveActorId,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId || undefined,
            metadata: serializedMetadata,
            ipAddress: entry.ipAddress || undefined,
            userAgent: entry.userAgent || undefined,
          },
        });
      } catch (error) {
        if (txClient) {
          // Inside an explicit transaction, audit failures must abort and roll back the transaction
          // to guarantee audit atomicity and eliminate un-audited state mutations.
          throw error;
        }
        console.warn('[AuditLogger Warning]: Failed to persist audit record:', error);
      }
    }
  );
}
