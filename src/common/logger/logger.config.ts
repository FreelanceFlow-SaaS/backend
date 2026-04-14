import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import { Params } from 'nestjs-pino';

/** Exported for unit tests — keep in sync with `createPinoLoggerParams` redact block. */
export const pinoHttpRedact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.body.password',
    'req.body.passwordHash',
    'req.body.refreshToken',
    'req.body.accessToken',
    'req.body.token',
    'req.body.secret',
    'req.body.apiKey',
  ],
  censor: '[REDACTED]',
};

/**
 * Factory so `NODE_ENV` / `LOG_LEVEL` are read when Nest bootstraps the module
 * (not at import time), which lets e2e tests force production JSON formatting.
 */
export function createPinoLoggerParams(): Params {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

      genReqId: (req: IncomingMessage) =>
        (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),

      base: {
        service: 'freelanceflow-api',
        env: process.env.NODE_ENV ?? 'development',
      },

      // ISO-8601 wall time; formatters.log also exposes `timestamp` for Loki queries.
      timestamp: pino.stdTimeFunctions.isoTime,

      formatters: {
        level(label: string) {
          return { severity: label };
        },
        log(object: Record<string, unknown>) {
          const time = object.time;
          let timestamp: string | undefined;
          if (typeof time === 'string') {
            timestamp = time;
          } else if (typeof time === 'number') {
            timestamp = new Date(time).toISOString();
          }
          if (timestamp === undefined) {
            return object;
          }
          const next = { ...object };
          delete next.time;
          next.timestamp = timestamp;
          return next;
        },
      },

      redact: { ...pinoHttpRedact },

      serializers: {
        req(req: IncomingMessage & { id?: string; originalUrl?: string }) {
          return {
            method: req.method,
            route: req.originalUrl ?? req.url,
            requestId: req.id,
          };
        },
        res(res: ServerResponse) {
          return { httpStatus: res.statusCode };
        },
      },

      customProps: (
        req: IncomingMessage & { id?: string; originalUrl?: string },
        res: ServerResponse
      ) => ({
        requestId: req.id,
        route: req.originalUrl ?? req.url,
        httpStatus: res.statusCode,
      }),

      customSuccessMessage: (req, res) =>
        `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode} — ${err.message}`,

      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
              messageKey: 'message',
            },
          }
        : undefined,

      messageKey: 'message',
    },
  };
}
