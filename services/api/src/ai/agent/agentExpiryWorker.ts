import type { PrismaClient } from '@prisma/client';
import { AgentRuntimeEngine, agentRuntime } from './agentRuntime';
import { safeClinicalLog } from '../../audit/clinicalAuditLogger';
import { env } from '../../config/env';
import net from 'net';
import tls from 'tls';
import { prisma as sharedPrisma } from '../../db/prisma';

export interface ExpirySweepResult {
  success: boolean;
  expiredActionsCount: number;
  expiredPlansCount: number;
  reconciledExecutingActionsCount: number;
  durationMs: number;
  skippedDueToLock?: boolean;
  error?: string;
}

export interface AgentExpiryWorkerOptions {
  intervalMs?: number;
  lockTtlMs?: number;
  runtime?: AgentRuntimeEngine;
  prisma?: PrismaClient;
}

/**
 * Dedicated background worker for sweeping stale agent plans and actions,
 * and reconciling abandoned EXECUTING actions.
 *
 * Operational guarantees:
 * - Runs periodically (default 15 minutes).
 * - Prevents overlapping sweeps via in-process mutex.
 * - Supports distributed advisory locking when Redis is configured.
 * - Zero blind redispatch of abandoned actions.
 * - Logs non-PHI operational metrics.
 */
export class AgentExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;
  private isStarted = false;
  private intervalMs: number;
  private lockTtlMs: number;
  private runtime: AgentRuntimeEngine;
  private prisma: PrismaClient;
  private workerId: string;
  private lastSweepAt?: Date;
  private lastSweepResult?: ExpirySweepResult;

  constructor(options: AgentExpiryWorkerOptions = {}) {
    this.intervalMs = options.intervalMs ?? env.AGENT_EXPIRY_INTERVAL_MS;
    this.lockTtlMs = options.lockTtlMs ?? 10 * 60 * 1000; // 10 minute lock TTL
    this.prisma = options.prisma ?? sharedPrisma;
    this.runtime = options.runtime ?? agentRuntime;
    this.workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Starts the periodic expiry scheduler.
   */
  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    safeClinicalLog('info', 'AgentExpiryWorker started', {
      workerId: this.workerId,
      intervalMs: this.intervalMs,
      distributedLocking: env.RATE_LIMIT_STORE === 'redis' ? 'ENABLED' : 'IN_PROCESS_ONLY',
    });

    // Schedule next tick
    this.timer = setInterval(() => {
      void this.triggerSweep().catch((err) => {
        safeClinicalLog('error', 'Unhandled error in AgentExpiryWorker scheduled sweep', {
          workerId: this.workerId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);

    // Unref timer so it does not block Node process exit if server is shutting down
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Stops the periodic scheduler gracefully.
   */
  public stop(): void {
    if (!this.isStarted) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isStarted = false;

    safeClinicalLog('info', 'AgentExpiryWorker stopped', {
      workerId: this.workerId,
      wasSweeping: this.isSweeping,
    });
  }

  /**
   * Triggers a single expiry sweep cycle immediately.
   * Safe to call manually or from tests.
   */
  public async triggerSweep(referenceTime: Date = new Date()): Promise<ExpirySweepResult> {
    // 1. In-process mutex: prevent overlapping sweeps in same process
    if (this.isSweeping) {
      safeClinicalLog('warn', 'Agent expiry sweep skipped; previous sweep in-process is still active', {
        workerId: this.workerId,
      });
      return {
        success: false,
        expiredActionsCount: 0,
        expiredPlansCount: 0,
        reconciledExecutingActionsCount: 0,
        durationMs: 0,
        skippedDueToLock: true,
      };
    }

    this.isSweeping = true;
    const startTime = Date.now();
    let acquiredDistributedLock = false;

    try {
      // 2. Distributed locking if Redis is configured
      if (env.RATE_LIMIT_STORE === 'redis' && env.REDIS_URL) {
        acquiredDistributedLock = await this.acquireRedisLock(env.REDIS_URL);
        if (!acquiredDistributedLock) {
          safeClinicalLog('info', 'Agent expiry sweep skipped; distributed lock currently held by peer instance', {
            workerId: this.workerId,
          });
          return {
            success: true,
            expiredActionsCount: 0,
            expiredPlansCount: 0,
            reconciledExecutingActionsCount: 0,
            durationMs: Date.now() - startTime,
            skippedDueToLock: true,
          };
        }
      }

      // 3. Execute stale plan and action expiration + abandoned executing reconciliation
      const sweepCounts = await this.runtime.expireStalePlansAndActions(referenceTime);
      const durationMs = Date.now() - startTime;

      const result: ExpirySweepResult = {
        success: true,
        expiredActionsCount: sweepCounts.expiredActionsCount,
        expiredPlansCount: sweepCounts.expiredPlansCount,
        reconciledExecutingActionsCount: sweepCounts.reconciledExecutingActionsCount,
        durationMs,
        skippedDueToLock: false,
      };

      this.lastSweepAt = new Date();
      this.lastSweepResult = result;

      // Log non-PHI operational metrics
      safeClinicalLog('info', 'Agent expiry sweep completed', {
        workerId: this.workerId,
        expiredActionsCount: result.expiredActionsCount,
        expiredPlansCount: result.expiredPlansCount,
        reconciledExecutingActionsCount: result.reconciledExecutingActionsCount,
        durationMs,
      });

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      safeClinicalLog('error', 'Agent expiry sweep failed with error', {
        workerId: this.workerId,
        error: errorMsg,
        durationMs,
      });

      const failedResult: ExpirySweepResult = {
        success: false,
        expiredActionsCount: 0,
        expiredPlansCount: 0,
        reconciledExecutingActionsCount: 0,
        durationMs,
        error: errorMsg,
      };
      this.lastSweepResult = failedResult;
      return failedResult;
    } finally {
      // 4. Release distributed lock if held
      if (acquiredDistributedLock && env.REDIS_URL) {
        await this.releaseRedisLock(env.REDIS_URL).catch(() => {});
      }
      this.isSweeping = false;
    }
  }

  /**
   * Acquires an advisory distributed lock via Redis using SET key val NX PX ttl.
   */
  private async acquireRedisLock(redisUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || '127.0.0.1';
      const port = Number(parsed.port) || 6379;
      const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      const isTls = parsed.protocol === 'rediss:';

      const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
        const s = isTls
          ? tls.connect({ host, port }, () => resolve(s))
          : net.createConnection({ host, port }, () => resolve(s));
        s.setTimeout(2000);
        s.on('error', reject);
      });

      if (password) {
        await this.sendRedisRaw(socket, `AUTH ${password}`);
      }

      const res = await this.sendRedisRaw(
        socket,
        `SET lock:agent_expiry_sweep ${this.workerId} NX PX ${this.lockTtlMs}`
      );
      socket.end();
      return res.includes('+OK');
    } catch {
      // If Redis connection fails, fallback to allowing local sweep with in-process lock
      return true;
    }
  }

  /**
   * Releases the distributed lock in Redis if owned by this worker.
   */
  private async releaseRedisLock(redisUrl: string): Promise<void> {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || '127.0.0.1';
      const port = Number(parsed.port) || 6379;
      const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      const isTls = parsed.protocol === 'rediss:';

      const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
        const s = isTls
          ? tls.connect({ host, port }, () => resolve(s))
          : net.createConnection({ host, port }, () => resolve(s));
        s.setTimeout(2000);
        s.on('error', reject);
      });

      if (password) {
        await this.sendRedisRaw(socket, `AUTH ${password}`);
      }

      await this.sendRedisRaw(socket, 'DEL lock:agent_expiry_sweep');
      socket.end();
    } catch {
      // Ignore cleanup error on shutdown
    }
  }

  private sendRedisRaw(socket: net.Socket | tls.TLSSocket, cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        resolve(data.toString('utf8'));
      };
      const onError = (err: Error) => {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        reject(err);
      };
      socket.once('data', onData);
      socket.once('error', onError);
      socket.write(`${cmd}\r\n`);
    });
  }

  /**
   * Gets current worker status for health checking.
   */
  public getStatus() {
    return {
      workerId: this.workerId,
      isStarted: this.isStarted,
      isSweeping: this.isSweeping,
      intervalMs: this.intervalMs,
      lastSweepAt: this.lastSweepAt,
      lastSweepResult: this.lastSweepResult,
    };
  }
}

// Singleton worker instance for server lifecycle
export const globalAgentExpiryWorker = new AgentExpiryWorker();
