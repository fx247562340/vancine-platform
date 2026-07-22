#!/usr/bin/env bash
# test-linux-ssh-integration.sh
# Real Linux/OpenSSH integration test with unique RUN_ID.
# Every run creates a unique image, container, and test key.
# No existing containers are reused. No cleanup/deletion commands.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && printf '%s\n' "$PWD")

PASSED=0
FAILED=0
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }

# Generate a unique RUN_ID (date+pid)
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
IMAGE="vancine-deploy-ssh-integration:${RUN_ID}"
CONTAINER="vancine-deploy-ssh-integration-${RUN_ID}"
TEST_KEY="/tmp/vancine-ssh-integration-key-${RUN_ID}"
KNOWN_HOSTS="/tmp/vancine-ssh-integration-knownhosts-${RUN_ID}"

echo "RUN_ID=$RUN_ID"
echo "IMAGE=$IMAGE"
echo "CONTAINER=$CONTAINER"

# --- 0. Collision check ---
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  fail "container $CONTAINER already exists - aborting"
  echo "TOTAL passed=$PASSED failed=$FAILED"; exit 1
fi
if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE}$"; then
  fail "image $IMAGE already exists - aborting"
  echo "TOTAL passed=$PASSED failed=$FAILED"; exit 1
fi
if [ -e "$TEST_KEY" ] || [ -e "${TEST_KEY}.pub" ]; then
  fail "test key $TEST_KEY already exists - aborting"
  echo "TOTAL passed=$PASSED failed=$FAILED"; exit 1
fi
pass "no collisions for RUN_ID=$RUN_ID"

# --- 1. Build the SSH integration image ---
echo "== Building image =="
docker build \
  -f "$REPO_ROOT/ops/deploy/tests/ssh-integration.Dockerfile" \
  -t "$IMAGE" \
  "$REPO_ROOT" 2>&1 | tail -3
pass "image built: $IMAGE"

IMAGE_ID=$(docker inspect -f '{{.Id}}' "$IMAGE")
echo "IMAGE_ID=$IMAGE_ID"

# --- 2. Start container with auto-assigned port ---
echo "== Starting container =="
docker run -d \
  --name "$CONTAINER" \
  -p "127.0.0.1::22" \
  "$IMAGE"
pass "container started: $CONTAINER"

for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pgrep -x sshd >/dev/null 2>&1; then
    pass "sshd is running"; break
  fi
  sleep 1
done

# --- 3. Verify image ID match ---
RUNNING_IMAGE=$(docker inspect -f '{{.Image}}' "$CONTAINER")
if [ "$RUNNING_IMAGE" = "$IMAGE_ID" ]; then
  pass "running image ID == built image ID"
else
  fail "image mismatch: running=$RUNNING_IMAGE built=$IMAGE_ID"
fi

# --- 4. INSTALL_OK ---
# Wait for installer to complete
for i in $(seq 1 15); do
  INSTALLER_LOG=$(docker logs "$CONTAINER" 2>&1)
  echo "$INSTALLER_LOG" | grep -q "INSTALL_OK" && break
  echo "$INSTALLER_LOG" | grep -q "INSTALL_FAILED" && break
  sleep 2
done

if echo "$INSTALLER_LOG" | grep -q "INSTALL_OK"; then
  pass "INSTALL_OK"
else
  fail "no INSTALL_OK: $INSTALLER_LOG"
fi

# --- 5. Extract test key ---
docker cp "$CONTAINER:/tmp/test-deploy-key" "$TEST_KEY"
chmod 600 "$TEST_KEY"
pass "test key extracted"

# --- 6. Known hosts from container ---
ASSIGNED_PORT=$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostPort}}{{end}}{{end}}' "$CONTAINER")
echo "ASSIGNED_PORT=$ASSIGNED_PORT"
HOST_KEY=$(docker exec "$CONTAINER" cat /etc/ssh/ssh_host_ed25519_key.pub)
echo "[127.0.0.1]:${ASSIGNED_PORT} ${HOST_KEY}" > "$KNOWN_HOSTS"
chmod 600 "$KNOWN_HOSTS"
pass "known_hosts created for port $ASSIGNED_PORT"

# --- 7. SSH auth test ---
echo "== SSH authentication =="
SSH_OUTPUT=$(ssh -v -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" \
  -o BatchMode=yes -i "$TEST_KEY" \
  -p "$ASSIGNED_PORT" vancine-deploy@127.0.0.1 "whoami" 2>&1 || true)

if echo "$SSH_OUTPUT" | grep -q "Authenticated to"; then
  pass "Authenticated to found"
else
  fail "Authenticated to not found: $SSH_OUTPUT"
fi
if echo "$SSH_OUTPUT" | grep -q "GATEWAY_REJECTED"; then
  pass "GATEWAY_REJECTED received"
else
  fail "No GATEWAY_REJECTED"
fi
if echo "$SSH_OUTPUT" | grep -q "Permission denied (publickey)"; then
  fail "Permission denied (publickey)"
else
  pass "No Permission denied (publickey)"
fi

# --- 8. 9 gateway rejection tests ---
echo "== 9 gateway rejections =="
REJECT_COUNT=0; TOTAL_REJECT=0
test_reject () {
  local label="$1" cmd="$2"
  TOTAL_REJECT=$((TOTAL_REJECT+1))
  local out
  out=$(ssh -v -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -o BatchMode=yes -i "$TEST_KEY" \
    -p "$ASSIGNED_PORT" vancine-deploy@127.0.0.1 "$cmd" 2>&1 || true)
  if echo "$out" | grep -q "Authenticated to" && echo "$out" | grep -q "GATEWAY_REJECTED"; then
    pass "rejected: $label"; REJECT_COUNT=$((REJECT_COUNT+1))
  else
    fail "not rejected: $label"
  fi
}
test_reject "empty" ""
test_reject "whoami" "whoami"
test_reject "shell" "/bin/bash -i"
test_reject "short SHA" "deploy abc"
test_reject "metachar" "echo SHOULD_NOT_RUN; cat /etc/passwd"
test_reject "newline" "deploy 0000000000000000000000000000000000000000
echo SHOULD_NOT_RUN"
test_reject "cmdsub" "deploy \$(whoami)"
test_reject "scp" "scp -t /tmp"
test_reject "sftp" "sftp-server"
echo "Gateway: $REJECT_COUNT/$TOTAL_REJECT"

# --- 9. Permissions ---
echo "== Permissions =="
HP=$(docker exec "$CONTAINER" stat -c '%a' /home/vancine-deploy)
SP=$(docker exec "$CONTAINER" stat -c '%a' /home/vancine-deploy/.ssh)
AP=$(docker exec "$CONTAINER" stat -c '%a' /home/vancine-deploy/.ssh/authorized_keys)
STP=$(docker exec "$CONTAINER" stat -c '%a' /var/lib/vancine-deploy)
HO=$(docker exec "$CONTAINER" stat -c '%U:%G' /home/vancine-deploy)
SO=$(docker exec "$CONTAINER" stat -c '%U:%G' /home/vancine-deploy/.ssh)
AO=$(docker exec "$CONTAINER" stat -c '%U:%G' /home/vancine-deploy/.ssh/authorized_keys)
STO=$(docker exec "$CONTAINER" stat -c '%U:%G' /var/lib/vancine-deploy)
[ "$HP" = "750" ] && pass "home 750" || fail "home=$HP"
[ "$SP" = "750" ] && pass ".ssh 750" || fail ".ssh=$SP"
[ "$AP" = "640" ] && pass "ak 640" || fail "ak=$AP"
[ "$STP" = "700" ] && pass "state 700" || fail "state=$STP"
[ "$HO" = "root:vancine-deploy" ] && pass "home owner" || fail "home owner=$HO"
[ "$SO" = "root:vancine-deploy" ] && pass ".ssh owner" || fail ".ssh owner=$SO"
[ "$AO" = "root:vancine-deploy" ] && pass "ak owner" || fail "ak owner=$AO"
[ "$STO" = "root:root" ] && pass "state owner" || fail "state owner=$STO"

# --- 10. Read/write/rename ---
echo "== Read/write/rename =="
docker exec "$CONTAINER" runuser -u vancine-deploy -- cat /home/vancine-deploy/.ssh/authorized_keys >/dev/null 2>&1 && pass "can read" || fail "cannot read"
docker exec "$CONTAINER" runuser -u vancine-deploy -- bash -c 'echo X >> /home/vancine-deploy/.ssh/authorized_keys' 2>/dev/null && fail "can append" || pass "cannot append"
docker exec "$CONTAINER" runuser -u vancine-deploy -- bash -c 'echo X > /home/vancine-deploy/.ssh/authorized_keys' 2>/dev/null && fail "can overwrite" || pass "cannot overwrite"
docker exec "$CONTAINER" runuser -u vancine-deploy -- bash -c 'mv /home/vancine-deploy/.ssh/authorized_keys /home/vancine-deploy/.ssh/ak.bak' 2>/dev/null && fail "can rename" || pass "cannot rename"

# --- 11. GNU stat preflight ---
echo "== GNU stat preflight =="
[ "$STP" = "700" ] && pass "GNU stat preflight OK" || fail "preflight fail"

# --- 12. Linux production-deploy tests ---
echo "== Linux production-deploy tests =="
docker exec "$CONTAINER" mkdir -p /tmp/tests/ops/deploy/tests /tmp/tests/ops/backup/tests
docker exec "$CONTAINER" mkdir -p /tmp/tests/ops/deploy/tests /tmp/tests/ops/backup/tests /tmp/tests/tests
for f in production-deploy.sh install-production-access.sh ssh-command-gateway.sh README.md; do
  docker cp "$REPO_ROOT/ops/deploy/$f" "$CONTAINER:/tmp/tests/ops/deploy/$f"
done
docker cp "$REPO_ROOT/ops/deploy/tests/test-production-deploy.sh" "$CONTAINER:/tmp/tests/ops/deploy/tests/test-production-deploy.sh"
docker cp "$REPO_ROOT/ops/deploy/tests/test-compose-contract.sh" "$CONTAINER:/tmp/tests/ops/deploy/tests/test-compose-contract.sh" 2>/dev/null || true
for f in test-postgres-backup.sh test-backup-alert.sh test-restore-drill.sh test-systemd-units.sh; do
  docker cp "$REPO_ROOT/ops/backup/tests/$f" "$CONTAINER:/tmp/tests/ops/backup/tests/$f" 2>/dev/null || true
done
docker cp "$REPO_ROOT/ops/backup/postgres-backup.sh" "$CONTAINER:/tmp/tests/ops/backup/postgres-backup.sh" 2>/dev/null || true
docker cp "$REPO_ROOT/tests/test_models_test.sh" "$CONTAINER:/tmp/tests/tests/test_models_test.sh" 2>/dev/null || true
LINUX_RESULT=$(docker exec "$CONTAINER" bash -c 'cd /tmp/tests && VANCINE_DEPLOY_TEST_MODE=1 bash ops/deploy/tests/test-production-deploy.sh all 2>&1 | grep "TOTAL passed"' 2>&1 || true)
echo "Linux: $LINUX_RESULT"
echo "$LINUX_RESULT" | grep -q "TOTAL passed=85 failed=0" && pass "Linux production-deploy 85/85" || fail "Linux: $LINUX_RESULT"

# --- 13. Static guards on Dockerfile and entrypoint ---
echo "== Static guards =="
DOCKERFILE="$REPO_ROOT/ops/deploy/tests/ssh-integration.Dockerfile"
ENTRYPOINT="$REPO_ROOT/ops/deploy/tests/ssh-integration-entrypoint.sh"

# Dockerfile must NOT contain RUN ... ssh-keygen
if grep -E 'RUN.*ssh-keygen' "$DOCKERFILE" >/dev/null 2>&1; then
  fail "Dockerfile contains RUN ssh-keygen (private key in image layer)"
else
  pass "Dockerfile has no RUN ssh-keygen"
fi

# Dockerfile must NOT COPY private keys or test keys (only match COPY directives, not comments)
if grep -iE '^COPY.*private|^COPY.*test.*key|^COPY.*id_ed25519' "$DOCKERFILE" >/dev/null 2>&1; then
  fail "Dockerfile COPYs private/test key material"
else
  pass "Dockerfile does not COPY private keys"
fi

# Entrypoint MUST contain runtime ssh-keygen
if grep -q 'ssh-keygen' "$ENTRYPOINT" >/dev/null 2>&1; then
  pass "Entrypoint contains runtime ssh-keygen"
else
  fail "Entrypoint missing runtime ssh-keygen"
fi

echo ""
echo "TOTAL passed=$PASSED failed=$FAILED"
echo "RUN_ID=$RUN_ID"
echo "Container=$CONTAINER Image=$IMAGE"
echo "All resources retained"
[ "$FAILED" -eq 0 ]
