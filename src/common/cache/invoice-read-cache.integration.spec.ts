/**
 * Requires a reachable Redis at REDIS_URL (e.g. docker compose from backend/).
 * Skipped in CI when unset so default unit runs stay green.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { createPinoLoggerParams } from '../logger/logger.config';
import { RedisCacheModule } from './redis-cache.module';
import { InvoiceReadCacheService } from './invoice-read-cache.service';
import { dashboardSummaryKey, invoiceListKey } from './cache-keys';

const redisUrl = process.env.REDIS_URL?.trim();
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis('InvoiceReadCacheService (Redis integration)', () => {
  let app: INestApplication;
  let invoiceReadCache: InvoiceReadCacheService;
  let raw: Redis;
  const userId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoggerModule.forRootAsync({ useFactory: () => createPinoLoggerParams() }),
        RedisCacheModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    invoiceReadCache = app.get(InvoiceReadCacheService);
    raw = new Redis(redisUrl!, { maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    await raw?.quit().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(cursor, 'MATCH', `user:${userId}:*`, 'COUNT', 64);
      cursor = next;
      if (keys.length) await raw.del(...keys);
    } while (cursor !== '0');
  });

  it('invalidateForUser removes dashboard and list keys', async () => {
    await raw.set(dashboardSummaryKey(userId), '{"totalRevenueTtc":"0.00"}');
    await raw.set(invoiceListKey(userId), '[]');
    expect(await raw.get(dashboardSummaryKey(userId))).not.toBeNull();

    await invoiceReadCache.invalidateForUser(userId);

    expect(await raw.get(dashboardSummaryKey(userId))).toBeNull();
    expect(await raw.get(invoiceListKey(userId))).toBeNull();
  });
});
