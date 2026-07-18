# Vancine PostgreSQL Backup Operations

This directory contains the source-controlled PostgreSQL backup, failure
notification, systemd scheduling, isolated restore-drill tooling, and encrypted
OSS off-site upload tooling.

## Safety properties

- Backups use PostgreSQL custom archives (`pg_dump -Fc`).
- Files are written as `.partial`, validated, and atomically renamed.
- Failed validation archives are retained as `.failed` for investigation.
- Backup directories use mode `700`; backup and checksum files use `600`.
- A non-blocking `flock` prevents overlapping backup runs.
- A backup starts only when free disk space is at least three times the
  current database size.
- The optional OSS copy is encrypted with `age` before upload.
- The OSS upload writes the encrypted archive, encrypted checksum, original
  checksum, and a manifest, then downloads the encrypted checksum for a
  round-trip verification.
- No script in this directory deletes backup files.
- Retention cleanup requires a separate reviewed change and explicit approval.

## Commands

Run one backup type:

```bash
sudo /opt/vancine-platform/ops/backup/postgres-backup.sh daily
sudo /opt/vancine-platform/ops/backup/postgres-backup.sh weekly
sudo /opt/vancine-platform/ops/backup/postgres-backup.sh predeploy
sudo /opt/vancine-platform/ops/backup/postgres-backup.sh manual
```

Defaults:

| Variable | Default |
|---|---|
| `BACKUP_ROOT` | `/opt/vancine-platform/backups` |
| `BACKUP_LOCK_FILE` | `/run/lock/vancine-backup.lock` |
| `POSTGRES_CONTAINER` | `postgres` |
| `POSTGRES_USER` | `root` |
| `POSTGRES_DB` | `new-api` |
| `BACKUP_MIN_FREE_MULTIPLIER` | `3` |
| `VANCINE_OSS_BACKUP_ENV_FILE` | `/etc/vancine/oss-backup.env` |
| `VANCINE_OSS_UPLOAD_SCRIPT` | `/opt/vancine-platform/ops/backup/oss-upload.sh` |

Do not put database passwords in these scripts. The commands execute inside
the PostgreSQL container using its local authentication configuration.

## Monitoring configuration

Create `/etc/vancine/backup.env` with owner `root:root` and mode `600`:

```ini
BACKUP_DAILY_SUCCESS_URL="https://monitor.example/private-daily-success-push-url"
BACKUP_WEEKLY_SUCCESS_URL="https://monitor.example/private-weekly-success-push-url"
BACKUP_PREDEPLOY_SUCCESS_URL="https://monitor.example/private-predeploy-success-push-url"
BACKUP_MANUAL_SUCCESS_URL="https://monitor.example/private-manual-success-push-url"
BACKUP_FAILURE_URL="https://monitor.example/private-failure-push-url"
```

The URLs are secrets and must never be committed or printed in reports. Each
success URL is called only after local archive validation and, when enabled,
OSS upload verification. Daily and weekly jobs use independent URLs so either
schedule can be monitored for a missed run.

The systemd `OnFailure` service calls `BACKUP_FAILURE_URL` when any backup
stage exits non-zero. If no failure URL is configured, the failure remains
visible in the systemd journal.

## OSS off-site backup configuration

Install `age` and `ossutil` on the production host, then create
`/etc/vancine/oss-backup.env` with owner `root:root` and mode `600`:

```ini
VANCINE_OSS_BACKUP_ENABLED=1
VANCINE_OSS_BUCKET="your-private-backup-bucket"
VANCINE_OSS_PREFIX="prod-db"
VANCINE_OSS_REGION="cn-hongkong"
VANCINE_OSS_ENDPOINT="https://oss-cn-hongkong.aliyuncs.com"
VANCINE_OSSUTIL_CONFIG_FILE="/etc/vancine/ossutil-backup.config"
VANCINE_AGE_RECIPIENT="age1..."
```

Create the `ossutil` config file referenced by `VANCINE_OSSUTIL_CONFIG_FILE`
with owner `root:root` and mode `600`:

```ini
[default]
accessKeyID=...
accessKeySecret=...
region=cn-hongkong
```

The production host needs only the `age` public recipient. Keep the private
identity offline or on a separate trusted machine used for restore drills.

Use a RAM policy that allows only listing the approved prefix and
`GetObject`/`PutObject` under that prefix. Do not grant delete permissions to
the backup upload user.

## Local verification

Run the deterministic behavior tests:

```bash
ops/backup/tests/test-postgres-backup.sh
ops/backup/tests/test-backup-alert.sh
ops/backup/tests/test-restore-drill.sh
ops/backup/tests/test-systemd-units.sh
```

Run the real PostgreSQL 15 backup-and-restore integration test:

```bash
ops/backup/tests/integration-postgres.sh
```

The integration test starts isolated containers with `--network none` and no
published ports. It removes only the temporary containers it creates and
retains the generated test backup for inspection.

## Production installation

Install only after local Docker verification, user approval, commit, push, and
deployment of the approved commit:

```bash
sudo install -d -m 700 -o root -g root /opt/vancine-platform/backups
sudo install -d -m 700 -o root -g root /etc/vancine
sudo install -m 700 ops/backup/postgres-backup.sh /opt/vancine-platform/ops/backup/
sudo install -m 700 ops/backup/backup-alert.sh /opt/vancine-platform/ops/backup/
sudo install -m 700 ops/backup/oss-upload.sh /opt/vancine-platform/ops/backup/
sudo install -m 644 ops/backup/systemd/vancine-backup@.service /etc/systemd/system/
sudo install -m 644 ops/backup/systemd/vancine-backup-alert@.service /etc/systemd/system/
sudo install -m 644 ops/backup/systemd/vancine-backup-daily.timer /etc/systemd/system/
sudo install -m 644 ops/backup/systemd/vancine-backup-weekly.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/vancine-backup@.service \
  /etc/systemd/system/vancine-backup-alert@.service \
  /etc/systemd/system/vancine-backup-daily.timer \
  /etc/systemd/system/vancine-backup-weekly.timer
sudo systemctl daemon-reload
sudo systemctl enable --now vancine-backup-daily.timer vancine-backup-weekly.timer
```

The backup directory must exist before systemd starts the service because
`ProtectSystem=strict` and `ReadWritePaths` establish the service mount
namespace before `ExecStart` runs. If `BACKUP_ROOT` or `BACKUP_LOCK_FILE` is
customized, add the corresponding writable path to a reviewed systemd drop-in;
changing the environment variable alone is not sufficient.

Before enabling the timers, confirm there is no legacy cron or timer invoking
another Vancine backup script.

Verify scheduling and run a manual systemd backup:

```bash
systemctl list-timers 'vancine-backup-*'
sudo systemctl start vancine-backup@manual.service
sudo systemctl status vancine-backup@manual.service --no-pager
journalctl -u vancine-backup@manual.service --since today --no-pager
```

## Isolated restore drill

Run against a backup with its adjacent `.sha256` file:

```bash
sudo /opt/vancine-platform/ops/backup/restore-drill.sh \
  /opt/vancine-platform/backups/daily/vancine-db-YYYYMMDDTHHMMSSZ.dump
```

The drill starts an isolated PostgreSQL 15 container with `--network none` and
no published port, restores the archive, verifies the `users`, `tokens`,
`top_ups`, and `subscription_orders` tables, reports row counts, and removes
only that temporary container.
