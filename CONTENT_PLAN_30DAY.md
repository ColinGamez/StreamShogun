# StreamShōgun — 30-Day Build-in-Public Content Plan (X)

> 3 posts/week (Tue, Thu, Sat) + 1 thread/week (Sunday).
> Voice: direct, technical, zero hype. Show the work.

---

## Week 1 — Auth & Token Rotation

### Tue 1 · Post: Why refresh tokens expire

Most desktop apps store a token forever and hope for the best.

We rotate refresh tokens on every use. Old token used twice? Entire session family gets revoked.

Sliding window: 7d refresh TTL, 15m access TTL. Silent re-auth in the background — user never sees a login screen unless they've been gone a week.

> 📸 Diagram: access/refresh token rotation flow with revocation arrow

---

### Thu 3 · Post: Zod validates env vars at boot

Our Fastify API won't even start if config is wrong.

`STRIPE_SECRET_KEY` must begin with `sk_`. `JWT_SECRET` must be ≥16 chars. One Zod schema, parsed once at startup. Bad deploy? Process exits immediately — no silent misconfiguration serving 500s for 20 minutes.

> 📸 Screenshot: `apps/api/src/config/env.ts` — the Zod schema

---

### Sat 5 · Post: Desktop + SaaS is a weird architecture

StreamShōgun is an Electron app that talks to a Fastify API.

Local SQLite for instant channel switching. PostgreSQL on the server for sync, billing, feature flags. The desktop client works fully offline — the server just makes it better. Hardest part: making the online features feel optional, not required.

> 📸 Architecture sketch: Electron ↔ IPC ↔ Preload ↔ Bridge ↔ Zustand ↔ API

---

### Sun 6 · Thread: How we built auth for a desktop SaaS (🧵 5 tweets)

1/ Building auth for a desktop Electron app is different from web. No httpOnly cookies. No server-side sessions the way you'd expect. Here's how we did it for StreamShōgun. 🧵

2/ The Electron main process holds the tokens. The renderer never touches them directly. All auth goes through IPC — `auth:login`, `auth:refresh`, `auth:logout`. The preload bridge exposes typed async functions, nothing else.

3/ Refresh token rotation: every time you use a refresh token, the server issues a new one and invalidates the old. If someone replays a stolen token, the server detects the reuse and kills the entire session chain. This is the "refresh token family" pattern.

4/ Token storage: encrypted in the OS keychain via Electron's `safeStorage`. Not localStorage. Not a plaintext file. The main process decrypts only when needed for an API call.

5/ The result: users log in once, stay logged in for a week silently, and the app works fully offline. If the server is unreachable, we show a subtle offline banner — never a blocking modal. Auth should be invisible when it works.

---

## Week 2 — Feature Flags & Entitlements

### Tue 8 · Post: Feature flags without a vendor

We didn't add LaunchDarkly or PostHog for feature flags.

One Prisma model: `FeatureFlag { userId, key, enabled }`. One admin endpoint to flip them. One `canUse()` gate in the Zustand store that checks plan + flags. Total code: ~80 lines. Enough for a team of one shipping a desktop app.

> 📸 Screenshot: `FeatureFlag` model in schema.prisma + the `canUse` store selector

---

### Thu 10 · Post: The PRO gate that doesn't annoy

Some apps hide features behind a paywall and grey out the whole UI. We show you the feature exists, tell you it's PRO, and let you keep using everything else.

`canUse("cloud_sync")` checks: is user on PRO plan? is the flag not explicitly disabled? Both must pass. One function, used everywhere. No scattered `if (plan === 'PRO')` checks.

> 📸 Screenshot: Settings page with the PRO badge next to Cloud Sync toggle

---

### Sat 12 · Post: Admin endpoints behind a key, not a login page

StreamShōgun's admin API doesn't have its own auth flow.

A single `ADMIN_KEY` env var. Every admin request sends it in `x-admin-key`. If the key isn't set, admin routes return 404 — they don't even register. Simple, auditable, hard to accidentally expose.

Every admin action writes to an `AuditLog` table with before/after payload.

> 📸 Screenshot: audit_logs table with a `feature-flag.set` action row

---

### Sun 13 · Thread: Entitlement hardening — PRO features that degrade gracefully (🧵 5 tweets)

1/ Shipping a freemium desktop app means some features need to be locked. But doing it without making the free tier feel broken is the actual challenge. Here's our approach. 🧵

2/ We have exactly two plans: FREE and PRO. The `Subscription` model tracks Stripe state but the client doesn't query it directly. Instead, `/v1/features` returns `{ plan, flags }` as a flat object. One fetch, one source of truth.

3/ On the desktop, `fetchServerFeatures()` runs after login. It stores the result in Zustand. Every feature check calls `canUse(flagKey)` which is: `plan === PRO && flags[key] !== false`. Feature flags can override plan — useful for beta access or per-user kill switches.

4/ What happens offline? The last-fetched features are cached in localStorage. If the server is unreachable, the app uses the cache. If the cache is empty and the user has never logged in, all PRO features are locked. No "assume PRO and hope" behavior.

5/ The UI pattern: PRO features render normally but show a small "PRO" badge and disable the control. Clicking the disabled toggle doesn't trigger a modal or upsell popup — just nothing. The upgrade path lives in Settings → Account, not scattered across the UI.

---

## Week 3 — Stripe & Billing

### Tue 15 · Post: Stripe integration in 200 lines

Three endpoints: `/checkout`, `/portal`, `/webhook`.

Checkout creates a Stripe session with the user's email pre-filled. Portal redirects to Stripe's hosted management page. Webhook listens for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.deleted`. Everything else is Stripe's problem.

We store the Stripe customer ID and subscription ID on our `Subscription` model. That's it.

> 📸 Screenshot: billing.ts route file — the three endpoint handlers

---

### Thu 17 · Post: Webhook idempotency for $0 of infrastructure

Stripe can send the same event twice. Most apps either ignore this or build a Redis dedup layer.

We have a `ProcessedEvent` table. One column: the Stripe event ID (`evt_...`). Before processing, check if it exists. If yes, return 200 and do nothing. Postgres handles the uniqueness constraint. Zero additional infrastructure.

> 📸 Screenshot: `ProcessedEvent` model + the dedup check in the webhook handler

---

### Sat 19 · Post: Never cross Stripe key environments

`sk_test_` keys in local and staging. `sk_live_` keys in production only.

Our Zod env schema enforces the `sk_` prefix — a publishable key would crash the API at boot. Separate webhook endpoints per environment in the Stripe Dashboard. The CLI `stripe listen --forward-to` handles local testing. This isn't clever — it's table stakes that people still get wrong.

> 📸 Table graphic: environment → key type → webhook URL mapping

---

### Sun 20 · Thread: What I learned integrating Stripe into a desktop app (🧵 5 tweets)

1/ Desktop apps and Stripe have an impedance mismatch. Stripe is built for the web. Your Electron app doesn't have a domain, cookies, or server-side redirects. Here's how we made it work. 🧵

2/ Checkout: the API creates a Stripe Checkout Session and returns the URL. The desktop app opens it in the user's default browser — not an in-app webview. After payment, Stripe redirects to a success page on our domain that tells the user to go back to the app.

3/ Why not a webview? Because showing a payment form inside Electron means you're handling card data in your process. Even with Stripe Elements, the security boundary is murkier. A real browser with real HTTPS is cleaner. Users already trust their browser for payments.

4/ Post-payment flow: the webhook fires, we update the Subscription model, and next time the desktop client calls `/v1/features` (which happens on app focus), it gets the updated plan. Typical lag: 2–5 seconds. We don't poll — we just wait for the next natural features fetch.

5/ Testing: `stripe listen --forward-to localhost:8787/v1/billing/webhook` + `stripe trigger checkout.session.completed`. Full end-to-end test without spending money. The `ProcessedEvent` dedup table means we can replay events safely during dev without corrupting state.

---

## Week 4 — Cloud Sync & Deployment

### Tue 22 · Post: Cloud sync with last-write-wins

Our sync protocol: `GET /v1/cloud/sync` pulls, `PUT /v1/cloud/sync` pushes.

The client sends `localUpdatedAt`. If the server's `updatedAt` is newer, it returns 409 with the server's payload. Client re-pulls, merges, retries. No CRDTs, no operational transforms. For settings, favorites, and bounded watch history — last-write-wins is fine.

> 📸 Sequence diagram: push → 409 conflict → pull → merge → retry push → 200

---

### Thu 24 · Post: Merging favorites across devices

Cloud sync receives a favorites array. Local has a favorites set. How to merge:

Union. `new Set([...local, ...cloud])`. That's it. Favorites are channel URLs — inherently idempotent. If you favorited a channel on your laptop and your desktop, the merged result has it once. No conflict possible.

Deletions are harder. We don't sync them yet. Honest shipping beats imaginary perfection.

> 📸 Code snippet: the 3-line favorites merge in the Zustand store

---

### Sat 26 · Post: Sync that never blocks playback

The worst thing a sync feature can do is freeze the UI.

Our `cloudPull()` and `cloudPush()` are wrapped in try/catch that swallows errors. They set a `cloudSyncing` boolean for the spinner, but if the API is down, the app continues as if sync doesn't exist. Pull on startup. Debounced push on changes. Both async, both fire-and-forget.

> 📸 Screenshot: Settings → Cloud Sync section with the toggle and "Last synced" timestamp

---

### Sun 27 · Thread: Deploying a monorepo with 4 apps and 2 packages (🧵 6 tweets)

1/ StreamShōgun is a pnpm monorepo: `apps/api`, `apps/backend`, `apps/desktop`, `apps/ui`, `packages/shared`, `packages/core`. Deploying it means building the right things in the right order. Here's the build graph. 🧵

2/ Build order matters. Shared → Core → then apps in parallel. Shared exports Zod schemas and TypeScript types. Core exports IPC channel enums, feature flags, licensing. Both must be built before anything else can typecheck.

3/ The API deploys independently. It's a Fastify server with Prisma. Build: `tsc`. Deploy: container image. Database migrations run as a separate step before the new image goes live — never as part of the application boot. `prisma migrate deploy` in CI.

4/ The desktop app bundles the UI. Vite builds the React frontend into `dist/`, then Electron Builder packages it with the main process. Three targets: `.exe` (NSIS), `.dmg`, `.AppImage`. One `pnpm build:win/mac/linux` command. Code signing happens in CI, never local.

5/ Typecheck is the gate. `pnpm typecheck` builds shared + core, generates Prisma clients, then runs `tsc --noEmit` across all four apps. If any fail, nothing ships. `pnpm lint` runs ESLint across the entire monorepo. Both are CI checks on every PR.

6/ The honest part: we don't have full CI yet. Typecheck and lint run locally before every push. 96 tests cover the core parsers. The API and UI don't have integration tests yet. Shipping > perfection, but we know where the gaps are.

---

## Week 5 (Days 29–30) — Reflections

### Tue 29 · Post: What actually matters at 0.1.0

30 days of building in public. Here's what shipped:

JWT refresh rotation. Stripe billing. Feature flags. Cloud sync. An Electron app that works offline and gets better when online. A Prisma schema with 8 models. A Fastify API with admin endpoints and audit logging.

None of it is novel. All of it works. The hard part was never the tech — it was knowing when to stop abstracting and start shipping.

---

### Thu 31 · Post: The stack, final count

StreamShōgun 0.1.0 stack:

- Electron 33 + React 19 + Zustand + Tailwind
- Fastify + Prisma + PostgreSQL
- Stripe Checkout + Customer Portal
- pnpm monorepo, 2 shared packages, 4 apps
- TypeScript everywhere, Zod at every boundary
- 96 tests, 0 lint errors, 0 type errors

Next: CI pipeline, integration tests, and the beta launch.

> 📸 Screenshot: terminal showing `pnpm typecheck` and `pnpm test` both passing green

---

## Posting Schedule Summary

| Day | Type | Topic |
|-----|------|-------|
| Tue 1 | Post | Refresh token rotation |
| Thu 3 | Post | Zod env validation |
| Sat 5 | Post | Desktop + SaaS architecture |
| **Sun 6** | **Thread** | **Auth for desktop SaaS** |
| Tue 8 | Post | Feature flags without a vendor |
| Thu 10 | Post | The PRO gate pattern |
| Sat 12 | Post | Admin key + audit log |
| **Sun 13** | **Thread** | **Entitlement hardening** |
| Tue 15 | Post | Stripe in 200 lines |
| Thu 17 | Post | Webhook idempotency |
| Sat 19 | Post | Stripe key separation |
| **Sun 20** | **Thread** | **Stripe + desktop app** |
| Tue 22 | Post | Cloud sync protocol |
| Thu 24 | Post | Merging favorites |
| Sat 26 | Post | Sync never blocks playback |
| **Sun 27** | **Thread** | **Monorepo deployment** |
| Tue 29 | Post | What matters at 0.1.0 |
| Thu 31 | Post | The stack, final count |

**Total: 13 posts + 4 threads = 17 pieces over 30 days.**
