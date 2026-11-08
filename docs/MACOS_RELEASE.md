# macOS release signing

The release workflow builds arm64 and x64 DMG/ZIP installers. The maintainer currently has no Apple Developer Program membership; Apple signing and notarization remain blocked until that membership and its credentials are supplied. With no signing secrets configured, these remain **ad-hoc signed and not notarized**; Gatekeeper can warn or block downloaded copies. Do not describe an ad-hoc release as Apple approved.

Signing uses the installed **electron-builder 26.15.3** API: `mac.hardenedRuntime`, `mac.entitlements`, `mac.entitlementsInherit`, and `mac.notarize` are flat keys. The v27 `mac.sign` object does not apply here. The built-in notarization integration submits and staples the application; no third-party notarization hook is needed. See the [v26 macOS configuration](https://www.electron.build/v26/docs/mac/) and [v26 notarization guide](https://www.electron.build/v26/docs/features/code-signing/notarization/).

## Set up Apple credentials

1. Use an active Apple Developer Program membership and a Mac with Xcode/Command Line Tools. Accept pending Apple agreements in the account.
2. Create a **Developer ID Application** certificate for distribution outside the Mac App Store. Install it on the Mac that owns its private key. In Keychain Access, export the certificate **and private key** as a password-protected `.p12`. A downloaded `.cer` without its private key is insufficient. Follow [Apple's Developer ID instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/) and [certificate export instructions](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html).
3. In App Store Connect, open Users and Access > Integrations > App Store Connect API and create a **team API key** with an appropriate authorized role (Developer or higher). Record its 10-character Key ID and issuer UUID and download the `.p8` private key, which Apple makes available only once. This setup uses a team key and issuer, not an individual key. See [Apple's team API key documentation](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/) and [electron/notarize authentication](https://github.com/electron/notarize#usage-with-app-store-connect-api-key).
4. Base64-encode the `.p12` and `.p8` files on your own machine. Store the resulting values directly in GitHub repository Actions secrets. Do not put private keys, certificate passwords, or their base64 contents in chat, issues, source files, artifacts, or build logs.

## Repository configuration

In GitHub > repository Settings > Secrets and variables > Actions, add these **repository secrets**:

| Secret                     | Value                                              | Build environment                                           |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `MAC_CSC_LINK`             | Base64 of exported Developer ID Application `.p12` | `CSC_LINK`                                                  |
| `MAC_CSC_KEY_PASSWORD`     | Password used when exporting that `.p12`           | `CSC_KEY_PASSWORD`                                          |
| `MAC_APPLE_API_KEY_BASE64` | Base64 of the downloaded `.p8` private key         | Decoded to temporary file; its path becomes `APPLE_API_KEY` |
| `MAC_APPLE_API_KEY_ID`     | Team API Key ID                                    | `APPLE_API_KEY_ID`                                          |
| `MAC_APPLE_API_ISSUER`     | Team issuer UUID                                   | `APPLE_API_ISSUER`                                          |

Set repository **variable** `MAC_SIGNING_REQUIRED` to `true` once credentials are ready. The workflow maps it to `REQUIRE_MAC_SIGNING`. Leaving the variable unset defaults to `false` and permits ad-hoc releases when no credentials exist. Any partially configured credentials fail the build even when signing is optional; a complete set automatically enables signing and notarization. Required mode fails on missing credentials before packaging, rather than silently publishing an unsigned release.

`prepare-mac-signing.mjs` decodes the private key into a uniquely named directory under `RUNNER_TEMP`, writes it with owner-only permissions, validates it, and exports only the path through `GITHUB_ENV`. The workflow cleans up the temporary key after building. The hosted runner is ephemeral. The scripts never print credential values; do not enable shell tracing or dump environment variables around these steps.

## Local macOS build

Configure these environment values privately on the Mac: `CSC_LINK` (base64 certificate or supported certificate path), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (readable `.p8` file path), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `REQUIRE_MAC_SIGNING=true`. Then run the normal `pnpm build:mac` build. Local builds use the `.p8` path directly and do not run the GitHub-specific preparation script.

Do not set `APPLE_ID` or `APPLE_APP_SPECIFIC_PASSWORD` alongside API authentication: builder v26 prioritizes those variables and could select a different notarization account. Do not disable identity discovery or use `CSC_NAME=-` for signed releases. Signed builds must run on macOS, with a valid Developer ID Application identity; `forceCodeSigning: true` prevents missing identities from silently passing.

## Runtime entitlements and native modules

Signed releases enable hardened runtime and grant only `com.apple.security.cs.allow-jit` in both application and child entitlements. They do not request App Sandbox or disable library validation. electron-builder signs nested executable code, including unpacked `better-sqlite3` native bindings, using the distribution identity. Verify a real signed build on both architectures before claiming readiness for users.

Ad-hoc builds use `identity: "-"` and `hardenedRuntime: false`. Installed v26 code warns that ad-hoc hardened runtime rejects Electron frameworks with a different Team ID. Turning hardened runtime off for ad-hoc builds avoids weakening the signed-release entitlements with `disable-library-validation`.

## Verify the produced release

After a successful signed workflow, download the DMG/ZIP from the actual GitHub release on a Mac and verify the enclosed application. Substitute its actual path:

```sh
codesign --verify --deep --strict --verbose=2 "/Applications/YourDownloadedApp.app"
codesign --display --verbose=4 "/Applications/YourDownloadedApp.app"
xcrun stapler validate "/Applications/YourDownloadedApp.app"
spctl --assess --type execute --verbose=2 "/Applications/YourDownloadedApp.app"
```

Confirm a Developer ID Application authority, a Team Identifier, hardened runtime, a valid stapled ticket, and Gatekeeper acceptance. Launch a quarantined download on arm64 and x64 Macs. Import a playlist/guide, play a stream, restart, and verify saved library state to exercise both Electron helpers and SQLite. A successful push or unit test does not establish that Apple notarization or real-device startup succeeded.

Run offline configuration tests from the repository root:

```sh
node --test apps/desktop/scripts/mac-signing.check.mjs
```

These tests use fabricated credential strings and temporary test files. They exercise fail-closed configuration, secret-free errors, key preparation/cleanup, and the v26 configuration shape; they do not contact Apple, sign binaries, or create credentials.
