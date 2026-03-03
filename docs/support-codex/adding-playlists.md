---
id: adding-playlists
title: Adding & Managing Playlists
tags: [playlist, m3u, m3u8, add, import, url, file, library]
lastUpdated: "2026-03-03"
summary: How to add M3U/M3U8 playlists from a URL or local file, and manage your playlist library.
---

# Adding & Managing Playlists

StreamShōgun supports **M3U** and **M3U8** playlist formats — the standard for IPTV channel lists.

> **Important:** Only use playlists you have obtained legally. StreamShōgun does not provide, host, or endorse any specific playlist sources.

## Adding a Playlist via URL

1. Open the **Library** page (📚 sidebar or Alt+1).
2. Click the **"Add Playlist"** button.
3. Select **"From URL"**.
4. Paste your M3U/M3U8 URL into the text field.
5. (Optional) Give it a friendly name.
6. Click **"Add"**.

StreamShōgun will download and parse the playlist. Channels will appear on the **Channels** page once loaded.

## Adding a Playlist from a Local File

1. Open the **Library** page.
2. Click **"Add Playlist"** → **"From File"**.
3. Browse to your `.m3u` or `.m3u8` file.
4. Click **"Open"**.

## Managing Playlists

On the **Library** page you can:

- **Refresh** — re-download a URL-based playlist to get updated channels.
- **Rename** — click the playlist name to edit it.
- **Delete** — remove a playlist and all its channels.

## Playlist Format

StreamShōgun supports standard M3U with extended attributes:

```
#EXTM3U
#EXTINF:-1 tvg-id="channel1" tvg-name="Channel One" tvg-logo="https://example.com/logo.png" group-title="News",Channel One
http://example.com/stream1.m3u8
```

Supported attributes:
- `tvg-id` — used for EPG matching
- `tvg-name` — display name
- `tvg-logo` — channel logo URL
- `group-title` — channel group/category

## Common Issues

| Problem | Fix |
|---------|-----|
| "Failed to parse playlist" | Ensure the file is a valid M3U format. Check for encoding issues (UTF-8 recommended). |
| Channels not appearing | After adding, switch to the Channels page. If empty, the playlist may be malformed. |
| URL returns 403/404 | The server hosting the playlist may require authentication or the URL may have expired. |
| Very slow loading | Large playlists (10,000+ channels) may take a moment to parse. This is normal. |

## When to Contact Support

If you believe you have a valid M3U file that StreamShōgun refuses to parse, please contact support with:
- The error message shown in the app
- The first 5 lines of the M3U file (redact any private URLs or tokens)

📧 **support@streamshogun.com**
