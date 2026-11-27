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

# JWT_SECRET must be present for the build too: lib/auth.ts refuses to load
# without one, and the build loads every route. This value signs nothing and
# stays in this stage — the runner stage below has no JWT_SECRET of its own, so
# the container still refuses to serve until the real one is supplied.
ENV JWT_SECRET="build-time-placeholder-not-a-secret"

RUN npm run build


# ── Stage 3: the Prisma CLI, alone ───────────────────────────────────────────
# The running container needs exactly one development tool: `prisma migrate
# deploy`. Installing just that package, at the version the lockfile pins, keeps
# the rest of the dev toolchain (TypeScript, ESLint, Playwright, Tailwind…) out
# of the final image.
FROM node:22-slim AS prisma-cli
WORKDIR /cli

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package-lock.json ./
RUN npm install --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")"


# ── Stage 4: production runner ────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Override via -e DATABASE_URL=... or docker-compose env; defaults to /app/data.
ENV DATABASE_URL="file:/app/data/diet.db"
# Give npm/npx a writable home — the system user has no real home dir.
ENV HOME=/tmp

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone output and static assets produced by Next.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema + migrations so we can run migrate deploy on startup.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
# The app's own runtime dependencies are already inside the standalone output
# above. The Prisma CLI lives apart from them so the two cannot shadow each other.
COPY --from=prisma-cli --chown=nextjs:nodejs /cli/node_modules ./prisma-cli/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/scripts/backup-db.mjs /app/scripts/docker-entrypoint.sh ./scripts/

# Persist the SQLite database in a named volume mounted at /app/data.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthy means the server answers and can read its database. The start period
# covers the snapshot and migrations that run before the server comes up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Snapshot the database if a migration is pending, migrate, then start the server.
CMD ["sh", "scripts/docker-entrypoint.sh"]
