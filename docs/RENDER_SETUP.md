# Render + Neon Free Setup

This is the $0/month production setup for StreamShogun while money is tight.

Provider split:

- Cloudflare Pages Free: static website
- Render free web service: API
- Neon Free: PostgreSQL
- Resend: transactional email, required before launch
- Your DNS host: `streamshogun.com` and `api.streamshogun.com`

Do not use Render Postgres for this free setup. Render's free Postgres is temporary, and the non-expiring Render database plan costs money. Neon Free is the better $0 database choice.

## What the repo already does

- [site/\_redirects](../site/_redirects) and [site/\_headers](../site/_headers) preserve the static website routes and security headers on Cloudflare Pages
- [render.yaml](../render.yaml) creates the API service
- [render.yaml](../render.yaml) keeps the API on Render's `free` plan
- The API reads `DATABASE_URL` from a secret you paste into Render
- Password reset emails can use `RESEND_API_KEY` directly without SMTP setup
- Billing can stay enabled with Stripe live keys when you are ready

## 1. Move the website to Cloudflare Pages

Use this when you want the public website off Vercel Hobby before taking real payments.

1. In Cloudflare Pages, create a new project from the GitHub repo.
2. Set build command to blank or:

```bash
node -e "console.log('Static site deploy')"
```

3. Set output directory to:

```text
site
```

4. Add the custom domain `streamshogun.com`.
5. Let Cloudflare give you the DNS records, then switch the domain over.

## 2. Create the free database

1. Open Neon.
2. Create a free Postgres project.
3. Copy the pooled connection string.
4. Keep it ready as `DATABASE_URL`.

The value should look like:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

## 3. Deploy the API on Render

1. Push this repo to GitHub with [render.yaml](../render.yaml).
2. In Render, click `New` -> `Blueprint`.
3. Connect the repo.
4. Let Render create `streamshogun-api`.
5. Choose the free web service plan if Render asks.
6. When prompted for secrets, set:

```env
DATABASE_URL=<your Neon pooled connection string>
SUPPORT_EMAIL=colin.kenny777@gmail.com
```

Render will generate `JWT_SECRET` automatically from the Blueprint.

`RESEND_API_KEY` is required for password reset emails before launch.

The Blueprint already fills in:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
LOG_LEVEL=info
CORS_ORIGIN=https://streamshogun.com
APP_PUBLIC_URL=https://streamshogun.com
COOKIE_DOMAIN=.streamshogun.com
EMAIL_FROM=StreamShogun <no-reply@mail.streamshogun.com>
STRIPE_PORTAL_RETURN_URL=https://streamshogun.com/account
```

The Blueprint asks for:

```env
DATABASE_URL=<your Neon pooled connection string>
RESEND_API_KEY=<your Resend API key>
```

## 4. Add billing secrets when ready

Stripe does not have a monthly fee for this setup. It takes fees out of successful payments.

When billing is enabled in production, also set these on the Render service:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_PRICE_ID_PRO_YEARLY`

Optional:

- `ADMIN_KEY`
- `SENTRY_DSN`
- `BILLING_DISABLED=true` if you want billing routes off temporarily

## 5. API custom domain

1. In Render, open `streamshogun-api`.
2. Add `api.streamshogun.com` as a custom domain.
3. Add the DNS record Render gives you.
4. Wait for TLS to finish provisioning.

## 6. Smoke test after deploy

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

## Free-plan notes

- Render free web services can sleep after inactivity, so the first request after a quiet stretch may be slow.
- Neon Free has usage limits, but it has no monthly charge and no credit card requirement.
- Vercel Hobby is free, but it is for personal/non-commercial use. Keep paid checkout on the API host and move/upgrade the website later once revenue covers it.
- Stripe has no fixed monthly platform cost for this path; fees come from successful payments.

## Fast rollback

If billing misbehaves, set this in Render and redeploy:

```env
BILLING_DISABLED=true
```

The app will stop creating checkout and portal sessions while the API stays online.
