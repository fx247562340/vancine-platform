#!/usr/bin/env bash
# Task 5: deploy.sh local client behavior tests.
# The client validates a full SHA, confirms it is reachable from origin/main,
# then sends exactly one `deploy <SHA>` command to the production deploy
# account. It must never commit, push, reset, build, clean, or log in as root.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && printf '%s\n' "$PWD")
CLIENT="$REPO_ROOT/deploy.sh"

PASSED=0
FAILED=0
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }

STATE_DIR=$(mktemp -d)
FAKEBIN="$STATE_DIR/fakebin"
REPO="$STATE_DIR/repo"
SSH_LOG="$STATE_DIR/ssh.log"
mkdir -p "$FAKEBIN" "$REPO"
# STATE_DIR is retained for post-mortem inspection; never deleted by this test.

# Real offline git repo with main and an origin/main ref.
(
  cd "$REPO"
  git init -q -b main
  git config user.email t@t
  git config user.name t
  printf '%s' "1.0.12" > VERSION
  git add VERSION
  git commit -q -m "v1.0.12"
  h=$(git rev-parse HEAD)
  mkdir -p "$REPO/.git/refs/remotes/origin"
  printf '%s\n' "$h" > "$REPO/.git/refs/remotes/origin/main"
  git config remote.origin.url "$REPO"
)
VALID_SHA=$(cd "$REPO" && git rev-parse HEAD)

# Fake ssh: records the exact argv and remote command, never connects.
cat > "$FAKEBIN/ssh" <<EOF
#!/usr/bin/env bash
printf '%s ' "\$@" >> "$SSH_LOG"
printf '\n' >> "$SSH_LOG"
exit 0
EOF
chmod +x "$FAKEBIN/ssh"

run_client () {
  : > "$SSH_LOG"
  (
    cd "$REPO"
    PATH="$FAKEBIN:$PATH" bash "$CLIENT" "$@" 2>&1
  ) || true
}

# --- missing/malformed SHA must never invoke ssh ---
run_client ""; [ -s "$SSH_LOG" ] && fail "empty sha invoked ssh" || pass "empty sha never invokes ssh"
run_client "abc"; [ -s "$SSH_LOG" ] && fail "short sha invoked ssh" || pass "short sha never invokes ssh"
run_client "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv"; [ -s "$SSH_LOG" ] && fail "uppercase sha invoked ssh" || pass "uppercase sha never invokes ssh"
run_client "z123456789abcdef0123456789abcdef01234567"; [ -s "$SSH_LOG" ] && fail "non-hex sha invoked ssh" || pass "non-hex sha never invokes ssh"

# --- wrong argument count must never invoke ssh ---
run_client; [ -s "$SSH_LOG" ] && fail "zero args invoked ssh" || pass "zero args never invokes ssh"
run_client "$VALID_SHA" "$VALID_SHA"; [ -s "$SSH_LOG" ] && fail "two args invoked ssh" || pass "two args never invokes ssh"

# --- valid SHA: fetched, resolved, verified, then sent once ---
out=$(run_client "$VALID_SHA")
if [ -s "$SSH_LOG" ]; then pass "valid sha invokes ssh once"; else fail "valid sha did not invoke ssh: $out"; fi
# Exactly one ssh invocation.
n=$(wc -l < "$SSH_LOG" | tr -d ' ')
[ "$n" -eq 1 ] && pass "exactly one ssh invocation ($n)" || fail "expected 1 ssh invocation, got $n"
# Remote command is exactly `deploy <SHA>`.
ssh_line=$(cat "$SSH_LOG")
case "$ssh_line" in
  *vancine-deploy@27.124.22.102*) pass "targets vancine-deploy account" ;;
  *) fail "does not target vancine-deploy account: $ssh_line" ;;
esac
case "$ssh_line" in
  *"deploy $VALID_SHA"*) pass "sends exact deploy <SHA> command" ;;
  *) fail "wrong remote command: $ssh_line" ;;
esac
case "$ssh_line" in
  *BatchMode=yes*StrictHostKeyChecking=yes*) pass "uses strict ssh options" ;;
  *) fail "missing strict ssh options: $ssh_line" ;;
esac
case "$ssh_line" in
  *root@*) fail "client logs in as root" ;;
  *) pass "never logs in as root" ;;
esac

# --- source must not contain forbidden behaviors ---
if grep -nE 'git commit|git push|git reset|git clean|docker |docker$|compose down|rmi|volume rm|root@27\.124' "$CLIENT"; then
  fail "client source contains forbidden behavior"
else
  pass "client source free of commit/push/reset/docker/root-login/cleanup"
fi

echo "TOTAL passed=$PASSED failed=$FAILED"
echo "deploy-client test fixtures retained at: $STATE_DIR"
[ "$FAILED" -eq 0 ]
