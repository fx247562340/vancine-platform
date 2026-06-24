#!/bin/bash
# Vancine Platform server-side deploy script
#
# Standard production flow after the 2026-06-25 migration:
#   GitHub -> production server git pull/reset -> docker compose build -> up -d
#
# Usage:
#   ./deploy.sh                    # deploy current origin/main to production
#   ./deploy.sh "commit message"   # commit tracked local changes, push, then deploy
#
# Notes:
# - Do not commit .env, keys, or secrets.
# - VERSION is read from the tracked VERSION file and exposed in the app/build.
# - The production server keeps docker-compose.override.yml with the build: block.

set -euo pipefail

SERVER="root@27.124.22.102"
APP_DIR="/opt/vancine-platform"
IMAGE_NAME="vancine-custom"
BRANCH="main"

cd "$(dirname "$0")"

VERSION=$(tr -d '[:space:]' < VERSION)
if [ -z "$VERSION" ]; then
  echo "❌ VERSION 文件为空"
  exit 1
fi

echo "📌 版本: $VERSION"
echo "🖥️  生产服务器: $SERVER"
echo "🌿 分支: $BRANCH"

# ============================================================
# 1. Optional Git commit & push
# ============================================================
if [ -n "${1:-}" ]; then
  echo "📦 Git 提交: $1"
  # Only stage tracked files. This avoids adding .env, generated files, or secrets.
  git add -u
  if git diff --cached --name-only | grep -qE '\.env$|\.key$|\.pem$|secret|password'; then
    echo "❌ 检测到敏感文件被暂存，已中止提交。请检查 git status"
    git reset HEAD
    exit 1
  fi
  git commit -m "$1"
  git push origin "$BRANCH"
  echo "✅ Git 推送完成"
else
  echo "⏭️  跳过 Git 提交（未提供 commit message）"
  echo "🔎 确认本地 HEAD 已推送到 origin/$BRANCH..."
  git fetch origin "$BRANCH" --quiet
  LOCAL_HEAD=$(git rev-parse HEAD)
  REMOTE_HEAD=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    echo "❌ 本地 HEAD 与 origin/$BRANCH 不一致。请先 git push，或传入 commit message 让脚本提交。"
    echo "   local : $LOCAL_HEAD"
    echo "   remote: $REMOTE_HEAD"
    exit 1
  fi
fi

# ============================================================
# 2. Pull source on production server
# ============================================================
echo "📥 服务器拉取最新代码..."
ssh "$SERVER" "set -euo pipefail
cd '$APP_DIR'
git fetch origin '$BRANCH'
git reset --hard 'origin/$BRANCH'
if [ ! -f docker-compose.override.yml ]; then
  cat > docker-compose.override.yml <<'YML'
services:
  vancine:
    build:
      context: .
      dockerfile: Dockerfile
YML
fi
git log -1 --oneline
"

# ============================================================
# 3. Build image on production server
# ============================================================
echo "🐳 服务器构建 Docker 镜像..."
ssh "$SERVER" "set -euo pipefail
cd '$APP_DIR'
docker compose build vancine
docker tag '${IMAGE_NAME}:latest' '${IMAGE_NAME}:${VERSION}'
"
echo "✅ 镜像构建完成: ${IMAGE_NAME}:${VERSION} 和 ${IMAGE_NAME}:latest"

# ============================================================
# 4. Restart containers
# ============================================================
echo "🔄 重启服务..."
ssh "$SERVER" "set -euo pipefail
cd '$APP_DIR'
docker compose up -d
"

# ============================================================
# 5. Verify
# ============================================================
echo "⏳ 等待服务健康..."
ssh "$SERVER" "set -euo pipefail
for i in \$(seq 1 60); do
  status=\$(docker inspect -f '{{.State.Health.Status}}' vancine 2>/dev/null || echo unknown)
  echo \"[\$i] health=\$status\"
  [ \"\$status\" = healthy ] && break
  [ \"\$status\" = unhealthy ] && exit 1
  sleep 2
done
curl -fsS http://127.0.0.1:3000/api/status >/tmp/vancine-status.json
grep -q '\"success\":true' /tmp/vancine-status.json
curl -fsS https://vancine.com/api/status >/tmp/vancine-status-https.json
grep -q '\"success\":true' /tmp/vancine-status-https.json
"
echo "🎉 部署成功！版本 v${VERSION}，服务正常运行"

# ============================================================
# 6. Clean old images (keep latest + current tagged + recent cache)
# ============================================================
echo "🧹 清理旧镜像标签（保留最近 3 个版本）..."
ssh "$SERVER" "docker images '${IMAGE_NAME}' --format '{{.Tag}}' | grep -v latest | sort -V | head -n -3 | xargs -I{} docker rmi '${IMAGE_NAME}:{}' 2>/dev/null || true"
echo "✅ 清理完成"
