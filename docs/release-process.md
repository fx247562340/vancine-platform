# Release Process

Use this process for every Vancine production release.

## Current version

The current version is tracked in the root `VERSION` file.

```bash
cat VERSION
# 1.0.6
```

The application exposes this version through `/api/status` as `version: "v1.0.6"`.

## Version policy

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

- Increment **PATCH** for bug fixes, copy changes, deployment fixes, and non-breaking UI polish.
- Increment **MINOR** for new user-visible features or new provider/model capabilities.
- Increment **MAJOR** for breaking API or data model changes.

Write the bare number in `VERSION`, for example:

```text
1.0.5
```

Do not include the `v` prefix in the file. The app formats it as `v1.0.5` at runtime.

## Required release gates

Production deploys are gated by local Docker verification and user approval:

1. Make the code change locally.
2. Build and run the full app locally with Docker.
3. Ask the user to verify `http://127.0.0.1:3000`.
4. Only after the user confirms, commit and push.
5. Deploy on the production server by pulling from GitHub and building there.

Do not deploy directly from an unverified local edit.

## Pre-release checklist

Before deploying:

1. Confirm the working tree contains only intentional changes.

   ```bash
   git status
   ```

2. Confirm the version.

   ```bash
   cat VERSION
   ```

3. Build and run the full app locally with Docker for user verification.

   ```bash
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

   Ask the user to verify the local app at `http://127.0.0.1:3000`. If the user finds an issue, fix it and repeat this step before continuing.

4. Run targeted checks for the changed area. For frontend-only changes, the Docker build above already runs both production frontend builds. For backend changes, also run:

   ```bash
   go test ./...
   ```

   If a known upstream test is failing, state that explicitly in the release notes instead of hiding it.

5. Commit and push.

   ```bash
   git add <files>
   git commit -m "release: v1.0.5"
   git push origin main
   ```

## Deploy

Deploy from the local checkout:

```bash
./deploy.sh
```

Or commit tracked changes and deploy in one step:

```bash
./deploy.sh "release: v1.0.5"
```

The script deploys `origin/main` to `27.124.22.102` and builds the Docker image on the server.

## Post-release verification

Run:

```bash
curl -s https://vancine.com/api/status
ssh root@27.124.22.102 'cd /opt/vancine-platform && docker compose ps'
ssh root@27.124.22.102 'docker logs vancine --tail 80'
```

Expected status fields:

```json
{
  "success": true,
  "setup": true,
  "system_name": "Vancine",
  "server_address": "https://vancine.com",
  "version": "v1.0.6"
}
```

For a new release, replace `v1.0.6` with the value from `VERSION`.

## Rollback

Preferred rollback is forward-fix and redeploy from GitHub. If the new build is bad but the server is healthy:

```bash
ssh root@27.124.22.102
cd /opt/vancine-platform
git log --oneline -5
git reset --hard <previous-good-commit>
docker compose build vancine
docker compose up -d
```

Emergency rollback to the old Japan server is only available while `64.83.35.21` is retained as cold backup. See [Deployment Reference](deployment.md#rollback).

## Notes on npm and lockfiles

Both frontend themes use npm and committed `package-lock.json` files.

- Do not reintroduce `bun.lock`.
- Do not use `bun install` for production builds.
- `web/classic` requires `npm install --legacy-peer-deps`.
- `web/classic` pins `react-icons` to `5.3.0` because later versions removed `SiLinkedin`.
