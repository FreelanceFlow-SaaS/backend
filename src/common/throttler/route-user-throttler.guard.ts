import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker: authenticated `userId:route` or anonymous `ip:route` (e.g. login).
 * Combined with the default hashed key (controller + handler + tracker), limits are per user and route.
 */
@Injectable()
export class RouteUserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const route =
      (typeof req.route?.path === 'string' && req.route.path) ||
      (typeof req.originalUrl === 'string' && req.originalUrl) ||
      (typeof req.url === 'string' && req.url) ||
      'unknown';
    const userId = req.user?.id ?? req.user?.sub;
    if (userId) {
      return `${userId}:${route}`;
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `${ip}:${route}`;
  }
}
