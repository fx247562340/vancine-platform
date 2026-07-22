#!/bin/bash
# SSH integration entrypoint: starts sshd, generates a unique test key,
# and runs the real installer in production mode.
set -euo pipefail

echo "[entrypoint] starting sshd..."
/usr/sbin/sshd

echo "[entrypoint] generating test Ed25519 key (runtime, not in image layer)..."
ssh-keygen -t ed25519 -f /tmp/test-deploy-key -N "" -C "ssh-integration-test"
chmod 600 /tmp/test-deploy-key
chmod 644 /tmp/test-deploy-key.pub

echo "[entrypoint] running installer in PRODUCTION mode (not test mode)..."
/tmp/installer.sh /tmp/test-deploy-key.pub

echo "[entrypoint] installer completed, keeping container alive..."
exec sleep infinity
