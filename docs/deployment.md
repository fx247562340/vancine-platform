# Deployment Reference

This page is the source of truth for production deployment after the 2026-06-25 server migration.

## Production environment

| Item | Value |
|------|-------|
| Server | `root@27.124.22.102` |
| Region | Hong Kong |
| OS | Ubuntu 24.04 LTS |
| App directory | `/opt/vancine-platform` |
| Public domain | `https://vancine.com` |
| Legacy API domain | `https://api.vancine.com` is deprecated; it only 301 redirects to `https://vancine.com` |
| Runtime | Docker Compose |
| App container | `vancine` |
| Database | PostgreSQL 15 container `postgres`, database `new-api` |
| Cache | Redis container `redis` |

The old server `64.83.35.21` is a temporary cold backup only. Do not deploy new changes there.

## Versioning

The current version is stored in the repository root:

```bash
cat VERSION
```

Current value (see the `VERSION` file):

```text
$(cat VERSION)
```

The Docker build passes this value into the Go binary:

```bash
-X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'
```

⚠️ **Important**: `docker-compose.yml` exposes the runtime version through the `APP_VERSION` environment variable (`VERSION=${APP_VERSION:-}`). At runtime `common/init.go` reads this env var and **overrides** the binary-embedded version. The production orchestrator always exports `APP_VERSION=v<VERSION>` so the banner / `/api/status` show the deployed version. For local use the variable defaults to empty and the Dockerfile-embedded version remains the source of truth.

Release rule:

1. Update `VERSION` (root file) before a release.
2. Commit the version change with the release changes.
3. Deploy an exact full 40-character SHA through the restricted deploy account (see [Release Process](release-process.md)).
4. Verify `/api/status` returns the expected version.

## Development-to-release workflow

Every change follows this gate sequence:

```text
local code change
  ↓
local Docker build and local app startup
  ↓
selected Layer 3 acceptance passes (A automated smoke or B owner manual — see "Local Docker verification" below)
  ↓
commit + push to GitHub
  ↓
production server pulls origin/main
  ↓
production server builds Docker image
  ↓
production deploy + health checks
```

Do not skip the local Docker verification gate for user-visible changes. The production server should only pull and build after the selected Layer 3 acceptance (A automated smoke or B owner manual) passes.

### Local Docker verification

From the project root:

```bash
cd /Users/xin/ClaudeProject/vancine-platform
cp .env.example .env   # first time only; fill local-only secrets
cat > docker-compose.override.yml <<'YML'
services:
  vancine:
    build:
      context: .
      dockerfile: Dockerfile
YML
docker compose build vancine
docker compose up -d
curl -s http://127.0.0.1:3000/api/status
```

Open the local app at:

```text
http://127.0.0.1:3000
```

The local app is verified at Layer 3 by exactly ONE of:

- **A. Minimal automated browser smoke** — one browser, one context,
  one page, one full load per target page, per the Automated browser
  release acceptance request budget in `AGENTS.md`; or
- **B. Manual acceptance by the project owner** — the owner inspects
  the running local app personally.

By default do not run both. Neither option replaces the code gates
(tests, typecheck, build) or the local Docker gate above; both only
apply AFTER the app is healthy on `127.0.0.1:3000`. If changes are
needed, repeat local build/start and verification before committing.

⚠️ **Stopping or removing local services, containers, networks, volumes, or
images must receive explicit approval before execution.** Do not run
`docker compose down`, `docker compose down -v`, `docker volume rm`,
`docker system prune`, or similar destructive commands without prior sign-off.
Leave the local stack running until the selected Layer 3 acceptance is complete.

## Production deployment (exact-SHA, application-only)

Production releases are triggered by an exact 40-character commit SHA, never by
a push. There is one authoritative root-owned orchestrator; GitHub Actions and
the local `deploy.sh` are thin clients that send the SHA through the restricted
`vancine-deploy` SSH account. See [`ops/deploy/README.md`](../ops/deploy/README.md)
for the full component map, bootstrap, and audit commands.

Deploy a specific commit from the local checkout:

```bash
./deploy.sh <40-character-commit-SHA>
```

Or dispatch the GitHub `Deploy to Production` workflow with the `deploy_sha`
input. The client validates the SHA, confirms it is reachable from
`origin/main`, then requests exactly one `deploy <SHA>` over strict SSH. It
never commits, pushes, resets, builds, restarts, cleans, or logs in as root.

## What the production orchestrator does

```text
acquire non-blocking deploy lock
  ↓
validate SHA syntax + reachability from origin/main
  ↓
validate target VERSION; reject a numeric downgrade (equal allowed)
  ↓
run ops/backup/postgres-backup.sh predeploy   (fail closed)
  ↓
record prior SHA + image tag + rollback tag
  ↓
git checkout --detach <SHA>   (no reset --hard, no clean)
  ↓
docker compose build vancine   (immutable image, running container untouched)
  ↓
docker compose up -d --no-deps --force-recreate vancine   (only the app)
  ↓
wait for Docker health; require success=true + exact version (internal + public)
  ↓
confirm running container uses the expected image
  ↓
atomically publish successful state
```

On any failure after application replacement, the orchestrator performs exactly
one application rollback (restore prior code SHA, recreate only `vancine` from
the prior image, re-verify health) and exits non-zero. PostgreSQL, Redis,
volumes, images, backups, and worktrees are never touched.

## Server-side compose override

Production has an untracked file at `/opt/vancine-platform/docker-compose.override.yml`:

```yaml
services:
  vancine:
    build:
      context: .
      dockerfile: Dockerfile
```

This file makes `docker compose build vancine` use the repository Dockerfile while leaving `docker-compose.yml` usable for prebuilt-image deployments.

## Build details

The root `Dockerfile` builds everything on the server:

1. `web/default`: npm install from `package-lock.json`, then `npm run build`.
2. `web/classic`: npm install from `package-lock.json` with `--legacy-peer-deps`, then `npm run build`.
3. Go backend: copy both frontend `dist/` outputs and compile the final binary.
4. Runtime image: copy the binary into `debian:bookworm-slim`.

Npm uses `https://registry.npmmirror.com` inside Docker and retry settings because Docker BuildKit containers on the Hong Kong server hit `ECONNRESET` against the default npm registry. Package integrity is still checked through `package-lock.json`.

## Health checks

After every deploy, run:

```bash
ssh root@27.124.22.102 'cd /opt/vancine-platform && docker compose ps'
ssh root@27.124.22.102 'curl -s http://127.0.0.1:3000/api/status'
curl -s https://vancine.com/api/status
```

Expected fields:

```json
{
  "success": true,
  "setup": true,
  "system_name": "Vancine",
  "server_address": "https://vancine.com",
  "version": "v<VERSION>"
}
```

## Nginx

Tracked config:

```text
deploy/nginx/vancine
```

Install updated config:

```bash
scp deploy/nginx/vancine root@27.124.22.102:/etc/nginx/sites-enabled/vancine
ssh root@27.124.22.102 'nginx -t && systemctl reload nginx'
```

The config proxies `vancine.com` and `www.vancine.com` to `127.0.0.1:3000`. `api.vancine.com` is a deprecated legacy domain and only redirects to `https://vancine.com$request_uri`.

## Backup

The source-controlled backup tooling lives in `ops/backup/`. It creates
PostgreSQL custom archives through a `.partial` file, validates required table
data, atomically publishes the dump, and then writes and verifies its SHA-256
checksum. A dump is complete only when its adjacent `.sha256` file exists.
The tooling contains no retention deletion logic.

Manual database backup:

```bash
ssh root@27.124.22.102 \
  'cd /opt/vancine-platform && ops/backup/postgres-backup.sh manual'
```

Isolated restore drill:

```bash
/opt/vancine-platform/ops/backup/restore-drill.sh \
  /opt/vancine-platform/backups/manual/vancine-db-YYYYMMDDTHHMMSSZ.dump
```

The production schedule is managed by systemd:

```text
Daily:  02:30 Asia/Shanghai
Weekly: Sunday 03:30 Asia/Shanghai
```

See `ops/backup/README.md` for local tests, monitoring configuration,
installation, timer verification, and recovery procedures.

## Rollback

Application rollback is automatic: when a new release fails its health gates
after replacement, the orchestrator restores the prior code SHA and recreates
only the `vancine` container from the prior image, then re-verifies health.
It prints `ROLLBACK_OK` or `ROLLBACK_FAILED` and exits non-zero either way.

Rollback **never** restores or restarts PostgreSQL or Redis, and never deletes
images, backups, files, directories, containers, volumes, or worktrees.
Database restore is always a separate, explicit, human-approved procedure (see
[`ops/backup/README.md`](../ops/backup/README.md)).

The old Japan server `64.83.35.21` is retained only as a temporary cold
backup. DNS-based rollback to it is an emergency option only when the Hong
Kong server is unavailable, not the normal application rollback path. Data
written on the new server after migration will not exist on the old server.
Prefer fixing forward on `27.124.22.102`.
