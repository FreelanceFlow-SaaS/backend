// Integration tests — validates the HTTP pipeline for the Invoices endpoints:
// ValidationPipe, JwtAuthGuard, GoldenRuleExceptionFilter, GoldenRuleInterceptor
import {
  INestApplication,
  ValidationPipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../../common/interceptors/golden-rule.interceptor';
import { mockLoggerProvider } from '../../common/testing/mock-logger';
import {
  testThrottlerImports,
  testThrottlerProviders,
} from '../../common/testing/throttler-test.module';
import { MailService } from '../mail/mail.service';
import { INVOICE_EMAIL_ENQUEUE } from '../invoice-email/invoice-email-enqueue.token';

const MOCK_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INVOICE_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CLIENT_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const mockInvoice = {
  id: INVOICE_ID,
  userId: MOCK_USER_ID,
  clientId: CLIENT_ID,
  invoiceNumber: 'FF-2024-0001',
  status: InvoiceStatus.draft,
  issueDate: new Date('2024-01-15'),
  dueDate: new Date('2024-02-15'),
  currency: 'EUR',
  totalHt: new Prisma.Decimal('300.00'),
  totalVat: new Prisma.Decimal('60.00'),
  totalTtc: new Prisma.Decimal('360.00'),
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
  lines: [
    {
      id: 'line-uuid-1',
      invoiceId: INVOICE_ID,
      serviceId: null,
      lineOrder: 1,
      description: 'Consulting',
      quantity: new Prisma.Decimal('2.00'),
      unitPriceHt: new Prisma.Decimal('150.00'),
      vatRate: new Prisma.Decimal('0.2000'),
      lineHt: new Prisma.Decimal('300.00'),
      lineVat: new Prisma.Decimal('60.00'),
      lineTtc: new Prisma.Decimal('360.00'),
      createdAt: new Date(),
    },
  ],
  client: { id: CLIENT_ID, name: 'Sophie Martin' },
};

const validCreateBody = {
  clientId: CLIENT_ID,
  issueDate: '2024-01-15',
  dueDate: '2024-02-15',
  lines: [{ lineOrder: 1, description: 'Consulting', quantity: 2, unitPriceHt: 150, vatRate: 0.2 }],
};

describe('Invoices — HTTP Pipeline (Integration)', () => {
  let app: INestApplication;
  let mockInvoicesService: jest.Mocked<InvoicesService>;
  const mockInvoiceEmailEnqueue = {
    enqueueSendInvoiceEmail: jest.fn().mockResolvedValue('test-job-id'),
  };
  const mockMailService = {
    isConfigured: jest.fn(() => true),
  };

  beforeAll(async () => {
    mockInvoicesService = {
      create: jest.fn().mockResolvedValue(mockInvoice),
      findAll: jest.fn().mockResolvedValue([mockInvoice]),
      findOne: jest.fn().mockResolvedValue(mockInvoice),
      update: jest.fn().mockResolvedValue({ ...mockInvoice, currency: 'USD' }),
      updateLines: jest.fn().mockResolvedValue(mockInvoice),
      updateStatus: jest.fn().mockResolvedValue({ ...mockInvoice, status: InvoiceStatus.sent }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [...testThrottlerImports],
      controllers: [InvoicesController],
      providers: [
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: INVOICE_EMAIL_ENQUEUE, useValue: mockInvoiceEmailEnqueue },
        { provide: MailService, useValue: mockMailService },
        { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: GoldenRuleInterceptor },
        mockLoggerProvider(GoldenRuleExceptionFilter.name),
        mockLoggerProvider(GoldenRuleInterceptor.name),
        ...testThrottlerProviders,
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

  // ─── POST /invoices ───────────────────────────────────────────────────────────

  describe('POST /api/v1/invoices', () => {
    it('should create an invoice and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(validCreateBody)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.invoiceNumber).toBe('FF-2024-0001');
      expect(mockInvoicesService.create).toHaveBeenCalledWith(MOCK_USER_ID, validCreateBody);
    });

    it('should strip unknown fields from request body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({ ...validCreateBody, unknownField: 'ignored' })
        .expect(201);

      expect(mockInvoicesService.create).toHaveBeenCalledWith(
        MOCK_USER_ID,
        expect.not.objectContaining({ unknownField: expect.anything() })
      );
    });

    it('should return 400 when clientId is missing', async () => {
      const { clientId: _, ...body } = validCreateBody;
      await request(app.getHttpServer()).post('/api/v1/invoices').send(body).expect(400);
    });

    it('should return 400 when issueDate is missing', async () => {
      const { issueDate: _, ...body } = validCreateBody;
      await request(app.getHttpServer()).post('/api/v1/invoices').send(body).expect(400);
    });

    it('should return 400 when lines array is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({ ...validCreateBody, lines: [] })
        .expect(400);
    });

    it('should return 400 when a line has a negative quantity', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({
          ...validCreateBody,
          lines: [
            { lineOrder: 1, description: 'Test', quantity: -1, unitPriceHt: 100, vatRate: 0.2 },
          ],
        })
        .expect(400);
    });

    it('should return 400 when a line has a negative unit price', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({
          ...validCreateBody,
          lines: [
            { lineOrder: 1, description: 'Test', quantity: 1, unitPriceHt: -50, vatRate: 0.2 },
          ],
        })
        .expect(400);
    });

    it('should return 400 when vatRate exceeds 1', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({
          ...validCreateBody,
          lines: [
            { lineOrder: 1, description: 'Test', quantity: 1, unitPriceHt: 100, vatRate: 1.5 },
          ],
        })
        .expect(400);
    });

    it('should return 400 when line description is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({
          ...validCreateBody,
          lines: [{ lineOrder: 1, description: '', quantity: 1, unitPriceHt: 100, vatRate: 0.2 }],
        })
        .expect(400);
    });

    it('should return 404 when client does not belong to user', async () => {
      mockInvoicesService.create.mockRejectedValueOnce(new NotFoundException('Client introuvable'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(validCreateBody)
        .expect(404);

      expect(res.body.message).toBe('Client introuvable');
    });
  });

  // ─── GET /invoices ────────────────────────────────────────────────────────────

  describe('GET /api/v1/invoices', () => {
    it('should return 200 with an array of invoices', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/invoices').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(mockInvoicesService.findAll).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should return 200 with an empty array when user has no invoices', async () => {
      mockInvoicesService.findAll.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/api/v1/invoices').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─── GET /invoices/:id ────────────────────────────────────────────────────────

  describe('GET /api/v1/invoices/:id', () => {
    it('should return 200 with the invoice when found', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${INVOICE_ID}`)
        .expect(200);

      expect(res.body.id).toBe(INVOICE_ID);
      expect(mockInvoicesService.findOne).toHaveBeenCalledWith(INVOICE_ID, MOCK_USER_ID);
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockInvoicesService.findOne.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices/non-existent-id')
        .expect(404);

      expect(res.body.message).toBe('Facture introuvable');
    });
  });

  // ─── PATCH /invoices/:id ──────────────────────────────────────────────────────

  describe('PATCH /api/v1/invoices/:id', () => {
    it('should return 200 with the updated invoice', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}`)
        .send({ currency: 'USD' })
        .expect(200);

      expect(res.body.currency).toBe('USD');
      expect(mockInvoicesService.update).toHaveBeenCalledWith(INVOICE_ID, MOCK_USER_ID, {
        currency: 'USD',
      });
    });

    it('should return 400 when invoice is not in draft status', async () => {
      mockInvoicesService.update.mockRejectedValueOnce(
        new BadRequestException('Seules les factures en brouillon peuvent être modifiées')
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}`)
        .send({ currency: 'USD' })
        .expect(400);
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockInvoicesService.update.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      await request(app.getHttpServer())
        .patch('/api/v1/invoices/non-existent-id')
        .send({ currency: 'USD' })
        .expect(404);
    });
  });

  // ─── PATCH /invoices/:id/lines ────────────────────────────────────────────────

  describe('PATCH /api/v1/invoices/:id/lines', () => {
    const linesBody = {
      lines: [
        { lineOrder: 1, description: 'New line', quantity: 3, unitPriceHt: 100, vatRate: 0.2 },
      ],
    };

    it('should return 200 with updated invoice when lines are replaced', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/lines`)
        .send(linesBody)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(mockInvoicesService.updateLines).toHaveBeenCalledWith(
        INVOICE_ID,
        MOCK_USER_ID,
        linesBody
      );
    });

    it('should return 400 when lines array is empty', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/lines`)
        .send({ lines: [] })
        .expect(400);
    });

    it('should return 400 when invoice is not in draft status', async () => {
      mockInvoicesService.updateLines.mockRejectedValueOnce(
        new BadRequestException('Seules les factures en brouillon peuvent être modifiées')
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/lines`)
        .send(linesBody)
        .expect(400);
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockInvoicesService.updateLines.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      await request(app.getHttpServer())
        .patch('/api/v1/invoices/non-existent-id/lines')
        .send(linesBody)
        .expect(404);
    });
  });

  // ─── PATCH /invoices/:id/status ───────────────────────────────────────────────

  describe('PATCH /api/v1/invoices/:id/status', () => {
    it('should return 200 with the updated invoice status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/status`)
        .send({ status: 'sent' })
        .expect(200);

      expect(res.body.status).toBe(InvoiceStatus.sent);
      expect(mockInvoicesService.updateStatus).toHaveBeenCalledWith(INVOICE_ID, MOCK_USER_ID, {
        status: 'sent',
      });
    });

    it('should return 400 for an invalid status value', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/status`)
        .send({ status: 'invalid-status' })
        .expect(400);
    });

    it('should return 400 for an invalid transition', async () => {
      mockInvoicesService.updateStatus.mockRejectedValueOnce(
        new BadRequestException('Transition de statut invalide: draft → paid')
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${INVOICE_ID}/status`)
        .send({ status: 'paid' })
        .expect(400);

      expect(res.body.message).toContain('Transition de statut invalide');
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockInvoicesService.updateStatus.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      await request(app.getHttpServer())
        .patch('/api/v1/invoices/non-existent-id/status')
        .send({ status: 'sent' })
        .expect(404);
    });
  });

  // ─── POST /invoices/:id/send-email ───────────────────────────────────────────

  describe('POST /api/v1/invoices/:id/send-email', () => {
    it('should return 202 with jobId when SMTP is configured', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/invoices/${INVOICE_ID}/send-email`)
        .send({
          to: ['client@example.com'],
          subject: 'Facture',
          body: 'Bonjour, merci.',
        })
        .expect(202);

      expect(res.body.jobId).toBe('test-job-id');
      expect(res.body.status).toBe('accepted');
      expect(mockInvoiceEmailEnqueue.enqueueSendInvoiceEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_USER_ID,
          invoiceId: INVOICE_ID,
          to: ['client@example.com'],
          subject: 'Facture',
          body: 'Bonjour, merci.',
        })
      );
    });

    it('should return 503 when SMTP is not configured', async () => {
      mockMailService.isConfigured.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${INVOICE_ID}/send-email`)
        .send({ to: ['a@b.co'], subject: 'S', body: 'B' })
        .expect(503);
      mockMailService.isConfigured.mockReturnValue(true);
    });
  });

  // ─── DELETE /invoices/:id ─────────────────────────────────────────────────────

  describe('DELETE /api/v1/invoices/:id', () => {
    it('should return 204 No Content on successful deletion', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/invoices/${INVOICE_ID}`).expect(204);

      expect(mockInvoicesService.remove).toHaveBeenCalledWith(INVOICE_ID, MOCK_USER_ID);
    });

    it('should return 400 when trying to delete a sent invoice', async () => {
      mockInvoicesService.remove.mockRejectedValueOnce(
        new BadRequestException(
          'Seules les factures en brouillon ou annulées peuvent être supprimées'
        )
      );

      await request(app.getHttpServer()).delete(`/api/v1/invoices/${INVOICE_ID}`).expect(400);
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockInvoicesService.remove.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      await request(app.getHttpServer()).delete('/api/v1/invoices/non-existent-id').expect(404);
    });
  });
});
