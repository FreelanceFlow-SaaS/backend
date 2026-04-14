import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health-indicator';
import { RedisHealthIndicator } from './redis.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary:
      'Liveness probe — PostgreSQL `SELECT 1`; optional Redis `PING` when `REDIS_URL` is set; build identity',
  })
  @ApiResponse({ status: 200, description: 'All dependencies healthy' })
  @ApiResponse({
    status: 503,
    description:
      'Degraded: database unreachable, or Redis unreachable while `REDIS_URL` is configured',
  })
  async check(): Promise<HealthCheckResult & { version: string; gitSha: string; env: string }> {
    const result = await this.health.check([
      () => this.prismaIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
    ]);

    const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? '1.0.0';

    // FR31: expose build identity so operators and reviewers can confirm which
    // version is running without SSH access.
    return {
      ...result,
      version,
      gitSha: process.env.GIT_SHA ?? 'local',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
