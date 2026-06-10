#!/bin/bash
# Vancine Platform 一键部署脚本
#
# 构建流程：本地构建前端 → 本地编译 Go 二进制（嵌入前端） → 上传到服务器 → 构建 Docker 镜像
# 为什么不用 Dockerfile.deploy：服务器内存不足无法在容器内编译，且 Docker Hub 访问受限无法拉取基础镜像
#
# 用法: ./deploy.sh "commit message"
#   或: ./deploy.sh                    (跳过 git 提交，仅构建部署)

set -e

SERVER="root@64.83.35.21"
IMAGE_NAME="vancine-custom"
PLATFORM="linux/amd64"

cd "$(dirname "$0")"

VERSION=$(cat VERSION | tr -d '[:space:]')
if [ -z "$VERSION" ]; then
  echo "❌ VERSION 文件为空"
  exit 1
fi
echo "📌 版本: $VERSION"

# ============================================================
# 1. Git 提交 & 推送
# ============================================================
if [ -n "$1" ]; then
  echo "📦 Git 提交: $1"
  # Only stage tracked files (safe: won't add new untracked files like .env)
  git add -u
  # Safety check: abort if .env or other sensitive files are staged
  if git diff --cached --name-only | grep -qE '\.env$|\.key$|\.pem$|secret|password'; then
    echo "❌ 检测到敏感文件被暂存，已中止提交。请检查 git status"
    git reset HEAD
    exit 1
  fi
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
# 3. 本地编译 Go 二进制（嵌入前端资源）
# ============================================================
echo "🔨 编译 Go 二进制 ($PLATFORM)..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o vancine-linux .
echo "✅ 编译完成"

# ============================================================
# 4. 上传到服务器并构建镜像
# ============================================================
echo "📤 上传到 $SERVER..."
scp vancine-linux "$SERVER:/opt/vancine-platform/vancine-linux"

echo "🐳 构建 Docker 镜像 (v${VERSION})..."
ssh "$SERVER" "cd /opt/vancine-platform && cat > Dockerfile.simple << 'EOF'
FROM docker.1ms.run/debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata wget && rm -rf /var/lib/apt/lists/* && update-ca-certificates
COPY vancine-linux /vancine
EXPOSE 3000
WORKDIR /data
ENTRYPOINT [\"/vancine\"]
EOF
docker build -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest -f Dockerfile.simple .
rm -f vancine-linux Dockerfile.simple"

# 更新 docker-compose.yml 使用版本标签
ssh "$SERVER" "cd /opt/vancine-platform && sed -i 's|image: ${IMAGE_NAME}:.*|image: ${IMAGE_NAME}:${VERSION}|' docker-compose.yml"

echo "✅ 镜像构建完成: ${IMAGE_NAME}:${VERSION}"

# ============================================================
# 5. 重启容器
# ============================================================
echo "🔄 重启服务..."
ssh "$SERVER" "cd /opt/vancine-platform && docker compose up -d"
echo "✅ 容器重启完成"

# ============================================================
# 6. 验证
# ============================================================
echo "⏳ 等待服务启动..."
sleep 5

STATUS=$(ssh "$SERVER" "curl -s http://localhost:3000/api/status" 2>/dev/null)
if echo "$STATUS" | grep -q '"success":true'; then
  echo "🎉 部署成功！版本 v${VERSION}，服务正常运行"
else
  echo "❌ 部署可能失败，请检查: ssh $SERVER 'docker logs vancine --tail 20'"
  exit 1
fi

# ============================================================
# 7. 清理旧镜像（保留最近 3 个版本）
# ============================================================
echo "🧹 清理旧镜像..."
ssh "$SERVER" "docker images ${IMAGE_NAME} --format '{{.Tag}}' | grep -v latest | sort -V | head -n -3 | xargs -I{} docker rmi ${IMAGE_NAME}:{} 2>/dev/null || true"
echo "✅ 清理完成"

# 清理本地临时文件
rm -f vancine-linux
