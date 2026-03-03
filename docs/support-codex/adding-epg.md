---
id: adding-epg
title: Adding EPG (Electronic Programme Guide) Sources
tags: [epg, xmltv, guide, programme, schedule, tv-guide, library]
lastUpdated: "2026-03-03"
summary: How to add XMLTV EPG sources so you can see programme schedules in the Guide view.
---

# Adding EPG (Electronic Programme Guide) Sources

The **EPG** provides programme schedules and descriptions for your channels, displayed in the **Guide** (📅) page.

StreamShōgun uses the **XMLTV** format, the industry standard for EPG data.

## Adding an EPG Source

1. Open the **Library** page (📚 sidebar or Alt+1).
2. Scroll to the **"EPG Sources"** section.
3. Click **"Add EPG Source"**.
4. Select from a **preset** or enter a **custom URL**.
5. Click **"Add"**.

StreamShōgun will download and index the XMLTV file. Depending on the size, this may take a few seconds.

## EPG Presets

StreamShōgun includes several free, community EPG presets. These are pre-configured XMLTV URLs for popular regions. Select your region from the dropdown when adding an EPG source.

## How EPG Matching Works

StreamShōgun automatically matches EPG data to your channels using:

1. **tvg-id** — the `tvg-id` attribute in your M3U matches the `channel id` in XMLTV.
2. **Fuzzy name matching** — if no exact `tvg-id` match, StreamShōgun tries to match by channel name.

For best results, make sure your M3U playlist includes `tvg-id` attributes.

## Refreshing EPG Data

EPG data is refreshed automatically based on your settings. To manually refresh:

1. Go to **Library** → **EPG Sources**.
2. Click the **refresh** icon next to the source.

## Common Issues

| Problem | Fix |
|---------|-----|
| "No programme data" | Ensure you've added at least one EPG source. Check that channel `tvg-id` values match the XMLTV source. |
| EPG shows wrong times | XMLTV uses UTC offsets. Ensure your OS timezone is set correctly. |
| Download fails | The XMLTV URL may be temporarily unavailable. Try again later or check the URL. |
| Guide is slow | Large XMLTV files (50MB+) may take longer to parse. This is normal on first load. |

## When to Contact Support

If EPG data never appears after adding a valid XMLTV source and your channels have correct `tvg-id` values, contact support.

📧 **support@streamshogun.com**
