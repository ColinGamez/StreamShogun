<!-- GitHub Release notes for v0.2.1 — paste into the Release body -->

## v0.2.1 — Production Hardening + Platform Packages

First packaged release off the current tree: working Windows installers,
audited Roku sideload, and a hardened API/desktop surface. See CHANGELOG.md
for the full list.

### Highlights

- **Windows installers that work** — NSIS setup + portable EXE ship the
  SQLite native binding (previously missing entirely) under distinct
  filenames; the packaged app launches into the Library.
- **Roku sideload audited** — BrightScript validation + packaging audit pass;
  guide keeps user EPG config, pause/resume works, registry loads guarded.
- **API entitlement hardening** — verified Roku pay-push grants, Stripe
  webhook plan/status consistency, multi-cookie auth, fail-closed Bearer
  handling, validated feedback, escaped bios, no-PII mail logs.
- **Batched achievements** — ~7 queries per evaluation instead of ~60
  sequential round-trips, identical grant semantics.
- **Modern toolchain** — TypeScript 6.0, React 19, ESLint 10, Electron 43,
  Fastify 5.12, Node 24 CI; zero high production advisories.

### Verification

```
pnpm typecheck   ✅  (0 errors)
pnpm lint        ✅  (0 errors)
pnpm test        ✅  (362/362)
pnpm build       ✅
Roku qa-static   ✅  (51 entries, manifest at root)
Windows smoke    ✅  (packaged app launches to Library)
Release dry-run  ✅  (win/mac/linux/roku artifacts upload)
```

**Full Changelog**: https://github.com/ColinGamez/StreamShogun/compare/v0.1.0...v0.2.1
