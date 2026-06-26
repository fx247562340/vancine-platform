#!/bin/bash
# Pre-deploy verification — run before git push or deploy.sh
#
# Usage:
#   ./bin/pre-deploy-check.sh              # full checks including Docker build
#   ./bin/pre-deploy-check.sh --skip-docker # skip Docker build (faster)
#
# Exit code 0 = all checks passed, non-zero = something failed.

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo "🔍 Pre-deploy checks..."
echo ""

# ---- 1. VERSION file ----
VERSION=$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "")
[ -z "$VERSION" ] && fail "VERSION file is empty or missing"
ok "VERSION: $VERSION"

# ---- 2. No secrets in staged files ----
STAGED=$(git diff --cached --name-only 2>/dev/null || echo "")
if [ -n "$STAGED" ]; then
  if echo "$STAGED" | grep -qE '\.env$|\.key$|\.pem$|secret|password'; then
    fail "Secrets detected in staged files: $(echo "$STAGED" | grep -E '\.env$|\.key$|\.pem$|secret|password')"
  fi
fi
ok "No secrets in staged files"

# ---- 3. CHANGELOG mentions current version ----
if [ -f CHANGELOG.md ]; then
  grep -q "$VERSION" CHANGELOG.md || fail "VERSION $VERSION not found in CHANGELOG.md"
  ok "CHANGELOG.md mentions $VERSION"
else
  warn "CHANGELOG.md not found — skipping check"
fi

# ---- 4. Devlog exists for current month ----
MONTH=$(date +%Y-%m)
if [ -f "docs/devlog/$MONTH.md" ]; then
  ok "Devlog exists: docs/devlog/$MONTH.md"
else
  warn "No devlog for $MONTH — write one before deploying"
fi

# ---- 5. AGENTS.md exists ----
[ -f AGENTS.md ] || fail "AGENTS.md missing — project rules file required"
ok "AGENTS.md present"

# ---- 6. Git working tree clean (tracked files only) ----
DIRTY=$(git diff --name-only 2>/dev/null || echo "")
if [ -n "$DIRTY" ]; then
  warn "Uncommitted changes in tracked files:"
  echo "$DIRTY" | sed 's/^/  /'
  echo ""
fi

# ---- 7. Docker build (optional) ----
if [ "${1:-}" = "--skip-docker" ]; then
  warn "Docker build skipped (--skip-docker)"
else
  if command -v docker >/dev/null 2>&1; then
    echo ""
    echo "🐳 Building Docker image..."
    if docker compose build vancine 2>&1; then
      ok "Docker build passed"
    else
      fail "Docker build failed"
    fi
  else
    warn "Docker not available — skipping build check"
  fi
fi

echo ""
echo -e "${GREEN}🎉 All pre-deploy checks passed for v${VERSION}${NC}"
