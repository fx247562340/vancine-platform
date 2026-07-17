#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

dump_path=${1:-}
if [ -z "$dump_path" ] || [ ! -f "$dump_path" ]; then
  printf 'Usage: %s /absolute/path/to/backup.dump\n' "$0" >&2
  exit 64
fi

checksum_path=$dump_path.sha256
if [ ! -f "$checksum_path" ]; then
  printf 'Checksum file is required: %s\n' "$checksum_path" >&2
  exit 66
fi

dump_directory=$(CDPATH= cd -- "$(dirname -- "$dump_path")" && pwd)
dump_name=$(basename "$dump_path")
checksum_name=$(basename "$checksum_path")
checksum_entry_count=$(awk 'NF { count++ } END { print count + 0 }' "$checksum_path")
if [ "$checksum_entry_count" -ne 1 ]; then
  printf 'Checksum file must contain exactly one entry\n' >&2
  exit 65
fi
checksum_target=$(awk 'NF { print $2; exit }' "$checksum_path")
checksum_target=${checksum_target#\*}
if [ "$checksum_target" != "$dump_name" ]; then
  printf 'Checksum file does not target the requested backup\n' >&2
  exit 65
fi
(
  cd "$dump_directory"
  sha256sum -c "$checksum_name"
)

restore_container=${RESTORE_CONTAINER_NAME:-vancine-restore-drill-$(date -u +%Y%m%dT%H%M%SZ)}
restore_image=${POSTGRES_RESTORE_IMAGE:-postgres:15-alpine}
restore_user=vancine_restore
restore_database=vancine_restore_drill

case "$restore_container" in
  ''|*[!a-zA-Z0-9_.-]*)
    printf 'RESTORE_CONTAINER_NAME contains unsupported characters\n' >&2
    exit 64
    ;;
esac

container_started=false
cleanup_restore_container() {
  if [ "$container_started" = true ]; then
    docker rm -f "$restore_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup_restore_container EXIT

docker run -d \
  --name "$restore_container" \
  --network none \
  -e POSTGRES_USER="$restore_user" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB="$restore_database" \
  "$restore_image" >/dev/null
container_started=true

ready=false
for _ in $(seq 1 30); do
  if docker exec "$restore_container" \
    pg_isready -U "$restore_user" -d "$restore_database" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  printf 'Temporary PostgreSQL did not become ready\n' >&2
  exit 70
fi

docker exec -i "$restore_container" pg_restore \
  -U "$restore_user" -d "$restore_database" \
  --no-owner --no-acl < "$dump_path"

for required_table in users tokens top_ups subscription_orders; do
  restored_table=$(docker exec "$restore_container" \
    psql -X -U "$restore_user" -d "$restore_database" -Atc \
    "select to_regclass('public.$required_table');")
  if [ -z "$restored_table" ]; then
    printf 'Restored database is missing required table: %s\n' "$required_table" >&2
    exit 65
  fi
done

for counted_table in users tokens top_ups subscription_orders; do
  restored_count=$(docker exec "$restore_container" \
    psql -X -U "$restore_user" -d "$restore_database" -Atc \
    "select count(*) from $counted_table;")
  case "$restored_count" in
    ''|*[!0-9]*)
      printf 'Invalid row count returned for restored table: %s\n' "$counted_table" >&2
      exit 65
      ;;
  esac
  printf 'RESTORE_TABLE_COUNT %s=%s\n' "$counted_table" "$restored_count"
done

printf 'Restore drill complete: image=%s backup=%s\n' "$restore_image" "$dump_name"
