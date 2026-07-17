#!/usr/bin/env bash

set -Eeuo pipefail

backup_kind=${1:-}
case "$backup_kind" in
  daily|weekly|predeploy|manual)
    ;;
  *)
    printf 'Usage: %s {daily|weekly|predeploy|manual}\n' "$0" >&2
    exit 64
    ;;
esac

if [ -z "${BACKUP_FAILURE_URL:-}" ]; then
  printf 'Backup failed for kind=%s; BACKUP_FAILURE_URL is not configured\n' \
    "$backup_kind" >&2
  exit 0
fi

curl --fail --silent --show-error --max-time 15 --retry 2 \
  "$BACKUP_FAILURE_URL" >/dev/null
printf 'Backup failure monitor notified for kind=%s\n' "$backup_kind"
