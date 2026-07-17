#!/usr/bin/env bash

set -Eeuo pipefail

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_script=$(CDPATH= cd -- "$test_dir/.." && pwd)/postgres-backup.sh
restore_script=$(CDPATH= cd -- "$test_dir/.." && pwd)/restore-drill.sh
test_run_root=$(mktemp -d "${TMPDIR:-/tmp}/vancine-backup-integration.XXXXXX")
source_container=vancine-backup-source-$$
restore_container=vancine-backup-restore-$$
source_container_started=false

cleanup_containers() {
  if [ "$source_container_started" = true ]; then
    docker rm -f "$source_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup_containers EXIT

docker run -d \
  --name "$source_container" \
  --network none \
  -e POSTGRES_USER=root \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=new-api \
  postgres:15 >/dev/null
source_container_started=true

source_ready=false
for _ in $(seq 1 30); do
  if docker exec "$source_container" pg_isready -U root -d new-api >/dev/null 2>&1; then
    source_ready=true
    break
  fi
  sleep 1
done
[ "$source_ready" = true ] || {
  printf 'FAIL: source PostgreSQL did not become ready\n' >&2
  exit 1
}

docker exec -i "$source_container" psql -X -U root -d new-api <<'SQL'
create table users (id bigint primary key, username text not null);
create table tokens (id bigint primary key, user_id bigint not null);
create table top_ups (id bigint primary key, user_id bigint not null, amount numeric not null);
create table subscription_orders (id bigint primary key, user_id bigint not null, status text not null);
insert into users values (1, 'integration-user');
insert into tokens values (1, 1);
insert into top_ups values (1, 1, 10);
insert into subscription_orders values (1, 1, 'paid');
SQL

PATH="$test_dir/fixtures/flock-bin:$PATH" \
  BACKUP_ROOT="$test_run_root/backups" \
  BACKUP_LOCK_FILE="$test_run_root/vancine-backup.lock" \
  POSTGRES_CONTAINER="$source_container" \
  POSTGRES_USER=root \
  POSTGRES_DB=new-api \
  "$backup_script" manual

dump_file=$(find "$test_run_root/backups/manual" -type f -name '*.dump' -print)
[ -n "$dump_file" ] || {
  printf 'FAIL: integration backup did not create a dump\n' >&2
  exit 1
}

RESTORE_CONTAINER_NAME="$restore_container" \
  POSTGRES_RESTORE_IMAGE=postgres:15 \
  "$restore_script" "$dump_file"

printf 'PASS: PostgreSQL 15 backup and isolated restore integration test\n'
printf 'Integration backup retained at %s\n' "$dump_file"
