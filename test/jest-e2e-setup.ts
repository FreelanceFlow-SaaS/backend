/**
 * E2E uses a real PostgreSQL URL from the environment. Redis is optional for most
 * flows: `@nestjs/config` only assigns keys from `.env` when they are **missing**
 * from `process.env`. Pin `REDIS_URL` to empty so a developer `.env` with a real
 * broker URL does not make `/health` fail when Redis is not running. Opt in per
 * suite with `process.env.REDIS_URL = 'redis://...'` before `createTestingModule`.
 */
process.env.REDIS_URL = '';
