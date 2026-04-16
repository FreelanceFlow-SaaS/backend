import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Optional Redis liveness: omitted when `REDIS_URL` is unset.
 * When `REDIS_URL` is set (staging/production with cache or mail queue), a failed
 * `PING` degrades the overall health check to 503 — see story 8.2 / NFR-G2.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      return this.getStatus(key, true, { message: 'Redis not configured (check skipped)' });
    }

    // `lazyConnect` + explicit `connect()` avoids racing `PING` before the TCP stream is
    // writable; with `enableOfflineQueue: false` that race throws "Stream isn't writeable...".
    const client = new Redis(url, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => undefined,
      lazyConnect: true,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response: ${String(pong)}`);
      }
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { error: message })
      );
    } finally {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}
