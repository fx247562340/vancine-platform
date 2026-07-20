# Vancine Production Deployment (P1)

This directory holds the authoritative production deployment chain. It
replaces the previous push-triggered GitHub Action and the all-in-one
`deploy.sh` with one exact-SHA, pre-backed-up, application-only transaction
that can automatically roll back the application image and code revision.

## Components

| File | Role |
|------|------|
| `production-deploy.sh` | Root-owned orchestrator: validate -> backup -> build -> replace `vancine` -> verify -> rollback on failure |
| `ssh-command-gateway.sh` | Forced SSH command for the `vancine-deploy` account; accepts only `deploy <40-hex-SHA>` |
| `install-production-access.sh` | One-time installer for the account, root-owned scripts, authorized_keys, and sudoers rule |
| `tests/` | Offline fake-command behavior and security tests |

Production executes root-owned installed copies at `/usr/local/sbin/vancine-production-deploy`
and `/usr/local/sbin/vancine-deploy-gateway`, not the repository checkout. This
prevents a repository commit from silently replacing the privileged entry point.

## Two thin clients, one implementation

Both GitHub Actions and the local `deploy.sh` send a full 40-character SHA
through the restricted `vancine-deploy` SSH account. Neither client commits,
pushes, resets, builds, restarts, cleans, or logs in as root.

- Local: `./deploy.sh <40-character-SHA>`
- GitHub: manual `workflow_dispatch` with required `deploy_sha` input.

## Deployment transaction

1. **Preflight** — acquire a non-blocking lock, validate the SHA syntax,
   require a clean tracked tree, fetch `origin/main` without pruning, confirm
   the SHA is an ancestor of `origin/main`, read and validate the target
   `VERSION`, and reject a numeric SemVer downgrade (equal is allowed).
2. **Backup** — run `ops/backup/postgres-backup.sh predeploy`. Any failure
   stops the release before checkout, build, or replacement.
3. **Build** — capture the prior SHA/version/image-ID and tag the old image
   with a unique rollback tag (collision fails closed); `git checkout --detach
   <SHA>`; validate the Compose configuration with
   `docker compose config --quiet` (rendered config is never printed) — a
   failure here aborts before any build and restores the prior checkout; then
   build the immutable image `vancine-custom:<version>-<sha12>` (reusing an
   existing tag only if its OCI revision/version labels match exactly).
   Building does not touch the running container.
4. **Replace** — `docker compose up -d --no-deps --force-recreate vancine`
   only. PostgreSQL, Redis, volumes, and networks are never recreated.
5. **Verify** — wait for Docker health, then require `success == true` and
   the exact expected version from both the internal and public status
   endpoints, and confirm the running container uses the expected image.
6. **Publish** — atomically write successful state only after all gates pass.

## Rollback

An error after application replacement triggers exactly one rollback attempt:

1. `git checkout --detach <prior SHA>`.
2. Recreate only `vancine` from the prior image tag.
3. Re-run container, internal, and public health checks against the prior
   version.
4. Print `ROLLBACK_OK` or `ROLLBACK_FAILED` and exit non-zero either way, so
   the attempted release is never reported as successful.

**Rollback never restores PostgreSQL or Redis, never restarts them, and never
deletes images, backups, files, directories, containers, volumes, or
worktrees.** Database restore is always a separate, explicit, human-approved
recovery procedure.

## State and audit evidence

The root-only state directory `/var/lib/vancine-deploy` (mode `0700`) holds
`state.json` (mode `0600`) with three sections, written atomically via a
same-directory temporary file + rename:

- `last_attempt` — this attempt's `sha`, `version`, `outcome`, and timestamp.
  `outcome` is one of `BACKUP_FAILED`, `BUILD_FAILED`, `DEPLOY_FAILED`,
  `ROLLBACK_OK`, `ROLLBACK_FAILED`, or `DEPLOY_OK`.
- `current_successful` — the last fully successful deployment (`sha`,
  `version`, `image_tag`, timestamp). It is preserved across failed attempts,
  so a failure never erases the known-good baseline.
- `prior_rollback` — the prior release captured for rollback (`sha`,
  `version`, `image_tag`, `image_id`, timestamp).

No credentials, HTTP response bodies, or environment variables are ever
written, and no failed candidate file is deleted. Console markers:
`DEPLOY_OK`, `DEPLOY_FAILED`, `ROLLBACK_OK`, `ROLLBACK_FAILED`.

## One-time bootstrap

Generate a dedicated Ed25519 key (never committed) and run the installer on
the production server as root:

```bash
ssh-keygen -t ed25519 -f vancine-deploy -N ""
sudo ./ops/deploy/install-production-access.sh /absolute/path/to/vancine-deploy.pub
```

The installer creates the `vancine-deploy` account (no password auth, no
`docker` group, `/bin/bash` shell), installs the root-owned gateway and
orchestrator, writes `authorized_keys` with a forced-command prefix, and
installs the single narrow sudoers rule:

```text
vancine-deploy ALL=(root) NOPASSWD: /usr/local/sbin/vancine-production-deploy *
```

Neither the public nor the private key is committed.

## GitHub production environment

Configure these secrets in the GitHub `production` Environment (never printed
or logged):

- `PRODUCTION_SSH_HOST`
- `PRODUCTION_SSH_PRIVATE_KEY`
- `PRODUCTION_SSH_KNOWN_HOSTS` (pinned; never discovered dynamically)

The SSH user is **fixed to `vancine-deploy`** in the workflow itself; it is
deliberately NOT read from a secret so a misconfigured secret can never switch
the login to root. The workflow uses native `ssh-agent`, `ssh-add` (key over
stdin), `ssh`, and `curl` on `ubuntu-latest`. No third-party SSH action. The
deployment SHA is validated as a whole-string bash regex (rejecting trailing
newlines / second-line injection) and `inputs.*` reach the shell only via step
`env`, never inline in a `run` block.

## Audit after a release

```bash
# Target SHA and immutable image
ssh root@27.124.22.102 'cat /var/lib/vancine-deploy/state.json'
ssh root@27.124.22.102 'docker inspect -f "{{.Config.Image}}" vancine'
# Health
ssh root@27.124.22.102 'curl -s http://127.0.0.1:3000/api/status'
curl -s https://vancine.com/api/status
# PostgreSQL and Redis must be unchanged
ssh root@27.124.22.102 'docker inspect -f "{{.Id}} {{.State.StartedAt}}" postgres redis'
```

## Recovery (database)

Database restore is always a separate, explicit, human-approved procedure. See
`ops/backup/README.md` for the restore drill. The deployment orchestrator
never performs or triggers a database restore.

## Testing

```bash
bash ops/deploy/tests/test-compose-contract.sh
bash ops/deploy/tests/test-production-deploy.sh all
bash ops/deploy/tests/test-ssh-command-gateway.sh
bash ops/deploy/tests/test-install-production-access.sh
bash tests/deploy_client_test.sh
bash ops/deploy/tests/test-workflow-contract.sh
```

`shellcheck` and `actionlint` are recommended when available; if absent, the
repository-native tests above still run.
