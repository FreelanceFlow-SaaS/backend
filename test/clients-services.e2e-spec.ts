/**
 * Clients & Services E2E Tests
 *
 * Runs against a REAL database and a fully bootstrapped NestJS app.
 * Requires DATABASE_URL in environment. Skipped automatically if absent.
 *
 * Run: npm run test:e2e
 *
 * What this layer proves that unit/integration tests cannot:
 *  - Real JWT auth guard enforcing authentication
 *  - Real DB writes with Prisma Decimal for hourlyRateHt
 *  - Tenant isolation enforced at the DB level (not just mocked)
 *  - Complete CRUD lifecycle: create → read → update → delete
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

jest.setTimeout(30000);

const runE2E = !!process.env.DATABASE_URL;
const describeE2E = runE2E ? describe : describe.skip;

// Helper to register + login and return the Bearer token
async function loginAs(server: any, email: string, password: string): Promise<string> {
  await request(server).post('/api/v1/auth/register').send({ email, password });
  const res = await request(server).post('/api/v1/auth/login').send({ email, password });
  return res.body.access_token;
}

describeE2E('Clients & Services — E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;

  const userA = {
    email: `e2e-client-a-${Date.now()}@freelanceflow.test`,
    password: 'SecurePass123!',
  };
  const userB = {
    email: `e2e-client-b-${Date.now()}@freelanceflow.test`,
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
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);

    // Register and login both users to get their tokens
    tokenA = await loginAs(app.getHttpServer(), userA.email, userA.password);
    tokenB = await loginAs(app.getHttpServer(), userB.email, userB.password);
  });

  afterAll(async () => {
    // Clean up both test users (cascades to clients, services via schema onDelete: Cascade)
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════
  // CLIENTS
  // ═══════════════════════════════════════════════════════════════

  describe('Clients CRUD', () => {
    let clientId: string;

    const clientPayload = {
      name: 'Sophie Martin',
      email: 'sophie@acme.fr',
      company: 'Acme SAS',
      address: '42 rue du Commerce, 75015 Paris',
    };

    it('POST /clients — should create a client and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(clientPayload)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(clientPayload.name);
      clientId = res.body.id;
    });

    it('POST /clients — should return 401 with no token', async () => {
      await request(app.getHttpServer()).post('/api/v1/clients').send(clientPayload).expect(401);
    });

    it('POST /clients — should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...clientPayload, email: 'bad-email' })
        .expect(400);
    });

    it("GET /clients — should list only the authenticated user's clients", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      res.body.forEach((c: any) => expect(c.id).toBeDefined());
    });

    it('GET /clients — User B should see an empty list (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('GET /clients/:id — should return the client when it belongs to the user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(clientId);
    });

    it("GET /clients/:id — TENANT ISOLATION: User B cannot access User A's client (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('PATCH /clients/:id — should update the client', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Sophie Dupont' })
        .expect(200);

      expect(res.body.name).toBe('Sophie Dupont');
    });

    it("PATCH /clients/:id — TENANT ISOLATION: User B cannot update User A's client (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hacked Name' })
        .expect(404);
    });

    it("DELETE /clients/:id — TENANT ISOLATION: User B cannot delete User A's client (404)", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('DELETE /clients/:id — should delete the client and return 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
    });

    it('GET /clients/:id — should return 404 after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SERVICES (PRESTATIONS)
  // ═══════════════════════════════════════════════════════════════

  describe('Services CRUD', () => {
    let serviceId: string;

    const servicePayload = {
      title: 'Développement backend',
      hourlyRateHt: 150.0,
    };

    it('POST /services — should create a service and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(servicePayload)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe(servicePayload.title);
      // hourlyRateHt is stored as Decimal — comes back as string representation
      expect(parseFloat(res.body.hourlyRateHt)).toBe(150.0);
      serviceId = res.body.id;
    });

    it('POST /services — should return 401 with no token', async () => {
      await request(app.getHttpServer()).post('/api/v1/services').send(servicePayload).expect(401);
    });

    it('POST /services — should return 400 for a negative rate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Dev', hourlyRateHt: -50 })
        .expect(400);
    });

    it('POST /services — should return 400 for a zero rate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Dev', hourlyRateHt: 0 })
        .expect(400);
    });

    it("GET /services — should list only the authenticated user's services", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/services')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /services — User B should see an empty list (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/services')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('GET /services/:id — should return the service when it belongs to the user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(serviceId);
    });

    it("GET /services/:id — TENANT ISOLATION: User B cannot access User A's service (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('PATCH /services/:id — should update title and rate', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Audit technique', hourlyRateHt: 200 })
        .expect(200);

      expect(res.body.title).toBe('Audit technique');
      expect(parseFloat(res.body.hourlyRateHt)).toBe(200);
    });

    it("PATCH /services/:id — TENANT ISOLATION: User B cannot update User A's service (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hacked' })
        .expect(404);
    });

    it("DELETE /services/:id — TENANT ISOLATION: User B cannot delete User A's service (404)", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('DELETE /services/:id — should delete the service and return 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
    });

    it('GET /services/:id — should return 404 after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
