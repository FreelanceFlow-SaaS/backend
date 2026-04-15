import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class GoldenRuleInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(GoldenRuleInterceptor.name)
    private readonly logger: PinoLogger
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => {
        const cleanResponse = this.sanitizeResponse(data);

        // Log unexpected extra fields clients are sending (analytics / API evolution)
        if (request.body && typeof request.body === 'object') {
          const keys = Object.keys(request.body);
          if (keys.length > 0) {
            this.logger.debug(
              { 'event.action': 'client_fields', path: request.path, fields: keys },
              'client request fields'
            );
          }
        }

        return cleanResponse;
      })
    );
  }

  private sanitizeResponse(data: any): any {
    // ✅ "Conservative in what you send" - Never leak sensitive data
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeResponse(item));
    }

    if (data && typeof data === 'object') {
      const sanitized = { ...data };

      delete sanitized.passwordHash;
      delete sanitized.password;
      delete sanitized.refreshToken;
      delete sanitized.tokenHash;

      if (sanitized.user) {
        delete sanitized.user.passwordHash;
        delete sanitized.user.password;
      }

      return sanitized;
    }

    return data;
  }
}
