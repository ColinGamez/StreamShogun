# Self-Hosting

This is the cleanest "own it ourselves" setup for StreamShogun:

- one VPS
- one Docker Compose stack
- one Caddy reverse proxy
- one Postgres database
- the website and API served from the same machine

You should still keep one external email sender such as Resend. Running your own mail server is a separate project and will make password reset deliverability much worse, not better.

If you do not want to rent a VPS, you can run this same stack on your own Windows PC with Docker Desktop. In that case, your PC becomes the server, which means:

- the machine has to stay on
- your home router has to forward ports `80` and `443`
- your domain has to point to your home public IP

## What this stack serves

- `https://streamshogun.com` -> static website from the repo's `site/` folder
- `https://api.streamshogun.com` -> Fastify API
- Postgres -> private container only, not exposed publicly

The production stack files live in:

- [docker/docker-compose.production.yml](../docker/docker-compose.production.yml)
- [docker/Caddyfile](../docker/Caddyfile)
- [docker/.env.production.example](../docker/.env.production.example)

## Server prerequisites

Use a Linux VPS with:

- Docker Engine
- Docker Compose plugin
- ports `80` and `443` open
- DNS control for `streamshogun.com`

Ubuntu 24.04 LTS is a good default.

## DNS

Point these records at your VPS public IP:

- `streamshogun.com`
- `api.streamshogun.com`
- `www.streamshogun.com`

Caddy will automatically provision TLS once the DNS points to the server.

## First deploy

1. Clone the repo onto the VPS.
2. Copy the production env template:

```bash
cp docker/.env.production.example docker/.env.production
```

3. Edit `docker/.env.production` with your real secrets.
4. Start the stack:

```bash
docker compose --env-file docker/.env.production -f docker/docker-compose.production.yml up -d --build
```

Or use the repo scripts:

```bash
pnpm selfhost:up
```

## Windows home-host bootstrap

On your current Windows machine, you can generate the production env file with:

```powershell
pnpm selfhost:init:windows
```

Or start the stack immediately:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/selfhost/bootstrap-local.ps1 -StartStack
```

If you later want email delivery too:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/selfhost/bootstrap-local.ps1 -Force -ResendApiKey "<resend-api-key>"
```

## Fastest bootstrap

If you want the VPS to install Docker, clone the repo, generate secrets, write the env file, and start the stack in one go, use:

```bash
curl -fsSL https://raw.githubusercontent.com/stream-shogun/stream-shogun/main/scripts/selfhost/bootstrap.sh -o bootstrap.sh
chmod +x bootstrap.sh
sudo SUPPORT_EMAIL="colin.kenny777@gmail.com" RESEND_API_KEY="<resend-api-key>" ./bootstrap.sh
```

That script lives at [scripts/selfhost/bootstrap.sh](../scripts/selfhost/bootstrap.sh).

For later updates on the server:

```bash
curl -fsSL https://raw.githubusercontent.com/stream-shogun/stream-shogun/main/scripts/selfhost/update.sh -o update.sh
chmod +x update.sh
sudo ./update.sh
```

## Required secrets

At minimum set:

```env
POSTGRES_PASSWORD=...
JWT_SECRET=...
SUPPORT_EMAIL=colin.kenny777@gmail.com
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=StreamShogun <no-reply@streamshogun.com>
```

## Smoke test

Check containers:

```bash
docker compose --env-file docker/.env.production -f docker/docker-compose.production.yml ps
```

Check health:

```bash
curl https://api.streamshogun.com/healthz
```

You want:

- `status: "ok"`
- `db: true`
- `emailConfigured: true`

Then test:

1. Open `https://streamshogun.com`
2. Log in
3. Trigger forgot-password
4. Confirm the email arrives
5. Open the account page
6. Confirm the desktop app can still sync

## Useful commands

```bash
pnpm selfhost:up
pnpm selfhost:down
pnpm selfhost:logs
```

The bootstrap and update helpers also exist here:

```bash
scripts/selfhost/bootstrap.sh
scripts/selfhost/update.sh
```

## Backups

Back up the `postgres_data` Docker volume before schema changes and on a schedule. If you later want, we can add an automated nightly `pg_dump` job to this stack too.
