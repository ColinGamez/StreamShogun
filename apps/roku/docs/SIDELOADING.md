# StreamShōgun — Roku Sideloading & Development Guide

## Prerequisites

1. **Roku device** on the same Wi-Fi network as your computer
2. **Roku Developer account** — sign up at [developer.roku.com](https://developer.roku.com)
3. **Developer mode enabled** on your Roku device

---

## Step 1: Enable Developer Mode

1. Using your Roku remote, press the following sequence:
   ```
   Home Home Home Up Up Right Left Right Left Right
   ```
2. A confirmation dialog appears. Read and accept the Developer SDK License Agreement.
3. Set a **password** (remember this — you'll need it to upload).
4. Note the **IP address** displayed on screen (e.g., `192.168.1.100`).

---

## Step 2: Package the App

### Option A: Build with the package script (recommended)

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/package.ps1
```

This regenerates required image assets, validates component XML, verifies manifest assets, and creates:

```
apps/roku/dist/StreamShogun-roku.zip
```

For a fuller validation pass, run:

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/qa-static.ps1
```

### Option B: ZIP directly

Create a ZIP file of the `apps/roku/` directory contents (not the folder itself):

```
cd apps/roku
# Windows (PowerShell)
Compress-Archive -Path .\* -DestinationPath ..\StreamShogun.zip

# macOS/Linux
zip -r ../StreamShogun.zip . -x ".*" "docs/*"
```

The ZIP must contain:

```
manifest        ← at the root of the ZIP
source/
components/
images/         ← required for store submission
```

### Option C: Use Eclipse BrightScript plugin

1. Install Eclipse IDE + BrightScript plugin
2. Import the `apps/roku/` folder as a project
3. Right-click → Export → BrightScript Deployment
4. Enter your Roku IP + password

---

## Step 3: Sideload to Roku

1. Open a browser and navigate to `http://<YOUR_ROKU_IP>` (e.g., `http://192.168.1.100`)
2. Enter your developer password when prompted
3. Click **Upload** on the Development Application Installer page
4. Select the `StreamShogun.zip` file
5. Click **Install**

The app will install and launch automatically in ~5 seconds.

### Scripted deploy

After enabling Developer Mode and setting your developer password:

```powershell
$env:ROKU_DEV_PASSWORD = "<developer-mode-password>"
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/discover-roku.ps1
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/deploy.ps1 -DeviceHost <ROKU_IP> -Launch
```

Run ECP smoke checks:

```powershell
powershell -ExecutionPolicy Bypass -File apps/roku/scripts/ecp-smoke.ps1 -DeviceHost <ROKU_IP> -Launch
```

See [HARDWARE_QA.md](HARDWARE_QA.md) for the full hardware checklist.

### Quick reloading

After the first install, just re-upload the ZIP — it replaces the previous version automatically.

---

## Step 4: Debug Console

Access the debug console via telnet:

```bash
telnet <YOUR_ROKU_IP> 8085
```

- Port `8085` — BrightScript debug console (prints, errors, crash stacks)
- Port `8087` — SceneGraph debug server (node inspector)
- Port `8080` — Web installer (same as browser)

Enable `DEBUG=true` in the manifest's `bs_const` to see `SafeLog` output:

```
bs_const=DEBUG=true
```

---

## Step 5: Store Submission

### Required Assets

| Asset                    | Size      | Format  |
| ------------------------ | --------- | ------- |
| Channel poster (focus)   | 540×405   | PNG     |
| Channel poster (unfocus) | 336×210   | PNG     |
| FHD splash screen        | 1920×1080 | JPG/PNG |
| Screenshots (3-6)        | 1920×1080 | JPG/PNG |

### Submission Process

1. Go to [developer.roku.com](https://developer.roku.com) → Manage Channels → Add Channel
2. Fill in the **Channel Properties**:
   - Channel Name: `StreamShōgun`
   - Channel Type: `App`
   - Category: `Media Player` or `Utilities`
3. Upload **Channel Store Info** (see [STORE_LISTING.md](STORE_LISTING.md))
4. Upload all required **images** (see table above)
5. Create a **signed package**:
   - Navigate to `http://<ROKU_IP>/plugin_package`
   - Enter app name + password
   - Click **Package** to generate a `.pkg` file
6. Upload the `.pkg` file to the developer portal
7. Submit for **certification review** (typically 3-7 business days)

### Certification Tips

- ✅ No crashes or error screens during normal use
- ✅ Back button always works to navigate back
- ✅ No hardcoded content or default URLs
- ✅ App is functional from first launch (shows empty state, not errors)
- ✅ All content is user-provided
- ✅ Privacy policy URL is accessible
- ✅ Splash screen displays for ≥1.5 seconds

---

## Development Tips

- Use `SafeLog("TAG", "message")` for debug output (only prints when `DEBUG=true`)
- URLs are automatically redacted in logs via `RedactUrl()`
- Registry data persists across sideload updates — use Settings → Clear All Data to reset
- The `tmp:/` directory is cleared on reboot; persistent data uses the Registry only
- Test with both HLS (.m3u8) and MP4 streams
- Test EPG with a small XMLTV file first before using large guides
