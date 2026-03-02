# StreamShōgun — SaaS Backend

Fastify + Prisma + PostgreSQL backend powering the StreamShōgun SaaS layer.

## Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9
- PostgreSQL ≥ 15 (local or Docker)

## Quick Start

```bash
# 1. Install dependencies (from monorepo root)
pnpm install

# 2. Copy environment template
cd apps/backend
cp .env.example .env
# → Edit .env: set DATABASE_URL and JWT_SECRET

# 3. Generate Prisma client
pnpm db:generate

# 4. Run database migrations
pnpm db:migrate

# 5. Start dev server (hot-reload)
pnpm dev
```

The API will be available at `http://localhost:3001`.

## API Routes

| Method | Path               | Auth     | Description               |
| ------ | ------------------ | -------- | ------------------------- |
| GET    | `/health`          | —        | Health check              |
| POST   | `/auth/register`   | —        | Create account            |
| POST   | `/auth/login`      | —        | Sign in, get tokens       |
| POST   | `/auth/refresh`    | —        | Rotate token pair         |
| POST   | `/auth/logout`     | Bearer   | Revoke all refresh tokens |
| GET    | `/me`              | Bearer   | Current user profile      |
| GET    | `/features`        | Bearer   | Feature flags for user    |
| GET    | `/subscription`    | Bearer   | Subscription details      |

## Auth Flow

1. **Register** → receive `accessToken` + `refreshToken`
2. Use `accessToken` in `Authorization: Bearer <token>` header
3. When access token expires (15 min), call `/auth/refresh` with the refresh token
4. Refresh tokens rotate on use (old one is revoked, new pair issued)
5. **Logout** revokes all refresh tokens for the user

## Database

```bash
# Open Prisma Studio (visual DB browser)
pnpm db:studio

# Push schema changes without creating a migration file (dev only)
pnpm db:push

# Create a migration
pnpm db:migrate
```

## Project Structure

```
apps/backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed script
├── src/
│   ├── config/
│   │   └── env.ts         # Zod-validated env vars
│   ├── lib/
│   │   ├── password.ts    # bcrypt hashing
│   │   ├── prisma.ts      # Prisma client singleton
│   │   └── tokens.ts      # JWT sign/verify/rotate
│   ├── middleware/
│   │   └── authenticate.ts # JWT preHandler
│   ├── routes/
│   │   ├── auth.ts        # register/login/refresh/logout
│   │   ├── features.ts    # GET /features
│   │   ├── health.ts      # GET /health
│   │   ├── me.ts          # GET /me
│   │   └── subscription.ts # GET /subscription
│   ├── schemas/
│   │   └── index.ts       # Zod request schemas
│   ├── app.ts             # Fastify app builder
│   └── server.ts          # Entrypoint
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Stripe Integration (Future)

The `Subscription` model includes `stripeCustomerId` and `stripeSubId` columns.
When ready:

1. Add `stripe` dependency
2. Create `/webhooks/stripe` route
3. Wire Stripe Checkout / Customer Portal
4. Update subscription status from webhook events

## Security

- Passwords hashed with bcrypt (12 rounds)
- JWT access tokens (short-lived, 15 min)
- JWT refresh tokens (7 days, rotated on use, stored in DB)
- Input validated with Zod on every endpoint
- Rate limiting (100 req/min per IP)
- Helmet security headers
- CORS restricted to configured origins
