import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis, { type Redis as RedisClient } from 'ioredis';

/**
 * Low-level Redis helpers for cache-aside.
 * When `REDIS_URL` is unset or connection fails at bootstrap, all operations no-op / delegate to loaders.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private redis: RedisClient | null = null;
  private active = false;

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(CacheService.name)
    private readonly logger: PinoLogger
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.logger.info(
        { 'event.action': 'redis_cache_disabled', reason: 'REDIS_URL unset' },
        'invoice/dashboard read cache disabled (no Redis URL)'
      );
      return;
    }
    const client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    try {
      await client.connect();
      await client.ping();
      this.redis = client;
      this.active = true;
      this.logger.info({ 'event.action': 'redis_cache_ready' }, 'Redis read cache connected');
    } catch (err) {
      this.logger.warn(
        { err, 'event.action': 'redis_cache_bootstrap_failed' },
        'Redis read cache unavailable; continuing without cross-instance read cache'
      );
      await client.quit().catch(() => undefined);
      this.redis = null;
      this.active = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
      this.active = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn({ err, key, 'event.action': 'redis_cache_get_failed' }, 'cache get failed');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn({ err, key, 'event.action': 'redis_cache_set_failed' }, 'cache set failed');
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn({ err, key, 'event.action': 'redis_cache_del_failed' }, 'cache del failed');
    }
  }

  /**
   * Deletes keys matching `pattern` using non-blocking SCAN (safe for production).
   * Prefer exact keys when possible; used for `user:{id}:invoices:list*` and detail wildcards.
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      let cursor = '0';
      do {
        const res = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 128);
        cursor = res[0];
        const keys = res[1];
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        { err, pattern, 'event.action': 'redis_cache_del_pattern_failed' },
        'cache delPattern failed'
      );
    }
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    serialize: (v: T) => string,
    deserialize: (raw: string) => T
  ): Promise<T> {
    if (!this.active) {
      return loader();
    }
    const cached = await this.get(key);
    if (cached !== null) {
      try {
        return deserialize(cached);
      } catch (err) {
        this.logger.warn(
          { err, key, 'event.action': 'redis_cache_deserialize_failed' },
          'cache deserialize failed; reloading'
        );
        await this.del(key);
      }
    }
    const fresh = await loader();
    try {
      await this.set(key, serialize(fresh), ttlSeconds);
    } catch {
      /* set already logged */
    }
    return fresh;
  }
}
