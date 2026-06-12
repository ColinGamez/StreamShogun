#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

APP_DIR="${APP_DIR:-/opt/streamshogun}"
REPO_URL="${REPO_URL:-https://github.com/stream-shogun/stream-shogun.git}"
REPO_REF="${REPO_REF:-main}"

APP_DOMAIN="${APP_DOMAIN:-streamshogun.com}"
API_DOMAIN="${API_DOMAIN:-api.streamshogun.com}"
SUPPORT_EMAIL="${SUPPORT_EMAIL:-colin.kenny777@gmail.com}"
EMAIL_FROM="${EMAIL_FROM:-StreamShogun <no-reply@streamshogun.com>}"
LOG_LEVEL="${LOG_LEVEL:-info}"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
ADMIN_KEY="${ADMIN_KEY:-$(openssl rand -hex 16)}"

info() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

install_base_packages() {
  info "Installing base packages"
  apt-get update -y
  apt-get install -y ca-certificates curl git openssl
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    info "Docker already installed"
    return
  fi

  info "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

install_compose_plugin_if_needed() {
  if docker compose version >/dev/null 2>&1; then
    info "Docker Compose plugin already available"
    return
  fi

  info "Installing Docker Compose plugin"
  apt-get install -y docker-compose-plugin
}

clone_or_update_repo() {
  info "Cloning or updating StreamShogun"
  mkdir -p "$(dirname "$APP_DIR")"

  if [[ ! -d "$APP_DIR/.git" ]]; then
    git clone "$REPO_URL" "$APP_DIR"
  fi

  git -C "$APP_DIR" fetch --all --tags
  git -C "$APP_DIR" checkout "$REPO_REF"
  git -C "$APP_DIR" pull --ff-only origin "$REPO_REF"
}

write_env_file() {
  info "Writing docker/.env.production"
  cat >"$APP_DIR/docker/.env.production" <<EOF
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
JWT_SECRET="${JWT_SECRET}"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
CORS_ORIGIN="https://${APP_DOMAIN}"
APP_PUBLIC_URL="https://${APP_DOMAIN}"
COOKIE_DOMAIN=".${APP_DOMAIN}"
SUPPORT_EMAIL="${SUPPORT_EMAIL}"
EMAIL_FROM="${EMAIL_FROM}"
LOG_LEVEL="${LOG_LEVEL}"
ADMIN_KEY="${ADMIN_KEY}"
EOF

  if [[ -n "${RESEND_API_KEY:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
RESEND_API_KEY="${RESEND_API_KEY}"
EOF
  fi

  if [[ -n "${SMTP_URL:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
SMTP_URL="${SMTP_URL}"
EOF
  fi

  if [[ -n "${SENTRY_DSN:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
SENTRY_DSN="${SENTRY_DSN}"
EOF
  fi

  if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY}"
EOF
  fi

  if [[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET}"
EOF
  fi

  if [[ -n "${STRIPE_PRICE_ID_PRO_MONTHLY:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
STRIPE_PRICE_ID_PRO_MONTHLY="${STRIPE_PRICE_ID_PRO_MONTHLY}"
EOF
  fi

  if [[ -n "${STRIPE_PRICE_ID_PRO_YEARLY:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
STRIPE_PRICE_ID_PRO_YEARLY="${STRIPE_PRICE_ID_PRO_YEARLY}"
EOF
  fi

  if [[ -n "${STRIPE_PORTAL_RETURN_URL:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
STRIPE_PORTAL_RETURN_URL="${STRIPE_PORTAL_RETURN_URL}"
EOF
  fi

  if [[ -n "${BILLING_DISABLED:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
BILLING_DISABLED="${BILLING_DISABLED}"
EOF
  fi

  if [[ -n "${FOUNDING_MEMBER_CUTOFF:-}" ]]; then
    cat >>"$APP_DIR/docker/.env.production" <<EOF
FOUNDING_MEMBER_CUTOFF="${FOUNDING_MEMBER_CUTOFF}"
EOF
  fi
}

deploy_stack() {
  info "Starting StreamShogun"
  docker compose \
    --env-file "$APP_DIR/docker/.env.production" \
    -f "$APP_DIR/docker/docker-compose.production.yml" \
    up -d --build
}

print_next_steps() {
  info "Done"
  cat <<EOF
StreamShogun is bootstrapped at:
  ${APP_DIR}

Make sure these DNS records point at this server:
  ${APP_DOMAIN}
  ${API_DOMAIN}
  www.${APP_DOMAIN}

Useful commands:
  docker compose --env-file ${APP_DIR}/docker/.env.production -f ${APP_DIR}/docker/docker-compose.production.yml ps
  docker compose --env-file ${APP_DIR}/docker/.env.production -f ${APP_DIR}/docker/docker-compose.production.yml logs -f
  curl https://${API_DOMAIN}/healthz

If RESEND_API_KEY was not provided, forgot-password emails will stay disabled until you add it to:
  ${APP_DIR}/docker/.env.production
and restart the stack.
EOF
}

install_base_packages
install_docker
install_compose_plugin_if_needed

require_command git
require_command docker

clone_or_update_repo
write_env_file
deploy_stack
print_next_steps
