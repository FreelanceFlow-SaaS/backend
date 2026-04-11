// Integration tests — validates the HTTP pipeline for the Users endpoints:
// ValidationPipe, JwtAuthGuard, GoldenRuleExceptionFilter, GoldenRuleInterceptor
import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../../common/interceptors/golden-rule.interceptor';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

const MOCK_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockProfile = {
  id: 'profile-uuid-1',
  userId: MOCK_USER_ID,
  displayName: 'Sophie Martin',
  legalName: 'Sophie Marie Martin',
  companyName: null,
  addressLine1: '123 rue de la Paix',
  addressLine2: null,
  postalCode: '75001',
  city: 'Paris',
  country: 'FR',
  vatNumber: null,
  siret: null,
  updatedAt: new Date(),
};

const mockUser = {
  id: MOCK_USER_ID,
  email: 'sophie@freelanceflow.test',
  passwordHash: '$2a$12$hashed',
  createdAt: new Date(),
  updatedAt: new Date(),
  profile: mockProfile,
};

describe('Users — HTTP Pipeline (Integration)', () => {
  let app: INestApplication;
  let mockUsersService: jest.Mocked<UsersService>;

  beforeAll(async () => {
    mockUsersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      getProfile: jest.fn().mockResolvedValue(mockUser),
      updateProfile: jest.fn().mockResolvedValue(mockUser),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: GoldenRuleInterceptor },
        mockLoggerProvider(GoldenRuleExceptionFilter.name),
        mockLoggerProvider(GoldenRuleInterceptor.name),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: MOCK_USER_ID };
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

  afterAll(async () => await app.close());

  beforeEach(() => jest.clearAllMocks());

  // ─── GET /users/profile ───────────────────────────────────────────────────────

  describe('GET /api/v1/users/profile', () => {
    it('should return 200 with the user profile', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users/profile').expect(200);

      expect(res.body.id).toBe(MOCK_USER_ID);
      expect(res.body.profile.displayName).toBe('Sophie Martin');
      expect(mockUsersService.getProfile).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should strip passwordHash from response (GoldenRuleInterceptor)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users/profile').expect(200);

      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should return 404 when user does not exist', async () => {
      mockUsersService.getProfile.mockRejectedValueOnce(
        new NotFoundException('Utilisateur introuvable')
      );

      const res = await request(app.getHttpServer()).get('/api/v1/users/profile').expect(404);

      expect(res.body.message).toBe('Utilisateur introuvable');
    });
  });

  // ─── PATCH /users/profile ─────────────────────────────────────────────────────

  describe('PATCH /api/v1/users/profile', () => {
    it('should return 200 with updated profile', async () => {
      const updatedUser = { ...mockUser, profile: { ...mockProfile, city: 'Lyon' } };
      mockUsersService.updateProfile.mockResolvedValueOnce(updatedUser as any);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ city: 'Lyon' })
        .expect(200);

      expect(res.body.profile.city).toBe('Lyon');
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(MOCK_USER_ID, { city: 'Lyon' });
    });

    it('should accept partial body (only fields to update)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ displayName: 'Sophie Dupont' })
        .expect(200);

      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(MOCK_USER_ID, {
        displayName: 'Sophie Dupont',
      });
    });

    it('should strip unknown fields from request body', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ city: 'Lyon', unknownField: 'ignored' })
        .expect(200);

      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        MOCK_USER_ID,
        expect.not.objectContaining({ unknownField: expect.anything() })
      );
    });

    it('should return 400 for an invalid postalCode (not 5 chars)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ postalCode: '750' })
        .expect(400);
    });

    it('should return 400 for an invalid country code (not 2 chars)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ country: 'FRA' })
        .expect(400);
    });

    it('should return 400 for an invalid SIRET (not 14 chars)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ siret: '12345' })
        .expect(400);
    });

    it('should return 400 for an empty displayName', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ displayName: '' })
        .expect(400);
    });

    it('should return 404 when user does not exist', async () => {
      mockUsersService.updateProfile.mockRejectedValueOnce(
        new NotFoundException('Utilisateur introuvable')
      );

      await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ city: 'Lyon' })
        .expect(404);
    });

    it('should strip passwordHash from response (GoldenRuleInterceptor)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .send({ city: 'Lyon' })
        .expect(200);

      expect(res.body.passwordHash).toBeUndefined();
    });
  });
});
