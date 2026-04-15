import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import type { Options } from 'pino-http';
import type { Params } from 'nestjs-pino';
import { ecsFormat } from '@elastic/ecs-pino-format';
import { createElasticsearchPinoStream, parseElasticsearchEnv } from './elasticsearch-pino.stream';

/** Exported for unit tests — keep in sync with `createPinoLoggerParams` redact block. */
export const pinoHttpRedact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'http.request.headers.authorization',
    'http.request.headers.cookie',
    'http.request.headers["x-api-key"]',
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

function buildPinoHttpOptions(isDev: boolean, useEcs: boolean): Options {
  const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

  const shared: Partial<Options> = {
    level,

    genReqId: (req: IncomingMessage) =>
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),

    redact: { ...pinoHttpRedact },

    customSuccessMessage: (req, res) =>
      `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode} — ${err.message}`,

    messageKey: 'message',
  };

  if (useEcs) {
    const ecs = ecsFormat({
      convertReqRes: true,
      serviceName: 'freelanceflow-api',
      serviceEnvironment: process.env.NODE_ENV ?? 'development',
      apmIntegration: false,
    });
    return {
      ...ecs,
      ...shared,
      messageKey: 'message',
    } as Options;
  }

  return {
    ...shared,
    base: {
      service: 'freelanceflow-api',
      env: process.env.NODE_ENV ?? 'development',
    },

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
  } as Options;
}

function pinoPrettyTransport() {
  return pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      messageKey: 'message',
    },
  });
}

/**
 * Factory so `NODE_ENV` / `LOG_LEVEL` are read when Nest bootstraps the module
 * (not at import time), which lets e2e tests force production JSON formatting.
 *
 * Production JSON uses **ECS** (`@elastic/ecs-pino-format`) for Elasticsearch / Kibana.
 * When `ELASTICSEARCH_URL` + auth are set (any `NODE_ENV`), logs use ECS so shipping matches stdout.
 *
 * Optional: `ELASTICSEARCH_*` duplicates to Elasticsearch (bulk).
 */
export function createPinoLoggerParams(): Params {
  const isDev = process.env.NODE_ENV !== 'production';
  const esConfig = parseElasticsearchEnv();
  const useEcs = !isDev || Boolean(esConfig);
  const base = buildPinoHttpOptions(isDev, useEcs);
  const logLevel = (process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info')) as pino.LevelWithSilent;

  const remoteStreams: pino.DestinationStream[] = [];
  if (esConfig) {
    remoteStreams.push(createElasticsearchPinoStream(esConfig));
  }

  if (remoteStreams.length > 0) {
    if (isDev) {
      const ms = pino.multistream([
        { level: logLevel, stream: pinoPrettyTransport() },
        ...remoteStreams.map((stream) => ({ level: logLevel, stream })),
      ]);
      return { pinoHttp: [base, ms] };
    }

    const ms = pino.multistream([
      { level: logLevel, stream: process.stdout },
      ...remoteStreams.map((stream) => ({ level: logLevel, stream })),
    ]);
    return { pinoHttp: [base, ms] };
  }

  if (isDev) {
    return {
      pinoHttp: {
        ...base,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageKey: 'message',
          },
        },
      },
    };
  }

  return { pinoHttp: base };
}
