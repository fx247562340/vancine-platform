#!/bin/sh

set -eu

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
script_path=$(CDPATH= cd -- "$test_dir/.." && pwd)/postgres-backup.sh
fixture_bin=$test_dir/fixtures/bin
test_run_root=$(mktemp -d "${TMPDIR:-/tmp}/vancine-backup-tests.XXXXXX")

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "expected file: $1"
}

assert_not_file() {
  [ ! -f "$1" ] || fail "unexpected file: $1"
}

run_backup() {
  case_name=$1
  backup_kind=$2
  case_root=$test_run_root/$case_name
  mkdir -p "$case_root/backups"
  : > "$case_root/docker.log"
  : > "$case_root/curl.log"

  PATH="$fixture_bin:$PATH" \
    BACKUP_ROOT="$case_root/backups" \
    BACKUP_LOCK_FILE="$case_root/backup.lock" \
    FAKE_DOCKER_LOG="$case_root/docker.log" \
    FAKE_CURL_LOG="$case_root/curl.log" \
    FAKE_BACKUP_TIMESTAMP="${FAKE_BACKUP_TIMESTAMP:-20260717T070000Z}" \
    FAKE_DF_MODE="${FAKE_DF_MODE:-enough}" \
    FAKE_ARCHIVE_MODE="${FAKE_ARCHIVE_MODE:-complete}" \
    BACKUP_SUCCESS_URL="${BACKUP_SUCCESS_URL:-}" \
    "$script_path" "$backup_kind"
}

test_successful_backup_is_atomic_and_private() {
  run_backup success daily

  final_file=$test_run_root/success/backups/daily/vancine-db-20260717T070000Z.dump
  checksum_file=$final_file.sha256

  assert_file "$final_file"
  assert_file "$checksum_file"
  assert_not_file "$final_file.partial"
  [ "$(stat -f '%Lp' "$final_file")" = "600" ] || fail 'backup mode must be 600'
  [ "$(stat -f '%Lp' "$test_run_root/success/backups")" = "700" ] || fail 'backup root mode must be 700'
  [ "$(stat -f '%Lp' "$(dirname "$final_file")")" = "700" ] || fail 'backup directory mode must be 700'
  (cd "$(dirname "$final_file")" && sha256sum -c "$(basename "$checksum_file")") >/dev/null \
    || fail 'checksum must verify'
}

test_success_monitor_is_pinged_after_verification() {
  BACKUP_SUCCESS_URL=https://monitor.invalid/success run_backup success-monitor daily

  grep -F 'https://monitor.invalid/success' "$test_run_root/success-monitor/curl.log" >/dev/null \
    || fail 'success monitor must be pinged'
}

test_invalid_backup_kind_stops_before_docker() {
  case_root=$test_run_root/invalid-kind
  mkdir -p "$case_root/backups"
  : > "$case_root/docker.log"

  if PATH="$fixture_bin:$PATH" \
    BACKUP_ROOT="$case_root/backups" \
    BACKUP_LOCK_FILE="$case_root/backup.lock" \
    FAKE_DOCKER_LOG="$case_root/docker.log" \
    "$script_path" monthly; then
    fail 'invalid backup kind must fail'
  fi

  [ ! -s "$case_root/docker.log" ] || fail 'invalid kind must not invoke docker'
}

test_low_disk_space_stops_before_dump() {
  if FAKE_DF_MODE=low run_backup low-disk daily; then
    fail 'low disk space must fail'
  fi

  if grep -F 'pg_dump' "$test_run_root/low-disk/docker.log" >/dev/null; then
    fail 'low disk space must stop before pg_dump'
  fi
}

test_existing_backup_is_never_overwritten() {
  case_root=$test_run_root/existing-backup
  mkdir -p "$case_root/backups/daily"
  final_file=$case_root/backups/daily/vancine-db-20260717T070000Z.dump
  printf '%s\n' 'ORIGINAL_BACKUP' > "$final_file"
  : > "$case_root/docker.log"

  if PATH="$fixture_bin:$PATH" \
    BACKUP_ROOT="$case_root/backups" \
    BACKUP_LOCK_FILE="$case_root/backup.lock" \
    FAKE_DOCKER_LOG="$case_root/docker.log" \
    FAKE_BACKUP_TIMESTAMP=20260717T070000Z \
    "$script_path" daily; then
    fail 'existing backup path must stop the run'
  fi

  [ "$(cat "$final_file")" = 'ORIGINAL_BACKUP' ] || fail 'existing backup must remain unchanged'
  [ ! -s "$case_root/docker.log" ] || fail 'collision must stop before docker'
}

test_invalid_archive_is_preserved_as_failed() {
  if FAKE_ARCHIVE_MODE=missing_subscription_orders run_backup invalid-archive weekly; then
    fail 'archive missing a required table must fail'
  fi

  failed_file=$test_run_root/invalid-archive/backups/weekly/vancine-db-20260717T070000Z.dump.failed
  assert_file "$failed_file"
  assert_not_file "$test_run_root/invalid-archive/backups/weekly/vancine-db-20260717T070000Z.dump"
}

test_script_contains_no_deletion_command() {
  if grep -En '(^|[[:space:]])(rm|unlink)([[:space:]]|$)|-delete([[:space:]]|$)' "$script_path"; then
    fail 'backup script must not delete files'
  fi
}

test_successful_backup_is_atomic_and_private
test_success_monitor_is_pinged_after_verification
test_invalid_backup_kind_stops_before_docker
test_low_disk_space_stops_before_dump
test_existing_backup_is_never_overwritten
test_invalid_archive_is_preserved_as_failed
test_script_contains_no_deletion_command

printf 'PASS: postgres backup behavior tests\n'
printf 'Test artifacts retained at %s\n' "$test_run_root"
