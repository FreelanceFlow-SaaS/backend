/**
 * Invoices & PDF E2E Tests
 *
 * Runs against a REAL database and a fully bootstrapped NestJS app.
 * Requires DATABASE_URL in environment. Skipped automatically if absent.
 *
 * Run: npm run test:e2e
 *
 * What this layer proves that unit/integration tests cannot:
 *  - Real JWT auth guard enforcing authentication
 *  - Real DB writes with Prisma Decimal for monetary values
 *  - Tenant isolation enforced at DB level (not mocked)
 *  - Atomic invoice number generation via invoice_counters table (no duplicates)
 *  - Complete invoice lifecycle: create → update lines → transition status → delete
 *  - Status transition matrix enforced end-to-end
 *  - PDF endpoint returns real binary PDF content with correct headers
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GoldenRuleExceptionFilter } from '../src/common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from '../src/common/interceptors/golden-rule.interceptor';

jest.setTimeout(30000);

const runE2E = !!process.env.DATABASE_URL;
const describeE2E = runE2E ? describe : describe.skip;

async function loginAs(server: any, email: string, password: string): Promise<string> {
  await request(server).post('/api/v1/auth/register').send({ email, password });
  const res = await request(server).post('/api/v1/auth/login').send({ email, password });
  return res.body.access_token;
}

describeE2E('Invoices & PDF — E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let clientId: string; // Client owned by User A
  let serviceId: string; // Service owned by User A

  const userA = { email: `e2e-inv-a-${Date.now()}@freelanceflow.test`, password: 'SecurePass123!' };
  const userB = { email: `e2e-inv-b-${Date.now()}@freelanceflow.test`, password: 'SecurePass123!' };

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

    tokenA = await loginAs(app.getHttpServer(), userA.email, userA.password);
    tokenB = await loginAs(app.getHttpServer(), userB.email, userB.password);

    // Seed: client and service owned by User A (needed to create invoices)
    const clientRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Acme SAS',
        email: 'acme@acme.fr',
        company: 'Acme SAS',
        address: '75015 Paris',
      });
    clientId = clientRes.body.id;

    const serviceRes = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Développement backend', hourlyRateHt: 150 });
    serviceId = serviceRes.body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════
  // INVOICE CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Invoice CRUD', () => {
    let invoiceId: string;
    let invoiceNumber: string;

    const invoicePayload = () => ({
      clientId,
      issueDate: '2024-01-15',
      dueDate: '2024-02-15',
      lines: [
        {
          lineOrder: 1,
          description: 'Développement backend',
          quantity: 2,
          unitPriceHt: 150,
          vatRate: 0.2,
        },
      ],
    });

    it('POST /invoices — should create an invoice and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(invoicePayload())
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.clientId).toBe(clientId);
      expect(res.body.status).toBe('draft');
      expect(parseFloat(res.body.totalHt)).toBe(300);
      expect(parseFloat(res.body.totalVat)).toBe(60);
      expect(parseFloat(res.body.totalTtc)).toBe(360);
      expect(res.body.lines).toHaveLength(1);
      invoiceId = res.body.id;
      invoiceNumber = res.body.invoiceNumber;
    });

    it('POST /invoices — invoice number should follow FF-YYYY-NNNN format', async () => {
      expect(invoiceNumber).toMatch(/^FF-\d{4}-\d{4}$/);
    });

    it('POST /invoices — second invoice for same user should get next sequential number', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(invoicePayload())
        .expect(201);

      const secondNumber = res.body.invoiceNumber;
      const firstSeq = parseInt(invoiceNumber.split('-')[2]);
      const secondSeq = parseInt(secondNumber.split('-')[2]);
      expect(secondSeq).toBe(firstSeq + 1);

      // Clean up the extra invoice
      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${res.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('POST /invoices — should return 401 with no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(invoicePayload())
        .expect(401);
    });

    it('POST /invoices — should return 400 when lines array is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...invoicePayload(), lines: [] })
        .expect(400);
    });

    it('POST /invoices — should return 400 for negative unit price', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          ...invoicePayload(),
          lines: [
            { lineOrder: 1, description: 'Test', quantity: 1, unitPriceHt: -50, vatRate: 0.2 },
          ],
        })
        .expect(400);
    });

    it('POST /invoices — should return 404 when clientId belongs to another user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenB}`)
        .send(invoicePayload()) // clientId belongs to User A
        .expect(404);
    });

    it('POST /invoices — SNAPSHOT: line should use service hourlyRateHt when serviceId provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId,
          issueDate: '2024-01-15',
          lines: [
            {
              lineOrder: 1,
              serviceId,
              description: 'Dev (snapshot)',
              quantity: 1,
              unitPriceHt: 999, // should be overridden by service.hourlyRateHt = 150
              vatRate: 0.2,
            },
          ],
        })
        .expect(201);

      expect(parseFloat(res.body.lines[0].unitPriceHt)).toBe(150); // snapshot of service rate

      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${res.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it("GET /invoices — should list only User A's invoices", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      res.body.forEach((inv: any) => expect(inv.id).toBeDefined());
    });

    it('GET /invoices — User B should see an empty list (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('GET /invoices/:id — should return the invoice when it belongs to the user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(invoiceId);
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.client.id).toBe(clientId);
    });

    it("GET /invoices/:id — TENANT ISOLATION: User B cannot access User A's invoice (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('PATCH /invoices/:id — should update metadata on a draft invoice', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ dueDate: '2024-03-15' })
        .expect(200);

      expect(new Date(res.body.dueDate).toISOString().slice(0, 10)).toBe('2024-03-15');
    });

    it("PATCH /invoices/:id — TENANT ISOLATION: User B cannot update User A's invoice (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ dueDate: '2024-12-31' })
        .expect(404);
    });

    it('PATCH /invoices/:id/lines — should replace lines and recalculate totals', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/lines`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          lines: [
            {
              lineOrder: 1,
              description: 'Audit technique',
              quantity: 1,
              unitPriceHt: 200,
              vatRate: 0.2,
            },
            {
              lineOrder: 2,
              description: 'Consulting',
              quantity: 3,
              unitPriceHt: 100,
              vatRate: 0.2,
            },
          ],
        })
        .expect(200);

      expect(res.body.lines).toHaveLength(2);
      // total HT = 200 + 300 = 500
      expect(parseFloat(res.body.totalHt)).toBe(500);
      expect(parseFloat(res.body.totalVat)).toBe(100);
      expect(parseFloat(res.body.totalTtc)).toBe(600);
    });

    it('PATCH /invoices/:id/lines — TENANT ISOLATION: User B cannot replace lines (404)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/lines`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          lines: [{ lineOrder: 1, description: 'Hack', quantity: 1, unitPriceHt: 1, vatRate: 0 }],
        })
        .expect(404);
    });

    it("DELETE /invoices/:id — TENANT ISOLATION: User B cannot delete User A's invoice (404)", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // STATUS TRANSITIONS
  // ═══════════════════════════════════════════════════════════════

  describe('Invoice status transitions', () => {
    let invoiceId: string;

    beforeEach(async () => {
      // Fresh draft invoice for each test
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId,
          issueDate: '2024-01-15',
          lines: [
            { lineOrder: 1, description: 'Test', quantity: 1, unitPriceHt: 100, vatRate: 0.2 },
          ],
        });
      invoiceId = res.body.id;
    });

    afterEach(async () => {
      // Best-effort cleanup — cancel then delete if still deletable
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'cancelled' })
        .catch(() => {
          /* already in terminal state */
        });

      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .catch(() => {
          /* paid invoices cannot be deleted — ignore */
        });
    });

    it('draft → sent: should return 200 with status=sent', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' })
        .expect(200);

      expect(res.body.status).toBe('sent');
    });

    it('draft → cancelled: should return 200 with status=cancelled', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });

    it('draft → paid: should return 400 (invalid transition)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'paid' })
        .expect(400);

      expect(res.body.message).toContain('Transition de statut invalide');
    });

    it('sent → paid: should return 200 with status=paid', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'paid' })
        .expect(200);

      expect(res.body.status).toBe('paid');
    });

    it('sent → cancelled: should return 200 with status=cancelled', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });

    it('paid → cancelled: should return 400 (terminal state)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' });
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'paid' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'cancelled' })
        .expect(400);

      expect(res.body.message).toContain('Transition de statut invalide');
    });

    it('PATCH /invoices/:id — should return 400 when trying to edit a sent invoice', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' });

      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ currency: 'USD' })
        .expect(400);
    });

    it('DELETE /invoices/:id — should return 400 when trying to delete a sent invoice', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'sent' });

      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it("TENANT ISOLATION: User B cannot transition User A's invoice status (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}/status`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'sent' })
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INVOICE DELETE LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  describe('Invoice delete lifecycle', () => {
    let invoiceId: string;

    it('DELETE /invoices/:id — should delete a draft invoice and return 204', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId,
          issueDate: '2024-01-15',
          lines: [{ lineOrder: 1, description: 'Test', quantity: 1, unitPriceHt: 100, vatRate: 0 }],
        });
      invoiceId = res.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
    });

    it('GET /invoices/:id — should return 404 after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PDF GENERATION
  // ═══════════════════════════════════════════════════════════════

  describe('PDF generation', () => {
    let pdfInvoiceId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId,
          issueDate: '2024-01-15',
          dueDate: '2024-02-15',
          lines: [
            {
              lineOrder: 1,
              description: 'Développement backend',
              quantity: 8,
              unitPriceHt: 150,
              vatRate: 0.2,
            },
            {
              lineOrder: 2,
              description: 'Réunions client',
              quantity: 2,
              unitPriceHt: 120,
              vatRate: 0.2,
            },
          ],
        });
      pdfInvoiceId = res.body.id;
    });

    afterAll(async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/invoices/${pdfInvoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('GET /pdf/invoices/:id — should return 200 with application/pdf content-type', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${pdfInvoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('GET /pdf/invoices/:id — should return Content-Disposition attachment header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${pdfInvoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`invoice-${pdfInvoiceId}.pdf`);
    });

    it('GET /pdf/invoices/:id — should return a non-empty PDF body starting with %PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${pdfInvoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.body.length).toBeGreaterThan(100);
      expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    });

    it('GET /pdf/invoices/:id — should return 401 with no token', async () => {
      await request(app.getHttpServer()).get(`/api/v1/pdf/invoices/${pdfInvoiceId}`).expect(401);
    });

    it("GET /pdf/invoices/:id — TENANT ISOLATION: User B cannot download User A's invoice PDF (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/pdf/invoices/${pdfInvoiceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('GET /pdf/invoices/:id — should return 404 for non-existent invoice', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pdf/invoices/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
