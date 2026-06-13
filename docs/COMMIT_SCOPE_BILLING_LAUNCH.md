# Commit Scope: Billing Launch Readiness

Last updated: 2026-06-12

The worktree contains many pre-existing changes. Use this file to keep the
billing launch commit focused.

## Include

Core billing fixes:

- `apps/api/src/routes/v1/billing.ts`
- `apps/api/prisma/migrations/20260612000000_add_trialing_subscription_status/migration.sql`
- `scripts/billing-smoke.ps1`
- `package.json`

Billing and trust docs:

- `docs/BILLING.md`
- `docs/PRODUCTION_BILLING_CHECKLIST.md`
- `docs/GROWTH_PLAYBOOK.md`
- `docs/BETA_LAUNCH_PACKAGE.md`
- `docs/COMMIT_SCOPE_BILLING_LAUNCH.md`
- `docs/support-codex/privacy-security.md`
- `docs/support-codex/subscriptions-billing.md`

Checkout return pages and deploy routing:

- `site/billing/success.html`
- `site/billing/cancel.html`
- `site/terms.html`
- `vercel.json`
- `site/vercel.json`

Do not include the older untracked migrations in this commit unless you are
intentionally shipping the broader account/profile/Roku changes with it. This
billing launch commit only needs the `TRIALING` enum migration listed above.

## Exclude Unless Intentionally Shipping

These appeared unrelated to the billing launch pass or were already dirty:

- Broad UI restyles under `apps/ui/src/`
- Desktop app changes under `apps/desktop/`
- Unrelated site pages such as profile/community/changelog unless the release needs them
- Older untracked API migrations for account/profile/Roku work unless they are part of the same release
- Self-hosting files unless the deploy target is self-hosting
- Local-only logs or generated artifacts
- `apps/api/.env` and any secret-bearing files

## Suggested Commit Message

```text
feat: harden billing launch flow
```

## Pre-Commit Checks

Run:

```powershell
pnpm billing:smoke
pnpm --filter @stream-shogun/api test
```

Optional broader checks before release:

```powershell
pnpm typecheck
pnpm lint
```

## Notes

- Local `.env` contains test Stripe secrets and is ignored by git.
- Live Stripe keys belong only in the production host secret store.
- The local smoke test created test-mode Stripe prices because the original
  copied price IDs belonged to live mode.
