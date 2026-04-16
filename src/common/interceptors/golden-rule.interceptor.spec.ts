import { ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { of } from 'rxjs';
import { GoldenRuleInterceptor } from './golden-rule.interceptor';
import { mockLoggerValue } from '../testing/mock-logger';

describe('GoldenRuleInterceptor', () => {
  const interceptor = new GoldenRuleInterceptor(mockLoggerValue as any);

  const httpContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ path: '/users/profile/logo', body: {} }),
      }),
    }) as ExecutionContext;

  it('returns StreamableFile unchanged so Nest can stream binary responses', (done) => {
    const file = new StreamableFile(Buffer.from('fake-image'), {
      type: 'image/png',
      disposition: 'inline; filename="logo"',
    });
    const next: CallHandler = { handle: () => of(file) };

    interceptor.intercept(httpContext(), next).subscribe((out) => {
      expect(out).toBe(file);
      expect(out instanceof StreamableFile).toBe(true);
      done();
    });
  });
});
