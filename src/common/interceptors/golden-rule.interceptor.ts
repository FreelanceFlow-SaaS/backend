import { 
  Injectable, 
  BadRequestException, 
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class GoldenRuleInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GoldenRuleInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    // Log extra fields that were stripped (for monitoring)
    if (request.body && typeof request.body === 'object') {
      const originalKeys = Object.keys(request.body);
      
      return next.handle().pipe(
        map(data => {
          // ✅ "Conservative in what you send" - Clean response
          const cleanResponse = this.sanitizeResponse(data);
          
          // Log for analytics (which fields are clients sending?)
          this.logClientBehavior(originalKeys, request.path);
          
          return cleanResponse;
        })
      );
    }
    
    return next.handle().pipe(
      map(data => this.sanitizeResponse(data))
    );
  }

  private sanitizeResponse(data: any): any {
    // ✅ "Conservative in what you send" - Never leak sensitive data
    if (data && typeof data === 'object') {
      const sanitized = { ...data };
      
      // Remove sensitive fields that might accidentally be included
      delete sanitized.passwordHash;
      delete sanitized.password;
      delete sanitized.refreshToken; // Never send refresh tokens in response body
      delete sanitized.tokenHash;
      
      // Clean nested objects
      if (sanitized.user) {
        delete sanitized.user.passwordHash;
        delete sanitized.user.password;
      }
      
      return sanitized;
    }
    
    return data;
  }

  private logClientBehavior(originalKeys: string[], path: string): void {
    // Analytics: Track what extra fields clients are sending
    // This helps with API evolution and client behavior understanding
    if (originalKeys.length > 0) {
      this.logger.log(`Client sent fields to ${path}: ${originalKeys.join(', ')}`);
    }
  }
}