# v0.2.0 dependency security triage

Last reviewed: 2026-07-27

## Release policy

The v0.2.0 release is blocked unless both automated checks pass:

1. Production dependency audit: zero high or critical advisories.
2. Complete dependency audit: zero critical advisories, including build and development tools.

High advisories that exist only in build or development tools may be accepted temporarily when the
dependency path, reachability, and mitigation are recorded below. They must not be hidden by a
force-upgrade or a blanket `continue-on-error` rule.

## Remediated critical and high ownership

| Dependency                                         | Ownership                                   | Exposure                                                   | Resolution                                                        |
| -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Electron 31                                        | Desktop runtime                             | Shipped Chromium and Node runtime                          | Upgraded to Electron 43.2.0                                       |
| electron-builder 24 / app-builder-lib 24           | Packaging                                   | CI and developer packaging; AppImage search-path advisory  | Upgraded the complete builder and Squirrel peer graph to 26.15.3  |
| fast-jwt 5 through `@fastify/jwt` 9                | API runtime                                 | Authentication and authorization token verification        | Upgraded `@fastify/jwt` to 10.2.1, resolving to patched fast-jwt  |
| find-my-way through Fastify                        | API runtime                                 | Public HTTP routing                                        | Upgraded Fastify to 5.10.0                                        |
| Nodemailer 7                                       | API runtime                                 | Password-reset email generation                            | Upgraded to Nodemailer 9.0.3                                      |
| fast-xml-parser                                    | Desktop/core runtime                        | Parses untrusted user-provided XMLTV                       | Upgraded to 5.10.1; strict XML validation remains enabled         |
| hls.js                                             | Desktop renderer runtime                    | Parses and plays remote HLS manifests                      | Upgraded to 1.6.16                                                |
| Vitest 4.0                                         | Test only                                   | Local/CI test server, not shipped                          | Upgraded all workspaces to 4.1.10                                 |
| PostCSS, flatted, effect, defu, picomatch, js-yaml | Build/configuration transitive dependencies | Build, generated-client configuration, lint, or test paths | Pinned to patched compatible releases through workspace overrides |

## Accepted build-only high advisories

The complete audit currently reports five high-severity findings, all for `brace-expansion` through
two non-runtime owners:

- ESLint 8 and TypeScript-ESLint 7: lint-only dependency paths.
- electron-builder 26.15.3 via EJS/Jake/filelist/minimatch: packaging-only dependency paths.

These packages do not process playlist, EPG, stream, account, or other end-user input at runtime.
Packaging runs on trusted repository files in isolated GitHub-hosted runners. Linting runs on trusted
source paths. A global override to `brace-expansion` 5 is not applied because the parents declare and
exercise older major APIs; forcing it would create an unvalidated packaging risk.

The accepted findings remain release-visible and must be rechecked whenever ESLint, TypeScript-ESLint,
or electron-builder publishes a compatible patched parent chain.

## Current audit result

- Production dependencies: zero known vulnerabilities.
- Complete graph: zero critical, five high, two moderate, two low.
- Release status: dependency security policy passes; functional and installer smoke gates remain.
