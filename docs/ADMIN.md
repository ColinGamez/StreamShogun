# Admin API

> **Audience:** Founders / operators with the `ADMIN_KEY` secret.

## Authentication

Every admin request **must** include the `x-admin-key` header:

```
x-admin-key: <your-secret>
```

| Scenario | Response |
| --- | --- |
| `ADMIN_KEY` not configured on server | `501 Not Implemented` |
| Header missing or wrong | `401 Unauthorized` |
| Header matches `ADMIN_KEY` | Request proceeds |

Set `ADMIN_KEY` in `.env` (min 16 characters):

```env
ADMIN_KEY=changeme-super-secret-key-123
```

---

## Endpoints

All endpoints are prefixed with `/v1/admin`.

### GET /v1/admin/users

Paginated list of users (**passwordHash and tokens are never returned**).

| Query Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 25 | Items per page (max 100). `perPage` also accepted. |

```bash
curl -s -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR_HOST/v1/admin/users?page=1&pageSize=25" | jq
```

**Response:**

```json
{
  "data": [
    {
      "id": "clx...",
      "email": "user@example.com",
      "displayName": "Alice",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "subscription": { "plan": "PRO", "status": "ACTIVE", "billingInterval": "MONTHLY" }
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 42 }
}
```

---

### GET /v1/admin/subscriptions

Paginated list of subscriptions with associated user info.

| Query Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 25 | Items per page (max 100). `perPage` also accepted. |

```bash
curl -s -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR_HOST/v1/admin/subscriptions?page=1&pageSize=10" | jq
```

**Response:**

```json
{
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "plan": "PRO",
      "status": "ACTIVE",
      "billingInterval": "MONTHLY",
      "stripeCustomerId": "cus_...",
      "stripeSubscriptionId": "sub_...",
      "currentPeriodEnd": "2026-02-01T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "...",
      "user": { "id": "clx...", "email": "user@example.com", "displayName": "Alice" }
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 10 }
}
```

---

### GET /v1/admin/subscription/:userId

Fetch a single user's subscription details. Returns 404 if the user has no
subscription.

| Path Param | Type | Required | Description |
| --- | --- | --- | --- |
| `userId` | string | **yes** | The user's ID |

```bash
curl -s -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR_HOST/v1/admin/subscription/clx123abc" | jq
```

**Response:**

```json
{
  "data": {
    "id": "clx...",
    "userId": "clx123abc",
    "plan": "PRO",
    "status": "ACTIVE",
    "billingInterval": "MONTHLY",
    "stripeCustomerId": "cus_...",
    "stripeSubscriptionId": "sub_...",
    "currentPeriodEnd": "2026-04-01T00:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "...",
    "user": { "id": "clx123abc", "email": "user@example.com", "displayName": "Alice" }
  }
}
```

---

### GET /v1/admin/feature-flags?userId=

List all feature flags for a specific user.

| Query Param | Type | Required | Description |
| --- | --- | --- | --- |
| `userId` | string | **yes** | The user's ID |

```bash
curl -s -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR_HOST/v1/admin/feature-flags?userId=clx123abc" | jq
```

**Response:**

```json
{
  "data": [
    { "id": "clx...", "userId": "clx...", "key": "beta-epg", "enabled": true }
  ]
}
```

---

### PUT /v1/admin/feature-flags

Create or update a feature flag for a user. Writes an audit-log entry.
Returns 404 if user does not exist.

**Request body (JSON):**

| Field | Type | Required |
| --- | --- | --- |
| `userId` | string | yes |
| `key` | string | yes |
| `enabled` | boolean | yes |

```bash
curl -s -X PUT -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"clx123abc","key":"cloud_sync","enabled":true}' \
  "https://YOUR_HOST/v1/admin/feature-flags" | jq
```

**Response:**

```json
{
  "data": { "id": "clx...", "userId": "clx...", "key": "cloud_sync", "enabled": true }
}
```

---

### POST /v1/admin/grant-pro

Grant PRO subscription to a user **without Stripe**. For alpha testers, support
comps, etc. Upserts the Subscription row. Writes an audit-log entry.
Returns 404 if user does not exist.

**Request body (JSON):**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | string | yes | Must match an existing user |
| `interval` | `"MONTHLY"` \| `"YEARLY"` | yes | Billing interval to record |
| `days` | integer | yes | 1–3650. PRO access duration from now |

```bash
curl -s -X POST -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"clx123abc","interval":"MONTHLY","days":30}' \
  "https://YOUR_HOST/v1/admin/grant-pro" | jq
```

**Response:**

```json
{
  "data": {
    "id": "clx...",
    "userId": "clx123abc",
    "plan": "PRO",
    "status": "ACTIVE",
    "billingInterval": "MONTHLY",
    "stripeCustomerId": null,
    "stripeSubscriptionId": null,
    "currentPeriodEnd": "2026-04-01T12:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### POST /v1/admin/revoke-pro

Downgrade a user from PRO back to FREE. The inverse of `grant-pro`.
Sets `plan = FREE`, `status = CANCELED`, clears `billingInterval` and
`currentPeriodEnd`. Writes an audit-log entry with previous state.
Returns 404 if user or subscription does not exist.

> **⚠️ Warning:** This does **not** cancel the Stripe subscription.
> If the user has an active Stripe subscription, cancel it manually
> through the Stripe dashboard or customer portal first.

**Request body (JSON):**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | string | yes | Must match an existing user with a subscription |
| `reason` | string | no | Optional audit note (max 500 chars) |

```bash
curl -s -X POST -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"clx123abc","reason":"End of beta trial"}' \
  "https://YOUR_HOST/v1/admin/revoke-pro" | jq
```

**Response:**

```json
{
  "data": {
    "id": "clx...",
    "userId": "clx123abc",
    "plan": "FREE",
    "status": "CANCELED",
    "billingInterval": null,
    "stripeCustomerId": null,
    "stripeSubscriptionId": null,
    "currentPeriodEnd": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### GET /v1/admin/audit-log

Paginated list of admin audit-log entries (newest first).

| Query Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 25 | Items per page (max 100). `perPage` also accepted. |

```bash
curl -s -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR_HOST/v1/admin/audit-log?page=1&pageSize=50" | jq
```

**Response:**

```json
{
  "data": [
    {
      "id": "clx...",
      "admin": "founder",
      "action": "feature-flag.set",
      "targetType": "FeatureFlag",
      "targetId": "clx...",
      "payload": { "userId": "clx...", "key": "beta-epg", "enabled": true },
      "createdAt": "2025-01-15T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 5 }
}
```

---

## Audit Log

Every mutating admin action writes a row to the `audit_logs` table:

| Column | Description |
| --- | --- |
| `admin` | Who performed the action (currently `"founder"`) |
| `action` | Machine-readable action name, e.g. `feature-flag.set` |
| `target_type` | Prisma model name, e.g. `FeatureFlag` |
| `target_id` | ID of the affected record |
| `payload` | JSON snapshot of the change |
| `created_at` | Timestamp |

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `ADMIN_KEY` | No (admin disabled if absent) | Shared secret for admin endpoints (min 16 chars) |

---

## Security Notes

- **Passwords are never returned.** User queries use an explicit `select` that omits `passwordHash`.
- **Refresh tokens are never returned.** Session data is not exposed through admin endpoints.
- **x-admin-key is redacted** from all request logs (configured in `logger.ts`).
- **Rate-limited.** Admin routes inherit the global rate limit (100 req/min).
- **No ADMIN_KEY = no access.** If the env var is not set, all admin endpoints return 501.
- **All write operations are audited** via the `audit_logs` table (`grant-pro`, `revoke-pro`, `feature-flag.set`).
