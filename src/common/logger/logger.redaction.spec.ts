import { Writable } from 'stream';
import pino from 'pino';
import { pinoHttpRedact } from './logger.config';

describe('createPinoLoggerParams — redaction', () => {
  function logLineWithRedact(payload: Record<string, unknown>): string {
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        cb();
      },
    });
    const logger = pino({ redact: { ...pinoHttpRedact } }, stream);
    logger.info(payload);
    return Buffer.concat(chunks).toString();
  }

  it('replaces authorization, cookie, x-api-key, password, refreshToken, accessToken, token, secret, apiKey', () => {
    const line = logLineWithRedact({
      req: {
        headers: {
          authorization: 'Bearer ultra-secret-jwt',
          cookie: 'refreshToken=opaque',
          'x-api-key': 'provider-key-xyz',
        },
        body: {
          email: 'user@example.com',
          password: 'hunter2',
          refreshToken: 'rt-secret',
          accessToken: 'at-secret',
          token: 'opaque-token',
          secret: 'client-secret',
          apiKey: 'ak-live',
        },
      },
    });

    expect(line).not.toContain('ultra-secret-jwt');
    expect(line).not.toContain('opaque');
    expect(line).not.toContain('provider-key-xyz');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('rt-secret');
    expect(line).not.toContain('at-secret');
    expect(line).not.toContain('opaque-token');
    expect(line).not.toContain('client-secret');
    expect(line).not.toContain('ak-live');
    expect(line).toContain('[REDACTED]');
    expect(line).toContain('user@example.com');

    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toMatchSnapshot('redacted-info-log-keys');
  });
});
