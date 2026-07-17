#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

backup_kind=${1:-}
case "$backup_kind" in
  daily|weekly|predeploy|manual)
    ;;
  *)
    printf 'Usage: %s {daily|weekly|predeploy|manual}\n' "$0" >&2
    exit 64
    ;;
esac

backup_root=${BACKUP_ROOT:-/opt/vancine-platform/backups}
backup_lock_file=${BACKUP_LOCK_FILE:-/run/lock/vancine-backup.lock}
postgres_container=${POSTGRES_CONTAINER:-postgres}
postgres_user=${POSTGRES_USER:-root}
postgres_database=${POSTGRES_DB:-new-api}
minimum_free_multiplier=${BACKUP_MIN_FREE_MULTIPLIER:-3}

case "$backup_kind" in
  daily) backup_success_url=${BACKUP_DAILY_SUCCESS_URL:-} ;;
  weekly) backup_success_url=${BACKUP_WEEKLY_SUCCESS_URL:-} ;;
  predeploy) backup_success_url=${BACKUP_PREDEPLOY_SUCCESS_URL:-} ;;
  manual) backup_success_url=${BACKUP_MANUAL_SUCCESS_URL:-} ;;
esac

case "$minimum_free_multiplier" in
  ''|*[!0-9]*)
    printf 'BACKUP_MIN_FREE_MULTIPLIER must be a positive integer\n' >&2
    exit 64
    ;;
  0)
    printf 'BACKUP_MIN_FREE_MULTIPLIER must be greater than zero\n' >&2
    exit 64
    ;;
esac

install -d -m 700 "$backup_root" "$backup_root/$backup_kind"
backup_lock_directory=$(dirname "$backup_lock_file")
if [ ! -d "$backup_lock_directory" ]; then
  install -d -m 700 "$backup_lock_directory"
fi

exec 9>"$backup_lock_file"
if ! flock -n 9; then
  printf 'Another Vancine backup is already running\n' >&2
  exit 75
fi

backup_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_directory=$backup_root/$backup_kind
backup_base=vancine-db-${backup_timestamp}.dump
partial_path=$backup_directory/$backup_base.partial
failed_path=$backup_directory/$backup_base.failed
final_path=$backup_directory/$backup_base
checksum_path=$final_path.sha256
checksum_partial=$checksum_path.partial

for reserved_path in \
  "$partial_path" "$failed_path" "$final_path" \
  "$checksum_path" "$checksum_partial"; do
  if [ -e "$reserved_path" ]; then
    printf 'Refusing to overwrite existing backup artifact: %s\n' "$reserved_path" >&2
    exit 73
  fi
done

database_size_bytes=$(docker exec "$postgres_container" \
  psql -X -U "$postgres_user" -d "$postgres_database" -Atc \
  'select pg_database_size(current_database());')

case "$database_size_bytes" in
  ''|*[!0-9]*)
    printf 'PostgreSQL returned an invalid database size\n' >&2
    exit 65
    ;;
esac

available_kib=$(df -Pk "$backup_root" | awk 'NR == 2 { print $4 }')
case "$available_kib" in
  ''|*[!0-9]*)
    printf 'Unable to determine available backup disk space\n' >&2
    exit 65
    ;;
esac

available_bytes=$((available_kib * 1024))
required_bytes=$((database_size_bytes * minimum_free_multiplier))
if [ "$available_bytes" -lt "$required_bytes" ]; then
  printf 'Insufficient backup disk space: available=%s required=%s\n' \
    "$available_bytes" "$required_bytes" >&2
  exit 73
fi

preserve_failed_backup() {
  backup_status=$?
  if [ -f "$partial_path" ]; then
    mv "$partial_path" "$failed_path"
    chmod 600 "$failed_path"
    printf 'Backup validation failed; archive retained at %s\n' "$failed_path" >&2
  fi
  exit "$backup_status"
}
trap preserve_failed_backup ERR

docker exec "$postgres_container" pg_dump \
  -U "$postgres_user" -d "$postgres_database" -Fc \
  --no-owner --no-acl > "$partial_path"
chmod 600 "$partial_path"
test -s "$partial_path"

archive_listing=$(docker exec -i "$postgres_container" pg_restore --list < "$partial_path")
archive_item_count=$(printf '%s\n' "$archive_listing" | awk 'NF { count++ } END { print count + 0 }')
test "$archive_item_count" -gt 0

for required_table in users tokens top_ups subscription_orders; do
  case "$archive_listing" in
    *"TABLE DATA public $required_table "*)
      ;;
    *)
      printf 'Backup archive is missing required table data: %s\n' "$required_table" >&2
      false
      ;;
  esac
done

mv "$partial_path" "$final_path"
chmod 600 "$final_path"

(
  cd "$backup_directory"
  sha256sum "$backup_base" > "$(basename "$checksum_partial")"
  mv "$(basename "$checksum_partial")" "$(basename "$checksum_path")"
  chmod 600 "$(basename "$checksum_path")"
  sha256sum -c "$(basename "$checksum_path")"
)

if [ -n "$backup_success_url" ]; then
  curl --fail --silent --show-error --max-time 15 --retry 2 \
    "$backup_success_url" >/dev/null
fi

trap - ERR
printf 'Backup complete: kind=%s file=%s bytes=%s archive_items=%s\n' \
  "$backup_kind" "$final_path" "$(wc -c < "$final_path")" "$archive_item_count"
