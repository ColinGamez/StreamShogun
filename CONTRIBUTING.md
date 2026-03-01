# Contributing to StreamShōgun

Thank you for your interest in contributing! This document provides guidelines
and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/stream-shogun.git
   cd stream-shogun
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Workflow

```bash
# Start the full dev environment (Vite + Electron)
pnpm dev

# Run UI only (browser mode)
pnpm dev:ui

# Run tests
pnpm test

# Typecheck all packages
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                          |
| ---------- | ------------------------------------ |
| `feat`     | A new feature                        |
| `fix`      | A bug fix                            |
| `docs`     | Documentation changes                |
| `style`    | Formatting, missing semicolons, etc. |
| `refactor` | Code change that is not a fix/feat   |
| `perf`     | Performance improvement              |
| `test`     | Adding or updating tests             |
| `build`    | Build system or dependencies         |
| `ci`       | CI/CD configuration                  |
| `chore`    | Other changes (e.g. `.gitignore`)    |

### Examples

```
feat(parser): add support for XSPF playlists
fix(player): resolve HLS teardown memory leak
docs(readme): update architecture diagram
ci: add Windows build to release workflow
```

## Pull Request Process

1. Ensure your branch is up to date with `main`.
2. Run the full quality gate locally:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
3. Write a clear PR description explaining **what** and **why**.
4. Link any related issues (e.g., `Closes #42`).
5. PRs require at least one approving review before merge.
6. Squash-merge is preferred to keep a clean history.

## Coding Standards

- **TypeScript** — strict mode is enabled; no `any` unless justified.
- **Formatting** — Prettier runs automatically; use `pnpm format`.
- **Linting** — ESLint with `@typescript-eslint`; run `pnpm lint`.
- **Imports** — Use `type` imports where applicable (`import type { … }`).
- **Components** — Functional React components with hooks only.
- **State** — Zustand for global state; avoid prop drilling.
- **IPC** — All Electron IPC goes through the preload bridge.
- **Security** — Never disable `contextIsolation` or `sandbox`.

## Project Structure

```
stream-shogun/
├── packages/core/     # Shared types, parsers, IPC channels
├── apps/ui/           # React + Vite frontend
├── apps/desktop/      # Electron main process
└── scripts/           # Build & utility scripts
```

## Questions?

Open a [Discussion](https://github.com/stream-shogun/stream-shogun/discussions)
or file an [Issue](https://github.com/stream-shogun/stream-shogun/issues).
