#!/usr/bin/env bash
# Task 1: Compose image + runtime VERSION contract test.
#
# Safety: this test never writes to the repository root. It copies
# docker-compose.yml into a freshly-created retained mktemp directory, places
# a non-secret placeholder .env there, and renders compose config from that
# directory. The fixture directory is RETAINED for post-mortem inspection and
# its path is printed at the end.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

passed=0
failed=0

assert_eq () {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    printf 'FAIL: %s\n  expected=%s\n  actual=%s\n' "$label" "$expected" "$actual"
  fi
}

# Build a retained fixture directory and copy the compose file into it. No
# cleanup is performed; the path is printed at the end for inspection.
FIXTURE_DIR=$(mktemp -d)
cp "$REPO_ROOT/docker-compose.yml" "$FIXTURE_DIR/docker-compose.yml"
FIXTURE_ENV="$FIXTURE_DIR/.env"
{
  printf '# non-secret placeholders for compose-contract rendering\n'
  for v in REDIS_PASSWORD SESSION_SECRET SQL_DSN REDIS_CONN_STRING POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
    printf '%s=\n' "$v"
  done
} > "$FIXTURE_ENV"

render () {
  docker compose \
    -f "$FIXTURE_DIR/docker-compose.yml" \
    --project-name vctest \
    config --format json "$@"
}

image_of () { python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["vancine"]["image"])'; }
version_of () { python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]["vancine"]["environment"]; print(s.get("VERSION","__MISSING__"))'; }

# --- Case A: explicit production variables set ---
image_a=$(VANCINE_IMAGE_TAG=1.2.3-0123456789ab APP_VERSION=v1.2.3 render | image_of)
env_a=$(VANCINE_IMAGE_TAG=1.2.3-0123456789ab APP_VERSION=v1.2.3 render | version_of)

assert_eq "Case A image" "vancine-custom:1.2.3-0123456789ab" "$image_a"
assert_eq "Case A VERSION env" "v1.2.3" "$env_a"

# --- Case B: defaults -> latest + empty VERSION ---
image_b=$(render | image_of)
env_b=$(render | version_of)

assert_eq "Case B image (default)" "vancine-custom:latest" "$image_b"
assert_eq "Case B VERSION env (default)" "" "$env_b"

echo "compose-contract: passed=$passed failed=$failed"
echo "fixture retained at: $FIXTURE_DIR"
[ "$failed" -eq 0 ] && exit 0 || exit 1
