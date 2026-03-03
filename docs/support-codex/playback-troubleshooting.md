---
id: playback-troubleshooting
title: Playback Troubleshooting
tags: [playback, player, stream, buffering, black-screen, no-audio, error, hls, video]
lastUpdated: "2026-03-03"
summary: Fix common playback issues like buffering, black screens, audio problems, and stream errors.
---

# Playback Troubleshooting

If a channel isn't playing, shows a black screen, or keeps buffering, follow these steps.

## Channel Won't Play / Black Screen

### Check the stream URL

1. Navigate to **Channels** (📡) and select the channel.
2. If the channel has an error badge, the stream URL may be invalid or down.
3. Try a different channel to confirm the app is working.

### Common causes

- **Stream offline** — the source server may be down.
- **Expired URL** — some playlist URLs have time-limited tokens.
- **Unsupported format** — StreamShōgun supports HLS (`.m3u8`) streams. Other formats may not work.

### Try refreshing the playlist

1. Go to **Library** (📚).
2. Click **refresh** on the playlist.
3. Try the channel again.

## Constant Buffering

### Check your internet connection

1. Open a browser and load a website to verify connectivity.
2. Run a speed test — streaming typically needs 5+ Mbps for HD content.

### Reduce quality

If your connection is slow, the stream may buffer. StreamShōgun uses HLS adaptive bitrate streaming, which should adjust automatically. If it doesn't:
- Try a different channel with lower quality.
- Check your router/firewall isn't throttling the connection.

## No Audio

1. **Check the volume control** in the player — look for the volume slider at the bottom.
2. **Check the mute button** — press **M** to toggle mute.
3. **Check your system volume** — ensure your OS audio output is working.
4. Some streams use audio codecs that may not be supported. Try a different channel.

## Player Controls

| Control | Action |
|---------|--------|
| Click video | Play / Pause |
| Space | Play / Pause |
| F | Toggle fullscreen |
| M | Toggle mute |
| Double-click | Toggle fullscreen |

> **Note:** Keyboard shortcuts work when the player is focused.

## Error Messages

| Error | Meaning | Fix |
|-------|---------|-----|
| "Network error" | Cannot reach the stream server | Check internet, try refreshing playlist |
| "Media error" | Stream format issue | Stream may be incompatible or corrupted |
| "Manifest not found" | HLS manifest missing | URL may be expired, refresh playlist |
| "Fatal playback error" | Unrecoverable error | Try a different channel, restart app |

## When to Contact Support

If multiple channels fail to play and other apps can stream video fine:
- Note how many channels fail vs. work
- Include your OS and app version
- Do NOT include stream URLs

📧 **support@streamshogun.com**
