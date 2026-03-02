# StreamShōgun SaaS — Release Playbook

> Canonical reference for shipping StreamShōgun. Every deploy, rollback, and
> incident should follow this document. Keep it up to date with the codebase.

---

## Table of Contents

1. [Environments](#1-environments)
2. [Required Environment Variables](#2-required-environment-variables)
3. [Database Migration Procedure](#3-database-migration-procedure)
4. [Rollback Strategy](#4-rollback-strategy)
5. [Stripe Key Separation](#5-stripe-key-separation)
6. [Monitoring Checklist](#6-monitoring-checklist)
7. [Incident Checklist](#7-incident-checklist)
8. [Data Backup Notes](#8-data-backup-notes)
9. [Versioning Policy](#9-versioning-policy)

---

## 1. Environments

| Property | **Local** | **Staging** | **Production** |
|---|---|---|---|
| API URL | `http://localhost:8787` | `https://api-staging.streamshogun.com` | `https://api.streamshogun.com` |
| Database | PG on `localhost:5432` (Docker) or `localhost:5433` (native) | Managed PG (e.g. Neon, Supabase, RDS) | Managed PG with HA / read replicas |
| Stripe mode | **Test** keys (`sk_test_…`) | **Test** keys (`sk_test_…`) | **Live** keys (`sk_live_…`) |
| Desktop build | Dev (`pnpm dev`) | Internal alpha (unsigned) | Signed release (`pnpm build:win/mac/linux`) |
| CORS origin | `http://localhost:5173` | `https://staging.streamshogun.com` | `https://app.streamshogun.com` |
| Log level | `debug` | `info` | `warn` |
| Sentry | Disabled | Enabled (staging DSN) | Enabled (prod DSN) |

### Local Quick-Start

```bash
# 1. Start Postgres
pnpm db:up                            # Docker — port 5432
# — or use native PG on port 5433, password 'jptv'

# 2. Push schema + seed
pnpm db:push
pnpm db:seed

# 3. Generate Prisma client
pnpm prisma:generate

# 4. Run everything
pnpm dev          # Electron + Vite + HMR
pnpm dev:api      # Fastify API on :8787
```

---

## 2. Required Environment Variables

All variables are validated at boot by Zod (`apps/api/src/config/env.ts`).
A missing or invalid value crashes the process immediately — no silent misconfig.

### API (`apps/api/.env`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `8787` | API listen port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `DATABASE_URL` | **Yes** | — | Full Postgres connection string incl. `?schema=public` |
| `JWT_SECRET` | **Yes** | — | ≥ 16 chars, use ≥ 64 in prod |
| `JWT_ACCESS_TTL` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | No | `7d` | Refresh token lifetime |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed origin(s) |
| `SENTRY_DSN` | No | — | Sentry ingest URL; omit to disable |
| `ADMIN_KEY` | No | — | ≥ 16 chars; enables `/v1/admin` endpoints |
| `STRIPE_SECRET_KEY` | No | — | Must start with `sk_`; enables `/v1/billing` |
| `STRIPE_WEBHOOK_SECRET` | No | — | Must start with `whsec_` |
| `STRIPE_PRICE_ID` | No | — | Must start with `price_` |

### Backend (`apps/backend/.env`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `3001` | Backend listen port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `DATABASE_URL` | **Yes** | — | Postgres connection string |
| `JWT_SECRET` | **Yes** | — | Must match the API secret if both services share tokens |
| `CORS_ORIGIN` | No | `http://localhost:5173` | |

### Secrets Management Rules

- **Never** commit `.env` files — only `.env.example`.
- Store secrets in your CI/CD platform's secret store (GitHub Actions secrets, Fly.io secrets, etc.).
- Rotate `JWT_SECRET` at least quarterly in prod; coordinate with active refresh tokens.
- `ADMIN_KEY` should be unique per environment and ≥ 32 chars in prod.

---

## 3. Database Migration Procedure

StreamShōgun uses **Prisma** with PostgreSQL. Two workflows exist:

### Development (schema push)

```bash
# Fast iteration — no migration file; use for local + early staging only
pnpm db:push
```

### Production (migration-based)

```bash
# 1. Create a named migration from schema changes
pnpm --filter @stream-shogun/api exec prisma migrate dev --name <description>

# 2. Review the generated SQL in prisma/migrations/<timestamp>_<description>/

# 3. Apply to staging
DATABASE_URL="<staging-url>" pnpm --filter @stream-shogun/api exec prisma migrate deploy

# 4. Smoke-test staging (see Monitoring Checklist §6)

# 5. Apply to production
DATABASE_URL="<prod-url>" pnpm --filter @stream-shogun/api exec prisma migrate deploy
```

### Pre-Flight Checks

- [ ] Local typecheck passes: `pnpm typecheck`
- [ ] Lint clean: `pnpm lint`
- [ ] All 96+ tests pass: `pnpm test`
- [ ] Prisma client regenerated: `pnpm prisma:generate`
- [ ] Migration SQL reviewed for destructive ops (column drops, table renames)
- [ ] Estimated migration time for large tables documented in PR

### Handling Prisma Drift

If the live database has drifted from the migration history:

```bash
# Resolve drift — creates a corrective migration
prisma migrate diff --from-schema-datasource prisma/schema.prisma \
                     --to-migrations ./prisma/migrations \
                     --script > fix.sql
# Review fix.sql before applying
```

---

## 4. Rollback Strategy

### API Rollback

| Layer | Rollback Method |
|---|---|
| **Application code** | Redeploy previous container/commit. Keep the last 3 tagged images. |
| **Database — additive migration** | No action needed; old code ignores new nullable columns. |
| **Database — destructive migration** | Restore from point-in-time backup (see §8). |
| **Stripe webhook** | Webhook endpoint version is immutable; no rollback needed. |

### Step-by-Step API Rollback

1. **Identify** the bad deploy (commit SHA / image tag).
2. **Revert** to the last known-good tag:
   ```bash
   # Container-based (e.g. Fly, Railway)
   fly deploy --image registry.fly.io/streamshogun-api:<good-tag>
   # — or Git-based
   git revert <bad-sha> && git push
   ```
3. **Database**: If the new deploy included a migration:
   - **Additive only** (new columns, new tables): old code runs fine against the new schema. No DB rollback.
   - **Destructive** (dropped columns, changed types): restore from backup, then redeploy old migration state.
4. **Verify** health endpoint responds and Sentry error rate drops.
5. **Notify** the team in the incident channel.

### Desktop Client Rollback

- Electron auto-updater points to a release channel. Publish a new patch version
  that reverts the offending change — the updater will push it to all clients.
- Never delete a published release; instead, mark it as a draft and publish the fix.

### Feature Flag Kill-Switch

Feature flags (`FeatureFlag` model, `cloud_sync` key, etc.) can disable a feature
server-side without redeployment:

```bash
curl -X PUT https://api.streamshogun.com/v1/admin/flags \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uid>","key":"cloud_sync","enabled":false}'
```

---

## 5. Stripe Key Separation

Stripe keys **must never** cross environment boundaries.

| Environment | Secret Key | Webhook Secret | Price ID |
|---|---|---|---|
| **Local** | `sk_test_…` (personal) | `whsec_…` (Stripe CLI) | `price_…` (test mode) |
| **Staging** | `sk_test_…` (shared test) | `whsec_…` (staging endpoint) | `price_…` (test mode) |
| **Production** | `sk_live_…` | `whsec_…` (prod endpoint) | `price_…` (live mode) |

### Rules

1. **`sk_live_` keys are only set in the production secret store.** Never in `.env` files, CI logs, or staging.
2. The Zod schema enforces the `sk_` prefix — a `pk_` (publishable) key will crash the API on boot.
3. Create a **separate Stripe webhook endpoint** per environment in the Stripe Dashboard:
   - Staging: `https://api-staging.streamshogun.com/v1/billing/webhook`
   - Production: `https://api.streamshogun.com/v1/billing/webhook`
4. Use the **Stripe CLI** for local webhook testing:
   ```bash
   stripe listen --forward-to localhost:8787/v1/billing/webhook
   # Copy the whsec_ value it prints into your local .env
   ```
5. Stripe events are deduplicated via the `ProcessedEvent` model — replaying events is safe.
6. **Never** log full Stripe keys. The API startup log shows only the key prefix (`sk_test_…****`).

---

## 6. Monitoring Checklist

### Per-Deploy Smoke Test

- [ ] `GET /health` returns `200` with `{ status: "ok" }`
- [ ] `POST /v1/auth/register` + `/v1/auth/login` flow works
- [ ] `GET /v1/features` returns plan + flags for a test user
- [ ] `GET /v1/cloud/sync` returns `200` for an authenticated PRO user
- [ ] `POST /v1/billing/checkout` creates a Stripe Checkout session (staging)
- [ ] Webhook test event processed without error (staging)
- [ ] Desktop client connects and syncs after update

### Ongoing Monitoring

| Signal | Tool | Alert Threshold |
|---|---|---|
| API error rate (5xx) | Sentry | > 1% of requests over 5 min |
| API latency (p95) | Hosting metrics / Prometheus | > 500 ms |
| Database connections | PG `pg_stat_activity` | > 80% of pool max |
| Database size | `pg_database_size()` | > 80% of plan quota |
| Stripe webhook failures | Stripe Dashboard → Webhooks | Any failed delivery > 1 hr old |
| JWT refresh failures | Sentry breadcrumbs | Spike in `401` on `/v1/auth/refresh` |
| Cloud Sync conflict rate | Application logs | > 10% of PUT `/v1/cloud/sync` returning `409` |
| Disk / memory | Hosting platform alerts | > 85% utilization |

### Log Inspection

```bash
# Fastify logs are structured JSON (pino)
# Local: human-readable via pino-pretty (devDependency)
# Prod: pipe to log aggregator (Datadog, Grafana Loki, etc.)
```

---

## 7. Incident Checklist

When something breaks in production:

### Triage (first 5 minutes)

- [ ] **Acknowledge** — post in #incidents: "Investigating [symptom]"
- [ ] **Assess severity**:
  - **SEV-1**: API fully down, all users affected → page on-call
  - **SEV-2**: Feature degraded (e.g. sync broken, billing failing) → active investigation
  - **SEV-3**: Minor / cosmetic → fix in next release
- [ ] **Check Sentry** for new unhandled exceptions
- [ ] **Check hosting dashboard** for deploy in the last 60 min

### Mitigate (next 15 minutes)

- [ ] If caused by latest deploy → **rollback** (see §4)
- [ ] If caused by a specific feature → **disable via feature flag**
- [ ] If database-related → check connection pool, run `SELECT 1` health check
- [ ] If Stripe-related → check Stripe Status page; pause webhook retries if needed

### Resolve

- [ ] Root cause identified and documented
- [ ] Fix deployed to staging and verified
- [ ] Fix deployed to production
- [ ] Sentry issue resolved / error rate returned to baseline

### Post-Mortem (within 48 hours)

- [ ] Timeline written (detected → mitigated → resolved)
- [ ] Root cause analysis (5-whys or similar)
- [ ] Action items created (issues filed):
  - Preventive measures (tests, alerts, guardrails)
  - Detection improvements (faster alerting)
  - Process updates (this playbook amended if needed)
- [ ] Post-mortem shared with team

---

## 8. Data Backup Notes

### PostgreSQL Backups

| Strategy | Frequency | Retention | Notes |
|---|---|---|---|
| **Managed provider snapshots** (Neon, Supabase, RDS) | Continuous / daily | 7–30 days | Preferred; point-in-time recovery (PITR) |
| **`pg_dump` via cron** | Daily at 03:00 UTC | 14 days | Fallback for self-hosted; compress with `gzip` |
| **WAL archiving** | Continuous | 7 days | Enables PITR on self-hosted PG |

### Backup Verification

- [ ] Restore a backup to a scratch database **monthly**
- [ ] Run `prisma migrate deploy` against the restored DB to confirm migration state
- [ ] Run read-only smoke queries (`SELECT count(*) FROM users`, etc.)

### What to Back Up

| Data | Location | Backed Up By |
|---|---|---|
| User accounts, subscriptions, sessions | PostgreSQL `users`, `subscriptions`, `sessions` | DB backup |
| Cloud sync data (settings, favorites, history) | PostgreSQL `app_settings_cloud` | DB backup |
| Feature flags, audit logs | PostgreSQL `feature_flags`, `audit_logs` | DB backup |
| Stripe billing state | Stripe (source of truth) | Stripe retains indefinitely |
| Desktop local data (SQLite, localStorage) | User's machine | User responsibility; cloud sync mitigates loss |
| Prisma migration history | Git (`prisma/migrations/`) | Git |

### Disaster Recovery

1. Provision a new PostgreSQL instance.
2. Restore from the latest backup / PITR snapshot.
3. Point `DATABASE_URL` to the new instance.
4. Run `prisma migrate deploy` to apply any pending migrations.
5. Redeploy the API and verify with the smoke test (§6).

---

## 9. Versioning Policy

### Semantic Versioning

StreamShōgun follows [SemVer 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
```

| Bump | When | Example |
|---|---|---|
| **MAJOR** | Breaking API contract changes, incompatible DB migrations, forced desktop update | `1.0.0` → `2.0.0` |
| **MINOR** | New features (cloud sync, new billing tier), additive API endpoints | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fixes, security patches, dependency updates | `1.1.0` → `1.1.1` |

### Version Locations

| File / Config | Purpose |
|---|---|
| Root `package.json` → `version` | Monorepo source of truth (currently `0.1.0`) |
| `apps/desktop/package.json` → `version` | Electron builder reads this for installer version |
| Git tags (`v0.1.0`) | Immutable release markers; CI triggers publish on tag push |
| GitHub Releases | Changelog + downloadable desktop installers |

### Release Flow

```
feature branch → PR → main (squash merge)
                        │
                        ├─ CI: typecheck + lint + test
                        │
                        └─ Tag vX.Y.Z → CI: build + publish
                              │
                              ├─ API: deploy to staging → smoke test → deploy to prod
                              ├─ Desktop: build Win/Mac/Linux → upload to GitHub Release
                              └─ Shared/Core: publish to internal registry (if needed)
```

### Pre-Release Tags

For staging / beta testing:

```
v1.2.0-beta.1   → internal testers
v1.2.0-rc.1     → release candidate
v1.2.0           → general availability
```

### Desktop Auto-Update Channel

- `latest` — stable releases (default)
- `beta` — opt-in pre-releases via Settings

---

*Last updated: 2026-03-02 · StreamShōgun v0.1.0*
