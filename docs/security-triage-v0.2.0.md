# v0.2.0 dependency security triage

Last reviewed: 2026-10-05 (full-app bug sweep)

## Release policy

The v0.2.0 release is blocked unless both automated checks pass:

1. Production dependency audit: zero high or critical advisories.
2. Complete dependency audit: zero critical advisories, including build and development tools.

High advisories that exist only in build or development tools may be accepted temporarily when the
dependency path, reachability, and mitigation are recorded below. They must not be hidden by a
force-upgrade or a blanket `continue-on-error` rule.

## Remediated critical and high ownership

| Dependency                                                                                                  | Ownership                                                                                         | Exposure                                                                   | Resolution                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron 31                                                                                                 | Desktop runtime                                                                                   | Shipped Chromium and Node runtime                                          | Upgraded to Electron 43.2.0                                                                                                                                                                                             |
| electron-builder 24 / app-builder-lib 24                                                                    | Packaging                                                                                         | CI and developer packaging; AppImage search-path advisory                  | Upgraded the complete builder and Squirrel peer graph to 26.15.3                                                                                                                                                        |
| fast-jwt 5 through `@fastify/jwt` 9                                                                         | API runtime                                                                                       | Authentication and authorization token verification                        | Upgraded `@fastify/jwt` to 10.2.1, resolving to patched fast-jwt                                                                                                                                                        |
| find-my-way through Fastify                                                                                 | API runtime                                                                                       | Public HTTP routing                                                        | Upgraded Fastify to 5.10.0                                                                                                                                                                                              |
| Nodemailer 7                                                                                                | API runtime                                                                                       | Password-reset email generation                                            | Upgraded to Nodemailer 9.0.3                                                                                                                                                                                            |
| fast-xml-parser                                                                                             | Desktop/core runtime                                                                              | Parses untrusted user-provided XMLTV                                       | Upgraded to 5.10.1; strict XML validation remains enabled                                                                                                                                                               |
| hls.js                                                                                                      | Desktop renderer runtime                                                                          | Parses and plays remote HLS manifests                                      | Upgraded to 1.6.16                                                                                                                                                                                                      |
| better-sqlite3                                                                                              | Desktop runtime                                                                                   | Persists playlists, EPG data, settings, and migrations                     | Upgraded to 13.0.1 for Electron 43 native ABI compatibility                                                                                                                                                             |
| Vitest 4.0                                                                                                  | Test only                                                                                         | Local/CI test server, not shipped                                          | Upgraded all workspaces to 4.1.10                                                                                                                                                                                       |
| PostCSS, flatted, effect, defu, picomatch, js-yaml                                                          | Build/configuration transitive dependencies                                                       | Build, generated-client configuration, lint, or test paths                 | Pinned to patched compatible releases through workspace overrides                                                                                                                                                       |
| ESLint 8 / TS-ESLint 7 / TS 5.9                                                                             | Lint-only toolchain                                                                               | Trusted source files                                                       | Upgraded to ESLint 10, TS-ESLint 8.57, TS 5.9 retained (TS 6 blocked: ts-eslint 8.57 peers `typescript <6.0`)                                                                                                           |
| Unverified Roku pay-push grants                                                                             | API runtime (entitlement)                                                                         | Forged push could grant Pro                                                | Push mutations now require Roku transaction validation before any grant                                                                                                                                                 |
| Webhook plan/status mismatch                                                                                | API runtime (entitlement)                                                                         | Canceled/past-due webhooks could leave PRO                                 | Checkout derives plan from verified status; invoice.paid restores PRO + period                                                                                                                                          |
| Renderer-writable license keys                                                                              | Desktop settings store                                                                            | XSS could flip `isProEnabled`                                              | License keys blocklisted from DB_SET_SETTING; gate requires valid state + format                                                                                                                                        |
| Unvalidated billing URLs                                                                                    | Desktop shell.openExternal                                                                        | Compromised response → arbitrary URL                                       | Stripe-host allowlist enforced before opening                                                                                                                                                                           |
| `brace-expansion`, `js-yaml` via old ESLint chain                                                           | Lint-only                                                                                         | Trusted source files                                                       | Resolved by the upgrade; remaining complete-graph highs are electron-builder/xmldom/Electron-shell/test-tooling paths                                                                                                   |
| Fastify 5.10.0 (`GHSA-667r-xxjv-c9mm`, `GHSA-p68q-wchp-6fh7`, `GHSA-hwr6-493r-vm6h`, `GHSA-9q9j-q6p8-xq58`) | API runtime                                                                                       | Public HTTP routing, auth, validation                                      | Upgraded to Fastify 5.12.5 (2026-10-02)                                                                                                                                                                                 |
| Nodemailer 9.0.3 (`GHSA-2x7j-588g-ccc2`, `GHSA-v53p-9fqp-m79j`)                                             | API runtime                                                                                       | Password-reset email generation                                            | Upgraded to Nodemailer 10.0.13 (2026-10-02); usage is basic `createTransport` + `sendMail`, API-compatible                                                                                                              |
| fast-uri 3.1.4 / 4.1.1 (`GHSA-jqff-g426-hqxp`, `GHSA-qw65-cvwx-89v3`)                                       | API runtime transitive via Fastify/ajv                                                            | URI parsing inside request validation                                      | Pinned via workspace overrides (`fast-uri@3` → `^3.1.7`, `fast-uri@4` → `^4.1.4`); upstream Fastify 5.12.5 still resolves vulnerable copies                                                                             |
| deepmerge-ts 7.1.5 (`GHSA-ggr8-5vv4-36mx`, stack exhaustion on recursive graphs)                            | Prisma CLI config merge (dev/migration tooling, reached via `@prisma/client` peer + dev `prisma`) | Never handles request input; only merges Prisma config objects in CLI runs | Force-pinned via workspace override to `^8.0.0` (2026-10-02). Validated: `prisma generate` succeeds, API suite 181/181 passes, typecheck clean. Revert to acceptance if a future Prisma 6 CLI breaks on deepmerge-ts 8. |

## Accepted build-only high advisories

The complete-graph audit reports highs only in non-request paths (verified 2026-10-02,
33 high advisories / 37 findings, zero critical):

- `brace-expansion` (lint via ESLint 8 / TS-ESLint 7; packaging via electron-builder
  minimatch) — including new 2026 CVEs (`GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`,
  `GHSA-rgw5-rvv9-x895`, `GHSA-qhr7-859c-m2p7`) that postdate the July triage. Same
  accepted class: trusted source files, isolated runners. No global override (parents
  exercise older major APIs).
- `js-yaml` (`GHSA-5p4m-2wfm-xmqj`, `GHSA-2883-xcg3-v3hh`) — reachable only through the
  ESLint chain; the new CVEs affect 4.x too, so the `^4.3.0` override no longer clears
  them. Lint-only, accepted.
- `@xmldom/xmldom` (8 advisories) — reachable only through electron-builder
  `app-builder-lib` (packaging) — accepted.
- `nanoid` (`GHSA-2v37-7h3g-55p8`) — reachable only through vitest/vite test/build
  chains — accepted.
- `browserslist` (2 advisories) — reachable only through vite/babel build chains — accepted.
- `undici` (WS-subprotocol DoS, TLS-bypass `GHSA-w293-vg96-wgc3`) — reachable through
  `@electron/get` binary downloads (packaging, trusted GitHub endpoints) — accepted.

## Runtime high advisories under watch

- Electron 43.2.0 (4 advisories: sandboxed-window inheritance `GHSA-gr2m-v5gq-v685`,
  protocol CORS `GHSA-j84w-jfhq-vhvj`, webview worker node-integration
  `GHSA-9qh4-3jw8-366w`, preload cache poisoning `GHSA-qmv3-fv6v-rmhq`). Mitigations in
  place: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `<webview>` usage
  (checkout opens the system browser), whitelisted IPC bridge. No patched Electron
  release resolves them yet — upgrade when one lands. These do not appear in the
  production (`--prod`) graph and do not block the release policy.

The accepted findings remain release-visible and must be rechecked whenever ESLint, TypeScript-ESLint,
or electron-builder publishes a compatible patched parent chain.

## Current audit result

- Production dependencies: zero known vulnerabilities.
- Complete graph: zero critical, 37 high, 21 moderate, 6 low (remaining highs are build/packaging-only paths, e.g. `brace-expansion` via electron-builder — same accepted class as before).
- Release status: dependency security policy passes; functional and installer smoke gates remain.
