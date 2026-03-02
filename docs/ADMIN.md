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
| `page` | number | 1 | Page number |
| `perPage` | number | 25 | Items per page (max 100) |

**Response:**

```json
{
  "data": [
    {
      "id": "clx...",
      "email": "user@example.com",
      "displayName": "Alice",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "subscription": { "plan": "PRO", "status": "ACTIVE" }
    }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 42 }
}
```

---

### GET /v1/admin/subscriptions

Paginated list of subscriptions with associated user info.

| Query Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | 1 | Page number |
| `perPage` | number | 25 | Items per page (max 100) |

**Response:**

```json
{
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "plan": "PRO",
      "status": "ACTIVE",
      "stripeCustomerId": "cus_...",
      "stripeSubscriptionId": "sub_...",
      "currentPeriodEnd": "2025-02-01T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "...",
      "user": { "id": "clx...", "email": "user@example.com", "displayName": "Alice" }
    }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 10 }
}
```

---

### GET /v1/admin/feature-flags?userId=

List all feature flags for a specific user.

| Query Param | Type | Required | Description |
| --- | --- | --- | --- |
| `userId` | string | **yes** | The user's ID |

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

**Request body (JSON):**

```json
{
  "userId": "clx...",
  "key": "beta-epg",
  "enabled": true
}
```

**Response:**

```json
{
  "data": { "id": "clx...", "userId": "clx...", "key": "beta-epg", "enabled": true }
}
```

---

### GET /v1/admin/audit-log

Paginated list of admin audit-log entries (newest first).

| Query Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | 1 | Page number |
| `perPage` | number | 25 | Items per page (max 100) |

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
  "meta": { "page": 1, "perPage": 25, "total": 5 }
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
- **Rate-limited.** Admin routes inherit the global rate limit (100 req/min).
- **No ADMIN_KEY = no access.** If the env var is not set, all admin endpoints return 501.
