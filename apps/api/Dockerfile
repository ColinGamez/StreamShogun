# ── StreamShōgun API — Production Dockerfile ────────────────────────
# Context: repo root (set via railway.json or `docker build -f apps/api/Dockerfile .`)

FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ── 1. Install ALL deps (need devDeps for tsc + prisma) ────────────
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# ── 2. Copy source ─────────────────────────────────────────────────
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
COPY tsconfig.base.json ./

# ── 3. Build shared lib → generate Prisma client → build API ──────
RUN pnpm --filter @stream-shogun/shared build
RUN pnpm --filter @stream-shogun/api exec prisma generate
RUN pnpm --filter @stream-shogun/api build

# ── 4. Prune to production deps only ──────────────────────────────
RUN pnpm prune --prod

# ── 5. Production image ───────────────────────────────────────────
FROM node:22-slim AS production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/generated ./apps/api/generated
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

ENV NODE_ENV=production
WORKDIR /app/apps/api

EXPOSE 8787

ENV PORT=8787

# db push on startup (idempotent), then start the API
CMD ["sh", "-c", "node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1 && node dist/server.js"]
