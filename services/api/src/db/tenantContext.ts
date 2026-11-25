import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const RLS_CONTEXT_SECRET =
  process.env.RLS_CONTEXT_SECRET ||
  env.RLS_CONTEXT_SECRET ||
  'aarogya_rls_signing_secret_super_secure_2026_production_key_minimum_32_chars';

export const VALID_WORKER_SCOPES = [
  'SECURITY_RECORDER',
  'AUDIT_RECORDER',
  'SESSION_WORKER',
  'REGISTRATION_WORKER',
  'INVITATION_WORKER',
  'DEMO_WORKER',
  'DEMO_WORKER_BULK_SEED',
  'STAGING_BOOTSTRAP_WORKER',
] as const;

export type ValidWorkerScope = typeof VALID_WORKER_SCOPES[number];

export interface TenantDatabaseContext {
  userId?: string;
  role?: string;
  practiceId?: string;
  patientId?: string;
  isSystemWorker?: boolean;
  workerScope?: ValidWorkerScope | string;
  auditEventId?: string;
}

const globalForContext = global as unknown as { tenantContextStorage?: AsyncLocalStorage<TenantDatabaseContext> };
export const tenantContextStorage =
  globalForContext.tenantContextStorage ||
  (globalForContext.tenantContextStorage = new AsyncLocalStorage<TenantDatabaseContext>());

/**
 * Returns the current ambient database tenant context if set.
 */
export function getTenantContext(): TenantDatabaseContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Updates the active tenant database context with additional validated parameters
 * (e.g. effective practice ID or effective patient ID resolved by middleware).
 */
export function updateTenantContext(delta: Partial<TenantDatabaseContext>): void {
  const store = tenantContextStorage.getStore();
  if (store) {
    Object.assign(store, delta);
  }
}

/**
 * Runs an asynchronous callback with the given tenant database context.
 */
export function runWithTenantContext<T>(
  context: TenantDatabaseContext,
  fn: () => Promise<T>
): Promise<T> {
  const current = tenantContextStorage.getStore() || {};
  const merged: TenantDatabaseContext = {
    ...current,
    ...context,
  };
  return tenantContextStorage.run(merged, fn);
}

/**
 * Preserves the active AsyncLocalStorage tenant context across callback- or
 * stream-based Express middleware (such as multer multipart parsing), whose
 * underlying socket events would otherwise drop the store before calling next().
 */
export function preserveTenantContext(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const store = tenantContextStorage.getStore();
    if (!store) {
      return middleware(req, res, next);
    }
    const capturedStore: TenantDatabaseContext = { ...store };
    return middleware(req, res, (err?: unknown) => {
      tenantContextStorage.run(capturedStore, () => next(err));
    });
  };
}

/**
 * Sets transaction-local PostgreSQL session variables on an active transaction connection.
 * Uses set_config(..., true) so settings are strictly scoped to the transaction and
 * automatically purged upon commit or rollback (guaranteeing zero connection pool leakage).
 * 
 * Binds the signed payload cryptographically to:
 * - Active PostgreSQL Transaction ID (pg_current_xact_id)
 * - Active PostgreSQL Backend Connection PID (pg_backend_pid)
 * - Exact Issuance and Expiration Timestamps (iat, exp)
 * 
 * This permanently eliminates both unexpired context replay attacks across transactions
 * and context leakage across pooled connections.
 */
export async function setPostgresLocalContext(
  tx: Prisma.TransactionClient,
  ctx: TenantDatabaseContext
): Promise<void> {
  const meta = await (tx as any).$queryRawUnsafe(
    `SELECT pg_current_xact_id()::text as xid, pg_backend_pid() as pid`
  );
  const xid = meta[0]?.xid || '0';
  const pid = meta[0]?.pid || 0;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60; // 60s TTL for transaction
  // Strict worker validation: only whitelisted worker scopes are accepted.
  // Generic 'true' is completely forbidden and rejected fail-closed to 'false'.
  let workerVal = 'false';
  if (ctx.workerScope && VALID_WORKER_SCOPES.includes(ctx.workerScope as ValidWorkerScope)) {
    if (
      ctx.workerScope === 'STAGING_BOOTSTRAP_WORKER' &&
      (process.env.APP_ENV === 'production' || (process.env.NODE_ENV === 'production' && process.env.APP_ENV !== 'staging'))
    ) {
      throw new Error('STAGING_BOOTSTRAP_WORKER cannot be issued in production.');
    }
    workerVal = ctx.workerScope;
  }

  // Strict audit event claim validation: dedicated claim restricted strictly to AUDIT_RECORDER worker scope
  let auditEventVal = '';
  if (ctx.auditEventId) {
    if (workerVal !== 'AUDIT_RECORDER') {
      throw new Error('auditEventId claim is strictly restricted to AUDIT_RECORDER worker scope.');
    }
    const trimmed = ctx.auditEventId.trim();
    if (!trimmed || trimmed.includes('|') || trimmed.includes('\n') || trimmed.includes('\0')) {
      throw new Error('Invalid auditEventId format.');
    }
    auditEventVal = trimmed;
  }

  const payload = `v2|${ctx.practiceId || ''}|${ctx.userId || ''}|${ctx.role || ''}|${ctx.patientId || ''}|${workerVal}|${now}|${exp}|${xid}|${pid}|${auditEventVal}`;
  const signature = crypto.createHmac('sha256', RLS_CONTEXT_SECRET).update(payload).digest('hex');

  await tx.$executeRawUnsafe(`SELECT set_config('app.context_payload', $1, true)`, payload);
  await tx.$executeRawUnsafe(`SELECT set_config('app.context_signature', $1, true)`, signature);

  if (ctx.userId) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_id', $1, true)`, ctx.userId);
  }
  if (ctx.role) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_role', $1, true)`, ctx.role);
  }
  if (ctx.practiceId) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_practice_id', $1, true)`, ctx.practiceId);
  }
  if (ctx.patientId) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_patient_id', $1, true)`, ctx.patientId);
  }
  if (workerVal !== 'false') {
    await tx.$executeRawUnsafe(`SELECT set_config('app.is_system_worker', $1, true)`, workerVal);
  }
  if (auditEventVal) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_audit_event_id', $1, true)`, auditEventVal);
  }
}

/**
 * Executes a callback within an explicit transaction that sets local RLS context.
 */
export async function withTenantTransaction<T>(
  prismaClient: PrismaClient,
  context: TenantDatabaseContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return await prismaClient.$transaction(async (tx) => {
    await setPostgresLocalContext(tx, context);
    return await fn(tx);
  });
}
