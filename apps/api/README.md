# StreamShōgun API

SaaS backend for user accounts, feature flags, and cloud sync.

## Stack

- **Runtime:** Node.js 18+
- **Framework:** Fastify 5
- **ORM:** Prisma 6 (PostgreSQL)
- **Auth:** JWT (access 15 min + refresh 7 day rotation)
- **Validation:** Zod (via `@stream-shogun/shared`)

## Quick Start

```bash
# 1. Start PostgreSQL
pnpm db:up

# 2. Install dependencies
pnpm install

# 3. Push schema to DB (or run migrations)
pnpm db:push          # quick dev sync
# pnpm db:migrate     # proper migration

# 4. Generate Prisma client
cd apps/api && pnpm db:generate

# 5. (Optional) Seed demo data
pnpm db:seed

# 6. Start dev server (hot-reload)
pnpm dev:api
```

Server runs on `http://localhost:8787`.

## API Routes

| Method | Path                  | Auth | Description                  |
| ------ | --------------------- | ---- | ---------------------------- |
| POST   | `/v1/auth/register`   | No   | Create account               |
| POST   | `/v1/auth/login`      | No   | Login, get tokens            |
| POST   | `/v1/auth/refresh`    | No   | Rotate refresh token         |
| POST   | `/v1/auth/logout`     | No   | Revoke session               |
| GET    | `/v1/me`              | Yes  | Current user + subscription  |
| GET    | `/v1/features`        | Yes  | Computed feature flags       |
| GET    | `/v1/cloud/settings`  | Yes  | Cloud settings blob          |
| PUT    | `/v1/cloud/settings`  | Yes  | Update cloud settings        |
| GET    | `/healthz`            | No   | Health check                 |

## Feature Flags

6 flags: `auto_refresh`, `multi_epg_merge`, `smart_matching`, `pip_window`, `discord_rpc`, `cloud_sync`.

- **PRO plan** → all flags `true` by default (unless explicitly overridden)
- **FREE plan** → all flags `false` by default

## Environment Variables

See `.env.example` for all required variables.
