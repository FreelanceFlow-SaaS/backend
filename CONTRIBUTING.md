# Contributing to FreelanceFlow API

Thank you for taking the time to contribute. This document covers everything you need to get your changes reviewed and merged efficiently.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Convention](#commit-convention)
- [Development Workflow](#development-workflow)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

---

## Prerequisites

- Node.js 22+
- A PostgreSQL database (local or [Neon](https://neon.tech))
- Git

---

## Getting Started

```bash
git clone https://github.com/FreelanceFlow-SaaS/backend.git
cd backend
npm install          # installs dependencies and sets up Husky git hooks
cp .env.example .env # fill in DATABASE_URL and JWT_SECRET
npm run prisma:push  # sync schema to your local DB
npm run start:dev    # start the dev server on port 3001
```

---

## Branch Naming

All branches must follow the pattern:

```
<type>/<short-description>
```

| Type        | When to use                          |
| ----------- | ------------------------------------ |
| `feature/`  | New functionality                    |
| `fix/`      | Bug fixes                            |
| `refactor/` | Code changes with no behavior change |
| `test/`     | Adding or improving tests            |
| `docs/`     | Documentation only                   |
| `chore/`    | Tooling, dependencies, config        |
| `ci/`       | CI/CD pipeline changes               |

Examples: `feature/invoice-pdf-layout`, `fix/refresh-token-expiry`, `docs/api-endpoints`

Branches target `main`. Do not commit directly to `main`.

---

## Commit Convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org). The `commit-msg` hook will reject any commit that does not conform.

Format:

```
<type>(<optional scope>): <description>
```

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

```bash
# Good
feat(invoices): add atomic invoice number generation
fix(auth): resolve refresh token not clearing on logout
test(users): add integration spec for profile upsert

# Bad — will be rejected
WIP
fix stuff
updated code
```

- Use the imperative mood: "add", "fix", "remove" — not "added", "fixed", "removed"
- Keep the description under 72 characters
- Reference an issue number in the body if applicable: `Closes #42`

---

## Development Workflow

1. Create a branch from the latest `main`
2. Make your changes
3. Write or update tests (see [Testing Requirements](#testing-requirements))
4. Run the full test suite locally before pushing:

```bash
npm run test        # unit tests
npm run test:e2e    # end-to-end tests (requires a real DB)
npm run lint        # ESLint
npm run build       # verify the build compiles
```

The pre-commit hook runs Prettier, ESLint, and tests for staged files automatically. The pre-push hook runs the full test suite and build — if either fails, the push is blocked.

---

## Testing Requirements

All contributions must maintain the existing test coverage level. Specifically:

- **New service methods** require a corresponding unit test in `*.service.spec.ts`
- **New endpoints** require a corresponding integration test in `*.integration.spec.ts`
- **New business flows** (e.g., a new status transition) require coverage in the E2E suite under `test/`

Test structure:

```
src/
└── modules/<module>/
    ├── <module>.service.spec.ts       # unit tests — mock all dependencies
    └── <module>.integration.spec.ts  # HTTP pipeline tests — mock only the service

test/
└── <feature>.e2e-spec.ts             # real DB, two users, tenant isolation checks
```

Run a single test file during development:

```bash
npx jest src/modules/invoices/invoices.service.spec.ts
```

---

## Pull Request Process

1. Push your branch and open a pull request against `main`
2. Fill in the PR description with:
   - What the change does
   - How to test it manually (if applicable)
   - Any migration steps required
3. Ensure all CI checks pass
4. Request a review from at least one team member
5. Do not merge your own PR without a review unless explicitly agreed

PRs that delete functionality, change authentication behavior, or modify the Prisma schema require a second reviewer.

---

## Code Style

Formatting and linting are handled automatically by the pre-commit hook. You do not need to run them manually before committing.

A few conventions enforced by the codebase:

- **French error messages** — all user-facing error messages returned by the API must be in French
- **Decimal for money** — never use JavaScript `number` for monetary values; use `Prisma.Decimal`
- **Tenant isolation** — every database query on a user-owned resource must include `userId` in the `where` clause
- **No `any` unless necessary** — `@typescript-eslint/no-explicit-any` is set to `off` as an escape hatch, not an invitation
- **No secrets in code** — all configuration must come from environment variables via `process.env`
