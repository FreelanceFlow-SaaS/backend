import { randomUUID } from 'crypto';
import { Params } from 'nestjs-pino';

const isDev = process.env.NODE_ENV !== 'production';

export const pinoLoggerConfig: Params = {
  pinoHttp: {
    // Respect LOG_LEVEL env var; default to debug in dev, info in prod
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

    // Honour an upstream X-Request-ID header (useful behind a gateway);
    // otherwise generate a fresh UUID for every request.
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),

    // Static fields present on every log line
    base: {
      service: 'freelanceflow-api',
      env: process.env.NODE_ENV ?? 'development',
    },

    // ── PII Redaction ───────────────────────────────────────────────────────
    // These paths are REPLACED with '[REDACTED]' before the log is written.
    // Nothing downstream (Datadog, Loki, Elastic) ever receives the raw value.
    redact: {
      paths: [
        'req.headers.authorization', // Bearer token
        'req.headers.cookie', // HttpOnly refresh token cookie
        'req.body.password', // Login / register payloads
        'req.body.passwordHash', // Should never appear, but guard anyway
        'req.body.refreshToken',
      ],
      censor: '[REDACTED]',
    },

    // ── Request / Response Serialisers ──────────────────────────────────────
    // Keep request logs lean — only fields useful for tracing/debugging.
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          request_id: req.id,
          user_agent: req.headers['user-agent'],
        };
      },
      res(res) {
        return { status_code: res.statusCode };
      },
    },

    // Static message templates for automatic request/response lines
    customSuccessMessage: (req, res) => `${req.method} ${(req as any).url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${(req as any).url} → ${res.statusCode} — ${err.message}`,

    // ── Transport ────────────────────────────────────────────────────────────
    // In development: pretty-print with colours and human timestamps.
    // In production: raw JSON to stdout — let the infra (Fluentbit, Promtail)
    // ship it to Loki / Elastic / Datadog.
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

    // Use 'message' instead of pino's default 'msg' — aligns with the schema
    // in the team logging spec and with most log aggregators' default field name.
    messageKey: 'message',
  },
};
