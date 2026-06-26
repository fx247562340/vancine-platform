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

Current value:

```text
1.0.6
```

The Docker build passes this value into the Go binary:

```bash
-X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'
```

Release rule:

1. Update `VERSION` before a release.
2. Commit the version change with the release changes.
3. Deploy from `origin/main` on the production server.
4. Verify `/api/status` returns the expected version.

## Development-to-release workflow

Every change follows this gate sequence:

```text
local code change
  ↓
local Docker build and local app startup
  ↓
user verifies the local app
  ↓
commit + push to GitHub
  ↓
production server pulls origin/main
  ↓
production server builds Docker image
  ↓
production deploy + health checks
```

Do not skip the local Docker verification gate for user-visible changes. The production server should only pull and build after the user confirms the locally running app is correct.

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

The user verifies behavior against this local Docker instance. If changes are needed, repeat local build/start and verification before committing.

Stop local services when done:

```bash
docker compose down
```

Reset local test data when needed:

```bash
docker compose down -v
```



```bash
cd /Users/xin/ClaudeProject/vancine-platform
./deploy.sh
```

The script deploys the current `origin/main` to `27.124.22.102`. If local `HEAD` is not pushed, the script stops before touching production.

To commit tracked local changes and deploy in one command:

```bash
./deploy.sh "release: short description"
```

The script stages only tracked files with `git add -u`. It refuses to commit `.env`, keys, PEM files, or files whose names include `secret` or `password`.

## What the deploy script does

```text
local git status
  ↓
optional commit + push
  ↓
ssh root@27.124.22.102
  ↓
git fetch origin main
  ↓
git reset --hard origin/main
  ↓
docker compose build vancine
  ↓
docker tag vancine-custom:latest vancine-custom:<VERSION>
  ↓
docker compose up -d
  ↓
local and HTTPS health checks
```

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
  "version": "v1.0.6"
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

Manual database backup:

```bash
ssh root@27.124.22.102 'docker exec postgres pg_dump -U root -Fc new-api > /tmp/vancine.dump'
```

Manual restore:

```bash
cat /tmp/vancine.dump | docker exec -i postgres pg_restore \
  -h 127.0.0.1 -U root -d new-api \
  --clean --if-exists --no-owner --no-acl
```

Keep the existing scheduled backup jobs on the production server:

```cron
30 2 * * * /opt/vancine-platform/backup.sh daily >> /opt/vancine-platform/backups/cron.log 2>&1
30 3 * * 0 /opt/vancine-platform/backup.sh weekly >> /opt/vancine-platform/backups/cron.log 2>&1
```

## Rollback

Rollback to the old server is only for emergencies while `64.83.35.21` is retained.

1. Change DNS records back to `64.83.35.21`.
2. Start the old app container:

   ```bash
   ssh root@64.83.35.21 'cd /opt/vancine-platform && docker compose up -d vancine'
   ```

Data written on the new server after migration will not exist on the old server. Prefer fixing forward on `27.124.22.102` unless the new server is unavailable.
