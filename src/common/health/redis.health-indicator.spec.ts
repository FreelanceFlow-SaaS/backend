import { HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisHealthIndicator } from './redis.health-indicator';

jest.mock('ioredis');

const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RedisHealthIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns up with skip message when REDIS_URL is unset', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const indicator = new RedisHealthIndicator(config);

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
    expect(result.redis).toMatchObject({
      message: expect.stringContaining('skipped') as string,
    });
    expect(MockedRedis).not.toHaveBeenCalled();
  });

  it('returns up when PING succeeds', async () => {
    MockedRedis.mockImplementation(
      () =>
        ({
          ping: jest.fn().mockResolvedValue('PONG'),
          quit: jest.fn().mockResolvedValue('OK'),
          disconnect: jest.fn(),
        }) as unknown as Redis
    );
    const config = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const indicator = new RedisHealthIndicator(config);

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
    expect(MockedRedis).toHaveBeenCalled();
  });

  it('throws HealthCheckError when PING fails', async () => {
    MockedRedis.mockImplementation(
      () =>
        ({
          ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
          quit: jest.fn().mockResolvedValue('OK'),
          disconnect: jest.fn(),
        }) as unknown as Redis
    );
    const config = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const indicator = new RedisHealthIndicator(config);

    await expect(indicator.isHealthy('redis')).rejects.toThrow(HealthCheckError);
  });
});
