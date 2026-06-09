# Vancine 上线整改与推广启动方案

> 制定日期：2026-06-09  
> 适用对象：个人开发者维护的 API 聚合平台  
> 当前状态：仅适合受控测试，不适合公开注册、公开推广或继续开放 PayPal 收款  
> 配套审查报告：`LAUNCH_READINESS_REVIEW.md`

## 1. 目标与执行原则

本方案的目标不是一次性把所有问题做到“企业级完美”，而是用个人开发者可维护的方式，先消除会造成管理员权限泄露、虚假充值、数据丢失和大规模滥用的风险，再进入小规模封闭测试，最后开始免费推广。

执行时遵循以下原则：

1. P0 问题全部解决前，不开放注册、不开放 PayPal、不公开推广。
2. 每次生产变更前先备份，变更后立即验证，失败时按预案回滚。
3. 生产密钥只保存在服务器，不写入 Git、文档、聊天记录或部署日志。
4. 发布镜像必须带不可变版本号，禁止只依赖 `latest`。
5. 对外只宣传已通过真实生产 Smoke Test 的模型和接口。
6. 优先选择免费方案，只有备份和监控确实无法免费满足时再考虑付费。

## 2. 总体排期

| 阶段 | 建议时间 | 目标 | 是否允许推广 |
|---|---:|---|---|
| 阶段 0：立即止血 | 2-4 小时 | 关闭风险入口，建立首份备份 | 否 |
| 阶段 1：密钥与服务器加固 | 0.5-1 天 | 密钥轮换、端口和 SSH 加固 | 否 |
| 阶段 2：PayPal 安全整改 | 1-2 天 | 防止伪造充值，补齐支付状态处理 | 否 |
| 阶段 3：备份与恢复 | 0.5 天 | 自动备份并完成恢复演练 | 否 |
| 阶段 4：构建、测试与部署 | 1-2 天 | 可重复构建、验证和回滚 | 否 |
| 阶段 5：产品与合规收尾 | 1 天 | 注册防滥用、协议、文档、模型验证 | 否 |
| 阶段 6：封闭测试 | 7-14 天 | 5-20 名真实开发者验证全流程 | 仅定向邀请 |
| 阶段 7：公开上线与免费推广 | 持续 | 稳定获取真实用户 | 是 |

建议先预留一个 2 小时低流量维护窗口。密钥轮换会让所有现有登录 Session 失效，数据库和 Redis 密码轮换可能造成约 5-15 分钟不可用。

### 2.1 主要改动文件

| 文件或模块 | 处理内容 |
|---|---|
| `docker-compose.yml` | 移除明文密钥、绑定本机端口、使用不可变镜像标签 |
| `.env.example`、`.gitignore` | 提供安全占位配置，确保真实 `.env` 不被提交 |
| `Dockerfile.deploy` | 改为多阶段构建，稳定生成两个前端和 Go 二进制 |
| `deploy.sh` | 删除自动 `git add -A`，增加备份、健康检查和回滚 |
| `.github/workflows/deploy.yml` | 增加测试、镜像构建、版本标签和失败回滚 |
| `controller/topup_paypal.go` | 官方 Webhook 验签、金额核对、事件处理 |
| PayPal 相关 model 与测试 | 交易 ID 唯一约束、幂等更新、退款和撤销记录 |
| `test_models.sh` | 环境变量密钥、真实接口、低成本分层测试 |
| 用户协议、隐私政策和文档 | 补齐实际规则，删除不可用接口宣传 |

---

## 3. 阶段 0：立即止血

### 3.1 暂停 PayPal

**目的：** 在 Webhook 验签修复前阻止伪造充值。

优先通过管理后台关闭：

1. 进入管理后台支付设置。
2. 找到 PayPal 设置。
3. 关闭 `PayPalEnabled`。
4. 确认前台不再显示 PayPal 支付入口。

紧急情况下可通过管理接口更新 `PayPalEnabled=false`，但必须使用已认证的管理员会话，不要把管理员 Cookie 写入脚本或 Git。

**验证：**

- 普通用户无法创建新的 PayPal 支付订单。
- `/api/paypal/webhook` 在 PayPal 未启用时返回 `403`。
- 数据库中不再新增 PayPal Pending 订单。

**回滚：** 不回滚。只有阶段 2 的验签、金额校验和测试全部完成后才重新开启。

### 3.2 暂停公开注册和免费额度

**目的：** 在邮箱验证和 Turnstile 未开启前避免批量注册消耗额度。

通过管理后台设置：

| 设置项 | 临时值 |
|---|---|
| `RegisterEnabled` | `false` |
| `PasswordRegisterEnabled` | `false` |
| `QuotaForNewUser` | `0` |

保留管理员登录和现有测试账号。封闭测试阶段可短时开启注册，让受邀用户完成注册后再次关闭；更理想的做法是后续实现邀请码。

**验证：**

```bash
curl -fsS https://vancine.com/api/status
```

确认返回结果中的 `register_enabled` 和 `password_register_enabled` 均为 `false`。

### 3.3 创建首次数据库备份

在任何密钥或数据库变更之前执行：

```bash
ssh <production-host>
sudo install -d -m 700 /opt/backups/vancine/manual
BACKUP_FILE=/opt/backups/vancine/manual/new-api-before-remediation-$(date +%F-%H%M).dump
docker exec postgres pg_dump -U root -d new-api -Fc > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
docker exec -i postgres pg_restore --list < "$BACKUP_FILE" | head
```

将备份复制到本地加密磁盘或另一个独立位置：

```bash
scp <production-host>:/opt/backups/vancine/manual/new-api-before-remediation-*.dump \
  <local-backup-directory>/
```

**验收标准：**

- 服务器和异地位置各有一份备份。
- `pg_restore --list` 可正常读取。
- 备份文件权限为 `600`。

---

## 4. 阶段 1：密钥轮换与服务器加固

### 4.1 改造 Compose 密钥管理

修改 `docker-compose.yml`：

```yaml
services:
  vancine:
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      SQL_DSN: postgresql://root:${POSTGRES_PASSWORD}@postgres:5432/new-api
      REDIS_CONN_STRING: redis://:${REDIS_PASSWORD}@redis:6379
      SESSION_SECRET: ${SESSION_SECRET}

  redis:
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]

  postgres:
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: new-api
```

在生产服务器 `/opt/vancine-platform/.env` 保存真实值：

```dotenv
POSTGRES_PASSWORD=<random-secret>
REDIS_PASSWORD=<random-secret>
SESSION_SECRET=<random-secret>
```

设置权限：

```bash
chmod 600 /opt/vancine-platform/.env
```

仓库中只保留 `.env.example`，其中全部使用占位值。确保 `.env` 已加入 `.gitignore`。

生成随机值时，可使用：

```bash
openssl rand -base64 48
```

生成后立即保存到密码管理器，不要将真实值写进命令参数、终端截图、Issue 或本文档。

### 4.2 密钥轮换顺序

严格按以下顺序执行：

1. 确认阶段 0 备份可读。
2. 在 PostgreSQL 中使用交互式 `\password root` 修改数据库密码。
3. 更新生产 `.env` 中的 `POSTGRES_PASSWORD`。
4. 更新 `.env` 中的 `REDIS_PASSWORD`，重建 Redis 容器。
5. 更新 `.env` 中的 `SESSION_SECRET`。
6. 使用新 Compose 配置重建服务。
7. 验证服务、管理员登录、模型请求和数据库写入。

建议命令：

```bash
cd /opt/vancine-platform
docker exec -it postgres psql -U root -d new-api
```

进入 `psql` 后执行交互式密码修改：

```text
\password root
```

更新 `.env` 后重建：

```bash
docker compose config >/dev/null
docker compose up -d --force-recreate redis vancine
docker compose ps
```

**影响：**

- Session Secret 轮换后，所有用户需要重新登录，这是预期行为。
- Redis 是缓存用途时可直接重建；若后续确认 Redis 中保存了不可丢失状态，应先导出并调整方案。

**验证：**

```bash
curl -fsS http://127.0.0.1:3000/api/status
docker compose ps
docker compose logs --tail=100 vancine
```

同时完成一次管理员重新登录、创建测试 Token、发起低成本模型请求。

### 4.3 收紧公网端口

Compose 必须使用：

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

从另一台机器验证公网端口不可访问：

```bash
nc -vz <production-host> 3000
```

预期结果为连接失败；`https://vancine.com` 和 `https://api.vancine.com` 仍应正常。

### 4.4 启用防火墙并加固 SSH

先确认 SSH Key 登录可用，并保持当前 SSH 会话不要关闭。再打开第二个终端验证新连接，避免把自己锁在服务器外。

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

SSH 建议配置：

```text
PasswordAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
```

先使用 `sshd -t` 验证配置，再 reload SSH，并从第二个终端测试。稳定后可再创建非 Root sudo 用户，将 `PermitRootLogin` 调整为 `no`。

**验收标准：**

- 公网仅开放 `22`、`80`、`443`。
- `3000` 无法从公网访问。
- SSH 密码登录失败，密钥登录成功。
- 应用仍可通过 Nginx 和 HTTPS 访问。

---

## 5. 阶段 2：PayPal 安全整改

### 5.1 替换当前 Webhook 验签方式

当前 `controller/topup_paypal.go` 会下载请求头提供的证书并直接使用其公钥验签，没有验证证书是否可信。应删除这条信任链，改为调用 PayPal 官方接口：

```text
POST /v1/notifications/verify-webhook-signature
```

发送以下字段：

```json
{
  "auth_algo": "<PAYPAL-AUTH-ALGO>",
  "cert_url": "<PAYPAL-CERT-URL>",
  "transmission_id": "<PAYPAL-TRANSMISSION-ID>",
  "transmission_sig": "<PAYPAL-TRANSMISSION-SIG>",
  "transmission_time": "<PAYPAL-TRANSMISSION-TIME>",
  "webhook_id": "<configured-webhook-id>",
  "webhook_event": {}
}
```

只有 PayPal 返回 `verification_status=SUCCESS` 时才继续处理。Sandbox 和生产环境必须使用对应 API 基地址和凭据。

### 5.2 只在实际捕获完成后充值

建议调整事件处理规则：

| 事件 | 动作 |
|---|---|
| `CHECKOUT.ORDER.APPROVED` | 只表示买家批准；执行或等待 Capture，不直接充值 |
| `PAYMENT.CAPTURE.PENDING` | 保持 Pending，不充值 |
| `PAYMENT.CAPTURE.COMPLETED` | 查询并核对 Capture 后充值 |
| `PAYMENT.CAPTURE.DENIED` | 标记失败 |
| `PAYMENT.CAPTURE.REFUNDED` | 记录退款并冻结或扣回对应额度 |
| `PAYMENT.CAPTURE.REVERSED` | 记录撤销并冻结或扣回对应额度 |

收到 `PAYMENT.CAPTURE.COMPLETED` 后，再使用 PayPal API 查询订单或 Capture，逐项核对：

1. Capture 状态必须为 `COMPLETED`。
2. PayPal Order ID 和 Capture ID 必须与本地订单关联。
3. `custom_id` 或 `reference_id` 必须等于本地 Pending 订单号。
4. 金额必须与本地应付金额精确一致，禁止浮点近似比较。
5. 币种必须一致。
6. 本地订单状态必须仍为 Pending。
7. Capture ID 必须唯一，不能被其他订单使用。

数据库更新需在事务中完成，确保“订单成功”和“增加额度”只发生一次。应为交易 ID 增加唯一约束，避免 Return 回调和 Webhook 并发造成重复充值。

### 5.3 PayPal 必测用例

至少添加以下自动化测试：

- 缺少 Webhook ID 时拒绝。
- PayPal 官方验签返回 `FAILURE` 时拒绝。
- 自签证书和伪造签名无法通过。
- 事件金额大于本地订单金额时拒绝。
- 币种不一致时拒绝。
- `custom_id` 或 `reference_id` 不存在时拒绝。
- Capture 状态不是 `COMPLETED` 时不充值。
- 相同 Webhook 重复投递只充值一次。
- Return 回调和 Webhook 并发只充值一次。
- 已成功订单无法再次完成。
- Refund 和 Reversed 事件可被记录并触发人工处理。

### 5.4 重新开启 PayPal 的条件

同时满足以下条件才可开启：

- 自动化测试全部通过。
- Sandbox 完成一次真实下单、支付、重复 Webhook、退款测试。
- 生产环境完成一笔最低金额真实支付。
- 数据库记录包含唯一 Transaction ID。
- 后台可以定位订单、用户、金额、币种、Capture ID 和原始事件。
- 已写明退款规则，并有人工处理流程。

官方参考：

- PayPal Webhook 验证指南：<https://developer.paypal.com/api/rest/webhooks/>
- PayPal Webhook 事件名称：<https://developer.paypal.com/api/rest/webhooks/event-names>
- Verify Webhook Signature API：<https://docs.paypal.ai/reference/api/rest/verify-webhook-signature/verify-webhook-signature>

---

## 6. 阶段 3：自动备份与恢复演练

### 6.1 备份范围

每日备份：

- PostgreSQL 数据库。
- `/opt/vancine-platform/data`。
- 必要的 Nginx 配置和 Compose 配置。
- 加密后的生产配置备份。

不建议把普通应用日志长期纳入完整备份，可单独设置日志轮转。

### 6.2 免费备份策略

采用“服务器本地 + 独立位置”两份：

- 本地保留最近 7 份每日备份和最近 4 份每周备份。
- 独立位置可使用个人电脑的加密磁盘、另一台服务器或免费额度对象存储。
- 每次同步后验证文件大小和校验值。

备份脚本建议放在 `/usr/local/sbin/vancine-backup`，使用 `systemd timer` 每日执行。脚本必须使用 `set -euo pipefail`，失败时退出非零，并写入独立日志。

核心备份命令：

```bash
docker exec postgres pg_dump -U root -d new-api -Fc > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
docker exec -i postgres pg_restore --list < "$BACKUP_FILE" >/dev/null
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

### 6.3 恢复演练

不要只验证备份文件存在。至少完成一次隔离恢复：

1. 启动临时 PostgreSQL 容器。
2. 创建空数据库。
3. 使用 `pg_restore` 恢复备份。
4. 检查用户数、订单数、Token 数和关键配置。
5. 删除临时容器。

**上线门槛：** 最近 7 天内有成功备份，最近 30 天内完成过一次恢复演练。

---

## 7. 阶段 4：构建、测试与可回滚部署

### 7.1 修复生产镜像构建

当前 `Dockerfile.deploy` 编译 Go 时需要嵌入：

- `web/default/dist`
- `web/classic/dist`

但 `.dockerignore` 排除了这两个目录。当前 `deploy.sh` 临时修改 `.dockerignore`，构建中断时可能无法恢复文件，不适合作为长期发布方式。

推荐把前端构建纳入多阶段 Dockerfile：

1. Default 前端 Builder 安装锁定依赖并执行 `build:check`。
2. Classic 前端 Builder 安装锁定依赖并执行 `build`。
3. Go Builder 从两个前端 Builder 复制 `dist` 后编译。
4. 最终镜像只包含可执行文件和许可证。

这样 CI、本地和发布环境使用同一构建过程，不依赖工作区里预先存在的 `dist`。

### 7.2 修复质量门禁

发布前最低门禁：

```bash
go test ./...
go vet ./...
cd web/default && bun run build:check
cd web/classic && bun run build
docker compose config
docker build -f Dockerfile.deploy -t vancine:<git-sha> .
```

处理优先级：

1. 修复当前 5 个失败的 Go 测试。
2. 修复 Default 前端 5 个 TypeScript 错误。
3. 修复 Docker 镜像构建。
4. 修复 `go vet` 中的锁复制和不可达代码。
5. 修复 Default ESLint 工具依赖。
6. Classic 的 149 个格式问题不要阻塞首发，可单独做一次机械格式化提交。

格式化和 Bundle 大小属于 P2；功能测试、类型检查、镜像构建属于 P1。

### 7.3 改造部署流程

禁止发布脚本自动执行 `git add -A`。它可能把测试密钥、临时文件和未审查改动一并提交。

建议发布流程：

1. 开发分支完成变更。
2. CI 运行全部质量门禁。
3. 构建镜像 `vancine:<git-sha>`。
4. 将镜像上传到镜像仓库，或通过 SSH 传输到服务器。
5. 部署前创建数据库备份。
6. 将生产 `.env` 中的 `VANCINE_IMAGE_TAG` 更新为新 SHA。
7. `docker compose up -d`。
8. 执行健康检查和 Smoke Test。
9. 失败时切回上一 SHA 并重新启动。

Compose 使用：

```yaml
services:
  vancine:
    image: vancine-custom:${VANCINE_IMAGE_TAG}
```

每次至少保留最近两个验证通过的生产镜像。

### 7.4 部署后 Smoke Test

每次部署自动检查：

```bash
curl -fsS https://vancine.com/api/status
curl -fsS https://api.vancine.com/api/status
curl -fsS https://vancine.com/docs >/dev/null
```

另外使用专用测试账号和低额度 Token 检查：

- 管理员登录。
- 用户登录。
- 创建和撤销 Token。
- `/v1/models`。
- 一个低成本文本模型请求。
- 一个低成本图片模型请求。
- 充值入口的启用/禁用状态。

### 7.5 回滚条件

出现以下任意情况，立即回滚：

- 健康检查失败。
- 数据库迁移失败。
- 管理员无法登录。
- 核心模型请求连续失败。
- 5xx 比例明显升高。
- 支付订单状态异常。

回滚动作：

1. 将 `VANCINE_IMAGE_TAG` 改回上一生产 SHA。
2. `docker compose up -d`。
3. 验证健康检查。
4. 若发生不兼容数据库变更，按事先制定的迁移回滚方案处理；不要直接覆盖生产数据库。

---

## 8. 阶段 5：产品、合规与模型可用性

### 8.1 注册防滥用

公开注册前必须：

1. 配置 SMTP。
2. 开启 `EmailVerificationEnabled`。
3. 配置 Cloudflare Turnstile 免费版。
4. 开启 `TurnstileCheckEnabled`。
5. 将新用户赠送额度设置为极低值，或完成首次验证/人工审核后再发放。
6. 对注册、登录、发验证码和模型调用配置速率限制。

个人开发者最稳妥的首发方式仍是邀请码或人工审核。

### 8.2 法律与运营文档

上线前至少发布：

- 用户协议。
- 隐私政策。
- 可接受使用政策。
- 退款、撤销与争议处理规则。
- 服务可用性和模型变化免责声明。
- 用户数据会传输给哪些上游模型提供商。
- 请求日志、错误日志和支付记录的保留期限。
- 联系方式和处理时限。

文档应由你根据实际业务和所在地要求确认；模板只能作为起点，不能替代法律意见。

### 8.3 修复模型测试与宣传内容

修改 `test_models.sh`：

- API Key 从环境变量读取。
- 不在脚本中保存任何真实或测试密钥。
- 图片尺寸改为生产模型支持的尺寸。
- 视频接口使用实际存在的 `/v1/videos`。
- 暂时移除不存在的 `/v1/3d/generations`。
- 默认测试仅调用低成本模型；视频等高成本测试由手工或定时任务单独运行。

建立模型状态表：

| 字段 | 内容 |
|---|---|
| 模型 | 对外展示名称 |
| 接口 | 实际路径 |
| 最近验证时间 | 最后成功 Smoke Test 时间 |
| 成功率 | 最近 24 小时或 7 天 |
| 已知限制 | 尺寸、格式、超时等 |
| 是否可推广 | 是/否 |

只宣传“可推广=是”的模型。3D、TTS 或图片模型未稳定前，文档中明确标注 Beta 或直接隐藏。

### 8.4 SEO 与免费推广前置

在开始推广前修复：

- `/sitemap.xml` 返回真实 XML Sitemap。
- 主站设置唯一 Canonical URL。
- API 子域名避免展示重复首页，改为 API 状态或文档入口。
- 每个推广链接使用 UTM 参数。
- 至少记录访问、注册、创建 Token、首次成功调用、首次充值五个转化事件。

---

## 9. 阶段 6：封闭测试方案

邀请 5-20 名真实开发者，优先选择能给出技术反馈的人，而不是单纯领取免费额度的人。

### 9.1 测试任务

每位测试者至少完成：

1. 阅读文档并注册。
2. 创建 API Token。
3. 使用 OpenAI 兼容方式完成首次文本调用。
4. 尝试一个非文本模型。
5. 查看用量和余额。
6. 提交一次问题或反馈。

选择 1-2 名可信测试者完成最低金额 PayPal 真实支付和退款测试。

### 9.2 每日检查

- 新增用户数和注册来源。
- 首次成功调用率。
- 各模型成功率和 P95 延迟。
- 5xx 和超时数量。
- 每位用户消耗和异常高频调用。
- 支付成功、Pending、退款和异常订单。
- 磁盘使用率、备份结果和容器状态。

### 9.3 封闭测试通过标准

- 连续 7 天没有 P0/P1 故障。
- 至少 5 名用户在不需要人工帮助的情况下完成首次调用。
- 主要文本模型成功率不低于 98%。
- 支付、重复通知和退款流程均验证通过。
- 每日备份成功，恢复演练通过。
- 没有无法解释的额度增长或订单状态异常。

---

## 10. 阶段 7：公开上线与零预算推广

达到 Go 条件后，采用低成本、内容驱动的方式推广：

### 第一优先级：可持续免费渠道

1. 写一篇完整技术文章：个人开发者如何统一接入多个模型 API，附真实代码和成本对比。
2. 发布可直接运行的示例项目，README 使用 Vancine 完成首次调用。
3. 在 GitHub README、项目文档和 Release 中放置稳定入口。
4. 在开发者社区发布“技术复盘 + 可用 Demo”，避免只发广告。
5. 邀请封闭测试用户提供真实使用案例和反馈。
6. 为长尾问题制作文档页面，例如模型兼容差异、图片尺寸限制、错误码排查。

### 暂缓事项

- 在支付与反滥用未稳定前发放大量免费额度。
- 购买广告或付费流量。
- 宣传未通过生产验证的模型。
- 承诺无法保障的 SLA、无限额度或永久价格。

推广效果按周判断，不以浏览量为唯一指标。核心指标应为：

```text
访问 -> 注册 -> 创建 Token -> 首次成功调用 -> 7 日留存 -> 充值
```

每周只保留能带来“首次成功调用”或真实反馈的渠道。

---

## 11. 监控与日常运维

优先使用免费方案：

- Uptime Kuma 或免费外部监控检查 HTTPS 与 `/api/status`。
- systemd timer 监控备份任务。
- 磁盘使用率达到 75% 告警，85% 必须处理。
- 应用错误日志和 PayPal Webhook 验证失败单独统计。
- 每周检查 Docker 镜像和构建缓存。

磁盘清理前先确认至少保留两个可回滚镜像。优先执行针对性清理，不要直接使用会删除所有未使用资源的激进命令。

建议告警项：

| 告警 | 阈值 |
|---|---|
| 主站不可用 | 连续 2 次失败 |
| `/api/status` 异常 | 任意一次失败 |
| 磁盘使用率 | 75% 警告，85% 严重 |
| 备份失败 | 任意一次 |
| PayPal 验签失败 | 短时间异常增加 |
| 5xx | 5 分钟内超过正常基线 |
| 模型成功率 | 主要模型低于 95% |

---

## 12. Go / No-Go 验收清单

以下项目全部通过，才允许公开上线和推广：

### 安全

- [ ] 已关闭旧密钥，生产 Session、PostgreSQL、Redis 密钥全部轮换。
- [ ] Git 和部署文件中没有真实密钥。
- [ ] 公网无法访问端口 `3000`。
- [ ] 防火墙已启用，仅开放必要端口。
- [ ] SSH 密码登录已关闭。

### 支付

- [ ] PayPal 使用官方 Webhook 验签接口。
- [ ] 金额、币种、订单、Capture ID 和状态均经过服务端核对。
- [ ] 重复通知和并发回调不会重复充值。
- [ ] Refund 和 Reversed 有处理流程。
- [ ] Sandbox 和生产最低金额测试均通过。

### 数据与运维

- [ ] 每日自动备份正常。
- [ ] 备份有独立位置副本。
- [ ] 恢复演练通过。
- [ ] 磁盘使用率低于 75%。
- [ ] 外部可用性和备份失败告警正常。

### 发布质量

- [ ] `go test ./...` 通过。
- [ ] `go vet ./...` 通过，或所有暂缓项有明确记录和风险说明。
- [ ] Default 前端 `build:check` 通过。
- [ ] Classic 前端构建通过。
- [ ] Docker 生产镜像可从干净工作区构建。
- [ ] 部署使用不可变版本并完成过一次回滚演练。

### 产品与合规

- [ ] 注册具备邮箱验证和 Turnstile，或保持邀请制。
- [ ] 新用户免费额度不会被批量滥用。
- [ ] 用户协议、隐私政策、退款和争议规则已发布。
- [ ] 文档接口与实际接口一致。
- [ ] 所有对外宣传模型均通过生产 Smoke Test。

### 封闭测试

- [ ] 连续 7 天无 P0/P1 故障。
- [ ] 至少 5 名真实用户独立完成首次调用。
- [ ] 支付和退款全流程验证通过。

任意一项 P0 未完成时，结论仍为 **NO-GO**。

---

## 13. 个人开发者执行优先级

当时间有限时，按以下顺序做，不要被格式化、视觉细节或广泛推广分散注意力：

1. 关闭 PayPal 和注册，完成首次备份。
2. 轮换全部泄露密钥，关闭公网 `3000`，加固 SSH。
3. 修复 PayPal 验签、金额校验和幂等性。
4. 建立每日备份和恢复演练。
5. 修复测试、类型检查、Docker 构建和可回滚部署。
6. 配置注册防滥用，补齐协议和真实文档。
7. 封闭测试 7-14 天。
8. 达到 Go 条件后，执行零预算内容推广。

这条顺序能把有限时间优先投入到“避免严重损失”和“确保首次用户成功”上，也是当前项目最现实的上线路径。
