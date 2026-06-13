# Production Billing Checklist

Last updated: 2026-06-12

Use this before accepting real StreamShōgun Pro payments.

## Local Result

Local test-mode billing has been verified:

- `pnpm billing:smoke` passes.
- Test Checkout Session creation works for monthly and yearly prices.
- Stripe Checkout redirects to `/billing/success`.
- Stripe webhooks reach `POST /v1/billing/webhook`.
- `/v1/features` returns `PRO` and all Pro flags after checkout.
- Trialing subscriptions are supported by the database enum.

## Production Stripe Setup

In Stripe live mode:

- [ ] Confirm business details and public support contact.
- [ ] Confirm statement descriptor.
- [ ] Confirm tax settings or explicitly decide not to collect tax yet.
- [ ] Confirm Customer Portal settings allow cancellation and payment method updates.
- [ ] Confirm live product is `StreamShōgun Pro`.
- [ ] Confirm live monthly Price is `$6.99/month`.
- [ ] Confirm live yearly Price is `$69.99/year`.
- [ ] Copy live monthly `price_...` ID.
- [ ] Copy live yearly `price_...` ID.
- [ ] Copy live secret key `<live Stripe secret key>`.
- [ ] Create production webhook endpoint:

```text
https://api.streamshogun.com/v1/billing/webhook
```

- [ ] Select webhook events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

- [ ] Copy production webhook secret `<Stripe webhook secret>`.

## Production API Environment

Set these on the production API host only:

```env
NODE_ENV="production"
CORS_ORIGIN="https://streamshogun.com"
APP_PUBLIC_URL="https://streamshogun.com"
STRIPE_SECRET_KEY="<live Stripe secret key>"
STRIPE_WEBHOOK_SECRET="<Stripe webhook secret>"
STRIPE_PRICE_ID_PRO_MONTHLY="price_live_monthly..."
STRIPE_PRICE_ID_PRO_YEARLY="price_live_yearly..."
STRIPE_PORTAL_RETURN_URL="https://streamshogun.com/account"
COOKIE_DOMAIN=".streamshogun.com"
```

Also confirm:

- [ ] `DATABASE_URL` points to production Postgres.
- [ ] `JWT_SECRET` is production-only and not reused locally.
- [ ] `ADMIN_KEY` is production-only and at least 32 chars.
- [ ] `SUPPORT_EMAIL` is correct.
- [ ] Email sending is configured or password reset fallback is intentionally disabled for launch.
- [ ] `BILLING_DISABLED` is unset.

## Production Database

Before deploy:

- [ ] Production backup exists.
- [ ] Migrations reviewed.
- [ ] `20260612000000_add_trialing_subscription_status` is included.
- [ ] Migrations are applied with:

```bash
pnpm --filter @stream-shogun/api exec prisma migrate deploy
```

After deploy:

- [ ] `/healthz` returns `db: true`.
- [ ] `/healthz` returns `stripeKeyConfigured: true`.
- [ ] `/healthz` returns `billingEnabled: true`.

## Production Smoke Test

Use a real payment only when ready.

- [ ] Create a founder/test account using an email you control.
- [ ] Start monthly checkout.
- [ ] Confirm Stripe Checkout opens.
- [ ] Complete payment with a real card only when production launch is intended.
- [ ] Confirm redirect lands on:

```text
https://streamshogun.com/billing/success
```

- [ ] Confirm Stripe Dashboard shows active or trialing subscription.
- [ ] Confirm `/v1/features` returns `PRO`.
- [ ] Confirm Account page can open the Stripe Customer Portal.
- [ ] Cancel the test subscription through the portal if it should not remain active.

## Kill Switch

If production billing misbehaves:

```env
BILLING_DISABLED="true"
```

Then redeploy the API. Checkout and portal routes return 503, and webhook
events are accepted but ignored.

## Do Not Do

- Do not put `<live Stripe secret key>` in local `.env`.
- Do not put live keys in staging.
- Do not paste Stripe secrets into chat, issues, PRs, or docs.
- Do not route Roku users to Stripe checkout inside the Roku channel.
- Do not launch paid ads until the founder beta produces at least one paid conversion.
