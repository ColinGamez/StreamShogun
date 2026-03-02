# Observability — StreamShōgun API on Railway

How structured logging, error tracking, and health checks work in the
`apps/api` Fastify server, and how to debug issues on Railway.

---

## Architecture

```
Request → Fastify (pino JSON logger) → Railway Log Drain → your dashboard
           │
           ├─ onRequest hook   → logs { reqId, method, url }
           ├─ onResponse hook  → logs { reqId, method, url, statusCode, responseTimeMs }
           ├─ error handler    → logs { reqId, err.message, err.stack (truncated), statusCode }
           │                      ↳ 5xx also sent to Sentry (if SENTRY_DSN set)
           └─ /healthz         → silenced in logs (Railway polls every 30s)
```

Every log line is a JSON object (pino). Every log line from a request handler
includes `reqId` — a UUID v4 generated at request entry. Use it to correlate
all log lines from a single request.

---

## Log Format (Production)

```jsonc
// onRequest
{"level":30,"time":1709337600000,"reqId":"a1b2c3d4-...","method":"POST","url":"/v1/auth/login","msg":"incoming request"}

// onResponse
{"level":30,"time":1709337600050,"reqId":"a1b2c3d4-...","method":"POST","url":"/v1/auth/login","statusCode":200,"responseTimeMs":48,"msg":"request completed"}

// error (4xx/5xx)
{"level":50,"time":1709337600100,"reqId":"a1b2c3d4-...","method":"PUT","url":"/v1/cloud/sync","err":{"message":"Conflict","stack":"Error: Conflict\n  at ... (15 more frames)","name":"ConflictError","statusCode":409},"msg":"request error: Conflict"}
```

---

## Log Redaction

These fields are replaced with `[REDACTED]` in all log output automatically:

| Category | Paths |
|---|---|
| **Auth body fields** | `password`, `newPassword`, `confirmPassword`, `currentPassword`, `refreshToken`, `token` |
| **Headers** | `authorization`, `cookie`, `x-admin-key`, `stripe-signature` |
| **Error context** | `err.config.headers.authorization`, `err.config.headers.cookie` |

Redaction is applied by pino at serialization time — values never reach log
output, even if a library accidentally logs the full request object.

Configuration: [`apps/api/src/config/logger.ts`](../apps/api/src/config/logger.ts)

---

## Error Handling

All errors pass through the global Fastify error handler in
[`apps/api/src/app.ts`](../apps/api/src/app.ts):

- Uses `request.log.error()` (not `app.log.error()`) so `reqId` is always present
- Stack traces are truncated to 15 lines to avoid flooding log aggregators
- 4xx errors: logged, NOT sent to Sentry
- 5xx errors: logged AND sent to Sentry (if enabled)
- Client response never includes stack traces or internal details

---

## Health Checks

| Endpoint | Purpose | Logged? |
|---|---|---|
| `GET /healthz` | Returns `{ status, db, uptime, version }`. Railway polls this. | **No** — silenced to avoid log noise |
| `GET /healthz/details` | DB latency, memory, Node version, Sentry status | **No** — same silencing |

Railway hits `/healthz` every 30s (`railway.json` → `healthcheckPath`).
If it returns non-200 for 30s, Railway marks the service as unhealthy.

```bash
# Check health manually
curl https://<railway-domain>/healthz | jq .
curl https://<railway-domain>/healthz/details | jq .
```

Expected healthy response:
```json
{ "status": "ok", "db": true, "uptime": 3600, "version": "0.1.0" }
```

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Override log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `SENTRY_DSN` | *(unset)* | Sentry error tracking for 5xx errors |
| `NODE_ENV` | — | `production` → JSON output; anything else → pino-pretty |

---

## Sentry Integration (Optional)

Enabled by setting `SENTRY_DSN`. All Sentry code is a no-op without it.

| Setting | Value |
|---|---|
| `tracesSampleRate` | 20% in production, 100% in dev |
| `sendDefaultPii` | `false` (GDPR-safe) |
| `environment` | `NODE_ENV` value |
| `release` | `package.json` version |

Verify: `GET /healthz/details` → `"sentry": true`

Source: [`apps/api/src/lib/sentry.ts`](../apps/api/src/lib/sentry.ts)

---

## Debugging on Railway

### 1. View logs

Railway dashboard → **Service** → **Deployments** → click active deployment → **View Logs**.

Filter by:
- **Request ID**: search for the `reqId` UUID
- **Endpoint**: search for a URL path (e.g. `/v1/auth/login`)
- **Status**: search for `"statusCode":500`
- **Errors only**: search for `"level":50`

### 2. Correlating a user report

1. User provides the time the error occurred.
2. Search Railway logs for `"level":50` around that timestamp.
3. Copy the `reqId` from the error log.
4. Search for that `reqId` — you'll see the full lifecycle:
   - `"msg":"incoming request"` — what they sent
   - `"msg":"request error: ..."` — what broke
   - (No `request completed` for errors — error handler responds instead.)

### 3. Temporarily increase log verbosity

Railway → Variables → set `LOG_LEVEL=debug` → redeploy.
Debug, then revert to `LOG_LEVEL=info` to reduce volume.

### 4. Common issues

| Symptom | Log pattern | Fix |
|---|---|---|
| `/healthz` returns `db: false` | No log (health silenced) | Check `DATABASE_URL` references the Railway PG service |
| 500 on auth endpoints | `"msg":"request error: ..."` with bcrypt/JWT stack | Verify `JWT_SECRET` ≥ 16 chars and bcrypt native compiled |
| CORS rejections | No server log (browser blocks pre-flight) | Add origin to `CORS_ORIGIN` |
| Rate limit 429 | `"statusCode":429` in response log | Default: 100 req/min per IP |
| Stripe webhook 400 | Error on `/v1/billing/webhook` | Verify `STRIPE_WEBHOOK_SECRET` matches the Railway endpoint |
| Prisma connection timeout | `"Can't reach database server"` | Check PG plugin status, redeploy |

### 5. Graceful shutdown

On `SIGTERM` (Railway sends this before stopping):
1. Fastify stops accepting new connections
2. In-flight requests complete
3. Sentry flushes pending events (2s timeout)
4. Prisma disconnects
5. Process exits 0

Log line: `Received SIGTERM, shutting down …`

---

## Log Volume Estimates

| Level | Lines per request | Notes |
|---|---|---|
| `info` | 2 | `incoming request` + `request completed` |
| `error` | 1 (replaces `completed`) | Error handler log |
| `debug` | 2+ | Plus any `request.log.debug()` in routes |

At 100 req/min, `info` level ≈ 200 lines/min ≈ 288K lines/day.
Railway free tier retains 24h. Paid plans support log drains to
Datadog, Grafana Cloud, Axiom, etc.

---

## Verifying Locally

```bash
# Start the API
pnpm dev:api

# Health check
curl http://localhost:8787/healthz | jq .
curl http://localhost:8787/healthz/details | jq .

# Trigger structured logs — watch terminal
curl http://localhost:8787/v1/does-not-exist
# → 404 with reqId-correlated error log

# Confirm redaction
curl -X POST http://localhost:8787/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"secret123"}'
# → log shows: "password":"[REDACTED]"
```

---

*Last updated: 2026-03-02*
