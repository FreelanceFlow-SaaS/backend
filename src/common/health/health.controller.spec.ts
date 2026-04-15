import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health-indicator';
import { RedisHealthIndicator } from './redis.health-indicator';

const mockHealthResult: HealthCheckResult = {
  status: 'ok',
  info: { database: { status: 'up' }, redis: { status: 'up' } },
  error: {},
  details: { database: { status: 'up' }, redis: { status: 'up' } },
};

const mockDegradedResult: HealthCheckResult = {
  status: 'error',
  info: {},
  error: { database: { status: 'down', error: 'Connection refused' } },
  details: { database: { status: 'down', error: 'Connection refused' } },
};

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let prismaIndicator: jest.Mocked<PrismaHealthIndicator>;
  let redisIndicator: jest.Mocked<RedisHealthIndicator>;

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn(),
    } as any;

    prismaIndicator = {
      isHealthy: jest.fn(),
    } as any;

    redisIndicator = {
      isHealthy: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: prismaIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return healthy status when DB is up', async () => {
    healthCheckService.check.mockResolvedValue(mockHealthResult);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.info?.database?.status).toBe('up');
    expect(healthCheckService.check).toHaveBeenCalledWith([
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('should reflect degraded status when DB is down', async () => {
    healthCheckService.check.mockResolvedValue(mockDegradedResult);

    const result = await controller.check();

    expect(result.status).toBe('error');
    expect(result.error?.database?.status).toBe('down');
  });

  it('exposes gitSha and env on healthy check', async () => {
    const prevSha = process.env.GIT_SHA;
    const prevEnv = process.env.NODE_ENV;
    process.env.GIT_SHA = 'deadbeef';
    process.env.NODE_ENV = 'test';
    healthCheckService.check.mockResolvedValue(mockHealthResult);

    const result = await controller.check();

    expect(result.gitSha).toBe('deadbeef');
    expect(result.env).toBe('test');
    process.env.GIT_SHA = prevSha;
    process.env.NODE_ENV = prevEnv;
  });
});
