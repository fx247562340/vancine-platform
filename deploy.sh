#!/usr/bin/env bash
# Vancine local deployment client.
#
# Usage: ./deploy.sh <40-character commit SHA>
#
# Validates a full commit SHA, confirms it is present on origin/main, then
# requests exactly one production deployment through the restricted
# vancine-deploy SSH account. This client never commits, pushes, resets,
# builds, restarts, cleans, or logs in as root. All privileged work happens
# server-side under the root-owned production orchestrator.

set -Eeuo pipefail

SERVER="vancine-deploy@27.124.22.102"
REMOTE="origin"
BRANCH="main"

die () {
  printf 'DEPLOY_CLIENT_FAILED: %s\n' "$*" >&2
  exit 1
}

# Require EXACTLY one argument: the full commit SHA.
[ $# -eq 1 ] || die "usage: $0 <40-character lowercase hex commit SHA from $BRANCH>"
sha="$1"

# Validate the SHA: exactly 40 lowercase hexadecimal characters (whole-string
# bash regex; rejects trailing newlines / second lines / injection).
sha_re='^[0-9a-f]{40}$'
if [[ ! "$sha" =~ $sha_re ]]; then
  die "SHA must be exactly 40 lowercase hex characters"
fi

# Confirm the commit exists and is reachable from origin/main before asking
# production to act. Fetch with an explicit refspec so refs/remotes/origin/main
# is refreshed even if the remote HEAD advertisement is stale. Never prune or
# delete refs. Run from the repository root (the caller's current directory).
git fetch "$REMOTE" "refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" --quiet
git cat-file -e "${sha}^{commit}" || die "commit not found locally: $sha"
git merge-base --is-ancestor "$sha" "$REMOTE/$BRANCH" || \
  die "commit $sha is not an ancestor of $REMOTE/$BRANCH"

printf 'Requesting deployment of %s via %s\n' "$sha" "$SERVER"

# Single, strict, non-interactive SSH invocation. The server-side forced
# command accepts only `deploy <SHA>`; no shell, no PTY, no forwarding.
# The dedicated deploy key is the only identity in the agent, so no
# IdentitiesOnly filter is needed.
exec ssh \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  "$SERVER" "deploy $sha"
