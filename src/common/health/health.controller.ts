import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness and readiness probe — checks DB connectivity and reports build version',
  })
  @ApiResponse({ status: 200, description: 'All dependencies healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies degraded' })
  async check(): Promise<HealthCheckResult & { version: string; gitSha: string; env: string }> {
    const result = await this.health.check([
      () => this.prismaIndicator.isHealthy('database'),
      // Redis indicator will be wired here in story 8.3 once RedisModule (7.4) is available.
      // When added: () => this.redisIndicator.isHealthy('redis')
    ]);

    // FR31: expose build identity so operators and reviewers can confirm which
    // version is running without SSH access.
    return {
      ...result,
      version: process.env.npm_package_version ?? '1.0.0',
      gitSha: process.env.GIT_SHA ?? 'local',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
