// Integration tests — validates the HTTP pipeline for the PDF endpoints:
// JwtAuthGuard, content-type header, 404 handling
import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { APP_FILTER } from '@nestjs/core';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoldenRuleExceptionFilter } from '../../common/filters/golden-rule-exception.filter';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

const MOCK_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INVOICE_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// Minimal valid PDF header bytes so the test can verify binary output
const FAKE_PDF_BUFFER = Buffer.from('%PDF-1.4 fake content');

describe('PDF — HTTP Pipeline (Integration)', () => {
  let app: INestApplication;
  let mockPdfService: jest.Mocked<PdfService>;

  beforeAll(async () => {
    mockPdfService = {
      generateInvoicePdf: jest.fn().mockResolvedValue(FAKE_PDF_BUFFER),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        { provide: PdfService, useValue: mockPdfService },
        { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
        mockLoggerProvider(GoldenRuleExceptionFilter.name),
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => await app.close());

  beforeEach(() => jest.clearAllMocks());

  // ─── GET /pdf/invoices/:id ────────────────────────────────────────────────────

  describe('GET /api/v1/pdf/invoices/:id', () => {
    it('should return 200 with application/pdf content-type', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${INVOICE_ID}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('should set Content-Disposition attachment header with correct filename', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${INVOICE_ID}`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`invoice-${INVOICE_ID}.pdf`);
    });

    it('should return binary PDF content', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${INVOICE_ID}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should call generateInvoicePdf with the invoice id and user id', async () => {
      await request(app.getHttpServer()).get(`/api/v1/pdf/invoices/${INVOICE_ID}`).expect(200);

      expect(mockPdfService.generateInvoicePdf).toHaveBeenCalledWith(INVOICE_ID, MOCK_USER_ID);
    });

    it('should return 404 when invoice does not exist or belongs to another user', async () => {
      mockPdfService.generateInvoicePdf.mockRejectedValueOnce(
        new NotFoundException('Facture introuvable')
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/pdf/invoices/non-existent-id')
        .expect(404);

      expect(res.body.message).toBe('Facture introuvable');
    });
  });
});
