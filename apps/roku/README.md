# StreamShōgun — Roku Channel App

A personal playlist player for Roku, built with BrightScript + SceneGraph.

> **No "IPTV" anywhere.** This is a _personal playlist player_ — users add their own M3U URLs.

---

## Features

- **Verified Playlist Import** — Fetch and parse M3U/M3U8 URLs before saving
- **Validated EPG Setup** — Fetch and parse XMLTV URLs before saving
- **StreamShōgun Account Entitlements** — On-device sign-in and Pro status refresh
- **Background Entitlement Refresh** — Saved sessions quietly re-check Pro state when stale
- **Roku Pro Gating** — Free playlist limit, Pro unlimited playlists, Pro EPG proxy
- **Roku Pay Store Flow** — ChannelStore catalog, RFI, purchase, validation retry, restore, and upgrade/downgrade workflow
- **In-Flow Pro Upgrade Paths** — Playlist and EPG Pro gates route directly to Roku Pay
- **Unified Channel Browser** — "All Playlists" grid with individual playlist switching
- **Favorites & Recents** — Local favorite/recent lanes plus resume-last playback
- **TV-Native Playlist Management** — Focusable playlist manager with safe removal
- **HLS/MP4 Playback** — Full-screen video with now-playing overlay
- **Channel Surfing** — Up/down remote navigation while watching
- **Responsive EPG Guide** — XMLTV guide matching with background playlist loading
- **Roku Deep Links** — Launch/input deep-link handling for saved playlist channels
- **Roku Metadata** — Rich playback metadata, content classification, and secure HTTPS certificates
- **Privacy-First** — All data stored locally, URLs redacted in logs
- **Store-Compliant** — No default content, no content curation

---

## Project Structure

```
apps/roku/
├── manifest                          App manifest (v1.0.x FHD)
├── source/
│   ├── main.brs                      Entry point + deep-link handling
│   ├── api/
│   │   ├── http.brs                  HTTP GET with caching + gzip
│   │   └── streamshogun_api.brs      Authenticated API + proxy helpers
│   ├── parse/
│   │   ├── m3u_parser.brs            M3U/M3U8 parser (EXTINF attributes)
│   │   └── xmltv_parser.brs          XMLTV parser (time-windowed, ±12h)
│   ├── storage/
│   │   └── registry_store.brs        Roku Registry persistence
│   └── util/
│       ├── normalize.brs             Channel name normalization
│       └── redact.brs                URL/token redaction for logging
├── components/
│   ├── MainScene.xml / .brs          Root scene + tab navigation
│   ├── ChannelGridItem.xml           Custom channel card for MarkupGrid
│   ├── ProgrammeListItem.xml         Custom guide row for MarkupList
│   ├── LibraryScene.xml / .brs       Playlist selector + channel grid
│   ├── AddPlaylistScene.xml / .brs   M3U URL entry form
│   ├── AccountScene.xml / .brs       StreamShōgun sign-in + Pro status
│   ├── RokuPayScene.xml / .brs       Roku Pay catalog/order/restore shell
│   ├── ManagePlaylistsScene.xml/.brs TV-native playlist management
│   ├── GuideScene.xml / .brs         EPG two-panel guide view
│   ├── AddEpgScene.xml / .brs        XMLTV URL entry form
│   ├── PlayerScene.xml / .brs        Video player with overlay
│   ├── SettingsScene.xml / .brs      Settings, legal, data management
│   └── tasks/
│       ├── FetchLibraryTask.xml      Multi-playlist library download + parse
│       ├── FetchPlaylistTask.xml     Background M3U download + parse
│       ├── FetchEpgTask.xml          Background XMLTV download + parse
│       ├── ValidateEpgTask.xml       XMLTV pre-save validation
│       ├── AccountSessionTask.xml    Login, refresh, and Pro feature fetch
│       ├── ValidateRokuPayTask.xml   Roku Pay purchase validation handoff
│       └── ResolveDeepLinkTask.xml   Deep-link channel lookup across playlists
├── images/
│   ├── icon_*.png / splash_*.jpg     Generated launch/store assets
│   └── README.md                     Asset sizing guide
├── scripts/
│   ├── create-assets.ps1             Regenerate Roku image assets
│   ├── package.ps1                   Validate + ZIP sideload package
│   ├── discover-roku.ps1             SSDP device discovery
│   ├── deploy.ps1                    Sideload package upload
│   ├── ecp-smoke.ps1                 ECP device/app smoke checks
│   └── qa-static.ps1                 Static validation + package audit
├── bsconfig.json                     BrighterScript validation config
└── docs/
    ├── SIDELOADING.md                Dev mode setup + packaging guide
    ├── HARDWARE_QA.md                Physical Roku QA checklist
    ├── STORE_LISTING.md              Channel store copy + keywords
    └── KNOWN_LIMITATIONS.md          Known issues + workarounds
```

---

## Quick Start

1. Enable Developer Mode on your Roku (see [docs/SIDELOADING.md](docs/SIDELOADING.md))
2. Build the sideload package:
   ```powershell
   powershell -ExecutionPolicy Bypass -File apps/roku/scripts/package.ps1
   ```
3. Upload `apps/roku/dist/StreamShogun-roku.zip` to `http://<ROKU_IP>` via the Development Application Installer
4. Add a playlist URL from the Library tab

### Static Validation

```powershell
npx --yes brighterscript --project apps/roku/bsconfig.json
```

---

## Design Tokens

| Token         | Value     | Usage                       |
| ------------- | --------- | --------------------------- |
| Background    | `#0c0c0e` | App background              |
| Surface       | `#111114` | Header, panels              |
| Surface hover | `#18181b` | Right panel                 |
| Accent        | `#7c5cfc` | Focus, highlights, branding |
| Text          | `#f4f4f5` | Primary text                |
| Muted         | `#a1a1aa` | Secondary text, labels      |
| Dim           | `#71717a` | Tertiary text, hints        |
| Error         | `#ff6b6b` | Validation, playback errors |

---

## Architecture

### Pro Entitlement Flow

```
Settings → StreamShōgun Account
              ↓
       AccountSessionTask
              ↓ POST /v1/auth/login or /v1/auth/refresh
              ↓ GET /v1/features
              ↓
       registry_store saves plan/status/feature flags
              ↓
Roku Pro gates: unlimited playlists, EPG proxy for raw .xml.gz sources
```

Paid Roku store releases should complete purchase, upgrade, downgrade, and
account sign-in flows on-device with Roku Pay / ChannelStore. The current Roku
app consumes existing StreamShōgun account entitlements and avoids external
checkout links inside the channel.

### Roku Pay Flow

```
Settings → Roku Pay
        ↓ ChannelStore.getCatalog
        ↓ ChannelStore.getUserData RFI
        ↓ ChannelStore.doOrder (+ Upgrade/Downgrade action when switching plans)
        ↓ Save purchaseId as pending_backend_validation
        ↓ Account action when StreamShōgun sign-in is needed
        ↓ Validate button or ValidateRokuPayTask → POST /v1/roku/validate-purchase
        ↓ Backend validate-transaction grants account entitlement
        ↓ Roku Pay push notifications → POST /v1/roku/pay-push
        ↓ Backend reconciles renewal/cancel/grace/hold entitlement changes
```

### Data Flow

```
User enters URL → AddPlaylistScene validates format + duplicate status
                                                      ↓
                     FetchPlaylistTask verifies URL parses as M3U
                                                      ↓
                                     registry_store saves playlist
                                                      ↓
LibraryScene.refresh() → loads playlists from registry
                              ↓
                     FetchLibraryTask (background)
                         ↓ Fetch all playlists or selected playlist
                         ↓ HttpGet + ParseM3U
                         ↓ attach playlist/channel metadata
                              ↓
                     Channel grid populated with All/Favorites/Recent
                                                      ↓
                         user selects channel or Resume Last
                                                      ↓
                                              PlayerScene starts playback
                                                      ↓
                         registry_store records last/recent/favorite state
```

### Roku Deep-Link Flow

```
Launch/Input event → MainScene.deepLink
                         ↓
              ResolveDeepLinkTask fetches saved playlists
                         ↓
        contentId matches tvg-id, tvg-name, channel name, URL,
        or stable IDs like ssg:<playlist-index>:<channel-index>
                         ↓
              PlayerScene starts direct playback
```

### EPG Flow

```
User enters XMLTV URL → AddEpgScene validates format
                                      ↓
                     ValidateEpgTask verifies URL parses as XMLTV
                                      ↓
                            registry_store saves EPG settings
                                                        ↓
GuideScene.refresh() → FetchEpgTask (background, cached)
                            ↓ ParseXMLTV (±12h window)
                            ↓ FetchLibraryTask loads playlist channels
                            ↓ MatchChannelsToEpg with unique guide keys
                                  ↓
                         Two-panel UI: channels ↔ programmes
```

### Storage

- **Roku Registry** (`roRegistrySection`) — playlists, EPG settings, preferences, optional account entitlement
- **tmp:/** filesystem — cached HTTP responses with TTL timestamps
- All data user-provided; nothing pre-populated

---

## Store Submission Checklist

- [ ] Create image assets (see [images/README.md](images/README.md))
- [ ] Create privacy policy page at streamshogun.com/privacy
- [ ] Screenshots (3-6 at 1920×1080, no copyrighted content)
- [ ] Package as signed `.pkg` via Roku device
- [ ] Submit at developer.roku.com
- [ ] Review store listing copy in [docs/STORE_LISTING.md](docs/STORE_LISTING.md)

---

## License

Proprietary — StreamShōgun © 2025
