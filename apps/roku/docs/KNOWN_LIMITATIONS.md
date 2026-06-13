# StreamShōgun Roku — Known Limitations

## Current Limitations (v1.0.0)

### 0. Roku Pay Store Release Path

**Issue**: The current sideload build can start Roku Pay catalog/order/restore flows, validate purchase IDs against the backend, and accept Roku Pay push notifications, but production validation still requires Roku Pay environment variables and Developer Dashboard product setup.

**Store requirement**: Paid Roku releases that offer subscriptions, upgrades, downgrades, or other transactional services must complete those flows on-device with Roku Pay / ChannelStore. Do not ship a Roku channel that sends customers to an external Stripe checkout page.

**Current behavior**:

- Settings includes on-device StreamShōgun account sign-in
- `/v1/features` is the source of truth for Pro feature flags
- Pro gates currently unlock unlimited playlists and the EPG proxy
- Playlist-limit and raw `.xml.gz` EPG gates can open Roku Pay directly
- Settings includes a Roku Pay ChannelStore shell for catalog, RFI, order, and restore
- Roku Pay purchase records are stored as pending backend validation
- A stored Roku Pay purchase can be retried with Validate after StreamShōgun sign-in
- `/v1/roku/validate-purchase` validates purchase IDs when Roku Pay API credentials are configured
- Plan switches pass ChannelStore `Upgrade` / `Downgrade` action metadata for monthly/yearly changes
- `/v1/roku/pay-push` records Roku Pay push events and reconciles matched subscription entitlements

**Future**: Complete physical-device Roku Pay billing testing with production Dashboard product IDs, push notification endpoint configuration, and subscription recovery scenarios before submitting a paid Roku store build.

---

### 1. Gzip / Compressed EPG Files

**Issue**: Roku's `roUrlTransfer` with `EnableEncodings(true)` handles HTTP `Content-Encoding: gzip` (server-side compression) but does **not** natively decompress raw `.xml.gz` files served without proper headers.

**Workaround**: If your XMLTV EPG file is served as `.xml.gz`:

- Sign in with an active Pro account so the Roku app can use the StreamShōgun EPG proxy
- Use a decompression proxy that serves the uncompressed XML
- Use a provider that serves uncompressed `.xml` directly
- Use a provider that sets `Content-Encoding: gzip` headers properly

**Detection**: The app detects gzip magic bytes (`1f 8b`) during EPG validation and shows a warning if Roku cannot parse the source. Active Pro accounts can route guide fetches through the authenticated StreamShōgun proxy.

---

### 2. URL Entry via Remote

**Issue**: Typing long playlist/EPG URLs using the Roku remote's on-screen keyboard is tedious.

**Future improvements**:

- QR code / pairing flow from mobile device
- Cloud Sync integration (sync playlists from the web app)
- Deep-link support to add playlists from the companion web app

**Current mitigation**: Use the Roku mobile app's keyboard feature for faster text entry.

**Validation**: Playlist and EPG URLs are fetched and parsed before they are saved. This catches unreachable URLs, duplicate playlist URLs, non-M3U playlist responses, and non-XMLTV guide responses during import. Free Roku sessions are limited to one playlist; active Pro entitlement unlocks unlimited playlist sources.

---

### 3. Large XMLTV File Performance

**Issue**: Very large XMLTV files (100MB+) may cause slow parsing or out-of-memory issues on lower-end Roku devices.

**Mitigations in place**:

- ±12 hour time window filtering (only parses programmes near current time)
- HTTP caching with configurable TTL (avoids re-downloading)
- Programme lists capped to 12 entries per channel

**Recommendations**:

- Use EPG sources that provide filtered/smaller data sets
- Set a longer TTL (12h or 24h) to reduce fetch frequency
- Test with a small file first before using large guides

---

### 4. Large Multi-Playlist Libraries

**Issue**: The Library defaults to "All Playlists", so very large collections may take longer to fetch and parse on lower-end devices.

**Mitigations in place**:

- Users can switch to a single playlist from the Library selector
- The selected Library scope is remembered locally
- Favorites, recents, and resume-last state are stored separately from playlist fetches
- The Guide loads playlist channels in a background task before matching EPG data

---

### 5. Stream Format Support

**Supported formats**:

- HLS (`.m3u8`) — primary, best compatibility
- MP4 (`.mp4`) — progressive download
- DASH (`.mpd`) — on supported devices

**Not supported**:

- RTMP streams (deprecated on Roku)
- Raw `.ts` files without HLS manifest
- DRM-protected streams (Widevine, PlayReady require special handling)
- Streams requiring custom HTTP headers or cookies for auth

**Note**: Stream format is auto-detected from the URL extension. If a stream URL doesn't have an extension, the app defaults to HLS.

---

### 6. EPG Channel Matching

**Issue**: Matching M3U channels to XMLTV entries is heuristic-based and may not match all channels.

**Matching strategy** (in order):

1. **Primary**: `tvg-id` attribute in M3U matches XMLTV `channel[@id]`
2. **Secondary**: Normalized channel name fuzzy match (lowercase, alphanumeric only, HD/SD suffixes stripped)

**Unmatched channels**: Shown in the Guide with "No programme data available" — they can still be played.

**Recommendations**:

- Use M3U playlists with `tvg-id` attributes for best matching
- Ensure the XMLTV source covers the same provider/region as your playlist

---

### 7. Single EPG Source

**Issue**: The app currently supports only one XMLTV EPG source URL at a time.

**Workaround**: Use a merged XMLTV source that combines multiple providers, or switch the EPG URL in Settings when needed.

---

### 8. Favorites, Recents, and Resume Are Local

**Issue**: Favorites, recently watched channels, and resume-last state are stored in the Roku Registry on the current device only.

**Current behavior**:

- Recent channels are capped to 24 entries
- Favorites and recent channels are derived from user-added playlist URLs
- Settings includes a viewing activity summary and a clear-viewing-activity action

**Future**: Cloud Sync integration can mirror this state across StreamShōgun devices.

---

### 9. No Account Sync

**Issue**: Playlists and settings are stored locally on the Roku device only. There is no cloud sync between devices.

**Future**: Integration with the StreamShōgun web app Cloud Sync feature is planned for a future release.

---

### 10. FHD Resolution Only

**Issue**: The app is designed for FHD (1920×1080) displays. It will work on 720p Roku devices but UI elements may be scaled down by the system.

**Note**: Layout was designed for FHD to maximize text readability and grid density. SD resolution is not supported.

---

## Reporting Issues

If you encounter a bug:

1. Enable debug mode: set `bs_const=DEBUG=true` in `manifest`
2. Sideload the updated app
3. Open the debug console: `telnet <ROKU_IP> 8085`
4. Reproduce the issue
5. Copy the log output (URLs are automatically redacted)
6. Report at: support@streamshogun.com
