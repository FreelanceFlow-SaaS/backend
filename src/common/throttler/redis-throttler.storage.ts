import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Shared Redis counter for @nestjs/throttler v6 (per-key window).
 * Suitable for multi-instance rate limits when all replicas use the same REDIS_URL.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    _throttlerName: string
  ) {
    const redisKey = `throttle:v1:${key}`;
    const n = await this.redis.incr(redisKey);
    if (n === 1) {
      await this.redis.pexpire(redisKey, ttl);
    }
    const pttl = await this.redis.pttl(redisKey);
    const timeToExpireMs = pttl > 0 ? pttl : ttl;
    const timeToExpire = Math.max(0, Math.ceil(timeToExpireMs / 1000));
    const isBlocked = n > limit;
    return {
      totalHits: n,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
