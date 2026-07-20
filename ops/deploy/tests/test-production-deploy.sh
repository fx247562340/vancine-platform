#!/usr/bin/env bash
# Task 2 + 3: offline fake-command behavior tests for production-deploy.sh.
# Uses a real throwaway git repo plus PATH stubs for git, docker, curl, and
# the predeploy backup. VANCINE_DEPLOY_TEST_MODE=1 allows non-root execution.
#
# Each case recreates a fresh repo and fresh stubs so leftover state from a
# prior success cannot mask the following case.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && printf '%s\n' "$PWD")
ORCHESTRATOR="$REPO_ROOT/ops/deploy/production-deploy.sh"

PASSED=0
FAILED=0
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }

# Read a dotted field from the orchestrator's state.json, e.g.
#   state_field last_attempt.outcome
state_field () {
  python3 -c '
import json,sys
try:
    d=json.load(open(sys.argv[1]))
except Exception:
    print(""); sys.exit(0)
for k in sys.argv[2].split("."):
    d=d.get(k,{}) if isinstance(d,dict) else {}
print("" if isinstance(d,(dict,list)) else d)
' "$STATE_DIR/state.json" "$1" 2>/dev/null
}

# Retained fixture directories created during this test. Never deleted here;
# the OS cleans /tmp. The paths are printed at the end for inspection.
FIXTURE_DIRS=()
register_fixture () { FIXTURE_DIRS+=("$1"); }
print_fixtures () {
  if [ "${#FIXTURE_DIRS[@]}" -gt 0 ]; then
    echo "test-production-deploy fixtures retained at:"
    for d in "${FIXTURE_DIRS[@]}"; do echo "  $d"; done
  fi
}

guard_forbidden_commands () {
  local script="$1"
  local bad
  bad=$(grep -nE 'reset --hard|git clean|docker compose down|docker (system|image|volume) prune|docker rmi|volume rm|pg_restore' "$script" 2>/dev/null || true)
  if [ -n "$bad" ]; then
    echo "FAIL guard: forbidden operations present in $script:"
    echo "$bad"
    return 1
  fi
  return 0
}

GIT_LOG="" DOCKER_LOG="" BACKUP_LOG="" REPO="" STATE_DIR="" LOCK_FILE="" FAKEBIN=""

setup_repo () {
  local pv="$1"
  shift || true
  local uv="${1:-}"
  # REPO is a freshly-created $STATE_DIR/repo per case; it should not exist
  # when setup_repo runs. Guard against accidental reuse without deleting.
  if [ -d "$REPO" ]; then
    echo "setup_repo: REPO already exists (state not fresh): $REPO" >&2
    return 1
  fi
  mkdir -p "$REPO"
  (
    set -Eeuo pipefail
    cd "$REPO"
    git init -q -b main
    git config user.email t@t
    git config user.name t
    printf '%s' "$pv" > VERSION
    git add VERSION
    git commit -q -m "v$pv base"
    if [ -n "$uv" ]; then
      printf '%s' "$uv" > VERSION
      git add VERSION
      git commit -q -m "v$uv"
    fi
    # Make origin/main resolvable so ancestry checks work without network.
    head_ref=$(git rev-parse HEAD)
    mkdir -p "$REPO/.git/refs/remotes/origin"
    printf '%s\n' "$head_ref" > "$REPO/.git/refs/remotes/origin/main"
    git config remote.origin.url "$REPO"
    git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
  )
}

setup_git_stub () {
  : > "$GIT_LOG"
  # Resolve the real git ONCE before we shadow it with the stub, so that calls
  # inside the stub's body cannot recurse into the stub itself.
  real_git=$(/usr/bin/env PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v "$FAKEBIN" | tr '\n' ':')" command -v git 2>/dev/null || printf '/usr/bin/git')
  [ -z "$real_git" ] && real_git=/usr/bin/git
  cat > "$FAKEBIN/git" <<EOF
#!/usr/bin/env bash
REAL_GIT="$real_git"
printf '%s\n' "git \$*" >> "$GIT_LOG"
case "\$1" in
  fetch) exit 0 ;;
  cat-file)
    [ "\$2" = "-e" ] || { exit 1; }
    cd "$REPO"; "\$REAL_GIT" cat-file -e "\${3:-}^{commit}" && exit 0 || exit 1
    ;;
  merge-base)
    cd "$REPO"; "\$REAL_GIT" merge-base --is-ancestor "\$3" origin/main && exit 0 || exit 1
    ;;
  show)
    # Pass the "<sha>:<path>" argument straight through unparsed so hex SHA
    # handling is identical to the real binary.
    cd "$REPO" || exit 1
    "\$REAL_GIT" show "\$2" 2>/dev/null && exit 0 || exit 1
    ;;
  rev-parse)
    # --verify checks for a rollback tag existence; pretend none exists so the
    # orchestrator uniqueness scheme is exercised. Other forms (rev-parse HEAD)
    # delegate to the real git on the fake repo.
    if [ "\$2" = "--verify" ]; then exit 1; fi
    cd "$REPO"; "\$REAL_GIT" rev-parse HEAD; exit 0
    ;;
  checkout)
    [ "\$2" = "--detach" ] || { exit 1; }
    # Optional restore-failure simulation: the first checkout (checkout_target)
    # succeeds; subsequent checkouts (restore_previous_checkout) fail when
    # GIT_RESTORE_FAIL=1.
    cf="\${GIT_CHECKOUT_COUNT_FILE:-}"
    if [ -n "\$cf" ]; then
      n=\$(cat "\$cf" 2>/dev/null || echo 0)
      n=\$((n+1))
      printf '%s' "\$n" > "\$cf"
      if [ "\${GIT_RESTORE_FAIL:-0}" = "1" ] && [ "\$n" -gt 1 ]; then exit 1; fi
    fi
    exit 0
    ;;
  status) exit 0 ;;
  diff)
    # git diff --name-only reports locally modified tracked files;
    # git diff --cached --name-only reports intentionally staged files.
    if [ "\$2" = "--name-only" ] && [ "\${TRACKED_DIRTY:-0}" = "1" ]; then
      printf 'tracked-file\n'
    elif [ "\$2" = "--cached" ] && [ "\${STAGED_DIRTY:-0}" = "1" ]; then
      printf 'staged-file\n'
    fi
    exit 0
    ;;
  diff-index) exit 0 ;;
  *) cd "$REPO"; "\$REAL_GIT" "\$@" ;;
esac
EOF
  chmod +x "$FAKEBIN/git"
}

setup_docker_stub () {
  : > "$DOCKER_LOG"
  : > "$DOCKER_TAG_LOG"
  : > "$STATE_DIR/image-labels"
  cat > "$FAKEBIN/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "$DOCKER_LOG"
# A stable fake prior-image ID used for both the running container and the
# rollback tag re-verification, so capture_previous_release can confirm they
# match.
PREV_ID="sha256:previmageid000000000000000000000000000000000000000000000000000"
TARGET_ID="sha256:targetimageid000000000000000000000000000000000000000000000000"
LABELS_FILE="$STATE_DIR/image-labels"
case "\$1" in
  compose)
    sub="\${2:-}"; shift 2 || true
    case "\$sub" in
      build)
        printf 'docker compose build %s\n' "\$*" >> "$DOCKER_LOG"
        if [ "\${DOCKER_BUILD_FAIL:-0}" = "1" ]; then exit 1; fi
        # Record provenance build args as the image's OCI labels.
        rev=""; ver=""
        for a in \$*; do
          case "\$a" in
            TARGET_SHA=*) rev="\${a#TARGET_SHA=}" ;;
            TARGET_VERSION=*) ver="\${a#TARGET_VERSION=}" ;;
          esac
        done
        # --build-arg form: "TARGET_SHA=<v>" arrives as a separate token after
        # --build-arg; capture both styles defensively.
        printf 'revision=%s\nversion=%s\n' "\$rev" "\$ver" > "\$LABELS_FILE"
        exit 0
        ;;
      config)
        printf 'docker compose config %s\n' "\$*" >> "$DOCKER_LOG"
        if [ "\${DOCKER_CONFIG_FAIL:-0}" = "1" ]; then exit 1; fi
        exit 0
        ;;
      up)
        printf 'docker compose up %s\n' "\$*" >> "$DOCKER_LOG"
        # Record the image tag this up used so a later docker inspect of
        # .Image can return the matching ID (rollback tags -> PREV_ID,
        # target tags -> TARGET_ID).
        printf '%s\n' "\${VANCINE_IMAGE_TAG:-}" > "$STATE_DIR/current-image-tag"
        if [ "\${DOCKER_UP_FAIL:-0}" = "1" ]; then exit 1; fi
        exit 0
        ;;
      *) exit 0 ;;
    esac
    ;;
  tag)
    printf 'docker tag %s %s\n' "\$2" "\$3" >> "$DOCKER_TAG_LOG"
    exit 0
    ;;
  image)
    # docker image inspect [-f FMT] <ref>
    fmt=""; ref=""
    shift
    [ "\${1:-}" = "inspect" ] && shift
    while [ \$# -gt 0 ]; do
      case "\$1" in
        -f) fmt="\$2"; shift 2 ;;
        *) ref="\$1"; shift ;;
      esac
    done
    case "\$ref" in
      vancine-custom:rollback-*)
        if [ "\${DOCKER_ROLLBACK_TAG_EXISTS:-0}" = "1" ]; then
          echo "\$PREV_ID"; exit 0
        fi
        if grep -q "docker tag .* \$ref" "$DOCKER_TAG_LOG" 2>/dev/null; then
          echo "\$PREV_ID"; exit 0
        fi
        exit 1
        ;;
      sha256:previmageid*)
        if [ "\${DOCKER_PREV_IMAGE_MISSING:-0}" = "1" ]; then exit 1; fi
        echo "\$PREV_ID"; exit 0
        ;;
      *)
        # Target image. Exists if DOCKER_IMAGE_EXISTS=1 or a build was logged.
        if [ "\${DOCKER_IMAGE_EXISTS:-0}" = "0" ] && ! grep -q "docker compose build" "$DOCKER_LOG" 2>/dev/null; then
          exit 1
        fi
        # OCI label queries. An explicit non-empty override wins; otherwise
        # fall back to the labels recorded at build time (may be empty).
        case "\$fmt" in
          *image.revision*)
            if [ -n "\${DOCKER_LABEL_REVISION:-}" ]; then printf '%s\n' "\$DOCKER_LABEL_REVISION"; exit 0; fi
            rev=\$(grep '^revision=' "\$LABELS_FILE" 2>/dev/null | cut -d= -f2-)
            printf '%s\n' "\${rev:-}"; exit 0
            ;;
          *image.version*)
            if [ -n "\${DOCKER_LABEL_VERSION:-}" ]; then printf '%s\n' "\$DOCKER_LABEL_VERSION"; exit 0; fi
            ver=\$(grep '^version=' "\$LABELS_FILE" 2>/dev/null | cut -d= -f2-)
            printf '%s\n' "\${ver:-}"; exit 0
            ;;
          *.Id*) echo "\$TARGET_ID"; exit 0 ;;
          *) echo "\$TARGET_ID"; exit 0 ;;
        esac
        ;;
    esac
    ;;
  inspect)
    if [ "\${DOCKER_INSPECT_FAIL:-0}" = "1" ]; then exit 1; fi
    fmt=""
    while [ \$# -gt 0 ]; do
      case "\$1" in
        -f) fmt="\$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    case "\$fmt" in
      *State.Health*) echo "healthy" ;;
      *Config.Image*) echo "vancine-custom:\${VANCINE_IMAGE_TAG:-test}" ;;
      *.Image*)
        # Running container image ID. Determined by the most recent compose up:
        # a rollback tag -> PREV_ID, a target tag -> TARGET_ID, none -> PREV_ID.
        if [ "\${DOCKER_NO_PREV_IMAGE:-0}" = "1" ]; then
          echo ""
        else
          cur_tag=\$(cat "$STATE_DIR/current-image-tag" 2>/dev/null || echo "")
          case "\$cur_tag" in
            rollback-*) echo "\$PREV_ID" ;;
            ?*) echo "\$TARGET_ID" ;;
            *) echo "\$PREV_ID" ;;
          esac
        fi
        ;;
      *) echo "healthy" ;;
    esac
    exit 0
    ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$FAKEBIN/docker"
}

setup_curl_stub () {
  cat > "$FAKEBIN/curl" <<EOF
#!/usr/bin/env bash
# Returns a JSON line that PARSES TO EOF without blocking parsers.
# CURL_FAIL=1 simulates unreachable endpoint (non-zero exit, no body).
# STATUS_INVALID=1 returns malformed JSON.
# CURL_FAIL_AFTER=N: first N calls succeed, subsequent calls fail.
if [ "\${CURL_FAIL:-0}" = "1" ]; then
  exit 1
fi
if [ "\${STATUS_INVALID:-0}" = "1" ]; then
  printf 'not valid json\n'
  exit 0
fi
# Track call count for phased failure simulation.
count_file="\${CURL_COUNT_FILE:-/dev/null}"
if [ -f "\$count_file" ]; then
  n=\$(cat "\$count_file")
else
  n=0
fi
n=\$((n + 1))
printf '%s' "\$n" > "\$count_file"
if [ -n "\${CURL_FAIL_AFTER:-}" ] && [ "\$n" -gt "\${CURL_FAIL_AFTER}" ]; then
  printf '{"success": false, "version": "%s"}\n' "\$STATUS_VERSION"
  exit 0
fi
if [ "\$STATUS_SUCCESS" = "1" ]; then
  printf '{"success": true, "version": "%s"}\n' "\$STATUS_VERSION"
else
  printf '{"success": false, "version": "%s"}\n' "\$STATUS_VERSION"
fi
EOF
  chmod +x "$FAKEBIN/curl"
}

setup_backup_stub () {
  : > "$BACKUP_LOG"
  cat > "$FAKEBIN/postgres-backup.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "backup \$*" >> "$BACKUP_LOG"
[ "\${BACKUP_FAIL:-0}" = "1" ] && { echo "backup failed" >&2; exit 1; }
exit 0
EOF
  chmod +x "$FAKEBIN/postgres-backup.sh"
}

# Fake flock(1) for environments without it (macOS). Uses a sibling marker
# file named "${DEPLOY_LOCK_FILE}.held" to simulate contention. The marker is
# created by the test; the fake flock exits 1 when it exists, 0 otherwise.
setup_flock_stub () {
  cat > "$FAKEBIN/flock" <<'EOF'
#!/usr/bin/env bash
# Parse: flock [-n|-x|-s|-u|-e] <fd|file> [command ...]
# We only simulate the -n (non-blocking) case.
case "$1" in
  -n|-x|-s|-u|-e) shift ;;
esac
[ -n "${VANCINE_DEPLOY_LOCK_FILE:-}" ] && [ -f "${VANCINE_DEPLOY_LOCK_FILE}.held" ] && exit 1
exit 0
EOF
  chmod +x "$FAKEBIN/flock"
}

# Fake chmod: records calls and is a NO-OP (does not change real mode) so the
# prepare_state_dir stat check can observe an unsafe mode the test set. Set
# CHMOD_FAIL=1 to make chmod fail outright (exercises fail-closed for the state
# dir). CHMOD_FAIL_STATEJSON=1 fails ONLY chmod on state.json.
setup_chmod_stub () {
  cat > "$FAKEBIN/chmod" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *state.json*)
    [ "${CHMOD_FAIL_STATEJSON:-0}" = "1" ] && exit 1
    [ "${CHMOD_FAIL:-0}" = "1" ] && exit 1
    ;;
  *)
    [ "${CHMOD_FAIL:-0}" = "1" ] && exit 1
    ;;
esac
exit 0
EOF
  chmod +x "$FAKEBIN/chmod"
}

# Fake stat: returns the REAL mode for the path (so the 0700 verification is
# observable). STAT_FAIL=1 makes it fail outright.
setup_stat_stub () {
  cat > "$FAKEBIN/stat" <<'EOF'
#!/usr/bin/env bash
[ "${STAT_FAIL:-0}" = "1" ] && exit 1
# Forward to the real stat.
case "$(uname)" in
  Darwin) /usr/bin/stat "$@" ;;
  *) /usr/bin/stat "$@" ;;
esac
EOF
  chmod +x "$FAKEBIN/stat"
}

fresh_state_dir () {
  # Create a brand new mktemp dir; previous STATE_DIRs are retained for
  # post-mortem inspection and their paths are registered for final printout.
  STATE_DIR=$(mktemp -d)
  register_fixture "$STATE_DIR"
  LOCK_FILE="$STATE_DIR/deploy.lock"
  FAKEBIN="$STATE_DIR/fakebin"
  GIT_LOG="$STATE_DIR/git.log"
  DOCKER_LOG="$STATE_DIR/docker.log"
  DOCKER_TAG_LOG="$STATE_DIR/docker-tag.log"
  BACKUP_LOG="$STATE_DIR/backup.log"
  mkdir -p "$FAKEBIN"
}

init_repo () {
  REPO="$STATE_DIR/repo"
}

# Run the orchestrator and capture its REAL exit code in RUN_EXIT plus the
# captured stdout+stderr in RUN_OUTPUT. The function itself returns 0 so it
# can be called without a trailing || true in set -e contexts; callers assert on
# RUN_EXIT and RUN_OUTPUT.
RUN () {
  local sha="$1"
  RUN_EXIT=0
  RUN_OUTPUT=$(VANCINE_DEPLOY_TEST_MODE=1 \
  VANCINE_DEPLOY_REPO="$REPO" \
  VANCINE_DEPLOY_STATE_DIR="${RUN_STATE_DIR:-$STATE_DIR}" \
  VANCINE_DEPLOY_LOCK_FILE="$LOCK_FILE" \
  VANCINE_DEPLOY_BACKUP_SCRIPT="postgres-backup.sh" \
  VANCINE_DEPLOY_HEALTH_ATTEMPTS=2 \
  VANCINE_DEPLOY_HEALTH_INTERVAL=1 \
  PATH="$FAKEBIN:$PATH" \
  CHMOD_FAIL="${CHMOD_FAIL:-0}" \
  CHMOD_FAIL_STATEJSON="${CHMOD_FAIL_STATEJSON:-0}" \
  STAT_FAIL="${STAT_FAIL:-0}" \
  VANCINE_DEPLOY_STATE_WRITE_FAIL="${VANCINE_DEPLOY_STATE_WRITE_FAIL:-0}" \
  STATUS_VERSION="${STATUS_VERSION:-}" \
  STATUS_SUCCESS="${STATUS_SUCCESS:-0}" \
  STATUS_INVALID="${STATUS_INVALID:-0}" \
  CURL_FAIL="${CURL_FAIL:-0}" \
  BACKUP_FAIL="${BACKUP_FAIL:-0}" \
  TRACKED_DIRTY="${TRACKED_DIRTY:-0}" \
  STAGED_DIRTY="${STAGED_DIRTY:-0}" \
  DOCKER_BUILD_FAIL="${DOCKER_BUILD_FAIL:-0}" \
  DOCKER_UP_FAIL="${DOCKER_UP_FAIL:-0}" \
  DOCKER_CONFIG_FAIL="${DOCKER_CONFIG_FAIL:-0}" \
  DOCKER_INSPECT_FAIL="${DOCKER_INSPECT_FAIL:-0}" \
  DOCKER_TAG_COLLISION="${DOCKER_TAG_COLLISION:-0}" \
  DOCKER_IMAGE_EXISTS="${DOCKER_IMAGE_EXISTS:-1}" \
  DOCKER_CHECKOUT_FAIL="${DOCKER_CHECKOUT_FAIL:-0}" \
  DOCKER_ROLLBACK_TAG_EXISTS="${DOCKER_ROLLBACK_TAG_EXISTS:-0}" \
  DOCKER_PREV_IMAGE_MISSING="${DOCKER_PREV_IMAGE_MISSING:-0}" \
  DOCKER_NO_PREV_IMAGE="${DOCKER_NO_PREV_IMAGE:-0}" \
  GIT_RESTORE_FAIL="${GIT_RESTORE_FAIL:-0}" \
  GIT_CHECKOUT_COUNT_FILE="${GIT_CHECKOUT_COUNT_FILE:-}" \
  DOCKER_LABEL_REVISION="${DOCKER_LABEL_REVISION:-}" \
  DOCKER_LABEL_VERSION="${DOCKER_LABEL_VERSION:-}" \
  CURL_FAIL_AFTER="${CURL_FAIL_AFTER:-}" \
  CURL_COUNT_FILE="${CURL_COUNT_FILE:-}" \
  bash "$ORCHESTRATOR" "$sha" 2>&1) || RUN_EXIT=$?
}

reset_env () {
  STATUS_VERSION=""; STATUS_SUCCESS=0; BACKUP_FAIL=0
  TRACKED_DIRTY=0; STAGED_DIRTY=0; DOCKER_BUILD_FAIL=0; DOCKER_UP_FAIL=0; DOCKER_INSPECT_FAIL=0
  CURL_FAIL=0; STATUS_INVALID=0; DOCKER_TAG_COLLISION=0; DOCKER_IMAGE_EXISTS=0
  DOCKER_CHECKOUT_FAIL=0; CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""
  DOCKER_ROLLBACK_TAG_EXISTS=0; DOCKER_PREV_IMAGE_MISSING=0; DOCKER_NO_PREV_IMAGE=0
  GIT_RESTORE_FAIL=0; GIT_CHECKOUT_COUNT_FILE=""; DOCKER_CONFIG_FAIL=0
  CHMOD_FAIL=0; CHMOD_FAIL_STATEJSON=0
  unset DOCKER_LABEL_REVISION DOCKER_LABEL_VERSION
}

case_runner () {
  local label="$1"; shift || true
  reset_env
  fresh_state_dir
  init_repo
  setup_repo "$@"
  mkdir -p "$FAKEBIN"
  setup_git_stub
  setup_docker_stub
  setup_curl_stub
  setup_backup_stub
  setup_flock_stub
  setup_chmod_stub
  setup_stat_stub
  printf '# %s\n' "$label"
}

UPGRADE_SHA () { cd "$REPO" && git log --format=%H | sed -n '1p'; }
BASE_SHA      () { cd "$REPO" && git log --format=%H | sed -n '2p'; }

# ============== STUB GENERATION GUARD ==============
test_stub_generation_guard () {
  echo "== stub generation guard =="
  # case_runner writes the fake stubs via unquoted heredocs. Any backtick or
  # $(...) in a heredoc comment would execute during stub generation, producing
  # stderr (command not found) or invoking real docker/git/etc. Capture stderr
  # across a full case_runner + RUN and assert it is empty of fixture noise.
  local err_tmp
  err_tmp=$(mktemp)
  case_runner "stub guard" 1.0.12 1.0.13 2>"$err_tmp"
  local upgrade
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade" 2>>"$err_tmp"
  local err
  err=$(cat "$err_tmp" 2>/dev/null || true)
  # stderr must be empty: no command substitution errors, no real docker usage,
  # no "command not found".
  [ -z "$err" ] && pass "stub generation + run produces no stderr" \
    || fail "unexpected stderr from fixtures: $err"
  # The fake docker must be present and used (real docker never invoked).
  [ -x "$FAKEBIN/docker" ] && pass "fake docker stub present" || fail "fake docker missing"
  grep -q "docker compose" "$DOCKER_LOG" && pass "fake docker recorded calls" || fail "no fake docker calls recorded"
}

# ============== PREFLIGHT ==============
test_preflight () {
  echo "== preflight =="
  local base upgrade
  case_runner "preflight base" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)

  STATUS_VERSION="1.0.12"; STATUS_SUCCESS=0
  RUN ""; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "empty sha => DEPLOY_FAILED" || fail "empty sha (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  RUN "abc"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "short sha => DEPLOY_FAILED" || fail "short sha (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  RUN "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "uppercase/too-long sha => DEPLOY_FAILED" || fail "uppercase sha (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  RUN "0000000000000000000000000000000000000000"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "missing sha => DEPLOY_FAILED" || fail "missing sha (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  TRACKED_DIRTY=1; RUN "$base"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "tracked dirty => DEPLOY_FAILED" || fail "tracked dirty (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  TRACKED_DIRTY=0

  STAGED_DIRTY=1; RUN "$base"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "staged dirty => DEPLOY_FAILED" || fail "staged dirty (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  STAGED_DIRTY=0

  # equal version allowed: use a repo whose HEAD version matches the running
  # version so the baseline consistency check passes, then deploy that same
  # version (target == current == HEAD version).
  case_runner "preflight equal-version" 1.0.12
  eq_sha=$(cd "$REPO" && git rev-parse HEAD)
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1
  RUN "$eq_sha"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_OK" && pass "equal version allowed => DEPLOY_OK" || fail "equal version (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # version downgrade rejected: target 1.0.13 is below the running 1.0.14.
  # (Fails at the downgrade check, before the baseline check.)
  case_runner "preflight downgrade" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.14"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "version downgrade rejected" || fail "version downgrade (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1
  # Create the .held marker file that the fake flock stub checks. The
  # orchestrator's flock then fails non-blockingly and prints DEPLOY_FAILED.
  # The marker file is retained inside STATE_DIR for post-mortem inspection.
  mkdir -p "$(dirname "$LOCK_FILE")"
  : > "${LOCK_FILE}.held"
  RUN "$base"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "held lock => DEPLOY_FAILED" || fail "held lock (exit=$RUN_EXIT out=$RUN_OUTPUT)"
}

# ============== TRANSACTION ==============
test_transaction () {
  echo "== transaction =="
  local base upgrade
  case_runner "tx happy base" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)

  # backup failure -> no checkout/build/up
  BACKUP_FAIL=1; STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "backup failure => DEPLOY_FAILED" || fail "backup failure (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  grep -q "backup predeploy" "$BACKUP_LOG" && pass "backup was attempted" || fail "backup not attempted"
  BACKUP_FAIL=0
  ! grep -q "docker compose build" "$DOCKER_LOG" && pass "no build after backup failure" || fail "build ran"
  ! grep -q "docker compose up" "$DOCKER_LOG" && pass "no up after backup failure" || fail "up ran"

  # healthy success path
  reset_env; fresh_state_dir; init_repo; setup_repo 1.0.12 1.0.13; setup_git_stub; setup_docker_stub; setup_curl_stub; setup_backup_stub; setup_flock_stub; setup_chmod_stub; setup_stat_stub
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_OK" && pass "healthy target => DEPLOY_OK" || fail "healthy target (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  grep -qE "docker compose build.*vancine" "$DOCKER_LOG" && pass "build vancine invoked" || fail "build vancine not invoked"
  grep -q "up -d --no-deps --force-recreate vancine" "$DOCKER_LOG" && pass "up --no-deps vancine invoked" || fail "up --no-deps not invoked"
  ! grep -qE "docker compose .* (postgres|redis)" "$DOCKER_LOG" && pass "postgres/redis untouched" || fail "postgres/redis recreated"

  # unhealthy => rollback (first curl succeeds for read_current_status,
  # subsequent calls fail for post-deploy health check)
  reset_env; fresh_state_dir; init_repo; setup_repo 1.0.12 1.0.13; setup_git_stub; setup_docker_stub; setup_curl_stub; setup_backup_stub; setup_flock_stub; setup_chmod_stub; setup_stat_stub
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  CURL_COUNT_FILE="$STATE_DIR/curl-count"; CURL_FAIL_AFTER=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "ROLLBACK" && pass "unhealthy => rollback" || fail "unhealthy (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  echo "$RUN_OUTPUT" | grep -qE "ROLLBACK_OK|ROLLBACK_FAILED" && pass "rollback marker present" || fail "rollback marker missing (out=$RUN_OUTPUT)"
  CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""
}

# ============== STRICT REGRESSION (Task 3 B) ==============
test_strict () {
  echo "== strict =="
  local base upgrade

  # --- 1. Target VERSION with v prefix rejected (bare MAJOR.MINOR.PATCH only) ---
  case_runner "strict target v prefix" "v1.0.12" "v1.0.13"
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "target v-prefix rejected => DEPLOY_FAILED" || fail "target v-prefix accepted (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- 2. Current status unreachable -> fail closed ---
  case_runner "strict current unreachable" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; CURL_FAIL=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "current unreachable => DEPLOY_FAILED" || fail "current unreachable (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  CURL_FAIL=0

  # --- 3. Current status JSON invalid -> fail closed ---
  case_runner "strict current invalid json" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; STATUS_INVALID=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "current invalid json => DEPLOY_FAILED" || fail "current invalid json (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  STATUS_INVALID=0

  # --- 4. Current status success!=true -> fail closed ---
  case_runner "strict current success false" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=0
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "current success!=true => DEPLOY_FAILED" || fail "current success!=true (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- 5. Current status version invalid -> fail closed ---
  case_runner "strict current version invalid" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="not-a-semver"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "current version invalid => DEPLOY_FAILED" || fail "current version invalid (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- 6. capture_previous runs docker tag for rollback tag ---
  case_runner "strict capture docker tag" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade" >/dev/null
  grep -q "docker tag" "$DOCKER_TAG_LOG" && pass "capture_previous runs docker tag" || fail "capture_previous no docker tag (log=$(cat "$DOCKER_TAG_LOG" 2>/dev/null))"

  # --- 7. Image tag collision (via docker image inspect) -> fail ---
  case_runner "strict image tag collision" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; DOCKER_ROLLBACK_TAG_EXISTS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "image tag collision => DEPLOY_FAILED" || fail "image tag collision (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_ROLLBACK_TAG_EXISTS=0

  # --- 7b. Existing immutable tag with MATCHING labels -> reuse, DEPLOY_OK ---
  case_runner "strict label reuse match" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  DOCKER_IMAGE_EXISTS=1; DOCKER_LABEL_REVISION="$upgrade"; DOCKER_LABEL_VERSION="1.0.13"
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_OK" && pass "existing tag matching labels reused => DEPLOY_OK" || fail "label reuse match (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_IMAGE_EXISTS=0; unset DOCKER_LABEL_REVISION DOCKER_LABEL_VERSION

  # --- 7c. Existing immutable tag with MISMATCHED labels -> fail closed ---
  case_runner "strict label mismatch" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  DOCKER_IMAGE_EXISTS=1; DOCKER_LABEL_REVISION="0000000000000000000000000000000000000000"
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "existing tag mismatched labels => DEPLOY_FAILED" || fail "label mismatch (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_IMAGE_EXISTS=0; unset DOCKER_LABEL_REVISION DOCKER_LABEL_VERSION

  # --- compose config preflight runs before build (call order) ---
  case_runner "strict compose config order" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade" >/dev/null
  grep -q "docker compose config" "$DOCKER_LOG" && pass "compose config preflight invoked" || fail "compose config not invoked"
  # config must appear before build in the log.
  cfg_line=$(grep -n "docker compose config" "$DOCKER_LOG" | head -1 | cut -d: -f1)
  bld_line=$(grep -n "docker compose build" "$DOCKER_LOG" | head -1 | cut -d: -f1)
  if [ -n "$cfg_line" ] && [ -n "$bld_line" ] && [ "$cfg_line" -lt "$bld_line" ]; then
    pass "compose config runs before build"
  else
    fail "compose config not before build (cfg=$cfg_line bld=$bld_line)"
  fi

  # --- compose config failure aborts before build and restores checkout ---
  case_runner "strict compose config fail" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)
  # Start the checkout at base so deploying upgrade changes it (CHECKOUT_CHANGED=1).
  ( cd "$REPO" && git checkout -q --detach "$base" )
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1; DOCKER_CONFIG_FAIL=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "compose config failure => DEPLOY_FAILED" || fail "compose config failure (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  ! grep -q "docker compose build" "$DOCKER_LOG" && pass "no build after compose config failure" || fail "build ran after config failure"
  ! grep -q "docker compose up" "$DOCKER_LOG" && pass "no up after compose config failure" || fail "up ran after config failure"
  DOCKER_CONFIG_FAIL=0

  # --- 8. Up failure triggers rollback (APP_REPLACED=1 before up) ---
  case_runner "strict up partial fail rollback" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; DOCKER_UP_FAIL=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -qE "ROLLBACK|DEPLOY_FAILED" && pass "up failure triggers rollback" || fail "up failure no rollback (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_UP_FAIL=0

  # --- 9. Rollback uses old VANCINE_IMAGE_TAG and old APP_VERSION ---
  case_runner "strict rollback uses old tag" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  CURL_COUNT_FILE="$STATE_DIR/curl-count"; CURL_FAIL_AFTER=1
  RUN "$upgrade" >/dev/null
  grep -qE "rollback-|1\.0\.12" "$DOCKER_LOG" && pass "rollback references old tag/version" || fail "rollback does not reference old (log=$(cat "$DOCKER_LOG" 2>/dev/null | head -20))"
  CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""

  # --- 10. Second consecutive deploy works ---
  case_runner "strict consecutive 1" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_OK" && pass "first deploy succeeds" || fail "first deploy (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  # Second deploy: same target
  fresh_state_dir; init_repo; setup_repo 1.0.12 1.0.13; setup_git_stub; setup_docker_stub; setup_curl_stub; setup_backup_stub; setup_flock_stub; setup_chmod_stub; setup_stat_stub
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -qE "DEPLOY_OK|DEPLOY_FAILED" && pass "second consecutive deploy produces a marker" || fail "second deploy silent (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- 11. Real exit codes: DEPLOY_OK exits 0, DEPLOY_FAILED exits non-zero,
  # ROLLBACK exits non-zero. ---
  case_runner "strict exit ok" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"
  [ "$RUN_EXIT" -eq 0 ] && pass "DEPLOY_OK exit code 0" || fail "DEPLOY_OK non-zero (exit=$RUN_EXIT)"

  case_runner "strict exit fail" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.14"; STATUS_SUCCESS=1
  RUN "$upgrade"
  [ "$RUN_EXIT" -ne 0 ] && pass "version downgrade non-zero exit" || fail "version downgrade zero exit (exit=$RUN_EXIT)"

  case_runner "strict exit rollback" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  CURL_COUNT_FILE="$STATE_DIR/curl-count"; CURL_FAIL_AFTER=1
  RUN "$upgrade"
  [ "$RUN_EXIT" -ne 0 ] && pass "rollback non-zero exit" || fail "rollback zero exit (exit=$RUN_EXIT)"
  CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""

  # --- empty prior image ID -> fail closed ---
  case_runner "strict empty prev image id" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; DOCKER_NO_PREV_IMAGE=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "empty prev image ID => DEPLOY_FAILED" || fail "empty prev image ID (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_NO_PREV_IMAGE=0

  # --- prior image ID present but image missing -> fail closed ---
  case_runner "strict prev image missing" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; DOCKER_PREV_IMAGE_MISSING=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "prev image missing => DEPLOY_FAILED" || fail "prev image missing (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  DOCKER_PREV_IMAGE_MISSING=0

  # --- version baseline mismatch (running != checkout HEAD) -> fail closed ---
  case_runner "strict baseline mismatch" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  # HEAD version is 1.0.13 but the running API reports 1.0.12 -> mismatch.
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "version baseline mismatch => DEPLOY_FAILED" || fail "baseline mismatch (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- missing flock tool -> fail closed ---
  case_runner "strict missing flock" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  # Remove the fake flock so require_tools detects it missing.
  : > "$FAKEBIN/flock"; chmod -x "$FAKEBIN/flock" 2>/dev/null || true
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"; echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "missing flock => DEPLOY_FAILED" || fail "missing flock (exit=$RUN_EXIT out=$RUN_OUTPUT)"

  # --- checkout restore failure -> explicit DEPLOY_FAILED ---
  # Move the working checkout to base (1.0.12) so deploying the upgrade
  # (1.0.13) actually changes the checkout (CHECKOUT_CHANGED=1). The build
  # then fails, triggering restore_previous_checkout, whose git checkout also
  # fails -> a second DEPLOY_FAILED marker.
  case_runner "strict checkout restore fail" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)
  ( cd "$REPO" && git checkout -q --detach "$base" )
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1   # running version == HEAD (base)
  DOCKER_BUILD_FAIL=1; GIT_RESTORE_FAIL=1; GIT_CHECKOUT_COUNT_FILE="$STATE_DIR/co-count"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "checkout restore failure => DEPLOY_FAILED" || fail "checkout restore failure (exit=$RUN_EXIT out=$RUN_OUTPUT)"
  echo "$RUN_OUTPUT" | grep -q "could not restore prior checkout" && pass "restore failure marker present" || fail "restore failure marker missing (out=$RUN_OUTPUT)"
  [ "$RUN_EXIT" -ne 0 ] && pass "checkout restore failure non-zero exit" || fail "checkout restore zero exit"
  DOCKER_BUILD_FAIL=0; GIT_RESTORE_FAIL=0; GIT_CHECKOUT_COUNT_FILE=""
}

# ============== STATE AUDIT ==============
test_state_audit () {
  echo "== state audit =="
  local upgrade

  # --- DEPLOY_OK records current_successful + last_attempt ---
  case_runner "state deploy ok" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN "$upgrade"
  [ "$(state_field last_attempt.outcome)" = "DEPLOY_OK" ] && pass "state: DEPLOY_OK last_attempt.outcome" || fail "state DEPLOY_OK outcome (got $(state_field last_attempt.outcome))"
  [ "$(state_field current_successful.sha)" = "$upgrade" ] && pass "state: current_successful.sha recorded" || fail "state current_successful.sha (got $(state_field current_successful.sha))"
  [ "$(state_field last_attempt.sha)" = "$upgrade" ] && pass "state: last_attempt.sha recorded" || fail "state last_attempt.sha"
  [ -n "$(state_field prior_rollback.sha)" ] && pass "state: prior_rollback recorded" || fail "state prior_rollback missing"

  # --- BACKUP_FAILED records outcome and preserves prior current_successful ---
  # Reuse the SAME state dir: a second (failing) attempt must not erase the
  # current_successful baseline written by the first successful attempt.
  BACKUP_FAIL=1
  RUN "$upgrade"
  [ "$(state_field last_attempt.outcome)" = "BACKUP_FAILED" ] && pass "state: BACKUP_FAILED outcome" || fail "state BACKUP_FAILED outcome (got $(state_field last_attempt.outcome))"
  [ "$(state_field current_successful.sha)" = "$upgrade" ] && pass "state: failure did not overwrite current_successful" || fail "state current_successful overwritten (got $(state_field current_successful.sha))"
  BACKUP_FAIL=0

  # --- BUILD_FAILED records outcome ---
  case_runner "state build failed" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; DOCKER_BUILD_FAIL=1
  RUN "$upgrade"
  [ "$(state_field last_attempt.outcome)" = "BUILD_FAILED" ] && pass "state: BUILD_FAILED outcome" || fail "state BUILD_FAILED outcome (got $(state_field last_attempt.outcome))"
  DOCKER_BUILD_FAIL=0

  # --- ROLLBACK result records outcome + prior_rollback ---
  case_runner "state rollback" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  CURL_COUNT_FILE="$STATE_DIR/curl-count"; CURL_FAIL_AFTER=1
  RUN "$upgrade"
  rb_outcome=$(state_field last_attempt.outcome)
  case "$rb_outcome" in
    ROLLBACK_OK|ROLLBACK_FAILED) pass "state: rollback outcome recorded ($rb_outcome)" ;;
    *) fail "state rollback outcome (got $rb_outcome)" ;;
  esac
  [ -n "$(state_field prior_rollback.image_id)" ] && pass "state: prior_rollback.image_id recorded" || fail "state prior_rollback.image_id missing"
  CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""
}

# ============== STATE SAFETY ==============
test_state_safety () {
  echo "== state safety =="
  local upgrade base

  # --- state dir symlink rejected ---
  case_runner "state symlink" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  RUN_STATE_DIR="$STATE_DIR/statelink"; ln -s "$STATE_DIR" "$RUN_STATE_DIR"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "must not be a symlink" && pass "state dir symlink rejected" || fail "state symlink (out=$RUN_OUTPUT)"
  RUN_STATE_DIR=""

  # --- state dir non-0700 perms rejected ---
  case_runner "state bad perms" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  chmod 0755 "$STATE_DIR"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "not 0700\|mode" && pass "state dir non-0700 rejected" || fail "state bad perms (out=$RUN_OUTPUT)"

  # --- chmod failure rejected ---
  case_runner "state chmod fail" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; CHMOD_FAIL=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "failed to chmod\|DEPLOY_FAILED" && pass "state chmod failure rejected" || fail "state chmod fail (out=$RUN_OUTPUT)"
  CHMOD_FAIL=0

  # --- stat failure rejected ---
  case_runner "state stat fail" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; STAT_FAIL=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "DEPLOY_FAILED" && pass "state stat failure rejected" || fail "state stat fail (out=$RUN_OUTPUT)"
  STAT_FAIL=0

  # --- corrupt state.json preserved, deploy terminates before backup ---
  case_runner "state corrupt json" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  printf 'not valid json{{{' > "$STATE_DIR/state.json"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "corrupt" && pass "corrupt state.json rejected" || fail "corrupt state.json (out=$RUN_OUTPUT)"
  [ "$(cat "$STATE_DIR/state.json")" = "not valid json{{{" ] && pass "corrupt state.json preserved (not overwritten)" || fail "corrupt state.json overwritten"
  ! grep -q "backup predeploy" "$BACKUP_LOG" && pass "no backup after corrupt state.json" || fail "backup ran after corrupt state.json"

  # --- state.json symlink rejected ---
  case_runner "state json symlink" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  ln -s "$STATE_DIR/nonexistent-target" "$STATE_DIR/state.json"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "state.json must not be a symlink" && pass "state.json symlink rejected" || fail "state.json symlink (out=$RUN_OUTPUT)"

  # --- state.json wrong perms (0644) -> fail closed (fake chmod cannot fix) ---
  case_runner "state json bad perms" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1
  printf '{"last_attempt":{}}' > "$STATE_DIR/state.json"
  chmod 0644 "$STATE_DIR/state.json"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "state.json mode is not 0600" && pass "state.json wrong perms rejected" || fail "state.json bad perms (out=$RUN_OUTPUT)"

  # --- state.json chmod failure -> fail closed ---
  case_runner "state json chmod fail" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; CHMOD_FAIL_STATEJSON=1
  printf '{"last_attempt":{}}' > "$STATE_DIR/state.json"
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "failed to chmod state.json" && pass "state.json chmod failure rejected" || fail "state.json chmod fail (out=$RUN_OUTPUT)"
  CHMOD_FAIL_STATEJSON=0

  # --- record_state write failure: no recursion, no traceback, non-zero ---
  case_runner "state write fail" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; VANCINE_DEPLOY_STATE_WRITE_FAIL=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "STATE_RECORD_FAILED" && pass "record_state failure -> STATE_RECORD_FAILED" || fail "no STATE_RECORD_FAILED (out=$RUN_OUTPUT)"
  echo "$RUN_OUTPUT" | grep -q "Traceback" && fail "Python traceback leaked" || pass "no Python traceback"
  [ "$RUN_EXIT" -ne 0 ] && pass "record_state failure non-zero exit" || fail "record_state failure zero exit"

  # --- success state write failure triggers exactly ONE rollback ---
  case_runner "state success write fail rollback" 1.0.12 1.0.13
  upgrade=$(UPGRADE_SHA)
  STATUS_VERSION="v1.0.13"; STATUS_SUCCESS=1; VANCINE_DEPLOY_STATE_WRITE_FAIL=1
  RUN "$upgrade"
  n=$(echo "$RUN_OUTPUT" | grep -c "ROLLBACK_START")
  [ "$n" -eq 1 ] && pass "state write failure triggers exactly one rollback" || fail "rollback count=$n (out=$RUN_OUTPUT)"
  VANCINE_DEPLOY_STATE_WRITE_FAIL=0

  # --- ROLLBACK_OK asserted separately (post-deploy version mismatch,
  # rollback health returns the old version) ---
  case_runner "state rollback ok" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)
  ( cd "$REPO" && git checkout -q --detach "$base" )
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "ROLLBACK_OK" && pass "ROLLBACK_OK marker asserted" || fail "no ROLLBACK_OK (out=$RUN_OUTPUT)"
  [ "$(state_field last_attempt.outcome)" = "ROLLBACK_OK" ] && pass "ROLLBACK_OK state outcome asserted" || fail "ROLLBACK_OK state outcome (got $(state_field last_attempt.outcome))"
  echo "$RUN_OUTPUT" | grep -q "ROLLBACK_FAILED" && fail "unexpected ROLLBACK_FAILED" || true

  # --- ROLLBACK_FAILED asserted separately (rollback health also fails) ---
  case_runner "state rollback failed" 1.0.12 1.0.13
  base=$(BASE_SHA); upgrade=$(UPGRADE_SHA)
  ( cd "$REPO" && git checkout -q --detach "$base" )
  STATUS_VERSION="v1.0.12"; STATUS_SUCCESS=1
  CURL_COUNT_FILE="$STATE_DIR/curl-count"; CURL_FAIL_AFTER=1
  RUN "$upgrade"
  echo "$RUN_OUTPUT" | grep -q "ROLLBACK_FAILED" && pass "ROLLBACK_FAILED marker asserted" || fail "no ROLLBACK_FAILED (out=$RUN_OUTPUT)"
  [ "$(state_field last_attempt.outcome)" = "ROLLBACK_FAILED" ] && pass "ROLLBACK_FAILED state outcome asserted" || fail "ROLLBACK_FAILED state outcome (got $(state_field last_attempt.outcome))"
  CURL_FAIL_AFTER=""; CURL_COUNT_FILE=""
}

SUITE="${1:-all}"
if [ "$SUITE" = "stub_guard" ] || [ "$SUITE" = "all" ]; then test_stub_generation_guard; fi
if [ "$SUITE" = "preflight" ] || [ "$SUITE" = "all" ]; then test_preflight; fi
if [ "$SUITE" = "transaction" ] || [ "$SUITE" = "all" ]; then test_transaction; fi
if [ "$SUITE" = "strict" ] || [ "$SUITE" = "all" ]; then test_strict; fi
if [ "$SUITE" = "state" ] || [ "$SUITE" = "all" ]; then test_state_audit; fi
if [ "$SUITE" = "state_safety" ] || [ "$SUITE" = "all" ]; then test_state_safety; fi
if [ "$SUITE" = "all" ]; then
  if guard_forbidden_commands "$ORCHESTRATOR"; then pass "no forbidden destructive commands"; else fail "forbidden commands present"; fi
fi

echo "TOTAL passed=$PASSED failed=$FAILED"
print_fixtures
[ "$FAILED" -eq 0 ]
