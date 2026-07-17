#!/bin/sh

set -eu

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
systemd_dir=$(CDPATH= cd -- "$test_dir/../systemd" 2>/dev/null && pwd) || {
  printf 'FAIL: systemd unit directory is missing\n' >&2
  exit 1
}

service_file=$systemd_dir/vancine-backup@.service
alert_service=$systemd_dir/vancine-backup-alert@.service
daily_timer=$systemd_dir/vancine-backup-daily.timer
weekly_timer=$systemd_dir/vancine-backup-weekly.timer

require_line() {
  expected=$1
  file=$2
  grep -Fqx "$expected" "$file" || {
    printf 'FAIL: expected %s in %s\n' "$expected" "$file" >&2
    exit 1
  }
}

require_line 'Type=oneshot' "$service_file"
require_line 'User=root' "$service_file"
require_line 'EnvironmentFile=-/etc/vancine/backup.env' "$service_file"
require_line 'ExecStart=/opt/vancine-platform/ops/backup/postgres-backup.sh %i' "$service_file"
require_line 'NoNewPrivileges=true' "$service_file"
require_line 'ProtectSystem=strict' "$service_file"
require_line 'OnFailure=vancine-backup-alert@%i.service' "$service_file"

require_line 'Type=oneshot' "$alert_service"
require_line 'EnvironmentFile=-/etc/vancine/backup.env' "$alert_service"
require_line 'ExecStart=/opt/vancine-platform/ops/backup/backup-alert.sh %i' "$alert_service"

require_line 'OnCalendar=*-*-* 02:30:00 Asia/Shanghai' "$daily_timer"
require_line 'Persistent=true' "$daily_timer"
require_line 'Unit=vancine-backup@daily.service' "$daily_timer"

require_line 'OnCalendar=Sun *-*-* 03:30:00 Asia/Shanghai' "$weekly_timer"
require_line 'Persistent=true' "$weekly_timer"
require_line 'Unit=vancine-backup@weekly.service' "$weekly_timer"

if grep -ERn 'ExecStart=.*[[:space:]/](rm|unlink)([[:space:]]|$)|[[:space:]]-delete([[:space:]]|$)' "$systemd_dir"; then
  printf 'FAIL: systemd units must not delete backup files\n' >&2
  exit 1
fi

printf 'PASS: systemd unit tests\n'
