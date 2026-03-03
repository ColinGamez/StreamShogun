---
id: privacy-security
title: Privacy & Security
tags: [privacy, security, data, collection, encryption, gdpr, telemetry]
lastUpdated: "2026-03-03"
summary: What data StreamShōgun collects, how it's stored, and your privacy rights.
---

# Privacy & Security

StreamShōgun is designed with privacy-first principles.

## What We Collect

### Without an Account (Free, offline)
- **Nothing.** StreamShōgun runs entirely on your device. No data is sent to our servers.
- Your playlists, EPG data, and watch history are stored locally on your computer.

### With an Account
- **Email and hashed password** — for authentication.
- **Subscription status** — managed via Stripe (we don't store full card numbers).
- **Cloud Sync data** (Pro, opt-in) — settings, favourites, and watch history.

### What We Never Collect
- ❌ Playlist URLs or contents
- ❌ Stream URLs
- ❌ What channels you watch
- ❌ Your IP address (beyond standard server logs)
- ❌ Device fingerprints
- ❌ Browsing or search history
- ❌ System files or personal documents

## Data Storage

| Data | Location | Encryption |
|------|----------|------------|
| Local settings | Your device (SQLite) | No (local only) |
| Auth tokens | Your device (secure storage) | At rest |
| Cloud Sync | Our servers (PostgreSQL on Railway) | In transit (TLS) + at rest |
| Payment info | Stripe (PCI-compliant) | Stripe's encryption |

## Telemetry

StreamShōgun includes **optional, anonymous** telemetry:
- App open count (for upgrade nudge logic)
- Error reports via Sentry (opt-in, no PII)

You can disable all telemetry in **Settings**.

## Your Rights

- **Export** — export your settings and data from Settings → Export.
- **Delete** — delete your account and all server-side data from Settings → Account → Delete Account.
- **Opt out** — use StreamShōgun without an account for zero data collection.

## Support Bundle Privacy

When using the **"Copy Support Bundle"** feature:
- Only non-sensitive diagnostic info is included (app version, OS, source counts).
- **URLs, tokens, and secrets are automatically redacted.**
- You can review the bundle before sharing it.

## When to Contact Support

For data deletion requests or privacy questions:

📧 **support@streamshogun.com**
