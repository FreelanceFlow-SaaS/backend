// Golden Rule Test — validates the HTTP pipeline: ValidationPipe, GoldenRuleInterceptor, GoldenRuleExceptionFilter
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../../common/interceptors/golden-rule.interceptor';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

const makeUser = (email: string) => ({
  id: 'test-uuid',
  email,
  createdAt: new Date(),
  passwordHash: 'hashed-secret', // must be stripped by interceptor
});

describe('Golden Rule — HTTP Pipeline', () => {
  let app: INestApplication;
  let mockAuthService: jest.Mocked<
    Pick<AuthService, 'register' | 'login' | 'logout' | 'refresh' | 'validateUser'>
  >;

  beforeAll(async () => {
    mockAuthService = {
      register: jest.fn().mockResolvedValue({
        access_token: 'mock-token',
        user: makeUser('test@example.com'),
        passwordHash: 'should-be-stripped',
        refreshToken: 'should-be-stripped',
      }),
      login: jest.fn().mockResolvedValue({
        access_token: 'mock-token',
        user: makeUser('test@example.com'),
        passwordHash: 'should-be-stripped',
      }),
      logout: jest.fn().mockResolvedValue({ message: 'Déconnexion réussie' }),
      refresh: jest.fn().mockResolvedValue({ access_token: 'new-mock-token' }),
      validateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: GoldenRuleInterceptor },
        mockLoggerProvider(GoldenRuleExceptionFilter.name),
        mockLoggerProvider(GoldenRuleInterceptor.name),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'test-uuid', email: 'test@example.com' };
          return true;
        },
      })
      .compile();

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
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /auth/register ─────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('should not throw errors for unknown fields (liberal acceptance)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          deviceId: 'mobile-123',
          appVersion: '2.0.0',
          randomData: { foo: 'bar' },
        })
        .expect(201);
    });

    it('should strip sensitive fields from response (conservative output)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);

      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('should return French validation errors for invalid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: '123' })
        .expect(400);

      expect(res.body.message).toContain("L'email doit être une adresse email valide");
      expect(res.body.message).toContain('Le mot de passe doit contenir au moins 8 caractères');
      expect(res.body.error).toBe('Bad Request');
    });

    it('should return 400 when required fields are missing', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({}).expect(400);
    });

    it('should produce identical response shape for old and new client versions', async () => {
      mockAuthService.register
        .mockResolvedValueOnce({ access_token: 'token', user: makeUser('old@client.com') })
        .mockResolvedValueOnce({ access_token: 'token', user: makeUser('new@client.com') });

      const [oldRes, newRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({ email: 'old@client.com', password: 'password123' }),
        request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({ email: 'new@client.com', password: 'password123', extraField: 'ignored' }),
      ]);

      expect(Object.keys(oldRes.body)).toEqual(Object.keys(newRes.body));
    });
  });

  // ─── POST /auth/login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should return 200 with access_token and safe user on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should strip sensitive fields from login response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should return 400 for invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when body is empty', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(400);
    });
  });

  // ─── POST /auth/logout ───────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should return 200 and success message when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', 'refreshToken=some-valid-token')
        .expect(200);

      expect(res.body.message).toBe('Déconnexion réussie');
    });

    it('should call authService.logout with userId from JWT and token from cookie', async () => {
      mockAuthService.logout.mockClear();

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', 'refreshToken=some-token')
        .expect(200);

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'test-uuid',
        'some-token',
        expect.anything()
      );
    });
  });

  // ─── POST /auth/refresh ──────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('should return new access_token when refresh cookie is present', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=valid-refresh-token')
        .expect(200);

      expect(res.body.access_token).toBe('new-mock-token');
    });

    it('should return 500 when no refresh token cookie is provided', async () => {
      // Controller throws generic Error (not HttpException) when cookie is missing
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(500);
    });
  });
});
