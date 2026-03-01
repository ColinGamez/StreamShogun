# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, please report them responsibly:

1. Email: **security@stream-shogun.dev** (or open a
   [private security advisory](https://github.com/stream-shogun/stream-shogun/security/advisories/new)
   on GitHub).
2. Include a description of the vulnerability, steps to reproduce, and any
   potential impact.
3. We will acknowledge receipt within **48 hours** and aim to provide a fix
   within **7 days** for critical issues.

## Electron Security Model

StreamShōgun follows the
[Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security):

| Control                        | Status |
| ------------------------------ | ------ |
| `contextIsolation`             | ✅ On  |
| `nodeIntegration`              | ✅ Off |
| `sandbox`                      | ✅ On  |
| Preload script with IPC bridge | ✅     |
| Content-Security-Policy        | ✅     |
| No `remote` module             | ✅     |
| Input validation on IPC        | ✅     |
| File size limits on load       | ✅     |
| HTTPS fetch with timeout       | ✅     |

## Dependency Management

- Dependabot is enabled for automated dependency updates.
- `pnpm audit` runs in CI on every pull request.
- Native modules (`better-sqlite3`) are pinned and rebuilt per platform.

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
After a fix is released, we will publish a security advisory crediting the reporter.
