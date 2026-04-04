// Integration tests — validates the HTTP pipeline for the Services endpoints:
// ValidationPipe, JwtAuthGuard, GoldenRuleExceptionFilter, GoldenRuleInterceptor
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../../common/interceptors/golden-rule.interceptor';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

const MOCK_USER_ID = 'user-uuid-123';

const mockService = {
  id: 'service-uuid-1',
  userId: MOCK_USER_ID,
  title: 'Développement backend',
  hourlyRateHt: '150.00', // Prisma returns Decimal as string-like object
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Services — HTTP Pipeline (Integration)', () => {
  let app: INestApplication;
  let mockServicesService: jest.Mocked<ServicesService>;

  beforeAll(async () => {
    mockServicesService = {
      create: jest.fn().mockResolvedValue(mockService),
      findAll: jest.fn().mockResolvedValue([mockService]),
      findOne: jest.fn().mockResolvedValue(mockService),
      update: jest.fn().mockResolvedValue({ ...mockService, title: 'Audit technique' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicesController],
      providers: [
        { provide: ServicesService, useValue: mockServicesService },
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

  // ─── POST /services ───────────────────────────────────────────────────────────

  describe('POST /api/v1/services', () => {
    const validBody = { title: 'Développement backend', hourlyRateHt: 150.0 };

    it('should create a service and return 201 with the created resource', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/services')
        .send(validBody)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe(mockService.title);
      expect(mockServicesService.create).toHaveBeenCalledWith(MOCK_USER_ID, validBody);
    });

    it('should strip unknown fields from request (liberal acceptance)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ ...validBody, unknownField: 'ignored' })
        .expect(201);

      expect(mockServicesService.create).toHaveBeenCalledWith(
        MOCK_USER_ID,
        expect.not.objectContaining({ unknownField: expect.anything() })
      );
    });

    it('should return 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ title: 'Only Title' })
        .expect(400);
    });

    it('should return 400 for a negative hourly rate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ title: 'Dev', hourlyRateHt: -50 })
        .expect(400);

      expect(res.body.message).toContain('Le taux horaire doit être supérieur à zéro');
    });

    it('should return 400 for a zero hourly rate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ title: 'Dev', hourlyRateHt: 0 })
        .expect(400);
    });

    it('should return 400 for a non-numeric hourly rate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ title: 'Dev', hourlyRateHt: 'not-a-number' })
        .expect(400);
    });

    it('should return 400 for an empty title', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .send({ title: '', hourlyRateHt: 150 })
        .expect(400);
    });
  });

  // ─── GET /services ────────────────────────────────────────────────────────────

  describe('GET /api/v1/services', () => {
    it('should return 200 with an array of services', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/services').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(mockServicesService.findAll).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should return 200 with an empty array when user has no services', async () => {
      mockServicesService.findAll.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/api/v1/services').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─── GET /services/:id ────────────────────────────────────────────────────────

  describe('GET /api/v1/services/:id', () => {
    it('should return 200 with the service when found', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/services/${mockService.id}`)
        .expect(200);

      expect(res.body.id).toBe(mockService.id);
      expect(mockServicesService.findOne).toHaveBeenCalledWith(mockService.id, MOCK_USER_ID);
    });

    it('should return 404 when service does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockServicesService.findOne.mockRejectedValueOnce(
        new NotFoundException('Prestation introuvable')
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/services/non-existent-id')
        .expect(404);

      expect(res.body.message).toBe('Prestation introuvable');
    });
  });

  // ─── PATCH /services/:id ──────────────────────────────────────────────────────

  describe('PATCH /api/v1/services/:id', () => {
    it('should return 200 with the updated service', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/services/${mockService.id}`)
        .send({ title: 'Audit technique' })
        .expect(200);

      expect(res.body.title).toBe('Audit technique');
      expect(mockServicesService.update).toHaveBeenCalledWith(mockService.id, MOCK_USER_ID, {
        title: 'Audit technique',
      });
    });

    it('should accept a partial body (only fields to update)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/services/${mockService.id}`)
        .send({ hourlyRateHt: 200 })
        .expect(200);
    });

    it('should return 400 for a negative rate in update body', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/services/${mockService.id}`)
        .send({ hourlyRateHt: -100 })
        .expect(400);
    });

    it('should return 404 when service does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockServicesService.update.mockRejectedValueOnce(
        new NotFoundException('Prestation introuvable')
      );

      await request(app.getHttpServer())
        .patch('/api/v1/services/non-existent-id')
        .send({ title: 'New Title' })
        .expect(404);
    });
  });

  // ─── DELETE /services/:id ─────────────────────────────────────────────────────

  describe('DELETE /api/v1/services/:id', () => {
    it('should return 204 No Content on successful deletion', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/services/${mockService.id}`).expect(204);

      expect(mockServicesService.remove).toHaveBeenCalledWith(mockService.id, MOCK_USER_ID);
    });

    it('should return 404 when service does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockServicesService.remove.mockRejectedValueOnce(
        new NotFoundException('Prestation introuvable')
      );

      await request(app.getHttpServer()).delete('/api/v1/services/non-existent-id').expect(404);
    });
  });
});
