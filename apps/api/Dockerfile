# ── StreamShōgun API — Production Dockerfile ────────────────────────
# Context: repo root (set via railway.json or `docker build -f apps/api/Dockerfile .`)
# Single-stage build — simpler, guaranteed to work on Railway.

FROM node:22-slim
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

ENV NODE_ENV=production
WORKDIR /app/apps/api

EXPOSE 8787

# db push on startup (idempotent), then start the API
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>&1; node dist/server.js"]
