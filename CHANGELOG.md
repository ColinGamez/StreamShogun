# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- M3U playlist parser with full attribute extraction
- XMLTV/EPG parser with programme indexing
- Electron desktop shell with secure IPC bridge
- React UI with Library, Channels, Guide, and Player pages
- HLS playback via hls.js with adaptive bitrate
- Virtualised EPG grid with scroll-synced timeline
- SQLite persistence layer (better-sqlite3) with WAL mode
- Multi-language support (English, Spanish, Japanese)
- Dark theme with CSS custom properties
- Welcome screen with sample data loader
- Zustand state management with DB-backed persistence
- Electron-builder packaging for Windows, macOS, and Linux
- GitHub Actions CI/CD workflows
- Dependabot configuration for automated updates

## [0.1.0] - 2026-03-02

### Added

- Initial project scaffold
- pnpm workspaces monorepo structure
- Core shared library with TypeScript types
- Development tooling (ESLint, Prettier, TypeScript strict mode)

[Unreleased]: https://github.com/stream-shogun/stream-shogun/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/stream-shogun/stream-shogun/releases/tag/v0.1.0
