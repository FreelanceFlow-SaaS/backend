# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# Uses the full devDependencies so nest build and prisma generate can run.
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached until package*.json changes)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate the Linux-compatible client
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy source and compile
COPY . .
RUN npm run build


# ─── Stage 2: Production image ────────────────────────────────────────────────
# Only ships the compiled output + production deps; no compiler, no source.
FROM node:22-alpine AS production

ENV NODE_ENV=production

# Unprivileged user — never run as root in a container
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

# Production deps only — much smaller than the full install
COPY package*.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev && npm cache clean --force

# Prisma: schema (for migrate deploy) + the generated Linux client
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Compiled NestJS application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

EXPOSE 3001

# Liveness probe — hits the actual HTTP server, not just "is Node installed"
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health 2>/dev/null || exit 1

# Run pending DB migrations then start the server.
# Using shell form so the && chain works; prisma migrate deploy is idempotent.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main"]
