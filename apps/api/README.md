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

| Method | Path                       | Auth | Description                   |
| ------ | -------------------------- | ---- | ----------------------------- |
| POST   | `/v1/auth/register`        | No   | Create account                |
| POST   | `/v1/auth/login`           | No   | Login, get tokens             |
| GET    | `/v1/auth/google/config`   | No   | Google Sign-In client config  |
| POST   | `/v1/auth/google`          | No   | Sign in with Google           |
| POST   | `/v1/auth/set-password`    | Yes  | Add password login to account |
| POST   | `/v1/auth/forgot-password` | No   | Legacy email reset flow       |
| POST   | `/v1/auth/reset-password`  | No   | Legacy reset-link completion  |
| POST   | `/v1/auth/refresh`         | No   | Rotate refresh token          |
| POST   | `/v1/auth/logout`          | No   | Revoke session                |
| GET    | `/v1/me`                   | Yes  | Current user + subscription   |
| GET    | `/v1/features`             | Yes  | Computed feature flags        |
| GET    | `/v1/cloud/settings`       | Yes  | Cloud settings blob           |
| PUT    | `/v1/cloud/settings`       | Yes  | Update cloud settings         |
| GET    | `/healthz`                 | No   | Health check                  |

## Feature Flags

6 flags: `auto_refresh`, `multi_epg_merge`, `smart_matching`, `pip_window`, `discord_rpc`, `cloud_sync`.

- **PRO plan** → all flags `true` by default (unless explicitly overridden)
- **FREE plan** → all flags `false` by default

## Environment Variables

See `.env.example` for all required variables.

## Deploying on Render

The repo now includes a production-ready [render.yaml](../../render.yaml) Blueprint for the API.

Recommended low-chaos stack:

1. Deploy the API as a Docker web service on Render.
2. Let the Blueprint create a small Render Postgres database automatically.
3. Keep the website on your current static host and point `api.streamshogun.com` at Render.

Minimum secrets to set in Render before the first production deploy:

- `JWT_SECRET`
- `SUPPORT_EMAIL`
- `RESEND_API_KEY`

Common production env vars to review:

- `CORS_ORIGIN=https://streamshogun.com`
- `APP_PUBLIC_URL=https://streamshogun.com`
- `COOKIE_DOMAIN=.streamshogun.com`
- `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
- `EMAIL_FROM=StreamShogun <no-reply@streamshogun.com>` if legacy reset emails stay enabled
- Stripe env vars if billing is enabled

After the service is live:

1. Add `api.streamshogun.com` as the custom domain in Render.
2. Update DNS to point that subdomain at Render.
3. Confirm `GET /healthz` returns `db: true`.
4. Smoke-test Google sign-in, account linking, checkout, cloud sync, and the password fallback flow.

The full cutover checklist lives in [docs/RENDER_SETUP.md](../../docs/RENDER_SETUP.md).

## Self-Hosting

If you want StreamShogun to run on your own VPS instead of a managed host, the repo now also includes a one-box deployment path:

- website via Caddy
- API via Docker
- Postgres via Docker

See [docs/SELF_HOSTING.md](../../docs/SELF_HOSTING.md) for the full setup.

## Transactional Email

Email is now optional. The primary account flow is Google-first, and Google-only accounts can add a password later from the account page if they need desktop fallback.

If you still want the legacy reset-email path available for older users, the API supports Resend via `RESEND_API_KEY` or any SMTP relay via `SMTP_URL`. In that case also set:

- `EMAIL_FROM`
- `SUPPORT_EMAIL`
- `APP_PUBLIC_URL`

`/healthz` includes `emailConfigured` so you can confirm whether the API sees email delivery config after deploy.
