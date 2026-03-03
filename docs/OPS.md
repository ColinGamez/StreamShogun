# StreamShōgun — Operations Runbook

> Last updated: 2026-03-02

## Table of Contents

1. [Secret Rotation](#1-secret-rotation)
2. [Database Backup (Railway Postgres)](#2-database-backup-railway-postgres)
3. [Disable Billing in an Emergency](#3-disable-billing-in-an-emergency)
4. [Rate Limits](#4-rate-limits)
5. [Incident Checklist](#5-incident-checklist)
6. [Monitoring & Alerts](#6-monitoring--alerts)

---

## 1. Secret Rotation

### 1.1 Rotate `JWT_SECRET`

**What it does:** Every issued access token and refresh token is signed with this
secret. Changing it invalidates **all** outstanding tokens instantly.

**Impact:**

- Every logged-in user is force-logged-out (access + refresh tokens fail verification).
- Desktop clients will see "Invalid or expired token" and fall back to offline/cached mode for up to 7 days, then prompt re-login.

**Procedure:**

```
1. Generate a new secret (≥ 32 chars):
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

2. Set the new value in Railway → Variables → JWT_SECRET.
   Railway will redeploy automatically.

3. (Optional) If you want a grace period, deploy with BOTH secrets using
   @fastify/jwt's `secret` array feature (not currently configured — would
   require a code change to accept an array).

4. Confirm: hit GET /v1/features with an old token → expect 401.

5. Communicate to users: "Please sign in again."
```

**What breaks:** All active sessions. The 7-day offline cache on the desktop
client keeps features working during the gap. No data loss occurs.

---

### 1.2 Rotate `STRIPE_WEBHOOK_SECRET`

**What it does:** Stripe signs every webhook payload with this secret.
Changing it on one side without the other causes signature verification failures
(HTTP 400 from our `/v1/billing/webhook`).

**Procedure:**

```
1. In Stripe Dashboard → Developers → Webhooks → select the endpoint.

2. Click "Reveal" on the signing secret. Note the CURRENT whsec_… value.

3. Click "Roll secret" — Stripe gives you a NEW whsec_… value.
   Stripe will send events signed with BOTH secrets for ~24 hours.

4. Set STRIPE_WEBHOOK_SECRET to the NEW value in Railway → Variables.
   Railway redeploys. The API now validates against the new secret.

5. During the 24-hour overlap, events signed with the old secret will
   still succeed because Stripe double-signs. After 24h, only the new
   secret is used.

6. Verify: check logs for "webhook.signature_invalid" errors — there should
   be none after the deploy.
```

**What breaks:** If you skip the overlap (e.g., delete the webhook and recreate),
events during the gap are lost. Stripe retries for up to 72 hours, so set the
new secret promptly.

---

## 2. Database Backup (Railway Postgres)

### Automated Backups

Railway's **Hobby** and **Pro** plans include automatic daily point-in-time
backups with 7-day retention. No configuration needed.

Verify in Railway Dashboard → your Postgres service → **Backups** tab.

### Manual Backups (pg_dump)

```bash
# Get the connection string from Railway → Variables → DATABASE_URL
# Example: postgresql://user:pass@host:port/dbname

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file=streamshogun-$(date +%Y%m%d-%H%M%S).dump
```

### Restore

```bash
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --no-owner \
  streamshogun-20260302-120000.dump
```

### Best Practices

- Take a manual dump **before** every `prisma migrate deploy` or schema change.
- Store dumps in a separate location (S3, local encrypted drive).
- Test restores quarterly — a backup you've never restored is not a backup.

---

## 3. Disable Billing in an Emergency

Two methods, from fastest to most thorough:

### 3.1 Feature Flag Kill-Switch (seconds, no deploy)

Set the `BILLING_DISABLED` env var in Railway:

```
BILLING_DISABLED=true
```

Railway redeploys. All `/v1/billing/*` endpoints (checkout, portal, webhook)
immediately return **503 Service Unavailable**.

Existing subscriptions are unaffected — users keep their current plan.
Stripe webhook events during the disabled window will get 503 responses;
Stripe will retry them for up to 72 hours. Re-enable before that window closes
to avoid data loss.

**To re-enable:** remove `BILLING_DISABLED` or set it to any value other
than `"true"`.

### 3.2 Remove Stripe Keys (minutes, no deploy)

Delete `STRIPE_SECRET_KEY` from Railway Variables. The billing routes will
return 501 Not Implemented. Webhook events will also fail (Stripe retries).

### 3.3 Disable the Stripe Webhook Endpoint (Stripe Dashboard)

In Stripe Dashboard → Developers → Webhooks → disable the endpoint.
This stops events at the source. Checkout/portal still work but subscription
state won't sync. Useful if you suspect webhook abuse.

---

## 4. Rate Limits

| Route                   | Limit       | Window   |
| ----------------------- | ----------- | -------- |
| Global (all routes)     | 100 req/IP  | 1 minute |
| `POST /v1/auth/register`| 5 req/IP   | 1 minute |
| `POST /v1/auth/login`   | 10 req/IP  | 1 minute |
| `POST /v1/auth/refresh` | 20 req/IP  | 1 minute |
| `POST /v1/auth/logout`  | 20 req/IP  | 1 minute |
| `POST /v1/billing/checkout` | 5 req/IP | 1 minute |
| `POST /v1/billing/portal`   | 5 req/IP | 1 minute |
| `POST /v1/billing/webhook`  | Global only | —    |

Exceeding the limit returns **429 Too Many Requests** with a `Retry-After`
header from `@fastify/rate-limit`.

To adjust globally, edit the `rateLimit` plugin options in `app.ts`.
Per-route limits are set via `config.rateLimit` in each route definition.

---

## 5. Incident Checklist

Use this when something is broken in production.

### Assess (first 5 minutes)

- [ ] **What is broken?** Auth? Billing? All routes? DB?
- [ ] Check Railway Dashboard → service health, recent deploys, crash logs.
- [ ] Check Railway Postgres → **Metrics** tab → connections, CPU, storage.
- [ ] Check Sentry for error spikes (if `SENTRY_DSN` is configured).
- [ ] Check Stripe Dashboard → Developers → Events for webhook failures.

### Contain (next 10 minutes)

- [ ] If billing is the problem → set `BILLING_DISABLED=true` (see §3.1).
- [ ] If auth is the problem → check JWT_SECRET is set, DB is reachable.
- [ ] If DB is down → check Railway Postgres; recent migration? Disk full?
- [ ] If deploy caused it → **Rollback**: Railway → Deployments → click
      the last known good deploy → "Redeploy".

### Diagnose

- [ ] Pull recent logs: Railway → service → Logs (or use `railway logs`).
- [ ] Search for `request error:` or `webhook.handler_error` log entries.
- [ ] Check for `❌ Invalid environment variables` in startup logs (env misconfiguration).
- [ ] If Prisma errors → check `DATABASE_URL`, run `prisma migrate deploy`.

### Resolve

- [ ] Apply fix (env var change, code patch, rollback).
- [ ] Verify fix: hit `/healthz` → 200, test affected endpoint manually.
- [ ] If billing was disabled, re-enable and verify Stripe webhook delivery
      (Stripe Dashboard → Webhooks → check for pending retries).

### Post-Incident

- [ ] Write a brief post-mortem: timeline, root cause, fix, prevention.
- [ ] File a follow-up ticket for any hardening needed.
- [ ] If secrets were potentially compromised → rotate immediately (see §1).

---

## 6. Monitoring & Alerts

### 6.1 Health Endpoint

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Railway health check (30 s). Returns `status`, `db`, `stripeKeyConfigured`, `billingEnabled`, `uptime`, `version`. |
| `GET /healthz/details` | Internal diagnostics — adds DB latency, memory, Node version, Sentry status. |

A `503` response means the database is unreachable (`"status": "degraded"`).

### 6.2 Structured Log Queries

All API logs are JSON (Pino). Use Railway Logs or any log aggregator.

| What to find | Log query / field |
| --- | --- |
| Failed Stripe invoice | `stripe.metric: invoice.payment_failed` |
| Deleted subscription | `stripe.metric: subscription.deleted` |
| Webhook handler crash | `webhook.handler_error` |
| Slow requests (> 1 s) | `responseTimeMs` > 1000 in `request.completed` lines |
| Auth failures | `statusCode: 401` |

Every response includes an `X-Request-Id` header for end-to-end correlation.

### 6.3 Sentry (Optional)

If `SENTRY_DSN` is set, unhandled errors **and** webhook handler errors are
reported automatically. Check the Sentry dashboard for:

- Spike in `webhook.handler_error` events
- Unhandled promise rejections
- High error rate on any endpoint

### 6.4 Daily Checks

- [ ] `curl $API_URL/healthz` → 200, `db: true`, `billingEnabled: true`.
- [ ] Sentry: no new unresolved issues.
- [ ] Stripe Dashboard → Webhooks → no sustained failures / pending retries.
- [ ] Railway Metrics: memory < 80 %, restart count = 0.
