# Deploy — Vancine Platform

Production deployment configuration for the Vancine API platform.

## Current production server

| Item | Value |
|------|-------|
| Production IP | `27.124.22.102` |
| Region | Hong Kong |
| OS | Ubuntu 24.04 LTS |
| SSH user | `root` |
| SSH key | `~/.ssh/id_ed25519` |
| App directory | `/opt/vancine-platform` |
| Domain | `vancine.com` |
| Legacy API domain | `api.vancine.com` deprecated; 301 redirects to `https://vancine.com` |
| Containers | `vancine`, `postgres`, `redis` |
| Database | PostgreSQL container `postgres`, DB `new-api` |

The previous Japan server `64.83.35.21` is now only a short-term cold backup. Its `vancine` container is stopped. Keep its disk until the Hong Kong server has run without issues for several days.

## Version

The current application version is stored in the root [`VERSION`](../VERSION) file.

Current version:

```text
1.0.4
```

The Docker build injects this value into the Go binary with:

```bash
-X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'
```

Before a release, update `VERSION` in a dedicated commit or as part of the release commit.

## Standard deploy process

The standard production deploy happens on the production server. Do not build locally and copy a binary unless the production server is unavailable.

```bash
cd /Users/xin/ClaudeProject/vancine-platform
./deploy.sh
```

If you want the script to commit tracked local changes first:

```bash
./deploy.sh "release: describe the change"
```

What `deploy.sh` does:

1. Confirms local `HEAD` matches `origin/main` unless a commit message is provided.
2. SSHes to `root@27.124.22.102`.
3. Runs `git fetch origin main` and `git reset --hard origin/main` in `/opt/vancine-platform`.
4. Builds the image on the server with `docker compose build vancine`.
5. Tags the image as both `vancine-custom:latest` and `vancine-custom:<VERSION>`.
6. Restarts the stack with `docker compose up -d`.
7. Verifies local and HTTPS health checks.
8. Removes old version tags, keeping the latest three.

## Server-side compose override

The repository `docker-compose.yml` defines the runtime services. The production server also keeps this untracked file:

```yaml
# /opt/vancine-platform/docker-compose.override.yml
services:
  vancine:
    build:
      context: .
      dockerfile: Dockerfile
```

Docker Compose loads this file automatically. It lets production build from source while keeping the base compose file useful for prebuilt images and local runtime tests.

## Build system

The root [`Dockerfile`](../Dockerfile) performs a full multi-stage build:

1. Build `web/default` with npm and `package-lock.json`.
2. Build `web/classic` with npm and `package-lock.json`.
3. Build the Go backend and embed both frontend `dist/` directories.
4. Copy the final binary into a slim Debian runtime image.

Important details:

- Both frontend themes now use npm, not bun.
- `web/default/package-lock.json` and `web/classic/package-lock.json` are tracked.
- `bun.lock` files are intentionally ignored.
- npm uses `https://registry.npmmirror.com` inside Docker plus retry settings. This avoids `ECONNRESET` observed from BuildKit containers on the Hong Kong server while package integrity is still checked from the lockfiles.
- `web/classic` pins `react-icons` to `5.3.0` because later `5.x` versions removed `SiLinkedin`, which the classic frontend still imports.

## Nginx

The tracked Nginx config lives at [`deploy/nginx/vancine`](nginx/vancine).

To update it on production:

```bash
scp deploy/nginx/vancine root@27.124.22.102:/etc/nginx/sites-enabled/vancine
ssh root@27.124.22.102 "nginx -t && systemctl reload nginx"
```

The current config:

- Proxies `vancine.com` and `www.vancine.com` to `127.0.0.1:3000`.
- Treats `api.vancine.com` as a deprecated legacy domain and redirects it to `https://vancine.com$request_uri`.
- Uses Let's Encrypt certificates from `/etc/letsencrypt/live/vancine.com/`.
- Adds CSP, HSTS, X-Content-Type-Options, X-XSS-Protection, and Referrer-Policy headers.
- Sets `client_max_body_size 20m`.

## Backup and restore

The production server has `backup.sh` in `/opt/vancine-platform`.

Expected backup schedule:

```cron
30 2 * * * /opt/vancine-platform/backup.sh daily >> /opt/vancine-platform/backups/cron.log 2>&1
30 3 * * 0 /opt/vancine-platform/backup.sh weekly >> /opt/vancine-platform/backups/cron.log 2>&1
```

Manual PostgreSQL backup:

```bash
ssh root@27.124.22.102 'docker exec postgres pg_dump -U root -Fc new-api > /tmp/vancine.dump'
```

Manual restore into an already running PostgreSQL container:

```bash
cat /tmp/vancine.dump | docker exec -i postgres pg_restore \
  -h 127.0.0.1 -U root -d new-api \
  --clean --if-exists --no-owner --no-acl
```

## Health checks

Use these checks after every deploy:

```bash
ssh root@27.124.22.102 'cd /opt/vancine-platform && docker compose ps'
ssh root@27.124.22.102 'curl -s http://127.0.0.1:3000/api/status'
curl -s https://vancine.com/api/status
```

Expected key fields:

```json
{
  "success": true,
  "setup": true,
  "system_name": "Vancine",
  "server_address": "https://vancine.com",
  "version": "v1.0.4"
}
```

## Rollback

Short-term rollback to the old Japan server is possible only while the old disk is retained.

1. Change DNS back to `64.83.35.21`.
2. On the old server:

   ```bash
   cd /opt/vancine-platform
   docker compose up -d vancine
   ```

Data written to the new Hong Kong server after the DNS switch will not automatically exist on the old server. Treat rollback as an emergency option only.
