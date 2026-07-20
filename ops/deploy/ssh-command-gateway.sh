#!/usr/bin/env bash
# Vancine restricted SSH command gateway.
#
# Invoked as the forced command for the vancine-deploy SSH account. Reads
# SSH_ORIGINAL_COMMAND and accepts exactly one form:
#   deploy <40-lowercase-hex-SHA>
# Any other input is rejected. On success it execs the root-owned production
# orchestrator through a single narrowly scoped sudo rule.

set -Eeuo pipefail

PRODUCTION_DEPLOY="${VANCINE_PRODUCTION_DEPLOY:-/usr/local/sbin/vancine-production-deploy}"

die () {
  printf 'GATEWAY_REJECTED: %s\n' "$*" >&2
  exit 1
}

# Read the original command. SSH sets SSH_ORIGINAL_COMMAND; if absent, reject.
raw="${SSH_ORIGINAL_COMMAND:-}"
[ -n "$raw" ] || die "no command supplied"

# Split on whitespace without dynamic command construction so shell
# metacharacters cannot execute. Disable globbing so tokens like '*' are not
# expanded to filenames.
set -f
# shellcheck disable=SC2086
set -- $raw
set +f

# Require exactly two tokens: "deploy" and a SHA.
[ $# -eq 2 ] || die "expected exactly one deploy argument, got $#"
[ "$1" = "deploy" ] || die "unknown command: $1"

sha="$2"

# Validate the SHA: exactly 40 lowercase hexadecimal characters.
sha_re='^[0-9a-f]{40}$'
if [[ ! "$sha" =~ $sha_re ]]; then
  die "invalid SHA: $sha"
fi

# Re-emit only the validated SHA to sudo. The orchestrator is the sole
# privileged entry point; the gateway never builds, restarts, or restores.
exec sudo -n "$PRODUCTION_DEPLOY" "$sha"
