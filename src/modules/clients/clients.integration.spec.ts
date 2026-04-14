// Integration tests — validates the HTTP pipeline for the Clients endpoints:
// ValidationPipe, JwtAuthGuard, GoldenRuleExceptionFilter, GoldenRuleInterceptor
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../../common/interceptors/golden-rule.interceptor';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

const MOCK_USER_ID = 'user-uuid-123';

const mockClient = {
  id: 'client-uuid-1',
  userId: MOCK_USER_ID,
  name: 'Sophie Martin',
  email: 'sophie@acme.fr',
  company: 'Acme SAS',
  addressLine1: '42 rue du Commerce',
  zipCode: '75015',
  city: 'Paris',
  country: 'FR',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Clients — HTTP Pipeline (Integration)', () => {
  let app: INestApplication;
  let mockClientsService: jest.Mocked<ClientsService>;

  beforeAll(async () => {
    mockClientsService = {
      create: jest.fn().mockResolvedValue(mockClient),
      findAll: jest.fn().mockResolvedValue([mockClient]),
      findOne: jest.fn().mockResolvedValue(mockClient),
      update: jest.fn().mockResolvedValue({ ...mockClient, name: 'Updated Name' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: mockClientsService },
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

  // ─── POST /clients ────────────────────────────────────────────────────────────

  describe('POST /api/v1/clients', () => {
    const validBody = {
      name: 'Sophie Martin',
      email: 'sophie@acme.fr',
      company: 'Acme SAS',
      addressLine1: '42 rue du Commerce',
      zipCode: '75015',
      city: 'Paris',
      country: 'FR',
    };

    it('should create a client and return 201 with the created resource', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send(validBody)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(mockClient.name);
      expect(mockClientsService.create).toHaveBeenCalledWith(MOCK_USER_ID, validBody);
    });

    it('should strip unknown fields from request (liberal acceptance)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({ ...validBody, unknownField: 'ignored', nested: { foo: 'bar' } })
        .expect(201);

      // unknownField must not reach the service
      expect(mockClientsService.create).toHaveBeenCalledWith(
        MOCK_USER_ID,
        expect.not.objectContaining({ unknownField: expect.anything() })
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({ name: 'Only Name' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it('should return 400 when addressLine1 is missing', async () => {
      const { addressLine1: _, ...bodyWithoutAddress } = validBody;
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send(bodyWithoutAddress)
        .expect(400);
    });

    it('should return 400 when zipCode is missing', async () => {
      const { zipCode: _, ...bodyWithoutZip } = validBody;
      await request(app.getHttpServer()).post('/api/v1/clients').send(bodyWithoutZip).expect(400);
    });

    it('should return 400 when city is missing', async () => {
      const { city: _, ...bodyWithoutCity } = validBody;
      await request(app.getHttpServer()).post('/api/v1/clients').send(bodyWithoutCity).expect(400);
    });

    it('should create a client without country (defaults to FR)', async () => {
      const { country: _, ...bodyWithoutCountry } = validBody;
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send(bodyWithoutCountry)
        .expect(201);
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);

      expect(res.body.message).toContain("L'email doit être une adresse email valide");
    });

    it('should return 400 when name is an empty string', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({ ...validBody, name: '' })
        .expect(400);
    });
  });

  // ─── GET /clients ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/clients', () => {
    it('should return 200 with an array of clients', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/clients').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(mockClientsService.findAll).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should return 200 with an empty array when user has no clients', async () => {
      mockClientsService.findAll.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/api/v1/clients').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─── GET /clients/:id ─────────────────────────────────────────────────────────

  describe('GET /api/v1/clients/:id', () => {
    it('should return 200 with the client when found', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${mockClient.id}`)
        .expect(200);

      expect(res.body.id).toBe(mockClient.id);
      expect(mockClientsService.findOne).toHaveBeenCalledWith(mockClient.id, MOCK_USER_ID);
    });

    it('should return 404 when client does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockClientsService.findOne.mockRejectedValueOnce(new NotFoundException('Client introuvable'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/clients/non-existent-id')
        .expect(404);

      expect(res.body.message).toBe('Client introuvable');
    });
  });

  // ─── PATCH /clients/:id ───────────────────────────────────────────────────────

  describe('PATCH /api/v1/clients/:id', () => {
    it('should return 200 with the updated client', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/clients/${mockClient.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
      expect(mockClientsService.update).toHaveBeenCalledWith(mockClient.id, MOCK_USER_ID, {
        name: 'Updated Name',
      });
    });

    it('should accept a partial body (only fields to update)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/clients/${mockClient.id}`)
        .send({ company: 'New Company SAS' })
        .expect(200);
    });

    it('should return 400 for invalid email in update body', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/clients/${mockClient.id}`)
        .send({ email: 'bad-email' })
        .expect(400);
    });

    it('should return 404 when client does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockClientsService.update.mockRejectedValueOnce(new NotFoundException('Client introuvable'));

      await request(app.getHttpServer())
        .patch('/api/v1/clients/non-existent-id')
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  // ─── DELETE /clients/:id ──────────────────────────────────────────────────────

  describe('DELETE /api/v1/clients/:id', () => {
    it('should return 204 No Content on successful deletion', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/clients/${mockClient.id}`).expect(204);

      expect(mockClientsService.remove).toHaveBeenCalledWith(mockClient.id, MOCK_USER_ID);
    });

    it('should return 404 when client does not exist or belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockClientsService.remove.mockRejectedValueOnce(new NotFoundException('Client introuvable'));

      await request(app.getHttpServer()).delete('/api/v1/clients/non-existent-id').expect(404);
    });
  });
});
