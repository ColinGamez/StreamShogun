# StreamShōgun Growth Playbook

Last updated: 2026-06-12

This playbook turns StreamShōgun into a steady subscription business without
changing the core promise: it is a bring-your-own-playlists media player, not a
content service.

## Positioning

Use this everywhere:

> StreamShōgun helps people organize and watch their own M3U playlists, XMLTV
> guides, and HLS streams across desktop and Roku.

Avoid:

- Any claim that StreamShōgun provides channels, streams, playlists, or media.
- Public wording that implies bundled content, curated directories, or piracy.
- Sending Roku customers to Stripe from inside the Roku channel.

Core trust line:

> StreamShōgun does not host, sell, provide, index, or distribute media content.
> Users bring their own playlist and guide sources.

## Offer

Free:

- 1 playlist source
- Unlimited channels within that playlist
- Local playback
- Manual EPG setup
- Watch history and favorites

Pro:

- Unlimited playlists
- Cloud Sync
- Smart EPG matching
- Multi-EPG merge
- Auto-refresh
- Picture-in-Picture
- Discord Presence
- Roku Pro entitlement support

Pricing:

- Monthly: $6.99/month
- Yearly: $69.99/year
- Trial: 7 days for first-time subscribers
- Promo codes: allowed through Stripe Checkout

Keep the current price as early supporter pricing until there is enough demand
to justify raising it.

## Revenue Targets

Use MRR as the main score.

| Goal        | Approximate paid users | Why it matters               |
| ----------- | ---------------------: | ---------------------------- |
| $500 MRR    |                     80 | Proof that strangers pay     |
| $1,000 MRR  |                    160 | Real side-income signal      |
| $3,000 MRR  |                    480 | Sustainable indie product    |
| $10,000 MRR |                  1,600 | Full-time business territory |

Assumption: roughly $6.20 blended monthly revenue per paid user after yearly
discount mix. Replace this with real Stripe data once there are subscribers.

## Funnel

Track the business as a funnel:

1. Visitor lands on site.
2. User downloads or registers.
3. User imports first playlist.
4. User gets first successful playback.
5. User hits a Pro reason: second playlist, Cloud Sync, smart matching, or Roku.
6. Paywall is viewed.
7. Checkout starts.
8. Pro becomes active.
9. User remains active after 30 days.

Most early growth work should improve one of these steps.

## Measurement Rules

The current public promise says no tracking, no analytics cookies, and no
third-party analytics on the website. Respect that.

Until the privacy policy is updated and the UI has clear consent, use:

- Stripe dashboard for trials, checkouts, MRR, churn, and coupons.
- Admin API for user and subscription counts.
- Support conversations for qualitative reasons people upgrade or cancel.
- GitHub release download counts.
- Manual spreadsheet tracking for launch experiments.

If product analytics are added later, only collect privacy-safe events:

- `app_opened`
- `playlist_imported`
- `first_playback_succeeded`
- `pro_feature_clicked`
- `paywall_viewed`
- `checkout_started`
- `checkout_completed`
- `subscription_canceled`

Never collect:

- Playlist URLs
- Stream URLs
- Channel names
- Programme titles
- Exact watch history
- Device fingerprints

## 90-Day Plan

### Days 1-14: Trust and Conversion Readiness

- Keep pricing, Terms, Billing docs, support docs, and app copy consistent.
- Verify Stripe checkout, success redirect, cancel redirect, webhook, and portal.
- Confirm `/v1/features` updates Pro status after checkout.
- Confirm account pages show billing interval and portal access.
- Ship a signed Windows build and an obvious download path.
- Add 5-8 real screenshots to the landing page and GitHub release.

### Days 15-30: Founder Beta

- Recruit 30 serious users manually.
- Offer early supporter pricing plus a Stripe promo code if needed.
- Ask each beta user three questions:
  - What playlist/EPG problem made you try this?
  - What feature would make Pro worth paying for?
  - What almost stopped you from trusting it?
- Convert objections into docs, copy, or product fixes.
- Do not chase broad traffic until at least 5 strangers have paid.

### Days 31-60: Content and Distribution

- Publish 2 useful pages per week:
  - M3U playlist organization guide
  - XMLTV EPG setup guide
  - Desktop HLS playback troubleshooting
  - Multi-EPG merge explanation
  - Cloud Sync for playlist setups
  - Roku personal playlist setup
- Post build-in-public updates from `CONTENT_PLAN_30DAY.md`.
- Keep every post specific, technical, and screenshot-backed.
- Add release notes to `site/changelog.html` for every meaningful build.

### Days 61-90: Conversion Experiments

- Test yearly-first pricing copy.
- Test Pro trigger copy on the second playlist limit.
- Test a "Founder" badge for the first 100 paying users.
- Add an exit survey to cancellation support flow.
- Improve the top support articles based on actual tickets.
- Decide whether to raise monthly/yearly pricing after 50 paid users.

## Acquisition Channels

Highest fit:

- GitHub releases and README SEO
- Search pages around M3U, XMLTV, HLS, EPG, and desktop playlist management
- YouTube walkthroughs and short demos
- Build-in-public posts with screenshots
- Roku Store listing, using media-player wording and avoiding prohibited terms

Use carefully:

- Reddit and forum communities: answer real questions, do not spam links.
- Paid ads: wait until checkout conversion and retention are proven.
- Affiliate/referral deals: only with people who understand bring-your-own-content.

## Weekly Dashboard

Update this every Friday.

| Metric                        | Target direction |
| ----------------------------- | ---------------- |
| Site visitors                 | Up               |
| Downloads/registers           | Up               |
| New free accounts             | Up               |
| Trials started                | Up               |
| Paid subscribers              | Up               |
| MRR                           | Up               |
| Checkout conversion           | Up               |
| Trial-to-paid conversion      | Up               |
| Cancellations                 | Down             |
| Refunds                       | Down             |
| Support tickets per paid user | Down             |

## First 7 Days

- [ ] Add Stripe test env vars to `apps/api/.env`.
- [ ] Run `pnpm billing:smoke`.
- [ ] Run a Stripe test-mode checkout to `/billing/success`.
- [ ] Run a canceled Stripe test to `/billing/cancel`.
- [ ] Confirm Terms, Privacy, Billing, and support docs all agree on pricing.
- [ ] Prepare one signed desktop release.
- [ ] Add real screenshots to the landing page and release page.
- [ ] Write a 10-user beta invite message.
- [ ] Create one Stripe promo code for founder outreach.
- [ ] Ask every beta user what they expected Pro to unlock.

Use [BETA_LAUNCH_PACKAGE.md](BETA_LAUNCH_PACKAGE.md) for invite copy,
feedback questions, and the first-user tracker. Use
[PRODUCTION_BILLING_CHECKLIST.md](PRODUCTION_BILLING_CHECKLIST.md) before
accepting real payments.

## Operating Rule

Build only what helps one of these happen:

- More qualified users try the app.
- More users reach first successful playback.
- More users understand why Pro is worth paying for.
- More subscribers stay after the first billing period.

Everything else can wait.
