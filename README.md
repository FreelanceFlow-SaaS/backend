# FreelanceFlow API

NestJS backend for the FreelanceFlow invoicing platform, targeting the French freelance market. Handles authentication, client and service management, invoice lifecycle, PDF generation, and structured audit logging.

---

## Table of Contents

- [Requirements](#requirements)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Scripts](#scripts)
- [Docker](#docker)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Git Workflow](#git-workflow)
- [Contributing](#contributing)
- [License](#license)

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
JWT_ACCESS_EXPIRES_IN="30m"
JWT_REFRESH_EXPIRES_IN="30d"

FRONTEND_URL="http://localhost:3000"

# Optional — defaults to "debug" in development, "info" in production
LOG_LEVEL=debug

# Optional — set by CI at build time; appears in GET /api/v1/health response (FR31)
GIT_SHA=local
```

If using Neon, set `DATABASE_URL` to the **direct** connection endpoint (no `-pooler` in the hostname). The pooler runs PgBouncer in transaction mode, which does not preserve `search_path` between sessions and will cause Prisma queries to fail at runtime.

---

## Local Development

```bash
npm install
npm run prisma:generate   # generate Prisma client
npm run prisma:push       # push schema to DB (first time or after schema changes)
npm run start:dev         # hot-reload server on port 3001
```

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

## API Reference

Full interactive documentation is available via Swagger UI once the server is running:

```
http://localhost:3001/api/docs
```

All routes are prefixed with `/api/v1`. Protected routes require a JWT access token in the `Authorization: Bearer <token>` header or via the HttpOnly cookie set at login.

---

## Architecture

### Request Lifecycle

Every request passes through three globally registered concerns:

1. **`ValidationPipe`** — `whitelist: true` strips unknown fields; `transform: true` coerces types.
2. **`GoldenRuleInterceptor`** — strips sensitive fields (`passwordHash`, `refreshToken`, `tokenHash`) from all outgoing responses.
3. **`GoldenRuleExceptionFilter`** — catches all exceptions, returns a consistent `{ statusCode, message, error, timestamp, path }` shape with French error messages. Responses from `/auth/refresh` that result in a `401` also include `"code": "SESSION_EXPIRED"` so clients can distinguish a fully expired session from a transient auth error.

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

- Access token: 30 min, returned in the response body (development only) and set as an HttpOnly cookie (`path: /`).
- Refresh token: 30 days, HttpOnly cookie, stored hashed in `refresh_tokens`.
- Token rotation: each `/auth/refresh` atomically deletes the old token and issues a new one.
- Stale cookie cleanup: if `/auth/refresh` fails for any reason (expired, invalid, missing), the HttpOnly cookie is cleared in the same response so the browser stops replaying a dead token.
- Session expiry signal: a failed refresh returns `401` with `"code": "SESSION_EXPIRED"` — the frontend uses this to redirect to the login page.
- Both durations are fully driven by `JWT_ACCESS_EXPIRES_IN` and `JWT_REFRESH_EXPIRES_IN` env vars — no code change needed to adjust them.

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

When an invoice transitions to `paid`, the column `paid_at` is set to the current timestamp. This is the authoritative payment date used by the dashboard revenue calculation — it is never overwritten and is independent of `updated_at` (which changes on any field edit).

### Dashboard

```
GET /api/v1/dashboard/summary
```

Returns aggregated totals for the authenticated user:

```json
{
  "totalRevenueTtc": "12500.00",
  "invoiceCount": 7,
  "paidCount": 3,
  "sentCount": 2,
  "draftCount": 1,
  "cancelledCount": 1
}
```

**Revenue rule (alignement PRD)** — `totalRevenueTtc` = somme des `totalTtc` EUR pour les factures dont `status = paid` uniquement. Les factures `sent`, `draft` ou `cancelled` ne sont pas comptabilisées. La date d'attribution du paiement est `paidAt` (renseigné à la transition `→ paid`) ; `updatedAt` n'est pas utilisé pour le revenu car il change à chaque modification de la facture.

### Logging

Structured JSON logging via `nestjs-pino`. PII fields (`Authorization` header, cookies, passwords, API keys, tokens) are redacted before any log is written. Business events (`user_login_success`, `user_login_failure`, `token_refresh`, etc.) carry a machine-readable `event` field for log aggregation queries. `pino-pretty` is active in development; raw JSON goes to stdout in production.

**Field schema (v1):** see [docs/runbook-logging.md](../docs/runbook-logging.md).

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

## Operations

### Health endpoint

```
GET /api/v1/health
```

Returns `200 OK` when all dependencies are healthy, `503 Service Unavailable` when any probe fails. Response body includes:

```json
{
  "status": "ok",
  "info": { "database": { "status": "up" } },
  "version": "1.0.0",
  "gitSha": "abc1234",
  "env": "production"
}
```

Set `GIT_SHA` as a build-time environment variable (e.g. from CI) to expose the exact deployed commit. Used as the liveness/readiness probe in Docker and Render.

### Observability

Every HTTP request carries a `X-Request-Id` response header (UUID generated by pino-http, or forwarded from an upstream `X-Request-Id` input header). Use this ID to correlate log lines across services and requests.

#### What is available now

| Signal                          | Where to find it                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Structured JSON logs**        | Render Dashboard → **freelanceflow-api** → **Logs** tab — filter by `"requestId"` or `"severity":"error"` |
| **CPU / memory / request rate** | Render Dashboard → **freelanceflow-api** → **Metrics** tab                                                |
| **Build version**               | `GET /api/v1/health` → `gitSha` field (equals the GitHub commit SHA injected at Docker build time)        |
| **Error rate**                  | Filter Render logs by `"level":"error"`; set a Render notification alert for 5xx spikes                   |

#### Grafana / Loki (when provisioned)

Once a Grafana Cloud workspace or self-hosted Loki is wired to receive the stdout JSON stream from Render:

1. Add a **Loki datasource** pointing at your Loki endpoint
2. Filter logs with: `{service="freelanceflow-api"}` — every HTTP line contains `service`, `requestId`, `severity`, `timestamp`, `route`, `httpStatus`
3. Recommended dashboards: **request rate** (`httpStatus` label), **error rate** (`severity="error"`), **P95 latency** (from `responseTime` field)

> Grafana provisioning is not yet done — the above are the setup steps for when it is. Current primary observability surface is Render's native log stream and metrics tab.

> Redis health probe and queue-depth metrics will be added in story 8.3 once the Redis module (story 7.4) is in place.

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit conventions, testing requirements, and the pull request process.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
