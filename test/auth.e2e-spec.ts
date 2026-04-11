/**
 * Auth E2E Tests
 *
 * These tests run against a REAL database and a fully bootstrapped NestJS app.
 * They require DATABASE_URL to be set in the environment (or .env file).
 *
 * Run: npm run test:e2e
 *
 * What this layer tests that unit/integration tests cannot:
 *  - Real password hashing round-trip (bcrypt)
 *  - Real JWT signing and verification with the configured secret
 *  - Real database writes, reads, and token rotation
 *  - Cookie headers on actual HTTP responses
 *  - The complete auth flow from register → login → refresh → logout
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GoldenRuleExceptionFilter } from '../src/common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../src/common/interceptors/golden-rule.interceptor';

// Neon/PostgreSQL connections can be slow — give each test and hooks enough time
jest.setTimeout(30000);

// Skip the entire suite if no database is configured (local dev without DB, some CI environments)
const runE2E = !!process.env.DATABASE_URL;
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Auth — E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: `e2e-${Date.now()}@freelanceflow.test`,
    password: 'SecurePass123!',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        skipMissingProperties: false,
      })
    );
    app.useGlobalFilters(new GoldenRuleExceptionFilter());
    app.useGlobalInterceptors(new GoldenRuleInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data so re-runs work
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await app.close();
  });

  // ─── Register ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should create a new user and return access_token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('should return 409 Conflict when registering the same email twice', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);

      expect(res.body.message).toContain('existe déjà');
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'valid@example.com', password: '123' })
        .expect(400);
    });
  });

  // ─── Login ───────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should return access_token and set refreshToken cookie on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(testUser)
        .expect(200);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.passwordHash).toBeUndefined();

      // Refresh token must be in an HttpOnly cookie, never in the response body
      const cookie = res.headers['set-cookie'] as unknown as string[];
      expect(cookie).toBeDefined();
      const refreshCookie = cookie.find((c: string) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toContain('Email ou mot de passe incorrect');
    });

    it('should return 401 for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'password123' })
        .expect(401);

      // Same message as wrong password — prevents user enumeration
      expect(res.body.message).toContain('Email ou mot de passe incorrect');
    });
  });

  // ─── Full auth flow ───────────────────────────────────────────────────────────

  describe('Full auth flow: login → refresh → logout', () => {
    let refreshTokenCookie: string;
    let accessToken: string;

    it('step 1 — login and capture tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(testUser)
        .expect(200);

      accessToken = res.body.access_token;
      const cookies = res.headers['set-cookie'] as unknown as string[];
      // Extract only "name=value" — strip path/httponly/samesite attributes
      const raw = cookies.find((c: string) => c.startsWith('refreshToken='))!;
      refreshTokenCookie = raw.split(';')[0];
      expect(refreshTokenCookie).toBeDefined();
    });

    it('step 2 — use refresh token to get new access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(res.body.access_token).toBeDefined();
      // New token must differ from the original (token rotation)
      expect(res.body.access_token).not.toBe(accessToken);

      // Capture rotated cookie (name=value only) for next step
      const cookies = res.headers['set-cookie'] as unknown as string[];
      if (cookies) {
        const raw = cookies.find((c: string) => c.startsWith('refreshToken='));
        if (raw) refreshTokenCookie = raw.split(';')[0];
      }
    });

    it('step 3 — logout invalidates the session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(res.body.message).toBe('Déconnexion réussie');
    });

    it('step 4 — refresh token is rejected after logout', async () => {
      // The token stored in DB was deleted during logout, so refresh must fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(401);
    });
  });
});
