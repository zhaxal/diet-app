# syntax=docker/dockerfile:1

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Install OpenSSL (required by Prisma on debian-slim).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Install all deps including devDeps (needed for the build stage).
RUN npm ci --ignore-scripts

# Generate Prisma client (engines are bundled in node_modules after this).
COPY prisma ./prisma
RUN npx prisma generate


# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# DATABASE_URL must be set for the build; the value doesn't matter here
# because no DB queries are made at build time.
ENV DATABASE_URL="file:/app/data/diet.db"

RUN npm run build


# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Override via -e DATABASE_URL=... or docker-compose env; defaults to /app/data.
ENV DATABASE_URL="file:/app/data/diet.db"

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone output and static assets produced by Next.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema + migrations so we can run migrate deploy on startup.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Copy the generated client (includes query engine binary).
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Persist the SQLite database in a named volume mounted at /app/data.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
