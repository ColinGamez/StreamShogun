# Transactional Email Setup

This project already supports transactional email for password resets. To turn it on for real users, you only need a verified sending domain and a small set of environment variables.

## Recommended Path

Use Resend as the default path. The app now accepts `RESEND_API_KEY` directly and sends through the Resend HTTPS API, so you do not need to think about SMTP unless you want another provider.

Why this is the best fit for the current setup:

- Verify a subdomain such as `mail.streamshogun.com`
- Paste a single Resend API key into the API environment
- Send from a verified address like `StreamShogun <no-reply@mail.streamshogun.com>`
- Route replies to the inbox you actually use, such as your Gmail

The current code works with:

- Resend API
- Postmark SMTP
- Amazon SES SMTP

## Required Environment Variables

Set these in the API service:

```env
APP_PUBLIC_URL="https://streamshogun.com"
SUPPORT_EMAIL="colin.kenny777@gmail.com"
RESEND_API_KEY="<resend-api-key>"
EMAIL_FROM="StreamShogun <no-reply@mail.streamshogun.com>"
COOKIE_DOMAIN=".streamshogun.com"
CORS_ORIGIN="https://streamshogun.com"
```

Notes:

- `APP_PUBLIC_URL` is used to build password reset links.
- `EMAIL_FROM` should use the verified sending domain or subdomain.
- `SUPPORT_EMAIL` can be your Gmail or another real inbox you control. The app now sets that as the email reply-to address automatically.
- `COOKIE_DOMAIN` is only needed when the site and API live on sibling subdomains and need shared auth cookies.
- If you want to use another provider, you can set `SMTP_URL` instead of `RESEND_API_KEY`.

## Domain Setup Checklist

1. Create a sending subdomain such as `mail.streamshogun.com`.
2. Add the SPF and DKIM records your email provider gives you.
3. Optionally add DMARC once SPF and DKIM are working.
4. Wait for the domain to show as verified in your provider dashboard.

## Deploy Checklist

1. Add the email-related environment variables to the API host.
2. Redeploy the API.
3. Check `GET /healthz` and confirm `emailConfigured` is `true`.
4. Trigger `POST /v1/auth/forgot-password` for a test account.
5. Open the reset email and complete the password reset flow.

## Local Development

If both `RESEND_API_KEY` and `SMTP_URL` are missing in local development, the forgot-password page shows a temporary debug reset link instead of sending email. That fallback is intentionally disabled in production.
