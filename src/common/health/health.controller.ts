import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe used by Docker / load balancer health checks' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  check() {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
