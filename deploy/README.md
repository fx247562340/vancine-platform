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

Current version (see the `VERSION` file):

```text
$(cat VERSION)
```

The Docker build injects this value into the Go binary with:

```bash
-X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'
```

Before a release, update `VERSION` in a dedicated commit or as part of the release commit.

## Standard deploy process

Production releases are triggered by an exact 40-character commit SHA, never
by a push. The local `deploy.sh` and the GitHub `Deploy to Production` workflow
are thin clients that send the SHA through the restricted `vancine-deploy` SSH
account. All privileged work happens server-side under the root-owned
orchestrator. See [`ops/deploy/README.md`](../ops/deploy/README.md) for the
full component map, bootstrap, and audit commands.

Deploy a specific commit from the local checkout:

```bash
cd /Users/xin/ClaudeProject/vancine-platform
./deploy.sh <40-character-commit-SHA>
```

What `deploy.sh` does:

1. Validates the SHA is exactly 40 lowercase hex characters.
2. Runs `git fetch origin main` (no pruning or ref deletion).
3. Confirms the commit exists and is an ancestor of `origin/main`.
4. Sends exactly one `deploy <SHA>` command to `vancine-deploy@27.124.22.102`
   over strict, non-interactive SSH.

It never commits, pushes, resets, builds, restarts, cleans, deletes images, or
logs in as root. The server-side orchestrator runs the predeploy backup, builds
the immutable image, replaces only the `vancine` container, verifies health,
and rolls back the application automatically on failure.

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

Production backup is managed by the P0 tooling in [`ops/backup/`](../ops/backup/README.md).
It runs via systemd timers (not cron):

```text
Daily:  02:30 Asia/Shanghai  (vancine-backup-daily.timer)
Weekly: Sunday 03:30 Asia/Shanghai  (vancine-backup-weekly.timer)
```

The backup script creates PostgreSQL custom archives, validates required
table data, atomically publishes the dump, and writes a SHA-256 checksum.
A predeploy backup is also run automatically before every production
deployment (see [`ops/deploy/README.md`](../ops/deploy/README.md)).

Manual backup:

```bash
ssh root@27.124.22.102 'cd /opt/vancine-platform && ops/backup/postgres-backup.sh manual'
```

⚠️ **Database restore is always a separate, explicit, human-approved
procedure.** See [`ops/backup/README.md`](../ops/backup/README.md) for the
restore drill. The deployment orchestrator never performs or triggers a
database restore.

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
  "version": "v<VERSION>"
}
```

## Rollback

Application rollback is automatic and application-only. When a new release
fails its health gates after replacement, the server-side orchestrator restores
the prior code SHA, recreates only the `vancine` container from the prior
image, re-verifies health, and exits non-zero. It never restores or restarts
PostgreSQL or Redis, and never deletes images, backups, containers, volumes, or
worktrees. Database restore is a separate, explicit, human-approved procedure
(see [`ops/backup/README.md`](../ops/backup/README.md)).

Do not run `git reset --hard`, whole-stack restart, or image deletion as a
manual rollback; redeploy an exact good SHA instead. Emergency DNS-based
rollback to the old Japan server is only available while `64.83.35.21` is
retained as cold backup.
