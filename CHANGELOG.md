# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
