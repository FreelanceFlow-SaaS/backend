import { Global, Module } from '@nestjs/common';
import { RouteUserThrottlerGuard } from './route-user-throttler.guard';

@Global()
@Module({
  providers: [RouteUserThrottlerGuard],
  exports: [RouteUserThrottlerGuard],
})
export class RateLimitModule {}
