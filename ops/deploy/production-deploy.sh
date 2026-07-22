#!/usr/bin/env bash
# Vancine authoritative production deployment orchestrator.
#
# Accepts exactly one full 40-character lowercase hex commit SHA. Performs
# preflight validation, runs the P0 predeploy backup, builds the immutable
# target image, replaces only the `vancine` application container, verifies
# health, and on failure rolls back to the prior application image/code only.
# PostgreSQL, Redis, volumes, images, backups, and worktrees are never touched.

set -Eeuo pipefail

if [ "${VANCINE_DEPLOY_TEST_MODE:-0}" != "1" ]; then
  [ "${BASH_VERSINFO[0]:-0}" -ge 4 ] || {
    echo "production-deploy requires bash 4+" >&2
    exit 64
  }
fi

# Restrict newly created state/backup files to the deploying user. Run the
# umask change in a subshell so the bare `umask` call never prints the prior
# value to the script's stdout and corrupts marker parsing.
_umask_previous=$(umask)
umask 077
unset _umask_previous

# ---- defaults (root-controlled; tests override via environment) ----
DEPLOY_REPO="${VANCINE_DEPLOY_REPO:-/opt/vancine-platform}"
DEPLOY_REMOTE="${VANCINE_DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${VANCINE_DEPLOY_BRANCH:-main}"
DEPLOY_STATE_DIR="${VANCINE_DEPLOY_STATE_DIR:-/var/lib/vancine-deploy}"
DEPLOY_LOCK_FILE="${VANCINE_DEPLOY_LOCK_FILE:-/run/lock/vancine-deploy.lock}"
DEPLOY_HEALTH_INTERNAL="${VANCINE_DEPLOY_HEALTH_INTERNAL:-http://127.0.0.1:3000/api/status}"
DEPLOY_HEALTH_PUBLIC="${VANCINE_DEPLOY_HEALTH_PUBLIC:-https://vancine.com/api/status}"
DEPLOY_HEALTH_ATTEMPTS="${VANCINE_DEPLOY_HEALTH_ATTEMPTS:-20}"
DEPLOY_HEALTH_INTERVAL="${VANCINE_DEPLOY_HEALTH_INTERVAL:-3}"
DEPLOY_BACKUP_SCRIPT="${VANCINE_DEPLOY_BACKUP_SCRIPT:-$DEPLOY_REPO/ops/backup/postgres-backup.sh}"

TARGET_SHA=""
TARGET_VERSION=""
CURRENT_VERSION=""
CHECKOUT_CHANGED=0
APP_REPLACED=0
PREV_SHA=""
PREV_VERSION=""
PREV_IMAGE_TAG=""
PREV_IMAGE_ID=""
TARGET_IMAGE_ID=""
# Most-specific outcome of the current attempt; recorded atomically on exit so
# a failure is never silently overwritten by a later success marker.
_DEPLOY_OUTCOME="DEPLOY_FAILED"
# Reentrance guard: on_error runs at most once (one rollback + one state record).
_ON_ERROR_ENTERED=0
# Set to 1 once prepare_state_dir has verified the state directory is safe.
_STATE_DIR_READY=0

validate_sha () {
  local sha="$1"
  if [ -z "$sha" ]; then die "missing deployment SHA"; fi
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    die "SHA must be exactly 40 lowercase hex characters: ${sha:-<empty>}"
  fi
}

validate_semver () {
  # Validate that the given version is bare MAJOR.MINOR.PATCH (no v/V prefix).
  local v="${1:-}"
  if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "VERSION must be bare numeric MAJOR.MINOR.PATCH (no v prefix), got: ${v:-<empty>}"
  fi
  # reject leading zeros (e.g. 01.0.0)
  local major minor patch
  IFS=. read -r major minor patch <<< "$v"
  for c in "$major" "$minor" "$patch"; do
    if [ "${#c}" -gt 1 ] && [[ "$c" == 0* ]]; then
      die "VERSION components must not have leading zeros: $v"
    fi
  done
}

normalize_version () {
  # Strip an optional leading "v" or "V" so API-form versions (v1.2.3) can
  # be compared as numeric SemVer. Used ONLY for comparing against current
  # running version (which the API reports with v prefix).
  local v="${1:-}"
  v="${v#v}"
  v="${v#V}"
  printf '%s' "$v"
}

semver_not_lower () {
  # returns 0 if candidate >= current, 1 otherwise
  local cand cur cmn cmp cpp czn czp czp2
  cand=$(normalize_version "$1")
  cur=$(normalize_version "$2")
  IFS=. read -r cmn cmp cpp <<< "$cand"
  IFS=. read -r czn czp czp2 <<< "$cur"
  if [ "$cmn" -gt "$czn" ]; then return 0; fi
  if [ "$cmn" -lt "$czn" ]; then return 1; fi
  if [ "$cmp" -gt "$czp" ]; then return 0; fi
  if [ "$cmp" -lt "$czp" ]; then return 1; fi
  if [ "$cpp" -lt "$czp2" ]; then return 1; fi
  return 0
}

# Portable path/permission inspection helpers (see install-production-access.sh
# for the detailed rationale: GNU stat -c vs BSD stat -f and why -c must be
# tried first on Linux).
#
# GNU/Linux:  stat -c '%a' returns mode, stat -f '%Lp' returns filesystem info
#             with exit 0 (the trap).  Always try -c first.
# BSD/macOS:  stat -f '%Lp' returns mode, stat -c is an illegal-option error.
#             The -c failure falls through to the -f branch.
#
# Mode is normalized to a canonical 4-digit octal string (e.g. 0700, 0750,
# 0640) for stable comparison regardless of platform quirks.

# get_mode <path>: print the 4-digit octal mode.  Returns 1 if the mode
# cannot be determined (caller must handle with `if !`).
get_mode () {
  local path="$1" raw=""
  # GNU form first.  The `if raw=$(...)` idiom keeps set -e from firing on
  # a failing stat; the exit code becomes the branch condition instead.
  if raw=$(stat -c '%a' "$path" 2>/dev/null); then
    if [[ "$raw" =~ ^[0-7]{3,4}$ ]]; then
      while [ "${#raw}" -lt 4 ]; do raw="0$raw"; done
      printf '%s' "$raw"
      return 0
    fi
  fi
  # BSD fallback.
  if raw=$(stat -f '%Lp' "$path" 2>/dev/null); then
    if [[ "$raw" =~ ^[0-7]{3,4}$ ]]; then
      while [ "${#raw}" -lt 4 ]; do raw="0$raw"; done
      printf '%s' "$raw"
      return 0
    fi
  fi
  return 1
}

# get_owner <path>: print the owning user name.  Returns 1 if the owner
# cannot be determined (caller must handle with `if !`).
get_owner () {
  local path="$1" raw=""
  if raw=$(stat -c '%U' "$path" 2>/dev/null); then
    if [ -n "$raw" ] && [[ "$raw" != *" "* ]]; then
      printf '%s' "$raw"
      return 0
    fi
  fi
  if raw=$(stat -f '%Su' "$path" 2>/dev/null); then
    if [ -n "$raw" ] && [[ "$raw" != *" "* ]]; then
      printf '%s' "$raw"
      return 0
    fi
  fi
  return 1
}

require_tools () {
  local missing=()
  for t in git docker curl python3 flock; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  [ "${#missing[@]}" -eq 0 ] || die "missing required tools: ${missing[*]}"
}

acquire_deploy_lock () {
  # File-descriptor-based lock via flock(1). The lock file is created if
  # absent and retained for audit. Releasing the lock only requires closing
  # the FD (automatic on process exit); no deletion ever occurs.
  mkdir -p "$(dirname "$DEPLOY_LOCK_FILE")"
  exec 19>"$DEPLOY_LOCK_FILE"
  if ! flock -n 19; then
    die "another Vancine deployment is already running ($DEPLOY_LOCK_FILE)"
  fi
  # FD 19 stays open for the lifetime of the orchestrator; closing the FD
  # (including on normal or abnormal exit) releases the flock automatically.
}

require_clean_tracked_tree () {
  cd "$DEPLOY_REPO"
  local tracked staged
  tracked=$({ git diff --name-only; git diff --cached --name-only; } | sort -u)
  if [ -n "$tracked" ]; then
    die "refusing to deploy with tracked or staged changes: $tracked"
  fi
}

fetch_and_validate_target () {
  cd "$DEPLOY_REPO"
  # Explicit refspec refreshes refs/remotes/<remote>/<branch> even if the
  # remote HEAD advertisement is stale. Never prune or delete refs.
  git fetch "$DEPLOY_REMOTE" "refs/heads/$DEPLOY_BRANCH:refs/remotes/$DEPLOY_REMOTE/$DEPLOY_BRANCH" --quiet
  if ! git cat-file -e "$TARGET_SHA^{commit}"; then
    die "commit not found: $TARGET_SHA"
  fi
  if ! git merge-base --is-ancestor "$TARGET_SHA" "$DEPLOY_REMOTE/$DEPLOY_BRANCH"; then
    die "target $TARGET_SHA is not an ancestor of $DEPLOY_REMOTE/$DEPLOY_BRANCH"
  fi
}

read_target_version () {
  cd "$DEPLOY_REPO"
  # Use the `if !` idiom (not `$(...) || true`) so a failing git show does not
  # trip the inherited ERR trap inside its subshell.
  if ! TARGET_VERSION=$(git show "$TARGET_SHA:VERSION" 2>/dev/null); then
    TARGET_VERSION=""
  fi
  [ -n "$TARGET_VERSION" ] || die "no VERSION file at $TARGET_SHA"
  validate_semver "$TARGET_VERSION"
}

read_current_status () {
  # Fail closed: if the current status endpoint is unreachable, returns
  # invalid JSON, reports success!=true, or has an invalid version, abort
  # the deployment. This prevents deploying on top of a broken baseline.
  local body ok
  body=$(curl -fsS --max-time 5 "$DEPLOY_HEALTH_INTERNAL" 2>/dev/null) || \
    die "current internal status unreachable: $DEPLOY_HEALTH_INTERNAL"
  [ -n "$body" ] || die "current internal status returned empty body"
  ok=$(printf '%s' "$body" | python3 -c 'import json,sys; print("true" if json.load(sys.stdin).get("success")==True else "false")' 2>/dev/null) || \
    die "current internal status invalid JSON"
  [ "$ok" = "true" ] || die "current internal status success!=true"
  CURRENT_VERSION=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null) || \
    die "current internal status: could not extract version"
  [ -n "$CURRENT_VERSION" ] || die "current internal status: version empty"
}

require_root_or_test () {
  if [ "${VANCINE_DEPLOY_TEST_MODE:-0}" = "1" ]; then return 0; fi
  [ "$(id -u)" -eq 0 ] || die "production-deploy must be executed as root"
}

parse_status () {
  # verify_status_url helper
  local url="$1"
  local body ok version
  body=$(curl -fsS --max-time 5 "$url" 2>/dev/null) || { echo "FAIL: $url unreachable"; return 1; }
  ok=$(printf '%s' "$body" | python3 -c 'import json,sys; print("true" if json.load(sys.stdin).get("success")==True else "false")' 2>/dev/null) || ok="false"
  version=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null) || version=""
  if [ "$ok" != "true" ]; then echo "FAIL: $url success!=true"; return 1; fi
  if [ -n "$2" ] && [ "$version" != "$2" ]; then
    printf 'FAIL: %s version expected=%s got=%s\n' "$url" "$2" "$version"
    return 1
  fi
  return 0
}

# ---- transaction steps ----
run_predeploy_backup () {
  # Fixed script path + separate predeploy argument. Never word-split a
  # command string. Each invocation appends to its own timestamped log so
  # historical logs are never truncated.
  local log="$DEPLOY_STATE_DIR/backup-predeploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  if ! "$DEPLOY_BACKUP_SCRIPT" predeploy >> "$log" 2>&1; then
    _DEPLOY_OUTCOME="BACKUP_FAILED"
    die "predeploy backup failed (log: $log)"
  fi
}

capture_previous_release () {
  cd "$DEPLOY_REPO"
  # (a) Record and validate the prior code SHA and its VERSION. Use `if`
  # idioms (not `$(...) || die`) so a failing command substitution does not
  # trip the inherited ERR trap inside its subshell.
  if ! PREV_SHA=$(git rev-parse HEAD 2>/dev/null); then
    die "could not read current HEAD"
  fi
  [ -n "$PREV_SHA" ] || die "prior SHA is empty"
  if ! PREV_VERSION=$(git show "$PREV_SHA:VERSION" 2>/dev/null); then
    PREV_VERSION=""
  fi
  [ -n "$PREV_VERSION" ] || die "prior VERSION is empty at $PREV_SHA"
  validate_semver "$PREV_VERSION"

  # (b) The running container's reported version (normalized) must equal the
  # prior VERSION. A mismatch means the checkout is out of sync with what is
  # actually running, so fail closed rather than capture a wrong baseline.
  local cur_norm
  cur_norm=$(normalize_version "$CURRENT_VERSION")
  [ "$cur_norm" = "$PREV_VERSION" ] || \
    die "version baseline mismatch: running=$cur_norm checkout=$PREV_VERSION"

  # (c) The prior image ID must be present and the image must actually exist.
  if ! PREV_IMAGE_ID=$(docker inspect -f '{{.Image}}' vancine 2>/dev/null); then
    PREV_IMAGE_ID=""
  fi
  [ -n "$PREV_IMAGE_ID" ] || die "prior image ID is empty (is the vancine container running?)"
  if ! docker image inspect "$PREV_IMAGE_ID" >/dev/null 2>&1; then
    die "prior image $PREV_IMAGE_ID does not exist"
  fi

  # (d) Build a unique rollback tag and check for collision using
  # `docker image inspect` (NOT git refs/tags). A collision is a hard failure;
  # we never overwrite an existing rollback tag.
  PREV_IMAGE_TAG="rollback-${PREV_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  if docker image inspect "vancine-custom:$PREV_IMAGE_TAG" >/dev/null 2>&1; then
    die "rollback tag collision: vancine-custom:$PREV_IMAGE_TAG already exists"
  fi

  # (e) Create the rollback tag on the old image and re-verify it resolves to
  # the same image ID, so rollback can rely on it later.
  if ! docker tag "$PREV_IMAGE_ID" "vancine-custom:$PREV_IMAGE_TAG" >/dev/null 2>&1; then
    die "failed to tag old image $PREV_IMAGE_ID as $PREV_IMAGE_TAG"
  fi
  local verify_id=""
  if ! verify_id=$(docker image inspect -f '{{.Id}}' "vancine-custom:$PREV_IMAGE_TAG" 2>/dev/null); then
    verify_id=""
  fi
  [ "$verify_id" = "$PREV_IMAGE_ID" ] || \
    die "rollback tag verification failed: tagged=$verify_id expected=$PREV_IMAGE_ID"
}

checkout_target () {
  cd "$DEPLOY_REPO"
  if [ "$TARGET_SHA" != "$PREV_SHA" ]; then
    git checkout --detach "$TARGET_SHA"
    CHECKOUT_CHANGED=1
  fi
}

validate_compose_config () {
  # Validate the Compose configuration with the deployment's immutable image
  # tag and runtime version BEFORE building or replacing anything. --quiet
  # suppresses the rendered config so no environment is leaked to output. A
  # failure aborts here; since checkout_target may already have run, die()
  # routes through on_error which restores the prior checkout.
  cd "$DEPLOY_REPO"
  local target_tag="$TARGET_VERSION-${TARGET_SHA:0:12}"
  if ! VANCINE_IMAGE_TAG="$target_tag" APP_VERSION="v$TARGET_VERSION" \
      docker compose config --quiet >/dev/null 2>&1; then
    _DEPLOY_OUTCOME="DEPLOY_FAILED"
    die "docker compose config validation failed for image tag $target_tag"
  fi
}

verify_image_labels () {
  # Confirm an image's OCI revision/version labels match the deployment target
  # EXACTLY. Missing or mismatched labels fail closed so a stale or foreign
  # image can never be reused under an immutable tag.
  local ref="$1" rev="" ver=""
  if ! rev=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref" 2>/dev/null); then
    rev=""
  fi
  if ! ver=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$ref" 2>/dev/null); then
    ver=""
  fi
  [ "$rev" = "$TARGET_SHA" ] || \
    die "image $ref revision label mismatch: got=${rev:-<empty>} expected=$TARGET_SHA"
  [ "$ver" = "$TARGET_VERSION" ] || \
    die "image $ref version label mismatch: got=${ver:-<empty>} expected=$TARGET_VERSION"
}

build_target_image () {
  cd "$DEPLOY_REPO"
  export VANCINE_IMAGE_TAG="$TARGET_VERSION-${TARGET_SHA:0:12}"
  export APP_VERSION="v$TARGET_VERSION"
  local target_ref="vancine-custom:$VANCINE_IMAGE_TAG"
  if docker image inspect "$target_ref" >/dev/null 2>&1; then
    # Immutable tag already exists: reuse ONLY if its labels match the target
    # exactly; otherwise fail closed (never rebuild over an existing tag).
    verify_image_labels "$target_ref"
    if ! TARGET_IMAGE_ID=$(docker image inspect -f '{{.Id}}' "$target_ref" 2>/dev/null); then
      die "failed to inspect existing image $target_ref"
    fi
  else
    # Build with explicit provenance build args so the runtime image carries
    # the OCI revision/version labels.
    docker compose build \
      --build-arg TARGET_SHA="$TARGET_SHA" \
      --build-arg TARGET_VERSION="$TARGET_VERSION" \
      vancine || { _DEPLOY_OUTCOME="BUILD_FAILED"; die "docker compose build failed"; }
    if ! TARGET_IMAGE_ID=$(docker image inspect -f '{{.Id}}' "$target_ref" 2>/dev/null); then
      die "failed to inspect built image $target_ref"
    fi
    # Re-verify the freshly built image's labels and ID.
    verify_image_labels "$target_ref"
  fi
  [ -n "$TARGET_IMAGE_ID" ] || die "target image ID is empty for $target_ref"
  local be="$DEPLOY_STATE_DIR/build.env"
  [ -L "$be" ] && die "build.env must not be a symlink: $be"
  printf 'VANCINE_IMAGE_TAG=%s\nAPP_VERSION=%s\nTARGET_IMAGE_ID=%s\n' \
    "$VANCINE_IMAGE_TAG" "$APP_VERSION" "$TARGET_IMAGE_ID" > "$be"
}

replace_application () {
  cd "$DEPLOY_REPO"
  # shellcheck disable=SC1091
  source "$DEPLOY_STATE_DIR/build.env"
  # Mark APP_REPLACED=1 BEFORE compose up so that a partial replacement
  # failure still triggers the rollback path.
  APP_REPLACED=1
  docker compose up -d --no-deps --force-recreate vancine || {
    die "docker compose replace failed"
  }
}

wait_for_container_health () {
  local i status
  for i in $(seq 1 "$DEPLOY_HEALTH_ATTEMPTS"); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' vancine 2>/dev/null) || status="missing"
    case "$status" in
      healthy) return 0 ;;
      unhealthy) die "container health=unhealthy" ;;
      missing) die "container missing" ;;
    esac
    sleep "$DEPLOY_HEALTH_INTERVAL"
  done
  die "container health timed out after $((DEPLOY_HEALTH_ATTEMPTS * DEPLOY_HEALTH_INTERVAL))s"
}

verify_running_image () {
  # Verify the running container's actual image ID matches the built target
  # image ID, not just the Config.Image tag string.
  local running_id
  running_id=$(docker inspect -f '{{.Image}}' vancine 2>/dev/null) || \
    die "could not inspect running container image ID"
  [ -n "$TARGET_IMAGE_ID" ] && [ "$running_id" = "$TARGET_IMAGE_ID" ] || \
    die "running image ID mismatch: running=$running_id expected=$TARGET_IMAGE_ID"
}

prepare_state_dir () {
  # Verify and harden the state directory BEFORE any state, backup log, or
  # build.env write. Rejects symlinks; enforces root:root 0700 in production
  # (test mode skips root ownership but still requires non-symlink + 0700).
  # Also validates any existing state.json is valid JSON + an object, failing
  # closed (never overwriting a corrupt file) so audit evidence is preserved.
  local d="$DEPLOY_STATE_DIR"
  [ -L "$d" ] && die "state directory must not be a symlink: $d"
  if [ ! -d "$d" ]; then
    mkdir -p "$d" || die "failed to create state directory: $d"
  fi
  [ -d "$d" ] || die "state path is not a directory: $d"
  chmod 0700 "$d" || die "failed to chmod state directory 0700: $d"
  # Production: verify root ownership.  Test mode skips ownership (tests run
  # as non-root and cannot chown), but mode is still verified.
  if [ "${VANCINE_DEPLOY_TEST_MODE:-0}" != "1" ]; then
    chown root:root "$d" || die "failed to chown state directory root:root: $d"
    local owner
    if ! owner=$(get_owner "$d"); then die "cannot determine state directory owner: $d"; fi
    if [ "$owner" != "root" ]; then die "state directory not root-owned: $d (owner=${owner:-unknown})"; fi
  fi
  local perms
  if ! perms=$(get_mode "$d"); then die "cannot determine state directory mode: $d"; fi
  if [ "$perms" != "0700" ]; then die "state directory mode is not 0700: $d (mode=${perms:-empty})"; fi
  # state.json must not be a symlink; if present it must be valid JSON + object.
  # Harden it to 0600 (root:root in production) and re-verify the mode.
  local sf="$d/state.json"
  [ -L "$sf" ] && die "state.json must not be a symlink: $sf"
  if [ -f "$sf" ]; then
    if ! python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d,dict)' "$sf" 2>/dev/null; then
      die "existing state.json is corrupt (invalid JSON or not an object), preserving for audit: $sf"
    fi
    chmod 0600 "$sf" || die "failed to chmod state.json 0600: $sf"
    if [ "${VANCINE_DEPLOY_TEST_MODE:-0}" != "1" ]; then
      chown root:root "$sf" || die "failed to chown state.json root:root: $sf"
      local sf_owner
      if ! sf_owner=$(get_owner "$sf"); then die "cannot determine state.json owner: $sf"; fi
      if [ "$sf_owner" != "root" ]; then die "state.json not root-owned: $sf (owner=${sf_owner:-unknown})"; fi
    fi
    local sf_perms
    if ! sf_perms=$(get_mode "$sf"); then die "cannot determine state.json mode: $sf"; fi
    if [ "$sf_perms" != "0600" ]; then die "state.json mode is not 0600: $sf (mode=${sf_perms:-empty})"; fi
  fi
  _STATE_DIR_READY=1
}

record_state () {
  # Atomically record deployment state. $1 is the outcome of the current
  # attempt: BACKUP_FAILED | BUILD_FAILED | DEPLOY_FAILED | ROLLBACK_OK |
  # ROLLBACK_FAILED | DEPLOY_OK.
  #
  # The state file (0600) keeps three sections:
  #   last_attempt       - this attempt's SHA/version/outcome/timestamp
  #   current_successful - the last fully successful deployment (preserved
  #                        across failed attempts so a failure never erases the
  #                        known-good baseline)
  #   prior_rollback     - the prior release captured for rollback
  # No credentials, HTTP response bodies, or environment variables are ever
  # written, and no failed candidate file is deleted. A corrupt existing
  # state.json is NEVER overwritten with an empty object (fail closed).
  local outcome="$1"
  local sf="$DEPLOY_STATE_DIR/state.json"
  [ -L "$sf" ] && return 1
  # Test hook: simulate a state-write failure (no Python traceback on stderr).
  if [ "${VANCINE_DEPLOY_STATE_WRITE_FAIL:-0}" = "1" ]; then
    return 1
  fi
  python3 - "$sf" "$outcome" "$TARGET_SHA" "$TARGET_VERSION" \
      "${VANCINE_IMAGE_TAG:-}" "$PREV_SHA" "$PREV_VERSION" "$PREV_IMAGE_TAG" \
      "$PREV_IMAGE_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" <<'PY'
import json, os, sys
(state_file, outcome, tsha, tver, ttag,
 psha, pver, ptag, pid, now) = sys.argv[1:11]
state = {}
if os.path.exists(state_file):
    try:
        with open(state_file) as f:
            state = json.load(f)
        if not isinstance(state, dict):
            raise ValueError("not an object")
    except Exception:
        # Corrupt state.json: NEVER overwrite. Fail closed (leave the file
        # intact for audit) by aborting without writing.
        sys.exit(2)
state["last_attempt"] = {
    "sha": tsha, "version": tver, "outcome": outcome, "at": now,
}
if outcome == "DEPLOY_OK":
    state["current_successful"] = {
        "sha": tsha, "version": tver, "image_tag": ttag, "at": now,
    }
if psha:
    state["prior_rollback"] = {
        "sha": psha, "version": pver, "image_tag": ptag,
        "image_id": pid, "at": now,
    }
# Same-directory unique temp file + atomic rename. On failure the temp is
# retained (never deleted) for diagnosis.
tmp = "%s.tmp.%d" % (state_file, os.getpid())
with open(tmp, "w") as f:
    json.dump(state, f, indent=2)
os.chmod(tmp, 0o600)
os.rename(tmp, state_file)
PY
}

restore_previous_checkout () {
  # Restore the prior code checkout. No `|| true`: a restore failure is an
  # explicit DEPLOY_FAILED. The original failure marker was already printed by
  # the caller (die / on_error), so the original failure semantics are
  # preserved; this adds a second marker for the restore failure. We do NOT
  # call die() here to avoid recursing back into on_error.
  cd "$DEPLOY_REPO"
  if [ "$CHECKOUT_CHANGED" = "1" ] && [ -n "$PREV_SHA" ]; then
    if ! git checkout --detach "$PREV_SHA" 2>/dev/null; then
      printf 'DEPLOY_FAILED: could not restore prior checkout to %s\n' "$PREV_SHA" >&2
      _DEPLOY_FAILED_PRINTED=1
    fi
  fi
  CHECKOUT_CHANGED=0
}

rollback_application () {
  echo "ROLLBACK_START"
  # Disable error trap during rollback to avoid recursion.
  trap - ERR
  local rollback_ok=1
  # 0. cd to deploy repo. Failure here means ROLLBACK_FAILED.
  if ! cd "$DEPLOY_REPO" 2>/dev/null; then
    echo "ROLLBACK_FAILED: could not cd to $DEPLOY_REPO"
    rollback_ok=0
  fi
  # 1. Checkout back to the prior code SHA. Failure here means ROLLBACK_FAILED.
  if [ "$rollback_ok" = "1" ] && [ "$CHECKOUT_CHANGED" = "1" ] && [ -n "$PREV_SHA" ]; then
    if ! git checkout --detach "$PREV_SHA" 2>/dev/null; then
      echo "ROLLBACK_FAILED: could not checkout prior SHA $PREV_SHA"
      rollback_ok=0
    fi
  fi
  # 2. Recreate only vancine with the prior image tag and version explicitly.
  if [ "$rollback_ok" = "1" ]; then
    if [ -z "$PREV_IMAGE_TAG" ] || [ -z "$PREV_VERSION" ]; then
      echo "ROLLBACK_FAILED: missing prior image tag or version"
      rollback_ok=0
    else
      if ! VANCINE_IMAGE_TAG="$PREV_IMAGE_TAG" APP_VERSION="v$PREV_VERSION" \
          docker compose up -d --no-deps --force-recreate vancine >/dev/null 2>&1; then
        echo "ROLLBACK_FAILED: docker compose up with old tag failed"
        rollback_ok=0
      fi
    fi
  fi
  # 3. Wait for Docker healthy.
  if [ "$rollback_ok" = "1" ]; then
    local i status
    local rb_healthy=0
    for i in $(seq 1 "$DEPLOY_HEALTH_ATTEMPTS"); do
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' vancine 2>/dev/null) || status="missing"
      case "$status" in
        healthy) rb_healthy=1; break ;;
        unhealthy|missing) break ;;
      esac
      sleep "$DEPLOY_HEALTH_INTERVAL"
    done
    if [ "$rb_healthy" != "1" ]; then
      echo "ROLLBACK_FAILED: container not healthy after rollback (status=$status)"
      rollback_ok=0
    fi
  fi
  # 4. Internal and public health must return the OLD version.
  if [ "$rollback_ok" = "1" ]; then
    if ! parse_status "$DEPLOY_HEALTH_INTERNAL" "v$PREV_VERSION" >/dev/null 2>&1; then
      echo "ROLLBACK_FAILED: internal health does not match old version v$PREV_VERSION"
      rollback_ok=0
    elif ! parse_status "$DEPLOY_HEALTH_PUBLIC" "v$PREV_VERSION" >/dev/null 2>&1; then
      echo "ROLLBACK_FAILED: public health does not match old version v$PREV_VERSION"
      rollback_ok=0
    fi
  fi
  # 5. Running image ID must equal PREV_IMAGE_ID.
  if [ "$rollback_ok" = "1" ] && [ -n "$PREV_IMAGE_ID" ]; then
    local running_id
    running_id=$(docker inspect -f '{{.Image}}' vancine 2>/dev/null) || running_id=""
    if [ "$running_id" != "$PREV_IMAGE_ID" ]; then
      echo "ROLLBACK_FAILED: running image ID $running_id != prior $PREV_IMAGE_ID"
      rollback_ok=0
    fi
  fi
  if [ "$rollback_ok" = "1" ]; then
    _DEPLOY_OUTCOME="ROLLBACK_OK"
    echo "ROLLBACK_OK"
  else
    _DEPLOY_OUTCOME="ROLLBACK_FAILED"
    echo "ROLLBACK_FAILED"
  fi
  CHECKOUT_CHANGED=0
  APP_REPLACED=0
}

on_error () {
  # Reentrance guard: on_error runs at most once, guaranteeing exactly one
  # rollback and one state record even if multiple failures fire.
  if [ "${_ON_ERROR_ENTERED:-0}" = "1" ]; then
    return 0
  fi
  _ON_ERROR_ENTERED=1
  # Disable the ERR trap immediately so failures inside rollback/state
  # recording cannot recurse back into on_error.
  trap - ERR

  if [ "${_DEPLOY_FAILED_PRINTED:-0}" != "1" ]; then
    printf 'DEPLOY_FAILED: unexpected error at line %s: %s\n' "${LINENO:-?}" "${BASH_COMMAND:-?}" >&2
  fi
  if [ "$APP_REPLACED" = "1" ]; then
    rollback_application
  elif [ "$CHECKOUT_CHANGED" = "1" ]; then
    restore_previous_checkout
  fi
  # Record the final outcome only if the state directory is ready. A
  # record_state failure here is terminal but non-recursive: emit a single
  # STATE_RECORD_FAILED marker (no Python traceback) and keep the original
  # non-zero exit code.
  if [ "${_STATE_DIR_READY:-0}" = "1" ]; then
    if ! record_state "${_DEPLOY_OUTCOME:-DEPLOY_FAILED}" 2>/dev/null; then
      printf 'STATE_RECORD_FAILED: state write failed (outcome=%s)\n' "${_DEPLOY_OUTCOME:-DEPLOY_FAILED}" >&2
    fi
  else
    printf 'STATE_RECORD_FAILED: state directory not ready (outcome=%s)\n' "${_DEPLOY_OUTCOME:-DEPLOY_FAILED}" >&2
  fi
  exit 1
}

die () {
  # Print the failure marker, then route through on_error so an error after
  # application replacement still triggers exactly one rollback attempt.
  _DEPLOY_FAILED_PRINTED=1
  printf 'DEPLOY_FAILED: %s\n' "$*" >&2
  on_error
}

# ---- main ----
# Require EXACTLY one argument: the full target commit SHA.
[ $# -eq 1 ] || die "usage: $(basename "$0") <40-character commit SHA>"
TARGET_SHA="$1"

# Install the ERR trap early so any set -e failure leaves a DEPLOY_FAILED
# marker instead of exiting silently. Rollback logic is a no-op until state
# flags are set during the transaction.
trap on_error ERR

require_root_or_test
validate_sha "$TARGET_SHA"
require_tools
require_clean_tracked_tree
acquire_deploy_lock
fetch_and_validate_target
read_target_version
read_current_status
if [ -n "$CURRENT_VERSION" ]; then
  # The API reports version with a v prefix (e.g. v1.2.3). Normalize before
  # validating and comparing. TARGET_VERSION must be bare (validated above).
  cur_normalized=$(normalize_version "$CURRENT_VERSION")
  validate_semver "$cur_normalized"
  if ! semver_not_lower "$TARGET_VERSION" "$cur_normalized"; then
    die "refusing version downgrade: current=$cur_normalized target=$TARGET_VERSION"
  fi
fi

# Prepare (and validate) the root-only state directory BEFORE any state, backup
# log, or build.env write. This also validates any existing state.json.
prepare_state_dir

run_predeploy_backup
capture_previous_release
checkout_target
validate_compose_config
build_target_image
replace_application
wait_for_container_health
parse_status "$DEPLOY_HEALTH_INTERNAL" "v$TARGET_VERSION" || die "internal health gate failed"
parse_status "$DEPLOY_HEALTH_PUBLIC" "v$TARGET_VERSION" || die "public health gate failed"
verify_running_image
_DEPLOY_OUTCOME="DEPLOY_OK"
# Final state write. If this fails, set -e fires the ERR trap (still active
# here) -> on_error, which rolls back the (already-replaced) application once.
# stderr is suppressed so no Python traceback leaks; the exit code propagates.
record_state "DEPLOY_OK" 2>/dev/null
trap - ERR
echo "DEPLOY_OK sha=$TARGET_SHA version=v$TARGET_VERSION image=vancine-custom:$VANCINE_IMAGE_TAG"
exit 0
