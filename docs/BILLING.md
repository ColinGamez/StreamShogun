# Billing (Stripe Subscriptions)

> **Status:** Opt-in. Set the three `STRIPE_*` env vars to enable.

## Architecture

```
User ──POST /v1/billing/checkout──► API ──► Stripe Checkout
                                            │
                                            ▼
                                    Stripe hosted page
                                            │
                                            ▼
Stripe ──POST /v1/billing/webhook──► API ──► Update Subscription table
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
| `STRIPE_PRICE_ID` | Yes (for checkout) | `price_1...` | Stripe Price ID for the PRO plan |

If any are missing, the billing endpoints return `501 Not Implemented`.

---

## Endpoints

All prefixed with `/v1/billing`.

### POST /v1/billing/checkout

Creates a Stripe Checkout session for PRO subscription upgrade.

**Auth:** JWT (Bearer token)

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

**Auth:** JWT (Bearer token)

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
| `customer.subscription.created` | Upsert subscription status + period end |
| `customer.subscription.updated` | Upsert subscription status + period end |
| `customer.subscription.deleted` | Revert to FREE, status → CANCELED, clear Stripe IDs |
| `invoice.paid` | Set status → ACTIVE |
| `invoice.payment_failed` | Set status → PAST_DUE |

---

## Feature Flags & Plan Status

`GET /v1/features` now includes subscription status:

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

## Database Changes

### Subscription table (updated)

- `stripe_customer_id` — now `UNIQUE` index
- `stripe_subscription_id` — now `UNIQUE` index

### ProcessedEvent table (new)

| Column | Type | Description |
| --- | --- | --- |
| `id` | String (PK) | Stripe event ID (`evt_...`) |
| `processed_at` | DateTime | When the event was processed |

---

## Stripe Dashboard Setup

1. **Create a Product** in Stripe Dashboard → Products
2. **Create a Price** (recurring, monthly) → copy the `price_...` ID
3. **Create a Webhook** endpoint → `https://your-domain.com/v1/billing/webhook`
4. **Select events:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Copy the webhook signing secret (`whsec_...`)

### Local Development with Stripe CLI

```bash
# Install Stripe CLI, then:
stripe login
stripe listen --forward-to localhost:8787/v1/billing/webhook

# In another terminal, trigger a test event:
stripe trigger checkout.session.completed
```

The CLI will print the webhook signing secret — use it as `STRIPE_WEBHOOK_SECRET`.

---

## Security Notes

- **No client trust.** Plan is determined server-side from Stripe webhooks only.
- **Idempotent processing.** `processed_events` table prevents double-processing.
- **Signature verification.** Raw body + `stripe-signature` header verified before processing.
- **Rate-limited.** Webhook endpoint inherits global rate limit. Stripe retries with backoff.
- **Stripe customer lazy-created.** On first checkout/portal request, a Stripe customer is created and linked.
