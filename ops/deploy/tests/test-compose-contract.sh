#!/usr/bin/env bash
# Compose deployment contract test (public interface: real `docker compose`).
#
# Contracts under test:
#   1. Fail-fast: each production-required variable (SQL_DSN,
#      REDIS_CONN_STRING, REDIS_PASSWORD, POSTGRES_USER, POSTGRES_PASSWORD,
#      POSTGRES_DB, SESSION_SECRET) must make `docker compose config` exit
#      non-zero when UNSET and when explicitly EMPTY. `config` is Compose's
#      validation-only entry point and never builds or starts services, so a
#      rejection there necessarily precedes any build/up; the assertion
#      additionally requires stderr to name the rejected variable, proving
#      the failure is an interpolation validation error.
#   2. All required variables non-empty -> config succeeds.
#   3. Runtime VERSION contract: the vancine container receives
#      VERSION=${APP_VERSION:-}. APP_VERSION=v1.2.3 renders exactly
#      VERSION=v1.2.3; APP_VERSION absent renders VERSION="" (the Dockerfile
#      compile-time version is the in-binary fallback).
#   4. VANCINE_IMAGE_TAG local/default behavior: an explicit tag passes
#      through unchanged; absent -> vancine-custom:latest.
#   5. Value hygiene: a rejection message must never echo variable values.
#
# Safety: this test never reads the repository .env. It copies
# docker-compose.yml into a freshly-created retained mktemp directory, writes
# non-secret placeholder .env fixtures there per case, and renders compose
# config from that directory only. The fixture directory is RETAINED for
# post-mortem inspection and its path is printed at the end.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

passed=0
failed=0

pass () { passed=$((passed + 1)); printf 'PASS: %s\n' "$1"; }
fail () { failed=$((failed + 1)); printf 'FAIL: %s\n' "$1"; }
assert_eq () {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass "$label"
  else
    fail "$label (expected=[$expected] actual=[$actual])"
  fi
}

REQUIRED_VARS=(SQL_DSN REDIS_CONN_STRING REDIS_PASSWORD POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SESSION_SECRET)

# Deterministic scrub: none of the contract variables may leak from the
# invoking environment. Every case is driven solely by the fixture .env plus
# the explicit per-case assignments passed through compose().
for _v in "${REQUIRED_VARS[@]}" APP_VERSION VANCINE_IMAGE_TAG; do
  unset "$_v" 2>/dev/null || true
done
unset _v

FIXTURE_DIR=$(mktemp -d)
cp "$REPO_ROOT/docker-compose.yml" "$FIXTURE_DIR/docker-compose.yml"
FIXTURE_ENV="$FIXTURE_DIR/.env"
FIXTURE_STDERR="$FIXTURE_DIR/config-stderr.txt"

# write_env_case <mode> [VAR=value...]
#   mode = full          -> every required var set to a non-secret placeholder
#   mode = missing:<VAR> -> every required var except <VAR> (left unset)
#   mode = empty:<VAR>   -> every required var; <VAR> set explicitly empty
# Extra VAR=value arguments are appended verbatim (e.g. APP_VERSION,
# VANCINE_IMAGE_TAG), so every case is driven solely by the fixture .env,
# exactly like production deployments.
write_env_case () {
  local mode="$1" v
  shift
  {
    printf '# non-secret placeholders for compose-contract rendering\n'
    for v in "${REQUIRED_VARS[@]}"; do
      case "$mode" in
        full)
          printf '%s=placeholder-%s\n' "$v" "$v" ;;
        missing:*)
          [ "$v" = "${mode#missing:}" ] || printf '%s=placeholder-%s\n' "$v" "$v" ;;
        empty:*)
          if [ "$v" = "${mode#empty:}" ]; then
            printf '%s=\n' "$v"
          else
            printf '%s=placeholder-%s\n' "$v" "$v"
          fi ;;
        *)
          printf 'write_env_case: unknown mode %s\n' "$mode" >&2
          exit 64 ;;
      esac
    done
    for v in "$@"; do
      printf '%s\n' "$v"
    done
  } > "$FIXTURE_ENV"
}

# compose <args...>: run real docker compose against the fixture with all
# contract variables scrubbed from the invoking environment, so the fixture
# .env is the sole interpolation source.
compose () {
  env -u SQL_DSN -u REDIS_CONN_STRING -u REDIS_PASSWORD \
      -u POSTGRES_USER -u POSTGRES_PASSWORD -u POSTGRES_DB \
      -u SESSION_SECRET -u APP_VERSION -u VANCINE_IMAGE_TAG \
      docker compose -f "$FIXTURE_DIR/docker-compose.yml" --project-name vctest "$@"
}

image_of () { python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["vancine"]["image"])'; }
version_of () { python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]["vancine"]["environment"]; print(s.get("VERSION","__MISSING__"))'; }

# render_json <out>: render the full config JSON for the current fixture.
render_json () {
  local out="$1"
  if ! compose config --format json > "$out" 2> "$FIXTURE_STDERR"; then
    fail "render failed for $(basename "$out") (stderr=$(cat "$FIXTURE_STDERR"))"
    return 1
  fi
}

# config_ok <label>: `docker compose config` must accept the current fixture.
config_ok () {
  local label="$1" rc=0
  compose config --quiet > /dev/null 2> "$FIXTURE_STDERR" || rc=$?
  if [ "$rc" -eq 0 ]; then
    pass "$label"
  else
    fail "$label (rc=$rc stderr=$(cat "$FIXTURE_STDERR"))"
  fi
}

# config_fails <label> <var>: `docker compose config` must reject the current
# fixture with a non-zero exit, name the offending variable on stderr, and
# never echo any variable value. A rejection at `config` happens before any
# build/up because `config` only validates and renders.
config_fails () {
  local label="$1" var="$2" rc=0
  compose config --quiet > /dev/null 2> "$FIXTURE_STDERR" || rc=$?
  if [ "$rc" -eq 0 ]; then
    fail "$label (config unexpectedly succeeded)"
    return 0
  fi
  if ! grep -q "$var" "$FIXTURE_STDERR"; then
    fail "$label (rc=$rc but stderr does not name $var: $(cat "$FIXTURE_STDERR"))"
    return 0
  fi
  if grep -q 'placeholder-' "$FIXTURE_STDERR"; then
    fail "$label (stderr leaked a variable value)"
    return 0
  fi
  pass "$label"
}

# --- Case 1: all required variables provided non-empty -> config succeeds ---
write_env_case full
config_ok "Case 1: all required vars non-empty -> config succeeds"

# --- Case 2: explicit tag + APP_VERSION -> exact image and VERSION ---
write_env_case full APP_VERSION=v1.2.3 VANCINE_IMAGE_TAG=1.2.3-0123456789ab
if render_json "$FIXTURE_DIR/case-2.json"; then
  assert_eq "Case 2 image tag passes through" \
    "vancine-custom:1.2.3-0123456789ab" \
    "$(image_of < "$FIXTURE_DIR/case-2.json")"
  assert_eq "Case 2 VERSION env == APP_VERSION" \
    "v1.2.3" \
    "$(version_of < "$FIXTURE_DIR/case-2.json")"
fi

# --- Case 3: defaults -> latest tag + empty VERSION (compile-time fallback) ---
write_env_case full
if render_json "$FIXTURE_DIR/case-3.json"; then
  assert_eq "Case 3 image defaults to latest" \
    "vancine-custom:latest" \
    "$(image_of < "$FIXTURE_DIR/case-3.json")"
  assert_eq "Case 3 VERSION empty when APP_VERSION absent" \
    "" \
    "$(version_of < "$FIXTURE_DIR/case-3.json")"
fi

# --- Cases 4-5: each required variable missing / explicitly empty ---
for _v in "${REQUIRED_VARS[@]}"; do
  write_env_case "missing:$_v"
  config_fails "Case 4: $_v missing -> config rejected before build/up" "$_v"
  write_env_case "empty:$_v"
  config_fails "Case 5: $_v empty -> config rejected before build/up" "$_v"
done
unset _v

echo "compose-contract: passed=$passed failed=$failed"
echo "fixture retained at: $FIXTURE_DIR"
[ "$failed" -eq 0 ] && exit 0 || exit 1
