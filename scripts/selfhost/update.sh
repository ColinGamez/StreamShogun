#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

APP_DIR="${APP_DIR:-/opt/streamshogun}"
REPO_REF="${REPO_REF:-main}"

git -C "$APP_DIR" fetch --all --tags
git -C "$APP_DIR" checkout "$REPO_REF"
git -C "$APP_DIR" pull --ff-only origin "$REPO_REF"

docker compose \
  --env-file "$APP_DIR/docker/.env.production" \
  -f "$APP_DIR/docker/docker-compose.production.yml" \
  up -d --build
