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

mode_of() {
  if stat -f '%Lp' "$1" 2>/dev/null; then
    return
  fi
  stat -c '%a' "$1"
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
    FAKE_FLOCK_MODE="${FAKE_FLOCK_MODE:-available}" \
    BACKUP_DAILY_SUCCESS_URL="${BACKUP_DAILY_SUCCESS_URL:-}" \
    BACKUP_WEEKLY_SUCCESS_URL="${BACKUP_WEEKLY_SUCCESS_URL:-}" \
    BACKUP_PREDEPLOY_SUCCESS_URL="${BACKUP_PREDEPLOY_SUCCESS_URL:-}" \
    BACKUP_MANUAL_SUCCESS_URL="${BACKUP_MANUAL_SUCCESS_URL:-}" \
    "$script_path" "$backup_kind"
}

test_successful_backup_is_atomic_and_private() {
  run_backup success daily

  final_file=$test_run_root/success/backups/daily/vancine-db-20260717T070000Z.dump
  checksum_file=$final_file.sha256

  assert_file "$final_file"
  assert_file "$checksum_file"
  assert_not_file "$final_file.partial"
  [ "$(mode_of "$final_file")" = "600" ] || fail 'backup mode must be 600'
  [ "$(mode_of "$test_run_root/success/backups")" = "700" ] || fail 'backup root mode must be 700'
  [ "$(mode_of "$(dirname "$final_file")")" = "700" ] || fail 'backup directory mode must be 700'
  (cd "$(dirname "$final_file")" && sha256sum -c "$(basename "$checksum_file")") >/dev/null \
    || fail 'checksum must verify'
}

test_success_monitor_is_pinged_after_verification() {
  BACKUP_DAILY_SUCCESS_URL=https://monitor.invalid/daily-success \
    run_backup success-monitor-daily daily
  BACKUP_WEEKLY_SUCCESS_URL=https://monitor.invalid/weekly-success \
    run_backup success-monitor-weekly weekly

  grep -F 'https://monitor.invalid/daily-success' \
    "$test_run_root/success-monitor-daily/curl.log" >/dev/null \
    || fail 'daily success monitor must be pinged'
  grep -F 'https://monitor.invalid/weekly-success' \
    "$test_run_root/success-monitor-weekly/curl.log" >/dev/null \
    || fail 'weekly success monitor must be pinged independently'
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

test_existing_shared_lock_directory_keeps_its_mode() {
  case_root=$test_run_root/shared-lock-directory
  mkdir -p "$case_root/backups" "$case_root/shared-locks"
  chmod 755 "$case_root/shared-locks"
  : > "$case_root/docker.log"

  PATH="$fixture_bin:$PATH" \
    BACKUP_ROOT="$case_root/backups" \
    BACKUP_LOCK_FILE="$case_root/shared-locks/vancine-backup.lock" \
    FAKE_DOCKER_LOG="$case_root/docker.log" \
    FAKE_BACKUP_TIMESTAMP=20260717T071000Z \
    "$script_path" daily >/dev/null

  [ "$(mode_of "$case_root/shared-locks")" = "755" ] \
    || fail 'existing shared lock directory mode must remain unchanged'
}

test_busy_lock_stops_before_docker() {
  if FAKE_FLOCK_MODE=busy run_backup busy-lock daily; then
    fail 'busy backup lock must fail'
  fi

  [ ! -s "$test_run_root/busy-lock/docker.log" ] \
    || fail 'busy lock must stop before docker'
  [ ! -d "$test_run_root/busy-lock/backups/daily" ] \
    || [ -z "$(find "$test_run_root/busy-lock/backups/daily" -type f -print)" ] \
    || fail 'busy lock must not create backup artifacts'
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
test_existing_shared_lock_directory_keeps_its_mode
test_busy_lock_stops_before_docker
test_invalid_archive_is_preserved_as_failed
test_script_contains_no_deletion_command

printf 'PASS: postgres backup behavior tests\n'
printf 'Test artifacts retained at %s\n' "$test_run_root"
