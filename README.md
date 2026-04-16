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

# Optional — set by CI at build time; exposed as `gitSha` on GET /api/v1/health (FR31)
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

**Redis (invoice email queue + shared rate limits):** optional until you use `POST /api/v1/invoices/:id/send-email`. Start Redis locally:

```bash
docker compose -f docker-compose.dev.yml up -d
# then set REDIS_URL=redis://localhost:6379 in .env
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
    ├── invoices/             # Invoice headers, line items, status transitions, email enqueue
    ├── pdf/                  # pdfmake PDF generation
    ├── mail/                 # SMTP (nodemailer) — credentials from env only
    └── invoice-email/        # BullMQ queue + worker: PDF at send time, bounded retries
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

**Breakdowns** — `revenueByClient[]` (trié par revenu décroissant) et `revenueByMonth[]` (trié chronologiquement, format `YYYY-MM`) sont également retournés dans la même réponse. Les mois sont calculés en **Europe/Paris** (`AT TIME ZONE 'Europe/Paris'` côté Postgres) : une facture payée le 31 décembre à 23h30 UTC apparaît en janvier dans `revenueByMonth` (CET = UTC+1). Ce choix est documenté ici — ne pas substituer UTC sans mettre à jour les tests frontière déc/jan.

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

Returns `200 OK` when all dependencies are healthy, `503 Service Unavailable` when any probe fails. Response body includes Terminus `status` / `info` / `error` / `details` plus top-level **`gitSha`** and **`env`** (FR31).

**PostgreSQL:** `SELECT 1` via Prisma — failure → `503`.

**Redis:** If **`REDIS_URL` is unset**, the Redis probe is **skipped** (reported as up with a “not configured” message). If **`REDIS_URL` is set** (cache or mail worker in V2), a failed **`PING`** degrades the check to **`503`** / `status: "error"` (NFR-G2). Keep `REDIS_URL` unset in environments that do not run Redis yet.

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up", "message": "Redis not configured (check skipped)" }
  },
  "gitSha": "abc1234",
  "env": "production"
}
```

Set **`GIT_SHA`** at **image build** (`Dockerfile` `ARG`; CI passes `--build-arg GIT_SHA`). **`gitSha`** identifies the exact commit deployed. Used as the liveness probe in Docker and Render.

### Observability

Every HTTP request carries a `X-Request-Id` response header (UUID generated by pino-http, or forwarded from an upstream `X-Request-Id` input header). Use this ID to correlate log lines across services and requests.

#### What is available now

| Signal                          | Where to find it                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structured JSON logs**        | Render Dashboard → **freelanceflow-api** → **Logs** tab — filter by `requestId` / `http.request.id` or error level (`log.level` in ECS, `severity` in local dev) |
| **CPU / memory / request rate** | Render Dashboard → **freelanceflow-api** → **Metrics** tab                                                                                                       |
| **Build identity**              | `GET /api/v1/health` → `gitSha` (GitHub commit SHA injected at Docker build)                                                                                     |
| **Error rate**                  | Filter Render logs by error level; set a Render notification alert for 5xx spikes                                                                                |

#### Elasticsearch / Kibana (optional)

When **`ELASTICSEARCH_URL`** and **`ELASTICSEARCH_API_KEY`** (or username/password) are set, the API also **bulk-indexes ECS-shaped JSON** into **`ELASTICSEARCH_LOG_INDEX`** (default `freelanceflow-api-logs`). Use **Kibana Discover** or **Observability → Logs** against that index or data stream. Production stdout uses the same ECS fields (`@timestamp`, `log.level`, `service.name`, `http.*`, `url.*`, `responseTime`, etc.).

> Redis **connectivity** is covered by this health endpoint when `REDIS_URL` is set. **Queue depth** and richer cache metrics remain for story 8.3 once cache-aside is wired.

### Invoice email (async)

- **Endpoint:** `POST /api/v1/invoices/:id/send-email` — returns **202 Accepted** with `{ jobId, status, message }`. The HTTP success means the job was **queued** (BullMQ), not that the recipient’s mailbox has received the message (delivery is asynchronous; SMTP outcome is handled in the worker).
- **Queue worker:** runs **in the same Nest process** as the HTTP server by default (BullMQ `WorkerHost`). For horizontal scale, run multiple API replicas against the **same** `REDIS_URL`; workers coordinate via BullMQ. Concurrency: `EMAIL_QUEUE_CONCURRENCY` (default `2`).
- **Retries:** each job uses **at most two attempts** (one automatic retry after 12s fixed backoff) for transient SMTP/network errors. Permanent SMTP failures (e.g. 550) fail the job without implying delivery.
- **Rate limits:** `POST .../login`, `POST .../send-email`, and `GET .../pdf/invoices/:id` are throttled per **user + route** (or **IP + route** for login) via `@nestjs/throttler`, using **Redis-backed storage** when `REDIS_URL` is set, otherwise in-memory (single-instance only).
- **Without `REDIS_URL`:** enqueue returns **503** with a clear message; configure Redis to enable the feature.

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
