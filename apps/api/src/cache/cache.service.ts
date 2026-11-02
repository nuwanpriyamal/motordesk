import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Small JSON cache backed by Redis when REDIS_URL is set,
 * otherwise by an in-process map (fine for a single dev instance).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis?: Redis;
  private memory = new Map<string, { value: string; expires: number }>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
      this.redis.on('error', (e) => this.logger.warn(`Redis error: ${e.message}`));
      this.logger.log('Using Redis cache');
    } else {
      this.logger.log('REDIS_URL not set, using in-memory cache');
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = this.redis ? await this.redis.get(key) : this.memoryGet(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      if (this.redis) await this.redis.set(key, raw, 'EX', ttlSeconds);
      else this.memory.set(key, { value: raw, expires: Date.now() + ttlSeconds * 1000 });
    } catch (e) {
      this.logger.warn(`Cache set failed: ${(e as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (this.redis) await this.redis.del(...keys);
      else keys.forEach((k) => this.memory.delete(k));
    } catch {
      /* cache misses are harmless */
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  private memoryGet(key: string): string | undefined {
    const entry = this.memory.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
