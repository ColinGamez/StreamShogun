# Environment Separation

> Two Railway services — **staging** and **production** — each with isolated
> databases, secrets, and Stripe accounts.

---

## Railway Project Layout

```
Railway Project: "StreamShōgun"
├── Service: api-staging          ← branch: main (or staging)
│   └── Plugin: PostgreSQL (staging)
└── Service: api-production       ← branch: production
    └── Plugin: PostgreSQL (production)
```

Each service is a separate Railway deploy target backed by its own
Postgres plugin. They share the same `railway.json` build config
but have completely independent environment variables.

### Setting Up

1. **Create the project** in Railway (already done: "hopeful-spirit").
2. **Add two services** from the same GitHub repo — one for staging, one for
   production — each attached to its own branch.
3. **Attach a PostgreSQL plugin** to each service (Railway auto-injects
   `DATABASE_URL`).
4. **Set environment variables** per the matrix below.

---

## Environment Variable Matrix

| Variable | Local (`.env`) | Staging | Production |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `staging` | `production` |
| `DATABASE_URL` | `postgresql://…localhost:5433/…` | Railway-injected (staging DB) | Railway-injected (prod DB) |
| `JWT_SECRET` | any ≥ 16-char string | unique random ≥ 32 chars | **different** unique random ≥ 32 chars |
| `JWT_ACCESS_TTL` | `15m` | `15m` | `15m` |
| `JWT_REFRESH_TTL` | `7d` | `7d` | `7d` |
| `CORS_ORIGIN` | `http://localhost:5173` | `https://staging.streamshogun.com` | `https://app.streamshogun.com` |
| `APP_PUBLIC_URL` | _(empty — falls back to CORS_ORIGIN)_ | `https://staging.streamshogun.com` | `https://app.streamshogun.com` |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (from `stripe listen`) | `whsec_…` (staging endpoint) | `whsec_…` (production endpoint) |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | `price_…` (test) | `price_…` (test) | `price_…` (live) |
| `STRIPE_PRICE_ID_PRO_YEARLY` | `price_…` (test) | `price_…` (test) | `price_…` (live) |
| `ADMIN_KEY` | any ≥ 16-char string | unique random | **different** unique random |
| `SENTRY_DSN` | _(empty)_ | Sentry staging DSN | Sentry production DSN |
| `LOG_LEVEL` | `debug` | `info` | `info` |

### Key Rules

- **`JWT_SECRET` must differ** between staging and production. Tokens minted
  in staging must not be valid in production (and vice versa).
- **`DATABASE_URL` must differ.** Each environment owns its schema. Never
  point staging at a production database.
- **Stripe keys must match the environment.** See safety checks below.

---

## Stripe Key Safety

A runtime assertion in `lib/stripe.ts` enforces:

| `NODE_ENV` | `sk_live_*` allowed? | `sk_test_*` allowed? |
| --- | --- | --- |
| `development` | **No** — throws fatal error | Yes |
| `staging` | **No** — throws fatal error | Yes |
| `production` | Yes | Yes (warning logged) |

This prevents the most dangerous misconfiguration: accidentally charging
real customers from a staging deploy.

```
FATAL: Stripe live key detected in NODE_ENV="staging".
       Use sk_test_* keys outside production. Aborting.
```

### How it works

```typescript
// lib/stripe.ts — runs on first billing request
function assertStripeKeyMatchesEnv(key: string): void {
  const isLiveKey = key.startsWith("sk_live_");
  const isProduction = env.NODE_ENV === "production";

  if (isLiveKey && !isProduction) {
    throw new Error(
      `FATAL: Stripe live key detected in NODE_ENV="${env.NODE_ENV}".`
    );
  }
}
```

---

## Stripe Dashboard Setup (per environment)

### Staging

1. Use **Test mode** keys (`sk_test_…`, `pk_test_…`).
2. Create a webhook endpoint → `https://api-staging-….up.railway.app/v1/billing/webhook`
3. Select the 6 events listed in [BILLING.md](BILLING.md#handled-webhook-events).
4. Copy `whsec_…` → Railway staging `STRIPE_WEBHOOK_SECRET`.
5. Create test Prices (monthly + yearly) → staging `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_YEARLY`.

### Production

1. Use **Live mode** keys (`sk_live_…`, `pk_live_…`).
2. Create a webhook endpoint → `https://api-production-….up.railway.app/v1/billing/webhook`
3. Same 6 events.
4. Copy `whsec_…` → Railway production `STRIPE_WEBHOOK_SECRET`.
5. Create live Prices (monthly + yearly) → production `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_YEARLY`.

---

## Branch Strategy

| Branch | Deploys to | Auto-deploy? |
| --- | --- | --- |
| `main` (or `staging`) | api-staging | Yes |
| `production` | api-production | Yes |

Workflow:

```
feature branch → PR → merge to main → staging auto-deploys
                                        ↓  (verify in staging)
                       merge main → production → production auto-deploys
```

---

## Generating Secrets

```bash
# JWT_SECRET (64 random hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ADMIN_KEY (32 random hex chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Always generate **separate** values for staging and production.

---

## Checklist: New Environment

- [ ] Railway service created, linked to correct branch
- [ ] PostgreSQL plugin attached
- [ ] `NODE_ENV` set (`staging` or `production`)
- [ ] `DATABASE_URL` auto-injected by Railway
- [ ] `JWT_SECRET` generated (unique to this env)
- [ ] `CORS_ORIGIN` set to the correct frontend URL
- [ ] `APP_PUBLIC_URL` set to the correct frontend URL
- [ ] `STRIPE_SECRET_KEY` set (test for staging, live for production)
- [ ] `STRIPE_WEBHOOK_SECRET` set (from Stripe Dashboard endpoint)
- [ ] `STRIPE_PRICE_ID_PRO_MONTHLY` set (test or live Price ID)
- [ ] `STRIPE_PRICE_ID_PRO_YEARLY` set (test or live Price ID)
- [ ] `ADMIN_KEY` generated (unique to this env)
- [ ] `SENTRY_DSN` set (optional)
- [ ] Deploy triggered; healthcheck passes (`/healthz`)
- [ ] Stripe CLI test events verified (staging only)
