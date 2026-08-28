# Release Process

Use this process for every Vancine production release.

## Current version

The current version is tracked in the root `VERSION` file.

```bash
cat VERSION
```

The application exposes this version through `/api/status` as `version: "v<VERSION>"`.

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
3. Complete Layer 3 exactly ONE of these ways (per the Layered
   verification contract below): the minimal automated browser smoke,
   OR a manual page acceptance by the project owner. Do not run both
   by default.
4. Only after the chosen Layer 3 pass, commit and push.
5. Deploy on the production server by pulling from GitHub and building there.

Do not deploy directly from an unverified local edit.

## Layered verification contract (request budget)

Release verification is layered. Each layer owns its assertions; by
default a later layer does NOT repeat the same assertion an earlier
layer already proved. Widen the matrix only when shared surfaces
(auth, router, metadata, acquisition, rate limiting) actually changed.
Temporary acceptance scripts and evidence under `outputs/` stay
untracked. These rules reduce duplicate requests — they never skip the
local Docker gate.

- **Layer 1 — code gates (no HTTP):** unit, component, router/Go
  tests, typecheck, build. Assert pure logic, contracts, and route
  wiring here; a browser must never re-prove what these prove.
- **Layer 2 — local Docker health + one bounded HTTP SEO pass:**
  container healthy with `RestartCount=0`, `/api/status` version and
  brand, startup-log error scan, then ONE bounded curl/Python script
  asserting canonical/sitemap/pollution-proof behavior. Health
  polling is capped at 120 seconds total with an interval of at least
  2 seconds.
- **Layer 3 — minimal UI smoke (pick exactly one by default):** the
  minimal automated browser smoke governed by the Automated browser
  release acceptance request budget in `AGENTS.md` (at most one full
  load per target page, mobile via same-page resize, at most two
  screenshots), OR a manual page acceptance by the project owner.
  Do not run both unless the owner explicitly asks. Either way, do not
  re-run the full local UI matrix again.
- **Layer 4 — production public smoke:** production version string,
  canonical, sitemap membership, and a core smoke of the new page
  only. Do not replay the local UI matrix against production.

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

3. Build and run the full app locally with Docker for verification.

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

   Complete Layer 3 as ONE of: the minimal automated browser smoke
   (per the Automated browser release acceptance request budget in
   `AGENTS.md`), or a manual page acceptance by the project owner —
   not both by default. Either way, the code gates and the local
   Docker gate are still mandatory. If an issue is found, fix it and
   repeat this step before continuing.

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

Deploy an exact full 40-character commit SHA through the restricted deploy
account. A push to `main` never deploys.

From the local checkout:

```bash
./deploy.sh <40-character-commit-SHA>
```

Or dispatch the GitHub `Deploy to Production` workflow with the `deploy_sha`
input. The client validates the SHA, confirms it is reachable from
`origin/main`, then requests exactly one `deploy <SHA>` over strict SSH to the
`vancine-deploy` account. It never commits, pushes, resets, builds, restarts,
cleans, or logs in as root.

The root-owned production orchestrator then runs the predeploy backup, builds
the immutable image `vancine-custom:<version>-<sha12>`, replaces only the
`vancine` container, verifies health, and rolls back the application
automatically on failure. See [`ops/deploy/README.md`](../ops/deploy/README.md)
for the full transaction and audit commands.

## Post-release verification

Run:

```bash
curl -s https://vancine.com/api/status
ssh root@27.124.22.102 'cat /var/lib/vancine-deploy/state.json'
ssh root@27.124.22.102 'docker inspect -f "{{.Config.Image}}" vancine'
ssh root@27.124.22.102 'docker inspect -f "{{.Id}} {{.State.StartedAt}}" postgres redis'
```

Expected status fields:

```json
{
  "success": true,
  "setup": true,
  "system_name": "Vancine",
  "server_address": "https://vancine.com",
  "version": "v<VERSION>"
}
```

For a new release, replace `v<VERSION>` with the actual value from `VERSION`. Confirm
PostgreSQL and Redis container IDs and `StartedAt` are unchanged by the
release.

## Rollback

Application rollback is automatic and application-only. When a new release
fails its health gates after replacement, the orchestrator restores the prior
code SHA, recreates only `vancine` from the prior image, re-verifies health,
and exits non-zero (`ROLLBACK_OK` or `ROLLBACK_FAILED`). It never restores or
restarts PostgreSQL or Redis, and never deletes images, backups, containers,
volumes, or worktrees.

Prefer fixing forward and redeploying an exact SHA. Do not run
`git reset --hard`, whole-stack restart, or image deletion as a manual
rollback; the orchestrator handles application rollback safely. Database
restore is a separate, explicit, human-approved procedure (see
[`ops/backup/README.md`](../ops/backup/README.md)).

Emergency DNS-based rollback to the old Japan server is only available while
`64.83.35.21` is retained as cold backup. See
[Deployment Reference](deployment.md#rollback).

## Notes on the frontend build

The project uses a single Bun frontend under `web/` with a committed `web/bun.lock`.

- Build the frontend with `cd web && bun install --frozen-lockfile && bun run build`.
- The Dockerfile and CI both build from `web/bun.lock`; keep it in sync with `web/package.json`.
- There is no separate `web/classic` or `web/default` theme and no `package-lock.json` files.
