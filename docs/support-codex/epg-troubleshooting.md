---
id: epg-troubleshooting
title: EPG Troubleshooting
tags: [epg, xmltv, guide, troubleshooting, not-loading, missing, wrong-times, matching]
lastUpdated: "2026-03-03"
summary: Common issues with the programme guide and how to fix them.
---

# EPG Troubleshooting

If your programme guide isn't showing data, programmes are missing, or times look wrong, follow these steps.

## EPG Not Loading at All

### Check that you have EPG sources configured

1. Go to **Library** (📚) → **EPG Sources**.
2. If the list is empty, add an EPG source. See [Adding EPG](adding-epg).

### Check for download errors

1. In **Library** → **EPG Sources**, check for any error badges on your sources.
2. If there's a red error icon, hover over it to see the error message.
3. Common causes: invalid URL, server down, network issues.

### Try a manual refresh

1. Click the **refresh** icon next to the EPG source.
2. Wait for the download and parsing to complete.

## Programmes Not Matching Channels

### Verify tvg-id values

StreamShōgun matches EPG data to channels primarily by `tvg-id`. If your M3U playlist has missing or incorrect `tvg-id` values:

1. Open the channel in **Channels** (📡).
2. Check if a `tvg-id` is listed in the channel details.
3. Compare it with the channel IDs in your XMLTV source.

### Enable fuzzy matching

StreamShōgun's fuzzy matcher tries to match by channel name when `tvg-id` fails:

1. Go to **Settings** (⚙️).
2. Look for the EPG settings section.
3. Ensure fuzzy matching is enabled.

## Wrong Programme Times

XMLTV times include UTC offsets (e.g., `20260303180000 +0000`). If programmes show at wrong times:

1. **Check your OS timezone** — right-click the clock in your taskbar → Date/Time settings.
2. **Verify the XMLTV source** — some sources may use wrong timezone offsets.
3. Times in the Guide are displayed in your local timezone automatically.

## EPG Shows Outdated Data

1. **Manual refresh** — click refresh on the EPG source.
2. **Check lastUpdated** — if the source hasn't updated on their end, data may be stale.
3. EPG data typically covers 1–7 days ahead. Old programmes are expected for past dates.

## EPG Search Not Finding Programmes

The programme search in the **Guide** page searches by:
- Programme title
- Programme description

Tips:
- Use partial words (e.g., "foot" for "Football")
- Search is case-insensitive
- Only loaded EPG data is searched

## When to Contact Support

If you've followed all steps above and EPG still doesn't work:
- Note how many EPG sources you have configured (but don't share the URLs)
- Note how many channels you have loaded
- Include your OS and app version

📧 **support@streamshogun.com**
