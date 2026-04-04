# FreelanceFlow API

NestJS backend for the FreelanceFlow invoicing platform, targeting the French freelance market. Handles authentication, client and service management, invoice lifecycle, PDF generation, and structured audit logging.

---

## Requirements

- Node.js 22+
- PostgreSQL (or a [Neon](https://neon.tech) serverless PostgreSQL project)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values before starting the server.

```bash
PORT=3001
NODE_ENV=development

DATABASE_URL="postgresql://user:password@host:5432/dbname"

JWT_SECRET="change-this-to-a-long-random-string"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

FRONTEND_URL="http://localhost:3000"

# Optional — defaults to "debug" in development, "info" in production
LOG_LEVEL=debug
```

`DATABASE_URL` must point to the **direct** connection endpoint, not a pooler. See [Known Issues](#known-issues).

---

## Local Development

```bash
npm install
npm run prisma:generate   # generate Prisma client
npm run prisma:push       # push schema to DB (first time or after schema changes)
npm run start:dev         # hot-reload server on port 3001
```

Swagger UI: `http://localhost:3001/api/docs`

Health check: `GET http://localhost:3001/api/v1/health`

---

## Scripts

**Development**

```bash
npm run start:dev         # hot-reload
npm run start:debug       # hot-reload with Node inspector
```

**Build**

```bash
npm run build             # compile to dist/
npm run start:prod        # run compiled output
```

**Database**

```bash
npm run prisma:generate   # regenerate Prisma client after schema changes
npm run prisma:migrate    # create and run a migration (dev only)
npm run prisma:push       # push schema without a migration file (prototyping)
npm run prisma:studio     # open Prisma Studio GUI
```

**Testing**

```bash
npm run test              # all unit tests
npm run test:watch        # watch mode
npm run test:cov          # with coverage report
npm run test:e2e          # end-to-end tests against a real database
npm run test:staged       # tests related to staged files (used by pre-commit hook)

# Single file
npx jest src/modules/auth/auth.service.spec.ts
```

**Code Quality**

```bash
npm run lint              # ESLint with auto-fix
npm run format            # Prettier
```

---

## Docker

```bash
# Build
docker build -t freelanceflow-api .

# Run (inject secrets at runtime — never bake .env into the image)
docker run -p 3001:3001 \
  -e DATABASE_URL="..." \
  -e JWT_SECRET="..." \
  -e NODE_ENV=production \
  freelanceflow-api
```

The container starts by running `prisma migrate deploy` (idempotent) before launching the server. The health endpoint at `/api/v1/health` is used as the liveness probe.

---

## API Endpoints

All routes are prefixed with `/api/v1`. Protected routes require a valid JWT access token in the `Authorization: Bearer <token>` header (also accepted via HttpOnly cookie after login).

**Auth** — no authentication required

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
```

**Freelancer Profile**

```
GET    /users/profile
PATCH  /users/profile
```

**Clients**

```
POST   /clients
GET    /clients
GET    /clients/:id
PATCH  /clients/:id
DELETE /clients/:id
```

**Services**

```
POST   /services
GET    /services
GET    /services/:id
PATCH  /services/:id
DELETE /services/:id
```

**Invoices**

```
POST   /invoices
GET    /invoices
GET    /invoices/:id
PATCH  /invoices/:id
PUT    /invoices/:id/lines
PATCH  /invoices/:id/status
DELETE /invoices/:id
```

**PDF**

```
GET    /pdf/invoices/:id
```

**Health**

```
GET    /health
```

---

## Architecture

### Request Lifecycle

Every request passes through three globally registered concerns:

1. **`ValidationPipe`** — `whitelist: true` strips unknown fields; `transform: true` coerces types.
2. **`GoldenRuleInterceptor`** — strips sensitive fields (`passwordHash`, `refreshToken`, `tokenHash`) from all outgoing responses.
3. **`GoldenRuleExceptionFilter`** — catches all exceptions, returns a consistent `{ statusCode, message, error, timestamp, path }` shape with French error messages.

### Module Structure

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── health/               # GET /health liveness endpoint
│   ├── prisma/               # PrismaService — global module
│   ├── logger/               # nestjs-pino configuration
│   ├── filters/              # GoldenRuleExceptionFilter
│   ├── interceptors/         # GoldenRuleInterceptor
│   └── testing/              # Shared test helpers (mock logger)
└── modules/
    ├── auth/                 # JWT auth, HttpOnly cookies, refresh token rotation
    ├── users/                # User CRUD, FreelancerProfile upsert
    ├── clients/              # Client directory (per-user)
    ├── services/             # Service catalog with hourly rates
    ├── invoices/             # Invoice headers, line items, status transitions
    └── pdf/                  # pdfmake PDF generation
```

### Authentication

- Access token: 15 min, returned in the response body (development only) and set as an HttpOnly cookie (`path: /`).
- Refresh token: 7 days, HttpOnly cookie (`path: /api/v1/auth`), stored hashed in `refresh_tokens`.
- Token rotation: each `/auth/refresh` atomically deletes the old token and issues a new one.

### Multi-tenancy

Every resource (`Client`, `Service`, `Invoice`) has a `userId` foreign key. All queries are scoped to the authenticated user's ID. A request for another user's resource returns 404, not 403, to avoid leaking existence.

### Invoice Lifecycle

```
draft --> sent --> paid
  |         |
  v         v
cancelled cancelled
```

Paid and cancelled are terminal states. Line items on non-draft invoices are immutable. Invoice numbers are generated atomically via a PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` sequence to eliminate race conditions.

### Logging

Structured JSON logging via `nestjs-pino`. PII fields (`Authorization` header, cookies, passwords) are redacted before any log is written. Business events (`user_login_success`, `user_login_failure`, `token_refresh`, etc.) carry a machine-readable `event` field for log aggregation queries. `pino-pretty` is active in development; raw JSON goes to stdout in production.

---

## Database Schema

Nine PostgreSQL tables, all using UUID primary keys:

| Table                   | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `users`                 | Authentication credentials and tenant boundary                             |
| `freelancer_profiles`   | Seller identity and legal details for invoices                             |
| `clients`               | Client directory, one per user                                             |
| `services`              | Reusable service catalog with hourly rate                                  |
| `invoices`              | Invoice header with pre-computed HT / VAT / TTC totals                     |
| `invoice_lines`         | Line items; `unitPriceHt` is snapshotted from the service at creation time |
| `invoice_status_events` | Immutable audit trail of status transitions                                |
| `invoice_counters`      | Per-user atomic sequence for invoice number generation                     |
| `refresh_tokens`        | Hashed refresh tokens for revocation                                       |

All monetary values use `Decimal(12,2)`. VAT rates use `Decimal(5,4)` (e.g., `0.2000` for 20%). Currency is enforced as EUR.

---

## Git Workflow

Feature branches follow the pattern `feature/<name>` and target `main`.

Commit format enforced by commit-msg hook: `type(scope): description`

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

Hook pipeline:

- **pre-commit**: Prettier + ESLint auto-fix + unit tests for staged files
- **commit-msg**: Conventional commit format check
- **pre-push**: Full test suite + build

Reinstall hooks after a fresh clone:

```bash
npm run prepare
```

---

## Known Issues

**Neon database — use the direct connection, not the pooler**

Neon provides two endpoints. The pooler (`ep-...-pooler.region.neon.tech`) runs PgBouncer in transaction mode, which does not preserve `search_path` between sessions. Prisma queries fail at runtime with "table does not exist" even though the table is present. Use the direct endpoint (no `-pooler` in the hostname) for `DATABASE_URL`.

**Prisma CLI broken symlink**

`npm run prisma:*` scripts may fail with a missing `.wasm` file due to a broken symlink in `node_modules/.bin/`. Use the build entrypoint directly if needed:

```bash
node node_modules/prisma/build/index.js generate --schema=./prisma/schema.prisma
node node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma
```
