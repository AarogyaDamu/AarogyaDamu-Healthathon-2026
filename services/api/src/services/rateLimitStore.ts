import net from 'net';
import tls from 'tls';
import { MemoryStore, Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Lightweight native Redis RESP client for distributed rate limiting.
 * Avoids heavy external client dependencies while guaranteeing cluster-wide rate limiting.
 */
class SimpleRedisClient {
  private client: net.Socket | tls.TLSSocket | null = null;
  private host: string;
  private port: number;
  private password?: string;
  private isTls: boolean;
  private connected = false;

  constructor(redisUrl: string) {
    try {
      const parsed = new URL(redisUrl);
      this.host = parsed.hostname || '127.0.0.1';
      this.port = Number(parsed.port) || 6379;
      this.password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      this.isTls = parsed.protocol === 'rediss:';
    } catch {
      this.host = '127.0.0.1';
      this.port = 6379;
      this.isTls = false;
    }
  }

  private connect(): Promise<net.Socket | tls.TLSSocket> {
    if (this.client && this.connected) return Promise.resolve(this.client);

    return new Promise((resolve, reject) => {
      const socketOptions = { host: this.host, port: this.port };
      const socket = this.isTls
        ? tls.connect(socketOptions, () => onConnect())
        : net.createConnection(socketOptions, () => onConnect());

      socket.setTimeout(3000);
      socket.on('error', (err) => {
        this.connected = false;
        reject(err);
      });
      socket.on('close', () => {
        this.connected = false;
        this.client = null;
      });

      const onConnect = () => {
        this.connected = true;
        this.client = socket;
        if (this.password) {
          this.sendCommand(`AUTH ${this.password}`)
            .then(() => resolve(socket))
            .catch(reject);
        } else {
          resolve(socket);
        }
      };
    });
  }

  public async sendCommand(cmd: string): Promise<string> {
    const socket = await this.connect();
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
}

/**
 * Distributed Redis Store for express-rate-limit across multiple server instances.
 */
export class DistributedRedisRateLimitStore implements Store {
  private redis: SimpleRedisClient;
  public prefix: string;
  private windowMs: number;
  private fallbackStore = new MemoryStore();

  constructor(redisUrl: string, prefix = 'rl:', windowMs = 15 * 60 * 1000) {
    this.redis = new SimpleRedisClient(redisUrl);
    this.prefix = prefix;
    this.windowMs = windowMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallbackStore.init(options);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const fullKey = `${this.prefix}${key}`;
      const incrResult = await this.redis.sendCommand(`INCR ${fullKey}`);
      const hits = parseInt(incrResult.replace(/[^0-9]/g, ''), 10) || 1;

      if (hits === 1) {
        await this.redis.sendCommand(`PEXPIRE ${fullKey} ${this.windowMs}`);
      }

      return {
        totalHits: hits,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    } catch {
      return this.fallbackStore.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const fullKey = `${this.prefix}${key}`;
      await this.redis.sendCommand(`DECR ${fullKey}`);
    } catch {
      await this.fallbackStore.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const fullKey = `${this.prefix}${key}`;
      await this.redis.sendCommand(`DEL ${fullKey}`);
    } catch {
      await this.fallbackStore.resetKey(key);
    }
  }

  async resetAll(): Promise<void> {
    await this.fallbackStore.resetAll();
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const fullKey = `${this.prefix}${key}`;
      const res = await this.redis.sendCommand(`GET ${fullKey}`);
      const hits = parseInt(res.replace(/[^0-9]/g, ''), 10);
      if (isNaN(hits)) return undefined;
      return {
        totalHits: hits,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    } catch {
      return this.fallbackStore.get(key);
    }
  }
}

/**
 * Creates the appropriate rate limiter store based on environment configuration.
 */
export function createRateLimitStore(prefix: string, windowMs: number): Store {
  if (env.RATE_LIMIT_STORE === 'redis' && env.REDIS_URL) {
    return new DistributedRedisRateLimitStore(env.REDIS_URL, prefix, windowMs);
  }
  return new MemoryStore();
}
