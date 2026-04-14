import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaHealthIndicator } from '../src/common/health/prisma.health-indicator';
import { Logger } from 'nestjs-pino';

jest.setTimeout(30000);

const runE2E = !!process.env.DATABASE_URL;
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Health (GET /api/v1/health) — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
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
    await app?.close();
  });

  it('returns 200 with gitSha and env when database is up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      gitSha: expect.any(String) as string,
      env: expect.any(String) as string,
    });
    expect(res.body.version).toBeUndefined();
    expect(res.body.details?.database?.status).toBe('up');
  });
});

describeE2E('Health — E2E degraded (mocked database failure)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 503 when the database health indicator fails', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaHealthIndicator)
      .useValue({
        isHealthy: jest.fn().mockImplementation(async () => {
          throw new HealthCheckError('Database check failed', {
            database: { status: 'down', message: 'mock unreachable' },
          });
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
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

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    // Unhealthy Terminus result is wrapped by GoldenRuleExceptionFilter (503 JSON envelope).
    expect(res.body.statusCode).toBe(503);
    expect(res.body.path).toEqual(expect.stringContaining('/health'));
    expect(
      typeof res.body.error === 'string' ? res.body.error : JSON.stringify(res.body.error)
    ).toMatch(/database|Service|Indisponible|Unavailable/i);
  });
});
