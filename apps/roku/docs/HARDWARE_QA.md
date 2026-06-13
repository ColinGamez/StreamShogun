# StreamShōgun Roku Hardware QA

Use this checklist for every sideload pass on a physical Roku device.

## 1. Discover Device

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/discover-roku.ps1
```

Expected:

- Device appears with an ECP URL such as `http://192.168.x.x:8060`
- `developer-enabled` is `true` when queried through ECP device info

## 2. Build and Validate

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/qa-static.ps1
```

Expected:

- BrighterScript validation passes
- `apps/roku/dist/StreamShogun-roku.zip` is created
- ZIP contains `manifest` at the root

## 3. Sideload

Set the developer password once for the shell:

```powershell
$env:ROKU_DEV_PASSWORD = "<developer-mode-password>"
```

Deploy and launch:

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/deploy.ps1 -DeviceHost <ROKU_IP> -Launch
```

If upload fails, open `http://<ROKU_IP>` in a browser and upload `apps/roku/dist/StreamShogun-roku.zip` manually.

## 4. ECP Smoke

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/ecp-smoke.ps1 -DeviceHost <ROKU_IP> -Launch
```

Notes:

- Some Roku TVs run ECP in Limited mode and may block `/query/apps`.
- `/query/device-info`, `/launch/dev`, and keypress commands are still useful smoke checks when allowed.

## 5. Manual Remote Checklist

First launch:

- App opens without a crash or blank screen
- Empty Library state is readable
- Full-screen overlays focus the first useful control when opened
- Saved account sessions refresh entitlements quietly when stale
- Back/Home behavior exits cleanly

Playlist entry:

- Add Playlist opens keyboard entry
- Invalid URL shows validation
- Duplicate playlist URL is rejected
- Free plan blocks a second playlist and focuses Upgrade
- Upgrade from Add Playlist opens Roku Pay without sending the user to an external checkout
- Save shows a checking state before storing
- Unreachable or non-M3U URL is not saved
- Valid playlist loads and focuses the grid

Library:

- `All Playlists` is the default selector option
- Individual playlist switching works
- Groups, Favorites, Recent, and Search all filter correctly
- `Resume Last` appears after first playback
- Replay button toggles favorite on the focused card

Player:

- Selected channel starts quickly
- Back stops playback and returns to Library
- OK toggles overlay
- Up/Right and Down/Left channel surf within the current filtered list
- Replay toggles favorite while playing
- Playback errors show a readable recovery screen

Guide:

- EPG source form validates URLs
- Save shows a checking state before storing an EPG source
- Unreachable or non-XMLTV EPG URL is not saved
- Free raw `.xml.gz` validation failures focus Upgrade for the Pro EPG proxy path
- Upgrade from EPG Source opens Roku Pay without sending the user to an external checkout
- Signed-out raw `.xml.gz` source shows a readable decompression warning when Roku cannot parse it
- Signed-in Pro account can load compatible raw `.xml.gz` sources through the EPG proxy
- Loading EPG data transitions to loading playlist channels without freezing remote focus
- Guide loads matched channels
- Multiple playlists with repeated channel numbers still show distinct guide rows
- Selecting a guide channel starts playback with playlist metadata

Settings:

- StreamShōgun Account opens the account overlay
- Invalid account credentials show a readable error
- Valid account sign-in stores plan/status and clears the password field
- Refresh Pro updates local entitlement state
- Roku Pay from Account opens the purchase/validate/restore overlay
- Sign-in with a stored pending Roku Pay purchase focuses the Roku Pay recovery path
- Sign Out removes local account tokens
- Pro Features reflects locked/unlocked state
- Pro Features opens Roku Pay when locked and Account when active
- Account overlay focuses Refresh Pro when signed in, or Roku Pay when a purchase needs validation
- Roku Pay opens the ChannelStore purchase/restore overlay
- Roku Pay summary shows signed-in or signed-out account state
- Settings Roku Pay info shows stored purchase recovery readiness
- Account from Roku Pay opens the account overlay
- Account can return to Roku Pay without backing out to Settings
- Account → Roku Pay auto-validates a stored purchase when signed in
- Load Plans sends `getCatalog` and renders product metadata or readable errors
- Monthly/Yearly sends RFI before `doOrder`
- Switching from monthly to yearly sends a Roku Pay `Upgrade` order action
- Switching from yearly to monthly sends a Roku Pay `Downgrade` order action
- Completed order stores purchase metadata as pending backend validation
- Restore sends `getAllPurchases` and records matching Pro purchases
- Validate retries a stored Roku Pay purchase after account sign-in
- Signed-in restore/order attempts backend validation through `/v1/roku/validate-purchase`
- Successful backend validation updates Settings account status to Pro
- Closing Roku Pay refreshes account entitlement from `/v1/features`
- Backend receives Roku Pay push notifications at `/v1/roku/pay-push`, echoes `responseKey`, and updates matched subscription state
- Manage Playlists opens a full-screen manager
- Removing a playlist requires a second OK confirmation
- Removed playlists disappear from Library and related favorites/recents/resume state
- Viewing Activity shows favorites, recents, and last played
- Diagnostics shows device/model/cache/local-data details
- Diagnostics shows Roku Pay stored purchase state
- Clear Viewing Activity removes favorites/recent/resume state
- Clear All Data resets Registry-backed state

## 6. Debug Console

Open the BrightScript console:

```powershell
telnet <ROKU_IP> 8085
```

For verbose app logs, temporarily set this in `apps/roku/manifest`:

```text
bs_const=DEBUG=true
```

Do not ship store builds with debug logging enabled.
