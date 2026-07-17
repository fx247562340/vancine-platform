#!/bin/sh

set -eu

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
script_path=$(CDPATH= cd -- "$test_dir/.." && pwd)/restore-drill.sh
fixture_bin=$test_dir/fixtures/bin
test_run_root=$(mktemp -d "${TMPDIR:-/tmp}/vancine-restore-tests.XXXXXX")
dump_file=$test_run_root/vancine-test.dump
docker_log=$test_run_root/docker.log

printf '%s\n' 'FAKE_POSTGRES_CUSTOM_DUMP' > "$dump_file"
(
  cd "$test_run_root"
  sha256sum "$(basename "$dump_file")" > "$(basename "$dump_file").sha256"
)
: > "$docker_log"

PATH="$fixture_bin:$PATH" \
  FAKE_DOCKER_LOG="$docker_log" \
  RESTORE_CONTAINER_NAME=vancine-restore-test \
  "$script_path" "$dump_file"

grep -F 'run -d --name vancine-restore-test' "$docker_log" >/dev/null || {
  printf 'FAIL: restore drill must start an isolated PostgreSQL container\n' >&2
  exit 1
}
grep -F -- '--network none' "$docker_log" >/dev/null || {
  printf 'FAIL: restore drill container must have no Docker network\n' >&2
  exit 1
}
grep -F 'pg_restore' "$docker_log" >/dev/null || {
  printf 'FAIL: restore drill must run pg_restore\n' >&2
  exit 1
}
grep -F 'rm -f vancine-restore-test' "$docker_log" >/dev/null || {
  printf 'FAIL: restore drill must remove only its temporary container\n' >&2
  exit 1
}

printf '%s\n' 'CORRUPTED' >> "$dump_file"
: > "$docker_log"
if PATH="$fixture_bin:$PATH" \
  FAKE_DOCKER_LOG="$docker_log" \
  RESTORE_CONTAINER_NAME=vancine-restore-test-corrupt \
  "$script_path" "$dump_file"; then
  printf 'FAIL: checksum mismatch must stop the restore drill\n' >&2
  exit 1
fi
[ ! -s "$docker_log" ] || {
  printf 'FAIL: checksum mismatch must stop before Docker\n' >&2
  exit 1
}

different_dump=$test_run_root/different.dump
printf '%s\n' 'DIFFERENT_VALID_DUMP' > "$different_dump"
(
  cd "$test_run_root"
  sha256sum "$(basename "$different_dump")" > "$(basename "$dump_file").sha256"
)
: > "$docker_log"
if PATH="$fixture_bin:$PATH" \
  FAKE_DOCKER_LOG="$docker_log" \
  RESTORE_CONTAINER_NAME=vancine-restore-test-wrong-manifest \
  "$script_path" "$dump_file"; then
  printf 'FAIL: checksum manifest for another dump must be rejected\n' >&2
  exit 1
fi
[ ! -s "$docker_log" ] || {
  printf 'FAIL: wrong checksum target must stop before Docker\n' >&2
  exit 1
}

printf 'PASS: restore drill behavior tests\n'
printf 'Test artifacts retained at %s\n' "$test_run_root"
