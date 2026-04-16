import { ThrottlerModule } from '@nestjs/throttler';
import { RouteUserThrottlerGuard } from '../throttler/route-user-throttler.guard';

/** High limits so integration tests do not hit 429; satisfies RouteUserThrottlerGuard DI. */
export const testThrottlerImports = [
  ThrottlerModule.forRoot({
    throttlers: [{ name: 'default', ttl: 60_000, limit: 1_000_000 }],
    errorMessage: 'Trop de requêtes.',
  }),
];

export const testThrottlerProviders = [RouteUserThrottlerGuard];
