---
id: faq
title: Frequently Asked Questions
tags: [faq, questions, help, general, common]
lastUpdated: "2026-03-03"
summary: Answers to the most common questions about StreamShōgun.
---

# Frequently Asked Questions

## General

### What is StreamShōgun?
StreamShōgun is a modern, cross-platform desktop IPTV player. It lets you watch live TV using your own legally obtained M3U playlists, with features like programme guides (EPG), search, favourites, and more.

### Is StreamShōgun free?
Yes! The Free plan includes full playback, EPG, search, and history. The Pro plan adds PIP, Cloud Sync, and priority support.

### Does StreamShōgun provide TV channels or streams?
**No.** StreamShōgun is a player only. You must provide your own M3U playlists from legal sources. We do not host, provide, or endorse any specific content sources.

### What platforms does StreamShōgun run on?
Windows 10+, macOS 12+, and Linux (Ubuntu 20.04+, Fedora 36+). All 64-bit only.

## Playlists & Channels

### What playlist formats are supported?
M3U and M3U8 with extended attributes (`#EXTINF`, `tvg-id`, `tvg-logo`, `group-title`).

### How many playlists can I add?
There's no limit on the number of playlists or channels.

### Can I organise channels into groups?
Yes — channels are automatically grouped by the `group-title` attribute in your M3U. You can filter by group on the Channels page.

## EPG / Programme Guide

### What EPG format is supported?
XMLTV format. StreamShōgun includes built-in presets for common regional EPG sources.

### Why don't my channels show programme data?
Your channels need matching `tvg-id` values. See [EPG Troubleshooting](epg-troubleshooting).

## Playback

### What stream formats are supported?
StreamShōgun primarily supports **HLS** (HTTP Live Streaming) via `.m3u8` manifests.

### Can I record streams?
No, StreamShōgun does not include recording functionality.

### What are the keyboard shortcuts?
| Key | Action |
|-----|--------|
| Space | Play / Pause |
| F | Toggle fullscreen |
| M | Toggle mute |
| Alt+1–6 | Switch pages |

## Account & Billing

### Do I need an account?
No. StreamShōgun works fully offline without an account. An account is only needed for Cloud Sync and subscription management.

### How do I cancel my subscription?
Settings → Account → Manage Subscription → Cancel in the Stripe portal. See [Subscriptions & Billing](subscriptions-billing).

### What happens when I cancel?
You keep Pro features until the end of your billing period, then revert to Free. No data is lost.

## Privacy

### What data does StreamShōgun collect?
Without an account: nothing. With an account: only email, hashed password, and opt-in Cloud Sync data. See [Privacy & Security](privacy-security).

### Are my playlists or stream URLs sent to your servers?
**Never.** All playlist and stream data stays on your device.

## Troubleshooting

### The app is slow or laggy
- Close other resource-heavy applications.
- Large playlists (10,000+ channels) or EPG files (50MB+) may cause initial slowness.
- Restart the app to clear memory.

### How do I reset the app to defaults?
Delete the app's data directory:
- **Windows:** `%APPDATA%/StreamShōgun`
- **macOS:** `~/Library/Application Support/StreamShōgun`
- **Linux:** `~/.config/StreamShōgun`

Then restart the app.

## When to Contact Support

For anything not covered here:

📧 **support@streamshogun.com**
