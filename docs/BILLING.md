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

### Roku entitlement note

The Roku app consumes the same subscription source of truth through
`/v1/features`, but a paid Roku store release must not send customers to Stripe
Checkout from inside the channel. Roku transactional/subscription releases need
Roku Pay / ChannelStore for on-device purchase, upgrade, downgrade, and related
account flows. The current Roku sideload build signs in to an existing
StreamShōgun account, gates Roku Pro features from the returned entitlement,
and includes a ChannelStore shell for catalog, RFI, order, and restore. Roku Pay
purchase IDs are not trusted locally; `/v1/roku/validate-purchase` validates
them with Roku's `validate-transaction` API before granting Pro. Roku Pay
push notifications should be configured to `POST /v1/roku/pay-push`; the
listener echoes Roku's `responseKey`, records a `RokuPayEvent`, and reconciles
matched subscription lifecycle events such as renewal, cancellation, grace,
hold, upgrade, and downgrade.

Roku Pay environment variables:

| Variable                      | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `ROKU_PAY_API_KEY`            | Partner API key used server-side for Roku Pay validation |
| `ROKU_PRODUCT_ID_PRO_MONTHLY` | Monthly Pro in-app product identifier                    |
| `ROKU_PRODUCT_ID_PRO_YEARLY`  | Yearly Pro in-app product identifier                     |

---

## Environment Variables

| Variable                      | Required           | Example                                                 | Description                                      |
| ----------------------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| `STRIPE_SECRET_KEY`           | Yes                | `<test Stripe secret key>` / `<live Stripe secret key>` | Stripe API secret key                            |
| `STRIPE_WEBHOOK_SECRET`       | Yes (for webhooks) | `<Stripe webhook secret>`                               | Webhook signing secret                           |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | Yes (for checkout) | `price_1…`                                              | Monthly recurring Price ID                       |
| `STRIPE_PRICE_ID_PRO_YEARLY`  | Yes (for checkout) | `price_1…`                                              | Yearly recurring Price ID                        |
| `APP_PUBLIC_URL`              | Recommended        | `https://app.streamshogun.com`                          | Return URLs for Checkout/Portal                  |
| `STRIPE_PORTAL_RETURN_URL`    | Optional           | `https://app.streamshogun.com/settings`                 | Portal return URL (defaults to `APP_PUBLIC_URL`) |

If `STRIPE_SECRET_KEY` is missing, billing endpoints return `501 Not Implemented`.
If a price ID is missing for the requested interval, checkout returns `501`.

### Environment Guard

A runtime assertion in `lib/stripe.ts` **blocks `live Stripe secret keys` keys** when
`NODE_ENV ≠ "production"`. This prevents accidentally charging real customers
from staging or development. See [ENVIRONMENTS.md](ENVIRONMENTS.md) for the
full key safety matrix.

---

## Stripe Dashboard Setup

### 1. Create Products & Prices

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/products).
2. Create a product called **"StreamShōgun PRO"** (or similar).
3. Add **two recurring prices**:
   - **Monthly**: $6.99/month → copy the `price_…` ID → `STRIPE_PRICE_ID_PRO_MONTHLY`
   - **Yearly**: $69.99/year → copy the `price_…` ID → `STRIPE_PRICE_ID_PRO_YEARLY`
4. For testing, use Test Mode prices first (`<test Stripe secret key>`).

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

### 4. Checkout Return Pages

Checkout uses hosted Stripe pages, then redirects customers back to:

| Flow    | URL                                 |
| ------- | ----------------------------------- |
| Success | `${APP_PUBLIC_URL}/billing/success` |
| Cancel  | `${APP_PUBLIC_URL}/billing/cancel`  |

The static site includes matching pages at `site/billing/success.html` and
`site/billing/cancel.html`. Keep the Vercel rewrites in both `vercel.json` and
`site/vercel.json` in sync with these paths.

---

## Stripe CLI — Local Testing

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:8787/v1/billing/webhook

# Copy the <Stripe webhook secret> value and set it in .env:
# STRIPE_WEBHOOK_SECRET=<Stripe webhook secret>

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

### Test Cards

| Card               | Behavior                  |
| ------------------ | ------------------------- |
| `4242424242424242` | Succeeds                  |
| `4000000000000341` | Attaches, fails on charge |
| `4000000000009995` | Declined                  |
| `4000002500003155` | Requires 3D Secure        |

---

## Handled Webhook Events

| Event                           | Action                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| `checkout.session.completed`    | Set plan=PRO, store Stripe status, interval, and period end |
| `customer.subscription.created` | Upsert subscription (plan, status, interval, periodEnd)     |
| `customer.subscription.updated` | Upsert subscription (plan, status, interval, periodEnd)     |
| `customer.subscription.deleted` | Revert to FREE/CANCELED, clear billingInterval              |
| `invoice.paid`                  | Set status=ACTIVE                                           |
| `invoice.payment_failed`        | Set status=PAST_DUE                                         |

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
  status               SubscriptionStatus  @default(ACTIVE)    // ACTIVE | TRIALING | CANCELED | PAST_DUE
  billingInterval      BillingInterval?                        // MONTHLY | YEARLY | null
  stripeCustomerId     String?             @unique
  stripeSubscriptionId String?             @unique
  rokuCustomerId       String?
  rokuTransactionId    String?             @unique
  rokuOriginalTransactionId String?
  rokuProductCode      String?
  rokuLastEventType    String?
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

### RokuPayEvent

```prisma
model RokuPayEvent {
  id                    String    @id @default(cuid())
  transactionId         String    @unique
  originalTransactionId String?
  customerId            String?
  productCode           String?
  type                  String
  status                String    @default("processing")
  errorMessage          String?
  payload               Json?
  createdAt             DateTime  @default(now())
  processedAt           DateTime?
}
```

---

## Verification Steps

### 0. Automated Smoke Test

Run the local billing smoke script after Stripe test keys and Price IDs are in
`apps/api/.env`:

```powershell
pnpm billing:smoke
```

The script checks required Stripe env vars, refuses live keys unless passed
`-AllowLive`, verifies the checkout return pages and Vercel rewrites, confirms
`/healthz` reports `billingEnabled: true`, creates a throwaway API account,
and requests monthly/yearly Checkout Sessions plus a Customer Portal Session.
To open the first Checkout Session in your browser, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/billing-smoke.ps1 -OpenCheckout
```

For preflight only, without calling the API:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/billing-smoke.ps1 -PreflightOnly
```

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

### 6. Check Roku Pay Event Table

```sql
SELECT transaction_id, type, status, error_message, processed_at
FROM roku_pay_events
ORDER BY created_at DESC
LIMIT 10;
```

---

## Safety Notes

- **Staging vs production keys**: Never use `live Stripe secret keys` in staging — the
  runtime guard in `lib/stripe.ts` will throw a fatal error.
- **Webhook secret per environment**: Each Stripe webhook endpoint has its
  own `<Stripe webhook secret>` — don't share between staging and production.
- **Server is source of truth**: The client never sets the plan. All plan
  changes flow through webhooks → Subscription table → `/v1/features`.
- **Rate limiting**: `/checkout` and `/portal` are rate-limited to 5
  requests per minute per IP.
- **Promotion codes**: Checkout sessions have `allow_promotion_codes: true`,
  so Stripe coupon codes work out of the box.
