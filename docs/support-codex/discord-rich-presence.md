---
id: discord-rich-presence
title: Discord Rich Presence
tags: [discord, rich-presence, integration, status, rpc]
lastUpdated: "2026-03-03"
summary: How to enable and configure Discord Rich Presence to show what you're watching.
---

# Discord Rich Presence

StreamShōgun can show your viewing activity in your Discord profile via **Rich Presence**.

## Enabling Discord Rich Presence

1. Go to **Settings** (⚙️ sidebar or Alt+6).
2. Find the **"Integrations"** section.
3. Toggle **"Discord Rich Presence"** to ON.

When enabled. Discord will show "Watching StreamShōgun" (or similar) in your profile status.

## What Is Shown

Discord Rich Presence displays:
- App name ("StreamShōgun")
- Current activity (e.g., "Watching live TV")
- Elapsed time

> **Privacy:** StreamShōgun does **not** share channel names, stream URLs, or playlist information with Discord. Only generic activity status is shown.

## Requirements

- **Discord desktop app** must be running (not the browser version).
- StreamShōgun must have the Discord integration enabled in Settings.
- A valid Discord Client ID must be configured (this is built into the app).

## Common Issues

| Problem | Fix |
|---------|-----|
| Status not showing | Ensure Discord desktop app is open before launching StreamShōgun. |
| "Activity Status" off in Discord | In Discord Settings → Activity Privacy, enable "Display current activity". |
| Status stuck on old info | Restart StreamShōgun to reset the RPC connection. |
| Linux: connection refused | Ensure the Discord IPC socket is accessible. Some Flatpak/Snap installs may need configuration. |

## Disabling Discord Rich Presence

1. Go to **Settings** → **Integrations**.
2. Toggle **"Discord Rich Presence"** to OFF.

Your Discord status will clear within a few seconds.

## When to Contact Support

If Discord integration consistently fails to connect and your Discord desktop app is running:
- Note your OS and Discord install type (standard, Flatpak, Snap, etc.)
- Include any error messages from the app

📧 **support@streamshogun.com**
