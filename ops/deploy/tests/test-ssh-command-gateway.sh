#!/usr/bin/env bash
# Task 4: restricted SSH command gateway behavior tests.
# The gateway reads SSH_ORIGINAL_COMMAND and accepts exactly one form:
#   deploy <40-lowercase-hex-SHA>
# Everything else is rejected without invoking the production orchestrator.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && printf '%s\n' "$PWD")
GATEWAY="$REPO_ROOT/ops/deploy/ssh-command-gateway.sh"

# Redirect the gateway's sudo target to a recorder so tests never touch root.
# The recorder and FAKEBIN directories are retained for post-mortem inspection.
RECORDER=$(mktemp)

PASSED=0
FAILED=0
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }

VALID_SHA="0123456789abcdef0123456789abcdef01234567"

run_gateway () {
  local cmd="$1"
  : > "$RECORDER"
  SSH_ORIGINAL_COMMAND="$cmd" \
  VANCINE_DEPLOY_GATEWAY_SUDO="/bin/sh -c \"printf '%s\n' \\\"\\\$@\\\" >> $RECORDER\" --" \
  bash "$GATEWAY" 2>/dev/null || true
}

# The gateway execs sudo; in tests we override the sudo binary via PATH.
# FAKEBIN and RECORDER are retained for post-mortem inspection.
FAKEBIN=$(mktemp -d)
cat > "$FAKEBIN/sudo" <<EOF
#!/usr/bin/env bash
printf '%s ' "\$@" >> "$RECORDER"
printf '\n' >> "$RECORDER"
exit 0
EOF
chmod +x "$FAKEBIN/sudo"

run_with_sudo () {
  local cmd="$1"
  : > "$RECORDER"
  SSH_ORIGINAL_COMMAND="$cmd" PATH="$FAKEBIN:$PATH" bash "$GATEWAY" 2>/dev/null || true
}

assert_rejected () {
  local label="$1" cmd="$2"
  run_with_sudo "$cmd"
  if [ -s "$RECORDER" ]; then fail "$label (sudo was invoked)"; else pass "$label rejected"; fi
}

assert_accepted () {
  local label="$1" cmd="$2"
  run_with_sudo "$cmd"
  if [ -s "$RECORDER" ] && grep -q "$VALID_SHA" "$RECORDER"; then
    pass "$label accepted"
  else
    fail "$label not accepted (recorder=[$(cat "$RECORDER")])"
  fi
}

# --- accepted: exactly one valid deploy command ---
assert_accepted "valid deploy" "deploy $VALID_SHA"

# --- rejected: missing/extra/wrong arguments ---
assert_rejected "empty" ""
assert_rejected "missing sha" "deploy"
assert_rejected "extra argument" "deploy $VALID_SHA extra"
assert_rejected "wrong command" "deployx $VALID_SHA"
assert_rejected "shell metachar semicolon" "deploy $VALID_SHA; echo SHOULD_NOT_RUN"
assert_rejected "shell metachar pipe" "deploy $VALID_SHA | cat"
assert_rejected "newline injection" "deploy $VALID_SHA
echo SHOULD_NOT_RUN"
assert_rejected "command substitution" "deploy \$(echo SHOULD_NOT_RUN)"
assert_rejected "scp command" "scp -t /tmp"
assert_rejected "sftp command" "sftp-server"
assert_rejected "shell command" "bash"
assert_rejected "env command" "env"

# --- rejected: bad SHA forms ---
assert_rejected "short sha" "deploy 0123456789abcdef"
assert_rejected "uppercase sha" "deploy 0123456789ABCDEF0123456789ABCDEF01234567"
assert_rejected "non-hex sha" "deploy z123456789abcdef0123456789abcdef01234567"

# --- source must not contain dangerous constructs ---
if grep -nE '\beval\b|bash -c|docker\.sock|NOPASSWD: ALL' "$GATEWAY"; then
  fail "gateway contains dangerous construct"
else
  pass "gateway source clean of eval/bash -c/docker.sock/NOPASSWD: all"
fi

echo "TOTAL passed=$PASSED failed=$FAILED"
echo "test-ssh-command-gateway fixtures retained at:"
echo "  recorder: $RECORDER"
echo "  fakebin:  $FAKEBIN"
[ "$FAILED" -eq 0 ]
