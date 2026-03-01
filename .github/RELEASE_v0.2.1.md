<!-- GitHub Release notes for v0.2.1 — paste into the Release body -->

## v0.2.1 — Production Hardening

A stability-focused release with zero new features. Every change targets crash
prevention, input validation, resource cleanup, or unbounded-growth mitigation.

### Highlights

- **IPC input validation** — Settings and watch-history handlers now reject
  malformed payloads before they reach SQLite.
- **Scheduler timeout** — A 60-second ceiling prevents the auto-refresh flag
  from stalling the app forever.
- **Discord RPC backoff** — 15-second cooldown between failed connection
  attempts eliminates retry spam.
- **Watch-history pruning** — Rows beyond 500 are automatically deleted inside
  a transaction, preventing unbounded DB growth.
- **React Error Boundaries** — Every page route is wrapped; a crash in any
  single page no longer takes down the entire app.
- **Async cleanup guards** — Fire-and-forget promises in the Player page and
  Zustand store now have `.catch()` handlers.

### Verification

```
pnpm typecheck   ✅  (0 errors)
pnpm lint        ✅  (0 errors)
pnpm test        ✅  (96/96)
```

### Files Modified

| File | Summary |
|------|---------|
| `apps/desktop/src/ipc.ts` | Validators, dead code removal, fetch fix |
| `apps/desktop/src/scheduler.ts` | Timeout guard |
| `apps/desktop/src/discord.ts` | Backoff, socket safety |
| `apps/desktop/src/pip.ts` | Param validation, double-null fix |
| `apps/desktop/src/db/repositories.ts` | Transaction + row pruning |
| `apps/ui/src/components/ErrorBoundary.tsx` | **New** — error boundary |
| `apps/ui/src/App.tsx` | Wrap pages in boundaries |
| `apps/ui/src/App.css` | Boundary fallback styles |
| `apps/ui/src/pages/Player.tsx` | `.catch()` on async cleanup |
| `apps/ui/src/stores/app-store.ts` | `.catch()` on init fire-and-forget |
| `CHANGELOG.md` | v0.2.1 entry |

**Full Changelog**: https://github.com/stream-shogun/stream-shogun/compare/v0.1.0...v0.2.1
