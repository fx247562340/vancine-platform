#!/bin/sh

set -eu

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
script_path=$(CDPATH= cd -- "$test_dir/.." && pwd)/backup-alert.sh
fixture_bin=$test_dir/fixtures/bin
test_run_root=$(mktemp -d "${TMPDIR:-/tmp}/vancine-backup-alert-tests.XXXXXX")
curl_log=$test_run_root/curl.log

: > "$curl_log"
PATH="$fixture_bin:$PATH" \
  FAKE_CURL_LOG="$curl_log" \
  BACKUP_FAILURE_URL=https://monitor.invalid/failure \
  "$script_path" daily
grep -F 'https://monitor.invalid/failure' "$curl_log" >/dev/null || {
  printf 'FAIL: failure monitor URL must be pinged\n' >&2
  exit 1
}

: > "$curl_log"
PATH="$fixture_bin:$PATH" \
  FAKE_CURL_LOG="$curl_log" \
  "$script_path" weekly
[ ! -s "$curl_log" ] || {
  printf 'FAIL: unset failure monitor must not invoke curl\n' >&2
  exit 1
}

if PATH="$fixture_bin:$PATH" "$script_path" monthly; then
  printf 'FAIL: invalid backup kind must fail\n' >&2
  exit 1
fi

printf 'PASS: backup failure alert tests\n'
printf 'Test artifacts retained at %s\n' "$test_run_root"
