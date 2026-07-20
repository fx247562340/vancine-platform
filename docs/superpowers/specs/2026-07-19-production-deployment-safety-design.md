# Vancine Production Deployment Safety Design

**Date:** 2026-07-19
**Status:** Approved
**Scope:** P1 production deployment chain only

## 1. Problem

Vancine currently has two deployment paths with different and unsafe behavior.

- `.github/workflows/deploy.yml` runs on every push to `main`, targets a
  `self-hosted` runner that is not installed, builds the whole Compose stack,
  and has no exact-SHA gate, backup, concurrency lock, version check, or
  rollback. Recent runs remain queued and are eventually cancelled.
- `deploy.sh` can commit local tracked changes, resets the production checkout
  with `git reset --hard`, starts the full Compose project, performs health
  checks only after replacement, has no automatic rollback, and deletes old
  image tags without an explicit retention approval.

The P0 backup work already provides a verified `predeploy` backup command with
locking, PostgreSQL archive validation, mode `600`, encrypted Alibaba OSS
upload, round-trip verification, and monitoring callbacks. P1 must reuse it.

## 2. Goals

1. Make every production release identify one exact 40-character Git commit.
2. Require an explicit manual release action; a push to `main` must not deploy.
3. Reuse the verified P0 pre-deployment backup and fail closed if it fails.
4. Replace only the `vancine` application container.
5. Automatically restore the previous application image and code revision when
   the new application fails its health gates.
6. Never automatically restore PostgreSQL or delete images, backups, files,
   directories, containers, volumes, or worktrees.
7. Give GitHub only a narrowly constrained SSH capability, not a root key or a
   general-purpose shell on production.
8. Keep `deploy.sh` and GitHub Actions as thin clients of the same production
   deployment implementation.

## 3. Non-goals

- Deploying PayPal dispute handling.
- Introducing a container registry or digest-based remote image distribution.
- Automatically restoring a database after an application rollback.
- Cleaning old images, backups, worktrees, containers, volumes, or test data.
- Fixing unrelated baseline Go tests.
- Changing protected new-api or QuantumNous project information.
- Modifying `docs/devlog/2026-07.md`.

## 4. Confirmed decisions

### 4.1 Trigger and target

- GitHub Actions uses `workflow_dispatch` only.
- The operator must supply a full 40-character hexadecimal SHA.
- The SHA must exist locally after fetching `origin/main` and must be an
  ancestor of, or equal to, the current `origin/main` head.
- Branch names, tags, abbreviated SHAs, `latest`, and arbitrary commits are not
  accepted as deployment targets.

### 4.2 Version policy

- `VERSION` contains a bare `MAJOR.MINOR.PATCH` numeric SemVer.
- The target version may equal the current production version but may not be
  lower.
- User-visible and API behavior changes should increment the version. Ops-only,
  test-only, and documentation-only releases may reuse the current version.
- Runtime `/api/status` must return `v<contents-of-VERSION>`.
- The immutable application image tag is
  `vancine-custom:<version>-<first-12-characters-of-SHA>`.

### 4.3 Rollback boundary

- A backup or build failure leaves the running application unchanged.
- A post-replacement health failure restores the prior application image and
  prior code SHA, then verifies health again.
- PostgreSQL, Redis, and all volumes remain untouched.
- Database restore is always a separate, explicit, human-approved recovery
  procedure.
- Failed and successful release artifacts remain available for diagnosis.

## 5. Architecture

```text
GitHub workflow_dispatch -- exact SHA --+
                                        +--> restricted SSH command
local deploy.sh --------- exact SHA ----+          |
                                                   v
                                      root-owned deploy gateway
                                                   |
                                                   v
                                      production-deploy <SHA>
                                                   |
                         lock -> validate -> backup -> build -> replace
                                                   |
                                             verify / rollback
```

There is one authoritative production deployment program. The tracked source
is reviewed in the repository, but production executes a root-owned installed
copy outside the Git checkout. This prevents a repository commit or restricted
deploy account from silently replacing the privileged entry point.

## 6. Components

### 6.1 `ops/deploy/production-deploy.sh`

The root-owned production orchestrator accepts exactly one full SHA. It uses
fixed defaults that may be overridden only by root-controlled environment for
offline tests:

| Setting | Production value |
|---|---|
| Repository | `/opt/vancine-platform` |
| Remote | `origin` |
| Branch | `main` |
| Compose project | existing production project |
| App service/container | `vancine` |
| Internal health URL | `http://127.0.0.1:3000/api/status` |
| Public health URL | `https://vancine.com/api/status` |
| Backup command | `ops/backup/postgres-backup.sh predeploy` |
| Deploy lock | `/run/lock/vancine-deploy.lock` |
| State directory | `/var/lib/vancine-deploy` |

It must use `set -Eeuo pipefail` and `umask 077`. It must not print environment
files, Docker environment, credentials, HTTP response bodies, or monitoring
URLs.

### 6.2 Restricted SSH gateway

`vancine-deploy` is a dedicated production account with:

- an independent deployment SSH key;
- no password authentication;
- no PTY, forwarding, agent forwarding, X11 forwarding, or interactive use;
- no membership in the `docker` group;
- no general-purpose sudo permission.

The authorized key is restricted to a root-owned gateway. The gateway accepts
only the exact command `deploy <40-character-SHA>`, rejects shell metacharacters
and all other input, and invokes the installed production orchestrator through
one narrowly scoped passwordless sudo rule.

Neither the public key nor private key is committed. Installation receives a
public-key file as an explicit argument and refuses unsafe ownership or
permissions.

### 6.3 `deploy.sh`

The repository-root script becomes a local client:

```text
./deploy.sh <40-character-SHA>
```

It validates the argument, confirms the SHA is present on `origin/main`, and
uses the dedicated account to request `deploy <SHA>`. It does not stage,
commit, push, reset, build, restart, clean, or delete anything locally.

### 6.4 GitHub Actions

`.github/workflows/deploy.yml` contains only a manually dispatched production
job on a GitHub-hosted Ubuntu runner.

- `permissions: contents: read`
- `environment: production`
- `concurrency.group: vancine-production`
- `concurrency.cancel-in-progress: false`
- required `deploy_sha` input matching `^[0-9a-f]{40}$`
- optional non-secret `reason` input
- native `ssh-agent`, `ssh-add`, `ssh`, and `curl`; no third-party SSH action
- host key loaded from a pinned `known_hosts` secret, never from `ssh-keyscan`
- SSH private key passed to `ssh-add` over stdin, never as a command argument or
  repository file

The GitHub `production` Environment owns the host, user, private key, and
known-hosts secrets. The workflow logs only the target SHA, stage, version, and
result.

### 6.5 Compose version and image inputs

`docker-compose.yml` uses distinct variables:

- `VANCINE_IMAGE_TAG` selects the application image tag and defaults to
  `latest` for existing local use.
- `APP_VERSION` supplies the optional runtime version override and defaults to
  an empty value, allowing the Dockerfile-embedded version to remain the local
  source of truth.

Production always exports both variables. The orchestrator verifies the target
version before build and validates the reported version after startup.

## 7. Deployment transaction

### 7.1 Preflight

1. Acquire the non-blocking deploy lock. A concurrent deployment exits without
   changing state.
2. Validate the target SHA syntax.
3. Require root execution and required tools.
4. Require no tracked or staged production changes. Existing untracked backup
   artifacts are not modified.
5. Fetch `origin/main` without pruning or deleting refs.
6. Resolve the target commit and verify it is reachable from `origin/main`.
7. Read and validate target `VERSION` using `git show <SHA>:VERSION` before
   changing the checkout.
8. Read the current production API version and reject a numeric SemVer
   downgrade. An equal version is allowed.

### 7.2 Backup and build

1. Run the currently deployed, already trusted backup script with `predeploy`.
2. Stop immediately if archive validation, OSS upload, round-trip verification,
   or monitoring completion fails.
3. Record current Git SHA, current container image ID, current version, and a
   unique rollback tag in root-only state.
4. Switch the tracked checkout to detached target SHA without `reset --hard` or
   `git clean`.
5. Validate Compose configuration without printing its rendered environment.
6. Build the target immutable image. Building must not change the running
   container.

### 7.3 Replacement and verification

1. Run only `docker compose up -d --no-deps --force-recreate vancine` with the
   immutable target image tag and target runtime version.
2. Wait a bounded time for Docker health to become `healthy`; treat
   `unhealthy`, container exit, missing container, and timeout as failure.
3. Request the internal and public status endpoints with bounded curl timeouts.
4. Parse JSON without logging the body and require `success == true` and the
   exact expected version.
5. Confirm the running container uses the expected immutable image ID.
6. Atomically publish the successful deployment state.

### 7.4 Rollback

An error after application replacement triggers one rollback attempt:

1. Check out the recorded prior code SHA.
2. Recreate only `vancine` from the recorded prior image tag.
3. Re-run container, internal, and public health checks against the prior
   version.
4. Report `ROLLBACK_OK` or `ROLLBACK_FAILED` and exit non-zero in both cases so
   the attempted release is never reported as successful.

No database restore or artifact cleanup occurs in either path.

## 8. State and audit evidence

The root-only state directory contains small non-secret records:

- current successful SHA, version, image tag, and deployment timestamp;
- last attempted SHA and outcome;
- prior rollback SHA, version, and image tag.

Writes use a same-directory temporary file followed by an atomic rename. Output
uses stable markers so tests and GitHub logs can distinguish `DEPLOY_OK`,
`DEPLOY_FAILED`, `ROLLBACK_OK`, and `ROLLBACK_FAILED`.

## 9. Testing

All destructive-looking operations are exercised first through offline fakes.

### 9.1 Orchestrator behavior tests

Tests fake `git`, `docker`, `curl`, and the backup entry point and assert:

- malformed, abbreviated, missing, or non-main SHAs fail before backup;
- tracked production changes fail closed while untracked files are preserved;
- concurrent deployment fails before any mutation;
- invalid SemVer and version downgrade fail;
- backup failure prevents checkout, build, and replacement;
- build failure leaves the old container running and restores the old checkout;
- only the `vancine` service is recreated with `--no-deps`;
- health timeout, unhealthy, wrong version, wrong image, internal failure, and
  public failure each cause application rollback;
- rollback never calls PostgreSQL restore and never restarts PostgreSQL/Redis;
- no path runs `reset --hard`, `git clean`, `docker compose down`, prune,
  image removal, volume removal, or filesystem deletion;
- successful state is written only after all gates pass.

### 9.2 Gateway and client tests

- Accept exactly `deploy <40-hex-SHA>`.
- Reject missing commands, extra arguments, uppercase/non-hex input, command
  substitution, separators, options, PTY usage, and forwarding attempts.
- Confirm the local client never invokes git commit, git reset, Docker, cleanup,
  or root SSH.
- Confirm secrets never appear in argv or logs.

### 9.3 Static and integration gates

- `bash -n` for every shell file.
- ShellCheck for every new or modified shell file.
- Actionlint for the workflow.
- `docker compose config --quiet` with production deployment variables.
- Existing backup behavior tests.
- P1 offline deployment tests, including simulated rollback.
- Full local Docker build and healthy application startup.
- User verification before commit, push, or production installation.

The unrelated baseline Go failures recorded on 2026-07-19 remain outside this
P1 scope and must be reported rather than hidden.

## 10. Release sequence

1. Implement and test on `codex/deploy-p1` in
   `/Users/xin/ClaudeProject/vancine-platform-deploy-p1`.
2. Codex reviews all changes and test evidence.
3. Build and run the full local Docker application.
4. Obtain user verification.
5. Obtain approval to commit and push.
6. Obtain separate approval for the one-time production account/bootstrap.
7. Configure GitHub `production` Environment secrets without printing them.
8. Manually dispatch the workflow with the approved full SHA.
9. Verify production SHA, immutable image, health, backup, and unchanged
   PostgreSQL/Redis container identities.
