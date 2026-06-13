# Render Setup

This is the simplest production setup for StreamShogun without juggling a bunch of different providers.

Provider split:

- Render: API and PostgreSQL
- Resend: transactional email
- Your DNS host: `api.streamshogun.com`

That keeps the app stack to one main dashboard, plus the email sender you already set up.

## What the repo already does

- [render.yaml](../render.yaml) creates the API service
- [render.yaml](../render.yaml) also creates a small Render Postgres database
- The API reads `DATABASE_URL` directly from that database through the Blueprint
- Password reset emails can use `RESEND_API_KEY` directly without SMTP setup

## Recommended first deploy

1. Push this repo to GitHub with [render.yaml](../render.yaml).
2. In Render, click `New` -> `Blueprint`.
3. Connect the repo.
4. Let Render create:
   - `streamshogun-api`
   - `streamshogun-db`
5. When prompted for secrets, set:

```env
SUPPORT_EMAIL=colin.kenny777@gmail.com
RESEND_API_KEY=<your Resend API key>
```

Render will generate `JWT_SECRET` automatically from the Blueprint.

The Blueprint already fills in:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
LOG_LEVEL=info
CORS_ORIGIN=https://streamshogun.com
APP_PUBLIC_URL=https://streamshogun.com
COOKIE_DOMAIN=.streamshogun.com
EMAIL_FROM=StreamShogun <no-reply@streamshogun.com>
STRIPE_PORTAL_RETURN_URL=https://streamshogun.com/account
```

## Billing and optional secrets

If billing is enabled in production, also set:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_PRICE_ID_PRO_YEARLY`

Optional:

- `ADMIN_KEY`
- `SENTRY_DSN`
- `BILLING_DISABLED=true` if you want billing routes off temporarily

## Custom domain

1. In Render, open `streamshogun-api`.
2. Add `api.streamshogun.com` as a custom domain.
3. Add the DNS record Render gives you.
4. Wait for TLS to finish provisioning.

## Smoke test after deploy

Check health:

```bash
curl https://api.streamshogun.com/healthz
```

You want:

- `status: "ok"`
- `db: true`
- `emailConfigured: true`

Then test:

1. Log in on the website.
2. Trigger forgot-password.
3. Confirm the email arrives.
4. Open the account page.
5. Run one billing flow if Stripe is enabled.
6. Open the desktop app and confirm cloud sync still works.

## Cost notes

The current Blueprint uses:

- Render web service on the `free` instance type
- Render Postgres on `basic-256mb`

That keeps the setup simple, but the database is intentionally on a paid plan so it does not hit Render's 30-day free Postgres limit.
