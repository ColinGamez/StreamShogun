# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Personal Roku Japan + Korea guide** - Master-account users can connect the protected combined
  Tokyo terrestrial and Korea XMLTV guide from the Roku EPG screen with one remote click.
- **Personal Roku channel library** - The same master-account channel feed used by desktop can now
  be added to Roku without exposing or retyping its private M3U URL.

- **Enforced dependency security policy** - CI now blocks high/critical production advisories and
  critical build/development advisories, with accepted build-only findings documented separately.
- **Modernized desktop and build runtime** - Electron 43, electron-builder 26, Vite 7, and the
  complete Squirrel packaging peer chain replace outdated release infrastructure; better-sqlite3
  13 restores native packaging compatibility with Electron 43 across supported platforms.
- **Deterministic package identity** - Explicit executable and Linux desktop names prevent scoped
  workspace metadata from producing invalid AppImage paths, while CI packaging never publishes
  outside the release workflow's controlled artifact step.
- **Patched input and authentication dependencies** - Fastify/JWT, Nodemailer, XMLTV parsing, HLS,
  test tooling, and compatible vulnerable transitives were upgraded intentionally.

- **Upgrade persistence gate** - transactional migration tests preserve user settings and playlist
  data across schema versions and verify failed migrations roll back cleanly.
- **Reinstall-safe Windows behavior** - NSIS uninstalls explicitly retain StreamShogun user data so
  a later reinstall can restore the local library and preferences.

- **Import failure coverage** - automated desktop tests now exercise request timeouts, HTTP 403/404,
  dropped connections, oversized payloads, and plain/gzip downloads through one shared network path.
- **Strict source validation** - malformed XMLTV is rejected before parsing, and repeated playlist
  stream URLs are deduplicated before SQLite persistence.

- **Deterministic playback recovery** - HLS and direct streams share a tested, bounded retry policy;
  signed and uppercase manifest URLs are correctly routed through hls.js.
- **Source-aware EPG restoration** - programmes retain their provider ownership across SQLite and
  IPC so overlapping guides resolve predictably, with the most recently imported provider winning.
- **Complete test gate** - the root test command and CI now include renderer policy tests instead
  of validating only the core and API workspaces.

- **Release-scale import coverage** — automated suites now exercise 20,000-channel M3U files,
  100,000 XMLTV programmes, malformed entries, missing logos, multiple stream protocols, and
  multi-provider EPG conflict resolution against explicit performance budgets.
- **Pre-release platform builds** — the Windows, macOS, and Linux packaging matrix can now be run
  manually before creating a version tag, and missing installer artifacts fail the build.
- **Large-library batching** — Channels initially renders 300 results and progressively reveals
  additional batches, preventing 5,000–20,000 channel playlists from mounting every card at once.
- **Durable desktop source persistence** — normal playlist and EPG imports now use SQLite, restore
  guide programmes after relaunch, and refresh channel/guide state after source deletion.

- **Guided first-run experience** — new users now land on a focused, privacy-first onboarding
  screen with a direct playlist-import path, optional sample data, and an explicit reminder that
  StreamShōgun manages user-provided sources rather than providing IPTV service.
- **Two-step Library setup** — playlist import is presented as the primary activation step while
  optional XMLTV/EPG configuration stays collapsed until it is needed.

- **Premium product visual alignment** — onboarding, navigation, active controls, cards, and setup
  states now share the site's slate-and-violet visual language and fit common laptop viewports.
- **Reliable clean-start development** — root development commands now build internal shared and
  core packages before starting Vite or Electron, eliminating missing workspace build artifacts.

- **System theme support** — theme selector now offers Dark / Light / **System** options.
  "System" follows the OS `prefers-color-scheme` media query and auto-updates when the
  OS switches between light and dark mode.
- **Player volume OSD** — ArrowLeft/ArrowRight keys adjust volume ±5% with a transient
  on-screen display showing icon, bar, and percentage. Uses the HlsPlayer video element
  directly via `videoRef`, persists to `localStorage`.
- **Channels arrow-key grid navigation** — ArrowUp/Down/Left/Right keys navigate between
  channel cards in the grid. Column count is estimated automatically from card width.
- **History CSV export** — new "📥 Export" button in the history header downloads all watch
  history as a CSV file with Channel, Group, Duration, Started, Stopped columns.
- **Window state persistence** — main window position, size, and maximized state are saved
  to `userData/window-state.json` with debounced writes on resize/move, restored on launch.
- **React.lazy page code-splitting** — all 7 page components loaded via `React.lazy` +
  `Suspense` with a shimmer `Skeleton` placeholder, reducing initial bundle size.
- **Skip-to-content link** — keyboard-accessible skip link appears on focus, jumping past the
  sidebar straight to `<main>`. Styled with accent color, hidden until focused.
- **Skeleton shimmer component** — reusable `<Skeleton width height />` placeholder with a
  CSS shimmer animation. Light-theme and reduced-motion variants included.
- **`useNetworkStatus` hook** — returns `navigator.onLine` state, reactively updated via
  `online`/`offline` window events.
- **OfflineBanner network awareness** — banner now shows when `navigator.onLine` is `false`
  (not just when using cached entitlements), with a distinct "No internet connection" message.
- **LoginModal email validation** — client-side regex check before server call; shows inline
  error for malformed email addresses.
- **Debounced `SearchInput`** — accepts a `debounce` prop (default 200 ms); local state updates
  instantly while the parent callback is throttled. Clear button bypasses debounce.
- **Document title per page** — `document.title` updates to "Library — StreamShōgun", etc. on
  every page transition, improving Alt-Tab and screen-reader experience.
- **Toast `role="alert"` for errors** — error toasts now use `role="alert"` (assertive) so
  screen readers announce them immediately.
- **HlsPlayer error banner `role="alert"`** — playback error overlay is now announced
  immediately to assistive technology.
- **HlsPlayer buffer-stall recovery** — if `waiting` persists for 15 seconds, automatically
  calls `hls.recoverMediaError()` to auto-heal stale streams.
- **Channels filter count `aria-live`** — channel count paragraph uses `aria-live="polite"`
  so assistive tech announces filter-result changes.
- **`Permissions-Policy` header** — Electron `webRequest` now sets a strict permissions policy
  blocking camera, microphone, geolocation, payment, USB, and interest-cohort.
- **Process error guards** — both main process (`uncaughtException`, `unhandledRejection`) and
  renderer (`unhandledrejection`) now have global catch handlers to log and surface errors.
- **`prefers-reduced-motion` support** — `@media (prefers-reduced-motion: reduce)` rule disables
  all CSS animations and transitions app-wide.
- **Single-instance Electron lock** — prevents multiple app windows; focuses the existing
  window when a second launch is attempted (`app.requestSingleInstanceLock()`).
- **Toast dismiss button** — every toast now has a `✕` dismiss button. Error toasts persist
  8 s (up from 4 s). Exit animation (`toastOut`) plays before DOM removal.
- **ChannelCard `aria-label`** — card announces "Play ‹name› — ‹now playing›" for screen readers.
- **Channels empty-filter state** — when search/group/favorites filters match zero channels,
  shows a helpful "No channels match" message with a "Clear filters" button.
- **ProgrammeDetail focus trap + live progress** — detail overlay traps keyboard focus via
  `useFocusTrap`; live programmes show an animated progress bar below metadata pills.
- **History search bar** — `SearchInput` above the history list filters entries by channel name
  or group. History timestamps now display relative time ("3 h ago") with full date tooltip.
- **Welcome error handling** — sample data loader now catches failures and surfaces them as
  error toasts. Feature cards have staggered entrance animations.
- **Library remove confirmation** — playlist/EPG "Remove" buttons now require `window.confirm()`
  before deleting, preventing accidental data loss.
- **Library input `aria-label`s** — playlist URL and EPG URL inputs now carry `aria-label`
  attributes matching their placeholder text for screen-reader accessibility.
- **HlsPlayer `role="region"`** — player container is now a labelled region for assistive tech.
- **EpgGrid programme `aria-label`s** — each programme block announces title, time range, and
  "currently airing" status to screen readers.
- **PaywallModal ARIA tabs** — tab switcher uses `role="tablist"` / `role="tab"` /
  `aria-selected` for proper screen-reader tab semantics.
- **Player now/next auto-refresh** — now-playing and up-next labels refresh every 30 s so they
  stay current when a programme ends without changing channels.
- **SupportChat message cap** — chat history is capped at 100 messages to prevent DOM bloat.
- **ChannelCard `React.memo`** — wrapped in `memo` with a custom comparator (`channel.url`,
  `nowPlaying`, `focused`) to skip re-renders during search/filter typing.
- **Keyboard shortcuts overlay** — press `Ctrl+/` or `?` to open a comprehensive shortcuts
  reference panel. Accessible, focus-trapped, dismissible with `Esc`.
- **Sleep timer (Player)** — set a 15/30/60/90-minute countdown that auto-stops playback and
  navigates back to channels. Active timer shows animated countdown in the player controls.
- **EPG presets expansion** — 10 curated regional EPG feeds (US, UK, Germany, France, Japan,
  Canada, Brazil, Spain, Italy, Australia) one-click loadable from the Library.
- **Library stats dashboard** — four-card overview showing total channels, groups, favorites,
  and programme count. Cards use glassmorphism and lift on hover.
- **Sidebar "Continue Watching" card** — when there's a last-watched channel, shows a compact
  card in the sidebar for one-click resume playback.
- **Sidebar channel/favorites badges** — nav items display channel count and favorite count
  inline badges that auto-update as data changes.
- **Sidebar version display** — app version shown at the bottom of the sidebar, dynamically
  pulled from `package.json` at build time via Vite `define`.
- **i18n: Rounds 3–7** — 55+ keys added across all three locales (en, es, ja) covering
  PaywallModal, Settings, ErrorBoundary, History, Player, sidebar, channels, and library.
- **i18n interpolation** — `t()` now accepts an optional `params` object for `{variable}`
  placeholder replacement, enabling dynamic translated strings.

### Changed

- **Build: main process → ESM** — esbuild now outputs `dist/main.mjs` (ESM) instead of
  `dist/main.js` (CJS). Electron 28+'s ESM import resolver correctly intercepts
  `import from "electron"` where CJS `Module._load` patching is unreliable with pnpm junctions.
- **Dev launcher: `ELECTRON_RUN_AS_NODE` purged** — `dev.mjs` now deletes
  `ELECTRON_RUN_AS_NODE` from the child env before spawning `electron.exe`. Without this,
  host tools (VSCode, Claude Code) that set `ELECTRON_RUN_AS_NODE=1` would put Electron into
  plain Node.js mode, preventing Chromium/browser-process initialisation and causing
  `require("electron")` to return the npm stub.
- **Dev launcher: direct binary, no shell** — uses `createRequire` to resolve the real
  `electron.exe` path and spawns it with `shell: false`, avoiding `cmd.exe` corruption of
  non-ASCII characters in the project path.
- **`isDev` guard** — changed from `!app.isPackaged` (requires full Electron init) to
  `!!process.defaultApp` (safe at module scope; `true` when launched as `electron <dir>`,
  `undefined` in packaged builds).
- **PaywallModal fully i18n'd** — all ~20 hardcoded English strings now use `t()` calls.
- **Settings remaining i18n'd** — ON/OFF toggles, loading states, billing labels, and error
  toasts now all use `t()` calls.
- **ErrorBoundary i18n'd** — crash title, fallback title, and "Try Again" button use `t()`.
- **Volume OSD CSS** — new glassmorphism overlay at bottom-center of the player with a
  smooth entrance animation, accent-colored fill bar, and tabular-nums percentage.
- **History header layout** — Export and Clear buttons wrapped in `.page-header-actions`.
- **Settings page fully i18n'd** — all Account section labels now use `t()` calls.
- **Library EPG toasts i18n'd** — "programmes" count and "already loaded" message use i18n keys.
- **Focus management on page transitions** — `<main>` receives focus and scrolls to top on
  every page change for keyboard and screen-reader users.
- **Sidebar "Continue Watching"** — label uses `t()` instead of hardcoded English; space key
  activates button per WAI-ARIA `role="button"` requirements.
- **GroupFilter "All" button** — uses `t("channels.allGroups", locale)`.
- **`APP_VERSION` dynamic** — version in `SupportChat` injected at build time via Vite `define`.

### Fixed

- **`ELECTRON_RUN_AS_NODE` startup crash** — Electron started in Node.js mode (no browser
  process, `process.type === undefined`) when `ELECTRON_RUN_AS_NODE=1` was inherited from
  the host environment. `dev.mjs` now explicitly deletes the variable before spawning.
- **`pip.ts` unused import** — removed unused `app` import that triggered a TS lint warning.
- **`discord.ts` Buffer type** — `sock.once("data")` handler now guards with
  `Buffer.isBuffer(data)` before calling `.readUInt32LE()`, fixing TS2339.
- **Toast ref cleanup** — `timers.current` captured in cleanup effect, eliminating React lint warning.
- **History SearchInput rendering** — search toolbar was missing from the render tree; now
  correctly rendered between Continue Watching and History List sections.
- **Player stale `saveWatch` closure** — watch-history effect uses `saveWatchRef` to always
  call the latest store function.
- **Feedback API URL mismatch** — `support-feedback.ts` now calls `/v1/support/feedback`.
- **Settings import allow-list** — import handler validates keys against an explicit allow-list
  instead of blindly writing every key from the JSON file.
- **Stale closure in global keyboard handler** — `App.tsx` `Alt+1‥7` effect now includes
  `handlePageChange` in its dependency array.
- **Platform build scripts** — `build:win/mac/linux` now prepend `@stream-shogun/shared` build
  step, fixing missing shared types in platform builds.
- **Library file picker** — replaced broken `window.prompt()` fallback with a proper
  `<input type="file">` picker; uses Electron's `file.path` when available.
- **Discord RPC multi-instance** — `tryConnect()` now iterates socket indices 0–9, connecting
  to whichever Discord instance is available.
- **Volume slider accessibility** — added `aria-label`, `aria-valuenow`, and `aria-valuetext`
  to the HLS player volume range input.
- **Single-instance lock** — now paired with process error guards for robustness.

## [0.2.1] - 2026-03-02

### Changed

- **IPC (main process):** Removed unused `secureFetch()` dead code; `PLAYLIST_LOAD_URL` now uses
  gzip-aware `secureFetchText()` for consistency with EPG endpoints.
- **Scheduler:** `doRefresh()` protected by a 60-second timeout guard — prevents the `refreshing`
  flag from stalling indefinitely if a cycle hangs.
- **Discord RPC:** `sendPacket` checks `socket.destroyed` before writing; catches write errors
  and resets connection state instead of failing silently.
- **PIP window:** `closePipWindow()` no longer double-nulls `pipWindow`; cleanup deferred to
  the `'closed'` event handler.
- **Watch history DB:** `saveWatchSession` now runs inside a transaction and auto-prunes rows
  beyond 500, preventing unbounded table growth.
- **Store (Zustand):** Fire-and-forget `loadSettings()` / `loadWatchHistory()` in `initFromDb`
  now have `.catch()` guards so rejected promises don't surface as unhandled.
- **Player page:** All async fire-and-forget calls (`saveWatch`, Discord activity) wrapped with
  `.catch()` to prevent unhandled-rejection noise on unmount.

### Added

- **`requireString()` / `requireFiniteNumber()` validators** in IPC handler layer — applied to
  `DB_SET_SETTING` (key must be non-empty) and `DB_SAVE_WATCH` (timestamps must be finite ≥ 0).
- **Discord reconnection backoff** — 15-second cooldown between connection attempts prevents
  rapid retry spam when Discord is unavailable.
- **PIP param validation** — `openPipWindow` throws on empty `channelUrl`; `channelName` falls
  back to `"PIP"`.
- **`<ErrorBoundary>` component** — class-based React boundary with retry button, wrapping all
  six page routes and the PIP player in `App.tsx`.
- **Error boundary CSS** (`.error-boundary-*`) in `App.css`.

### Fixed

- `PLAYLIST_LOAD_URL` previously bypassed gzip decompression (used raw `secureFetch` instead of
  `secureFetchText`) — now consistent with all other fetch paths.

## [0.1.0] - 2026-03-02

### Added

- Initial project scaffold
- pnpm workspaces monorepo structure
- Core shared library with TypeScript types
- Development tooling (ESLint, Prettier, TypeScript strict mode)

[Unreleased]: https://github.com/stream-shogun/stream-shogun/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/stream-shogun/stream-shogun/compare/v0.1.0...v0.2.1
[0.1.0]: https://github.com/stream-shogun/stream-shogun/releases/tag/v0.1.0
