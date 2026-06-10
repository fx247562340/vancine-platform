# Vancine 上线准备度复查

> 复查日期：2026-06-10  
> 对比基线：`LAUNCH_READINESS_REVIEW.md`  
> 范围：当前工作区、自动化门禁、生产配置、公开接口、备份与支付流程

## 结论

**当前结论：允许继续受控的免费 / PayPal Sandbox 内测，但仍为公开付费上线 NO-GO。**

相比 2026-06-09 的首次审查，生产密钥、端口绑定、注册保护、法律文档、磁盘空间和 PayPal 官方验签均有明显改善。当前最主要的剩余风险已经从“密钥直接泄露”转为：

1. PayPal 金额、币种、退款与幂等处理仍不完整。
2. 仓库 Compose 与生产安全配置严重不一致，重新部署可能恢复不安全配置。
3. SSH 密码和 Root 登录仍开放，防火墙与 Fail2ban 未启用。
4. 备份只有同机副本，未完成恢复演练。
5. 测试、类型检查和生产 Docker 构建仍失败。

在 PayPal 保持测试模式、推广范围受控的前提下，可以继续邀请少量开发者测试。切换 PayPal 生产模式或开始公开推广前，必须完成本文的 P0 项。

## 上次 P0 整改状态

| 项目 | 当前状态 | 复查结果 |
|---|---|---|
| 生产密钥泄露 | 已完成 | Session、PostgreSQL、Redis 密钥均已轮换；生产 `.env` 权限为 `600` |
| PayPal Webhook 可伪造 | 部分完成 | 已调用 PayPal 官方验签 API，伪造空请求返回 `403`；金额、币种、退款一致性仍有缺口 |
| 应用端口公网暴露 | 基本完成 | 生产容器实际绑定 `127.0.0.1:3000`；公网直接 HTTP 请求无法访问应用，但防火墙仍未启用 |
| 没有数据库备份 | 部分完成 | 每日 Cron 已运行，两份备份通过 gzip 完整性检查；无异地副本、无恢复演练 |
| 注册无反滥用保护 | 明显改善 | 邮箱验证与 Turnstile 已开启；公开注册和新用户赠送额度仍开启 |
| 用户协议与隐私政策为空 | 已完成 | 中英文协议和隐私政策均可通过公开 API 获取 |

## 已确认完成的改进

### 生产安全与运行

- 生产 Session、PostgreSQL、Redis 密钥已轮换，旧仓库值不再是生产凭据。
- 生产 Compose 使用环境变量，不再直接保存真实密钥。
- 生产 `.env` 权限为 `600 root:root`。
- 生产应用实际监听 `127.0.0.1:3000`。
- 主容器使用版本标签 `vancine-custom:1.0.2`，状态为 Healthy。
- 磁盘使用率从约 `80%` 降至 `41%`。
- PostgreSQL 与 Redis 仍未直接暴露公网。

### 产品与合规

- 邮箱验证已开启。
- Turnstile 已开启。
- 用户协议和隐私政策已提供中英文版本。
- `/sitemap.xml` 已返回真实 XML。
- 假 PayPal Webhook 请求会返回 `403`。

### 构建与代码质量

- `go vet ./...` 当前通过。
- Classic 前端生产构建通过。
- `docker compose config` 通过。
- PayPal 已改为调用官方 `/v1/notifications/verify-webhook-signature`。

## P0：公开付费上线阻断项

### 1. PayPal 完成事件仍可能跳过金额校验

`PAYMENT.CAPTURE.COMPLETED` 的资源本身通常就是 Capture，金额位于 `resource.amount`。当前代码只在存在 `resource.purchase_units[0].payments.captures` 时检查金额：

- `controller/topup_paypal.go:788`
- `controller/topup_paypal.go:794`
- `controller/topup_paypal.go:809`

因此，标准 Capture Completed 事件可能直接进入充值，而不执行金额检查。

另外：

- 没有检查币种是否等于配置的 `PayPalCurrency`。
- `CHECKOUT.ORDER.APPROVED` 分支 Capture 成功后没有解析并核对 Capture 金额与 Capture ID。
- 订阅订单在金额校验前就会执行完成逻辑：`controller/topup_paypal.go:775`。
- Return 回调在 Capture 信息缺失时仍可能调用充值：`controller/topup_paypal.go:661`、`controller/topup_paypal.go:677`。

**必须处理：**

1. 只基于服务端查询得到的 Capture 详情充值。
2. 强制要求 Capture ID 非空、状态为 `COMPLETED`。
3. 金额和币种必须与本地订单完全一致。
4. 订阅与普通充值使用同一套验证函数。
5. `CHECKOUT.ORDER.APPROVED` 只执行 Capture，不直接充值；由 Completed 事件或查询后的完整 Capture 详情完成充值。

### 2. PayPal 退款处理可能重复或错误扣减额度

当前退款处理先单独扣除用户额度，再单独更新订单状态：

- `controller/topup_paypal.go:879`
- `controller/topup_paypal.go:888`

如果额度扣减成功、订单更新失败，Webhook 重试时会再次扣减额度。

同时：

- 部分退款仍会扣除整笔充值额度。
- 退款金额和本地金额不一致时只记录日志，仍继续处理。
- 没有检查退款币种。
- 未处理 `PAYMENT.CAPTURE.REVERSED`。
- Refund、订单状态和用户额度没有放在同一个数据库事务中。

**必须处理：**

1. 创建单一事务完成订单锁定、状态检查、退款记录和额度扣减。
2. 按实际退款金额同比例扣减额度，或明确只支持整单退款并拒绝部分退款。
3. 保存 PayPal Refund ID，并增加唯一约束，确保每个退款事件只处理一次。
4. 处理 Reversed 和争议事件，至少进入人工冻结流程。

### 3. Transaction ID 不是唯一约束

`model/topup.go:23` 仅为 `transaction_id` 创建普通索引。生产数据库也只有普通索引。

这意味着同一个 PayPal Capture ID 理论上可以关联多笔订单，数据库无法提供最终幂等保护。

**必须处理：**

- 对非空 `transaction_id` 创建唯一部分索引。
- 充值事务中先检查 Capture ID 未被其他订单使用。
- 增加重复事件和并发 Return/Webhook 测试。

### 4. 仓库配置可在下次部署时恢复不安全状态

生产服务器已经使用安全 Compose，但仓库中的 `docker-compose.yml` 仍然包含：

- 明文默认数据库、Redis 和 Session 值。
- 公网 `"3000:3000"`。
- `vancine-custom:latest`。

生产和仓库配置已经漂移。任何从仓库重新初始化或执行错误工作流的操作，都可能重新暴露端口并恢复弱配置。

**必须处理：**

1. 将安全的生产 Compose 结构同步回仓库。
2. 使用 `${POSTGRES_PASSWORD}`、`${REDIS_PASSWORD}`、`${SESSION_SECRET}`。
3. 将端口固定为 `127.0.0.1:3000:3000`。
4. 添加安全的 `.env.example`，真实 `.env` 保持忽略。
5. 删除 Compose 中全部可被误用的固定密码。

### 5. SSH 和主机防护仍未完成

生产现状：

- UFW 未启用。
- Fail2ban 未启用。
- `PasswordAuthentication yes`。
- `PermitRootLogin yes`。

应用已绑定本机端口，但服务器管理入口仍暴露在密码爆破风险下。

**必须处理：**

1. 先验证第二个 SSH Key 会话可正常登录。
2. 启用 UFW，仅开放 `22`、`80`、`443`。
3. 关闭 SSH 密码登录。
4. 将 Root 登录先改为 `prohibit-password`，稳定后改为 `no`。
5. 启用 Fail2ban 或等效 SSH 防护。

### 6. 数据库备份仍不具备灾难恢复能力

已确认每日 Cron 成功执行，现有两份备份通过 gzip 完整性检查。但：

- 备份与数据库位于同一服务器和磁盘。
- 备份文件权限为 `644`。
- 脚本只检查文件非空，没有验证 SQL 可恢复。
- 没有恢复演练记录。

**必须处理：**

1. 将备份文件权限改为 `600`。
2. 每日同步至少一份到独立位置。
3. 对压缩文件执行 `gzip -t`。
4. 每月至少一次恢复到临时数据库并核对关键表。
5. 备份失败时发送告警。

## P1：发布质量阻断项

### 1. 自动化门禁仍失败

| 检查 | 2026-06-10 结果 |
|---|---|
| `go test ./...` | 失败：Controller 1、Claude 转换 3、Stream Scanner 1 |
| `go vet ./...` | 通过 |
| Default `bun run build:check` | 失败：5 个 TypeScript 错误 |
| Default `bun run lint` | 工具依赖异常，无法执行 |
| Classic `npm run build` | 通过，但仍有 CSS 与大 Bundle 警告 |
| Classic `npm run lint` | 失败：149 个文件 |
| `docker compose config` | 通过 |
| `docker build -f Dockerfile.deploy ...` | 失败：构建上下文缺少 Classic `dist` |

至少需要让 Go 测试、Default 类型检查和生产 Docker 构建通过，才适合进入公开发布。

### 2. 部署仍不可追踪、不可自动回滚

新 `deploy.sh` 已改进为版本标签，并避免自动添加未跟踪文件，但仍存在：

- 不传提交信息时可直接部署未提交工作区。
- 当前工作区有 25 个修改文件和一个 114 MB 未跟踪二进制。
- 本地 `VERSION` 为 `1.0.0`，生产镜像标签为 `1.0.2`，公开状态接口却返回 `v0.0.0`。
- Go 构建没有注入版本号。
- 健康检查失败时只退出，不自动切回上一镜像。
- 部署前没有自动数据库备份。
- 服务器端重新构建镜像标签，版本标签仍可被覆盖。
- GitHub Actions 工作流仍执行无效的 `docker compose up -d --build`。

**必须处理：**

1. 仅允许从干净且已提交的 Git SHA 部署。
2. 镜像标签使用 Git SHA，并禁止覆盖。
3. Go 构建注入版本和 Commit SHA。
4. 部署前备份，部署后 Smoke Test，失败自动回滚。
5. 删除或修复当前 GitHub Actions 部署工作流。
6. 将本地编译产物加入 `.gitignore`。

### 3. 模型 Smoke Test 脚本仍不可用

`test_models.sh` 仍然：

- 要求直接编辑脚本填入 API Key。
- 图片请求使用 `512x512`。
- 视频请求使用不存在的 `/v1/videos/generations`。
- 测试未开放的 `/v1/3d/generations`。

需要改为从环境变量读取 Key，并只测试实际开放、低成本的接口。

## P2：建议尽快处理

- 首页未返回 HSTS、CSP、X-Frame-Options、X-Content-Type-Options 等常见安全头。
- 新用户仍赠送 `500000` 配额单位；即使有邮箱和 Turnstile，也建议内测期间进一步限制。
- 仍有 7 笔超过 24 小时的 PayPal Pending 订单，建议自动过期。
- 12 笔 PayPal Success 中仍有 7 笔缺少 Transaction ID，需要标记为历史记录并避免自动退款处理。
- PayPal Webhook 当前记录所有 `paypal-*` 请求头，生产环境建议降低日志敏感度。
- PayPal 目前为 `PayPalEnabled=true`、`PayPalTestMode=true`，前台应明确标记 Sandbox，避免用户误解。

## 当前允许的范围

### 可以继续

- 5-20 人定向邀请内测。
- 免费或极低赠送额度测试。
- PayPal Sandbox 流程验证。
- 文档、模型兼容性和首次调用体验测试。

### 暂时不要

- 切换 PayPal 生产模式。
- 正式接受真实付款。
- 大规模公开推广。
- 承诺稳定 SLA。
- 大量发放免费额度。

## 最短上线整改路径

按以下顺序处理：

1. 保持 PayPal Sandbox，修复支付金额、币种、Capture ID、退款事务和唯一约束。
2. 将生产安全 Compose 同步回仓库，修复 GitHub Actions，避免安全配置回退。
3. 关闭 SSH 密码和 Root 密码登录，启用 UFW。
4. 将备份复制到独立位置，并完成一次恢复演练。
5. 修复 Go 测试、Default 类型检查和 Docker 生产构建。
6. 将部署绑定到干净 Git SHA，并完成失败回滚演练。
7. 连续运行 7 天封闭测试后，再重新评估公开付费上线。

## 新的 Go / No-Go 门槛

满足以下全部条件后，可将结论调整为公开上线 Go：

- [ ] PayPal Capture 金额、币种、状态和 ID 强制校验。
- [ ] PayPal 充值、退款和撤销具备事务与数据库幂等保护。
- [ ] PayPal Sandbox 支付、重复通知、部分退款和完整退款测试通过。
- [ ] 仓库 Compose 与生产安全配置一致。
- [ ] SSH 密码登录关闭，UFW 启用。
- [ ] 异地备份和恢复演练通过。
- [ ] `go test ./...` 通过。
- [ ] Default `build:check` 通过。
- [ ] 生产 Docker 镜像从干净工作区构建通过。
- [ ] 部署失败自动回滚验证通过。
- [ ] 封闭测试连续 7 天无 P0/P1 故障。

