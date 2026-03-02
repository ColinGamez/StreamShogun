# Billing (Stripe Subscriptions)

> **Status:** Opt-in. Set the four `STRIPE_*` / `APP_PUBLIC_URL` env vars to enable.

## Architecture

```
User ──POST /v1/billing/checkout──► API ──► Stripe Checkout
                                            │
                                            ▼
                                    Stripe hosted page
                                            │
                                            ▼
Stripe ──POST /v1/billing/webhook──► API ──► Update Subscription table

User ──POST /v1/billing/portal───► API ──► Stripe Customer Portal
```

- **Server is source of truth.** The client never decides the plan.
- **Webhooks are idempotent.** Each Stripe event ID is stored in `processed_events`; duplicates are skipped.
- **Signature-verified.** The raw request body is verified against `STRIPE_WEBHOOK_SECRET`.

---

## Environment Variables

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes (to enable) | `sk_test_51...` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes (for webhooks) | `whsec_...` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID_PRO` | Yes (for checkout) | `price_1...` | Stripe recurring Price ID for PRO |
| `APP_PUBLIC_URL` | No | `https://app.streamshogun.com` | Return URL base (falls back to `CORS_ORIGIN`) |

If `STRIPE_SECRET_KEY` or `STRIPE_PRICE_ID_PRO` are missing, billing endpoints return `501 Not Implemented`.

---

## Endpoints

All prefixed with `/v1/billing`.

### POST /v1/billing/checkout

Creates a Stripe Checkout session for PRO subscription upgrade.

- **Auth:** JWT (Bearer token)
- **Rate limit:** 10 req / min

**Response:**

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

The client should redirect the user to this URL.

**Query params on redirect back:**
- Success: `?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `?canceled=1`

---

### POST /v1/billing/portal

Creates a Stripe Customer Portal session for managing subscription / invoices.

- **Auth:** JWT (Bearer token)
- **Rate limit:** 10 req / min

**Response:**

```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

---

### POST /v1/billing/webhook

Receives Stripe webhook events. **No auth header** — uses `stripe-signature` header for verification.

**Response:** `200 { "received": true }`

---

## Handled Webhook Events

| Event | Action |
| --- | --- |
| `checkout.session.completed` | Set plan → PRO, status → ACTIVE, store Stripe IDs |
| `customer.subscription.created` | Upsert plan/status + period end |
| `customer.subscription.updated` | Upsert plan/status + period end |
| `customer.subscription.deleted` | Revert to FREE, status → CANCELED, clear Stripe IDs |
| `invoice.paid` | Set status → ACTIVE |
| `invoice.payment_failed` | Set status → PAST_DUE |

### Status Mapping

| Stripe Status | Our Status | Plan |
| --- | --- | --- |
| `active`, `trialing` | ACTIVE | PRO |
| `past_due`, `unpaid` | PAST_DUE | FREE |
| `canceled`, `incomplete_expired`, others | CANCELED | FREE |

Plan = PRO **only** when status = ACTIVE. All other statuses fall back to FREE.

---

## Feature Flags & Plan Status

`GET /v1/features` returns subscription status:

```json
{
  "plan": "PRO",
  "flags": { "auto_refresh": true, "multi_playlist": true, "...": true },
  "subscription": {
    "status": "ACTIVE",
    "currentPeriodEnd": "2026-04-01T00:00:00.000Z"
  }
}
```

**Flag logic:**
- PRO + ACTIVE → all flags `true` (unless individually overridden)
- PRO + PAST_DUE/CANCELED → flags treated as FREE (`false`)
- Feature flag overrides always take precedence

---

## Database Models

### Subscription (existing, updated)

```prisma
model Subscription {
  plan               Plan               @default(FREE)
  status             SubscriptionStatus  @default(ACTIVE)
  stripeCustomerId   String?            @unique
  stripeSubscriptionId String?          @unique
  currentPeriodEnd   DateTime?
}
```

### ProcessedEvent (idempotency)

```prisma
model ProcessedEvent {
  id          String   @id    // Stripe event ID (evt_…)
  processedAt DateTime @default(now())
}
```

---

## Local Development with Stripe CLI

### 1. Install Stripe CLI

```bash
# macOS/Linux
brew install stripe/stripe-cli/stripe

# Windows (scoop)
scoop install stripe

# Or download: https://github.com/stripe/stripe-cli/releases
```

### 2. Login & forward webhooks

```bash
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:8787/v1/billing/webhook
```

Copy the `whsec_…` secret from the output → set as `STRIPE_WEBHOOK_SECRET` in `.env`.

### 3. Set up test environment

```env
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_… (from stripe listen output)
STRIPE_PRICE_ID_PRO=price_… (create a recurring price in Stripe Dashboard)
```

### 4. Trigger test events

```bash
# Full checkout flow
stripe trigger checkout.session.completed

# Individual events
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

### 5. End-to-end test

```bash
# Register a user
curl -X POST http://localhost:8787/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"testpassword123"}'

# Use the accessToken from the response
TOKEN="ey…"

# Create checkout session
curl -X POST http://localhost:8787/v1/billing/checkout \
  -H "Authorization: Bearer $TOKEN"
# → Open the returned URL → use test card 4242 4242 4242 4242

# Check features after subscription activates
curl http://localhost:8787/v1/features \
  -H "Authorization: Bearer $TOKEN"
# → plan: "PRO", flags: all true

# Open billing portal
curl -X POST http://localhost:8787/v1/billing/portal \
  -H "Authorization: Bearer $TOKEN"
# → Open URL to manage/cancel subscription
```

---

## Railway Deployment

Required env vars in Railway Variables tab:

1. **`STRIPE_SECRET_KEY`** — Live key for production, test key for staging
2. **`STRIPE_WEBHOOK_SECRET`** — From Stripe Dashboard webhook endpoint
3. **`STRIPE_PRICE_ID_PRO`** — Recurring price ID for PRO plan
4. **`APP_PUBLIC_URL`** — Your frontend URL (for checkout return redirects)

### Stripe Dashboard Webhook Setup

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. URL: `https://streamshogun-production.up.railway.app/v1/billing/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Railway

---

## Security

- **No client trust.** Plan determined server-side via webhooks only.
- **Idempotent.** `processed_events` table prevents double-processing.
- **Signature verified.** Raw body + `stripe-signature` header checked before any processing.
- **Rate-limited.** Checkout and portal limited to 10 req/min per IP.
- **Secrets redacted.** `stripe-signature`, `Authorization` headers, and Stripe keys never logged.
- **Lazy customer creation.** Stripe customer created on first checkout/portal request, linked by userId.
