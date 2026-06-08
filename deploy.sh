#!/bin/bash
# Vancine Platform 一键部署脚本
# 用法: ./deploy.sh "commit message"
#   或: ./deploy.sh                    (跳过 git 提交，仅构建部署)

set -e

SERVER="root@64.83.35.21"
IMAGE="vancine-custom:latest"
PLATFORM="linux/amd64"

cd "$(dirname "$0")"

# ============================================================
# 1. Git 提交 & 推送
# ============================================================
if [ -n "$1" ]; then
  echo "📦 Git 提交: $1"
  git add -A
  git commit -m "$1"
  git push
  echo "✅ Git 推送完成"
else
  echo "⏭️  跳过 Git 提交（未提供 commit message）"
fi

# ============================================================
# 2. 构建前端
# ============================================================
echo "🔨 构建 classic 前端..."
cd web/classic
npm install --silent --legacy-peer-deps
npm run build
cd ../..
echo "✅ classic 前端构建完成"

echo "🔨 构建 default 前端..."
cd web/default
npm install --silent
npm run build
cd ../..
echo "✅ default 前端构建完成"

# ============================================================
# 3. Docker 构建
# ============================================================
echo "🐳 Docker 构建 ($PLATFORM)..."

# 临时解除 dist 排除
cp .dockerignore .dockerignore.bak
sed -i '' '/\/dist$/d' .dockerignore

docker build --platform "$PLATFORM" -f Dockerfile.deploy -t "$IMAGE" .

# 恢复 .dockerignore
cp .dockerignore.bak .dockerignore
rm .dockerignore.bak

echo "✅ Docker 镜像构建完成"

# ============================================================
# 4. 上传镜像到服务器
# ============================================================
echo "📤 上传镜像到 $SERVER..."
docker save "$IMAGE" | ssh "$SERVER" "docker load"
echo "✅ 镜像上传完成"

# ============================================================
# 5. 重启容器
# ============================================================
echo "🔄 重启服务..."
ssh "$SERVER" "docker rm -f new-api && cd /opt/vancine-platform && docker compose up -d"
echo "✅ 容器重启完成"

# ============================================================
# 6. 验证
# ============================================================
echo "⏳ 等待服务启动..."
sleep 3

STATUS=$(ssh "$SERVER" "curl -s http://localhost:3000/api/status" 2>/dev/null)
if echo "$STATUS" | grep -q '"success":true'; then
  echo "🎉 部署成功！服务正常运行"
else
  echo "❌ 部署可能失败，请检查: ssh $SERVER 'docker logs new-api --tail 20'"
  exit 1
fi
