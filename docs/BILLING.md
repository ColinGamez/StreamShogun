# Billing — Stripe Subscription Integration

StreamShōgun supports PRO subscriptions with **monthly** and **yearly** billing
intervals via Stripe Checkout, Portal, and Webhooks.

---

## Architecture

```
Client (desktop / web)
  │
  ├─ POST /v1/billing/checkout  { interval: "monthly" | "yearly" }
  │    → returns { url }  (Stripe Checkout redirect)
  │
  ├─ POST /v1/billing/portal
  │    → returns { url }  (Stripe Customer Portal redirect)
  │
  └─ GET  /v1/features
       → { plan, subscriptionStatus, billingInterval, flags }

Stripe ──webhook──▶ POST /v1/billing/webhook
                      │
                      ├─ Signature verification (STRIPE_WEBHOOK_SECRET)
                      ├─ Idempotency (WebhookEvent unique constraint)
                      └─ Updates Subscription row → server is source of truth
```

---

## Environment Variables

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | `sk_test_…` / `sk_live_…` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes (for webhooks) | `whsec_…` | Webhook signing secret |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | Yes (for checkout) | `price_1…` | Monthly recurring Price ID |
| `STRIPE_PRICE_ID_PRO_YEARLY` | Yes (for checkout) | `price_1…` | Yearly recurring Price ID |
| `APP_PUBLIC_URL` | Recommended | `https://app.streamshogun.com` | Return URLs for Checkout/Portal |
| `STRIPE_PORTAL_RETURN_URL` | Optional | `https://app.streamshogun.com/settings` | Portal return URL (defaults to `APP_PUBLIC_URL`) |

If `STRIPE_SECRET_KEY` is missing, billing endpoints return `501 Not Implemented`.
If a price ID is missing for the requested interval, checkout returns `501`.

### Environment Guard

A runtime assertion in `lib/stripe.ts` **blocks `sk_live_*` keys** when
`NODE_ENV ≠ "production"`. This prevents accidentally charging real customers
from staging or development. See [ENVIRONMENTS.md](ENVIRONMENTS.md) for the
full key safety matrix.

---

## Stripe Dashboard Setup

### 1. Create Products & Prices

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/products).
2. Create a product called **"StreamShōgun PRO"** (or similar).
3. Add **two recurring prices**:
   - **Monthly**: e.g. $9.99/month → copy the `price_…` ID → `STRIPE_PRICE_ID_PRO_MONTHLY`
   - **Yearly**: e.g. $99.99/year → copy the `price_…` ID → `STRIPE_PRICE_ID_PRO_YEARLY`
4. For testing, use Test Mode prices first (`sk_test_…`).

### 2. Create Webhook Endpoint

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks).
2. Add endpoint: `https://<your-api-domain>/v1/billing/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

### 3. Customer Portal

1. Go to [Stripe Dashboard → Settings → Customer Portal](https://dashboard.stripe.com/settings/billing/portal).
2. Enable the features you want (cancel, update payment method, etc.).
3. The portal is available at `POST /v1/billing/portal`.

---

## Stripe CLI — Local Testing

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:8787/v1/billing/webhook

# Copy the whsec_... value and set it in .env:
# STRIPE_WEBHOOK_SECRET=whsec_...

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

### Test Cards

| Card | Behavior |
| --- | --- |
| `4242424242424242` | Succeeds |
| `4000000000000341` | Attaches, fails on charge |
| `4000000000009995` | Declined |
| `4000002500003155` | Requires 3D Secure |

---

## Handled Webhook Events

| Event | Action |
| --- | --- |
| `checkout.session.completed` | Set plan=PRO, status=ACTIVE, store billingInterval |
| `customer.subscription.created` | Upsert subscription (plan, status, interval, periodEnd) |
| `customer.subscription.updated` | Upsert subscription (plan, status, interval, periodEnd) |
| `customer.subscription.deleted` | Revert to FREE/CANCELED, clear billingInterval |
| `invoice.paid` | Set status=ACTIVE |
| `invoice.payment_failed` | Set status=PAST_DUE |

### Idempotency

Every webhook event is recorded in the `WebhookEvent` table with a **unique
constraint on `stripeEventId`**. The handler uses INSERT-first with a P2002
(unique violation) catch — if the event was already processed, it returns 200
immediately with zero side effects. This eliminates the race condition in a
SELECT-then-INSERT pattern.

### Safety Guards

- **Incomplete status skip**: Subscriptions with status `incomplete`,
  `incomplete_expired`, or `paused` are not acted on — prevents plan flips
  on partial data.
- **Customer ownership verification**: Every handler verifies the Stripe
  customer ID matches the stored `stripeCustomerId` before mutating.
- **Sanitized logging**: Errors are stripped to `{ message, name }` — no
  stack traces or raw Stripe secrets in logs.
- **Deterministic failure handling**: Handler errors return 200 and are
  recorded as `status: "failed"` in `WebhookEvent` to prevent infinite
  Stripe retries.

---

## Database Models

### Subscription (updated)

```prisma
model Subscription {
  id                   String              @id @default(cuid())
  userId               String              @unique
  plan                 Plan                @default(FREE)      // FREE | PRO
  status               SubscriptionStatus  @default(ACTIVE)    // ACTIVE | CANCELED | PAST_DUE
  billingInterval      BillingInterval?                        // MONTHLY | YEARLY | null
  stripeCustomerId     String?             @unique
  stripeSubscriptionId String?             @unique
  currentPeriodEnd     DateTime?
  ...
}
```

### WebhookEvent (new)

```prisma
model WebhookEvent {
  id            String    @id @default(cuid())
  stripeEventId String    @unique       // evt_... from Stripe
  type          String                  // e.g. "invoice.paid"
  status        String    @default("processed")  // processed | ignored | failed
  errorMessage  String?                 // failure reason (truncated to 500 chars)
  createdAt     DateTime  @default(now())
  processedAt   DateTime?               // set when handler completes
}
```

---

## Verification Steps

### 1. Checkout Flow

```bash
# Monthly
curl -X POST http://localhost:8787/v1/billing/checkout \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"interval": "monthly"}'
# → { "url": "https://checkout.stripe.com/..." }

# Yearly
curl -X POST http://localhost:8787/v1/billing/checkout \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"interval": "yearly"}'
```

### 2. Check Subscription Updated

```sql
SELECT plan, status, billing_interval, stripe_subscription_id, current_period_end
FROM subscriptions
WHERE user_id = '<your-user-id>';
-- Expected: plan=PRO, status=ACTIVE, billing_interval=MONTHLY or YEARLY
```

### 3. Verify Features Endpoint

```bash
curl http://localhost:8787/v1/features \
  -H "Authorization: Bearer <token>"
# → { "plan": "PRO", "subscriptionStatus": "ACTIVE", "billingInterval": "MONTHLY", "flags": { ... } }
```

### 4. Portal

```bash
curl -X POST http://localhost:8787/v1/billing/portal \
  -H "Authorization: Bearer <token>"
# → { "url": "https://billing.stripe.com/..." }
```

### 5. Check WebhookEvent Table

```sql
SELECT stripe_event_id, type, status, error_message, processed_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

---

## Safety Notes

- **Staging vs production keys**: Never use `sk_live_*` in staging — the
  runtime guard in `lib/stripe.ts` will throw a fatal error.
- **Webhook secret per environment**: Each Stripe webhook endpoint has its
  own `whsec_…` — don't share between staging and production.
- **Server is source of truth**: The client never sets the plan. All plan
  changes flow through webhooks → Subscription table → `/v1/features`.
- **Rate limiting**: `/checkout` and `/portal` are rate-limited to 10
  requests per minute per IP.
- **Promotion codes**: Checkout sessions have `allow_promotion_codes: true`,
  so Stripe coupon codes work out of the box.
