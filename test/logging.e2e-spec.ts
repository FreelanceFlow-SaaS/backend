/**
 * Captures one production JSON request log line from pino-http (nestjs-pino).
 * Requires DATABASE_URL — health probe touches Prisma.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Logger } from 'nestjs-pino';

jest.setTimeout(30000);

const runE2E = !!process.env.DATABASE_URL;
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Structured logging (production JSON, ECS) — E2E', () => {
  let app: INestApplication;
  let prevNodeEnv: string | undefined;
  let stdoutSpy: jest.SpyInstance;
  const stdoutChunks: string[] = [];

  beforeAll(async () => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown, ...args: unknown[]) => {
        const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        if (s.trimStart().startsWith('{')) {
          stdoutChunks.push(s);
        }
        const cb = args.find((a) => typeof a === 'function') as (() => void) | undefined;
        if (cb) {
          queueMicrotask(() => cb());
        }
        return true;
      });

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        skipMissingProperties: false,
      })
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    stdoutSpy.mockRestore();
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
    await app?.close();
  });

  it('emits ECS-shaped JSON with correlation and exposes X-Request-Id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const requestIdHeader = res.headers['x-request-id'] as string | undefined;
    expect(requestIdHeader).toBeDefined();

    const jsonLine = stdoutChunks
      .map((c) => c.trim())
      .find((line) => {
        try {
          const o = JSON.parse(line) as Record<string, unknown>;
          return o['service.name'] === 'freelanceflow-api' && typeof o.responseTime === 'number';
        } catch {
          return false;
        }
      });

    expect(jsonLine).toBeDefined();
    const log = JSON.parse(jsonLine!) as Record<string, unknown>;

    expect(log).toMatchObject({
      'service.name': 'freelanceflow-api',
      'service.environment': 'production',
      'log.level': expect.any(String) as string,
      message: expect.any(String) as string,
      'http.request.id': requestIdHeader,
    });
    expect(typeof log['ecs.version']).toBe('string');
    expect(log).toHaveProperty('@timestamp');
    expect((log.http as Record<string, unknown>)?.response).toEqual(
      expect.objectContaining({ status_code: 200 })
    );
    expect((log.http as Record<string, unknown>)?.request).toEqual(
      expect.objectContaining({ method: 'GET' })
    );
    expect(log.url).toEqual(expect.objectContaining({ path: '/api/v1/health' }));

    expect(Object.keys(log)).toEqual(
      expect.arrayContaining([
        '@timestamp',
        'ecs.version',
        'event.dataset',
        'http',
        'log.level',
        'message',
        'responseTime',
        'service.environment',
        'service.name',
        'url',
      ])
    );
    expect(typeof log.responseTime).toBe('number');
    expect(typeof log['@timestamp']).toBe('string');
    expect(typeof log.message).toBe('string');
    expect(typeof log['log.level']).toBe('string');
  });
});
