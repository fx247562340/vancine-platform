# test_models.sh 现代化设计 (P0-3)

- **日期**：2026-07-19
- **分支**：`codex/test-models-p0-3`（从 `origin/main` 创建）
- **状态**：设计已由范总批准，本文件为记录
- **范围**：仅重写 `test_models.sh` + 新增 `tests/test_models_test.sh`；不触碰 Go / 前端 / 部署 / devlog

---

## 1. 目标

把 `test_models.sh` 从「硬编码、直连生产、明文 Key、错误端点、无轮询、总是写文件」的旧脚本，改造为：

1. **安全默认**：默认 dry-run，不联网、不要 Key、不花钱、不写报告。
2. **数据驱动**：模型矩阵集中在数组里，endpoint / payload 由类型派生。
3. **完整异步轮询**：视频 / 3D 提交后必须轮询到 `SUCCESS`，提交成功不算 PASS。
4. **可离线测试**：通过函数 seam + fake curl，全程不访问 vancine.com。

---

## 2. 现状问题（旧脚本缺陷）

| 问题 | 旧脚本行为 | 风险 |
|------|-----------|------|
| 明文 Key | `API_KEY=""` 硬编码空值，提示用户填入 | Key 泄露进进程参数 / 报告 |
| Authorization 明文 | `-H "Authorization: Bearer $API_KEY"` 进 curl 参数列表 | `ps` 可见 |
| 错误端点 | 视频用 `/v1/videos/generations`、3D 用 `/v1/3d/generations` | 404，计费/路由错误 |
| 无异步轮询 | 视频/3D 只看提交 HTTP 200 | 提交成功但任务失败也判 PASS |
| Seedream 尺寸错 | 全部 `512x512` | 4.5/5.0-lite 需 ≥3,686,400 像素，会 400 |
| TTS 音色错 | 用 `alloy` | Doubao-tts2.0 + alloy 触发 resource mismatch |
| 3D 入参错 | 用 `/v1/3d/generations` + 纯文本 | 404；Doubao-Seed3D-2.0 缺图上游 400 |
| 总是写报告 | 每次生成 `model_test_results_*.md` | 污染仓库 |
| 无 dry-run | 直接打生产 | 误执行产生费用 |
| 响应未脱敏 | 错误 message 直接进报告 | 可能含敏感信息 |

---

## 3. 真实接口契约（来自 router + 2026-06-19 报告 + Docs/index.jsx）

| 类型 | 提交端点 | 轮询端点 | 响应方式 |
|------|----------|----------|----------|
| 文本 | `POST /v1/chat/completions` | — | 同步 JSON |
| 图片 | `POST /v1/images/generations` | — | 同步 JSON（含 url） |
| TTS | `POST /v1/audio/speech` | — | 同步二进制 MP3 |
| 视频 | `POST /v1/video/generations` | `GET /v1/video/generations/{task_id}` | 异步 task_id |
| 3D | `POST /v1/video/generations` | `GET /v1/video/generations/{task_id}` | 异步 task_id |

> 关键：**3D 与视频共用同一端点**。不存在 `/v1/3d/generations`、`/v1/videos/generations`。3D 图片统一用 `images` 数组（Docs/index.jsx:1026-1030 明确禁止 `image_data`，网关会把 `images` 转成上游 `content[].image_url`）。

### 3.1 提交响应 task_id 提取

报告 §6.1 提交响应同时含顶层 `id` 与 `task_id`（同值）。轮询响应 §6.2 包在 `data.task_id`。提取顺序（兼容顶层或 data 包装）：

```
task_id = data.task_id        // 轮询/部分提交
       ?? top.task_id         // 提交
       ?? top.id              // 提交兜底
```

缺失 task_id → 明确 FAIL（异步类）。

### 3.2 状态机识别

后端常量（model/task.go:36-41）全大写：`SUBMITTED / QUEUED / IN_PROGRESS / FAILURE / SUCCESS / UNKNOWN`。
报告 §6.1 提交响应却返回小写 `queued`，§6.2 轮询返回大写 `SUCCESS / IN_PROGRESS`。

→ **统一大写比较**。识别集合（用户指定，含 PENDING 兜底）：

- 非终态（继续轮询）：`SUBMITTED / QUEUED / PENDING / IN_PROGRESS`
- 成功：`SUCCESS`（仅判定「存在结果 URL / 结果字段」，不打印 URL）
- 失败：`FAILURE`
- 未知状态 / 空 status / HTTP 非 2xx / JSON 解析失败 / 缺 task_id / 超时 → FAIL

---

## 4. 运行模式

| 命令 | 行为 |
|------|------|
| `./test_models.sh` | dry-run：校验依赖、矩阵、endpoint、JSON payload。不联网、不要 Key。全合法 → exit 0 |
| `./test_models.sh --live` | 每类选 1 个代表模型做低成本冒烟；视频/3D 默认不跑（需 `--allow-expensive`） |
| `./test_models.sh --live --all --allow-expensive` | 全模型实测；执行前显示数量+计费风险，交互确认 |
| 加 `--yes` | 非交互完整测试（跳过确认门禁） |

### 4.1 参数表

| 参数 | 说明 | 失败条件 |
|------|------|----------|
| `--live` | 切换到真实调用 | — |
| `--all` | 全模型（非默认代表集） | 仅 live 有效 |
| `--allow-expensive` | 解锁视频/3D 实测 | — |
| `--yes` | 跳过非交互确认 | — |
| `--models a,b` | 筛选模型（逗号分隔） | **严格**：每项须为已知模型；含未知项、空段（前导/尾随/连续逗号 `,,`）、空筛选 → 失败 |
| `--report PATH` | 写 Markdown 报告 | 父目录不存在 → 失败（不自动创建/污染） |
| `--base-url URL` | 覆盖默认 `https://vancine.com` | — |
| `--poll-interval S` | 轮询间隔秒 | 非正整数 → 失败 |
| `--timeout S` | 单任务总超时秒 | 非正整数 → 失败 |
| `--help` | 帮助 | — |

- **禁止** `--api-key`（出现即失败）。
- 未知参数 → 失败。
- `--live` 隐含需要 API Key。

---

## 5. 安全要求

1. **Key 来源**：仅 `VANCINE_API_KEY` 环境变量。live 且未设置 → `read -s` 交互输入（不回显）。
2. **dry-run 不读/不要 Key**。
3. **Authorization 不进参数列表**：用 curl `--config -` 从 stdin 读 header（`-H "Authorization: Bearer …"` 写入临时 config 文本，经 stdin 传入，不出现在 `ps`/argv）。或等价 stdin 方式。**不落地凭据文件**（不写 `~/.vancine_key` 之类，不创建/删除临时凭据文件）。
4. **禁止 `set -x`**。
5. **脱敏**：输出 / 错误 / 报告一律不含 API Key、Authorization、Cookie、完整响应体、敏感请求头。`redact()` 优先按当前 `API_KEY` **精确值**整体替换（适用任意格式 Key，不依赖 `sk-` 前缀），再清除敏感头后的值。**敏感头规则 (bound to header form)**：Set-Cookie/Cookie/Authorization 仅在呈现形如 `Name:` 的 Header 形态时才清理冒号后的整段值到行尾；无冒号的普通单词（如 "authorization policy denied"、"cookie validation failed"）**不得**被误伤；独立的 `Bearer <token>`（无冒号）单独清理。实现使用依赖的 `python3` 进行**有界的正则**替换：`(?i)\b(?:Set-Cookie|Cookie|Authorization)\b\s*:.*`（清除到行尾）+ `(?i)\bBearer\b\s+\S+`。**API_KEY 仅通过真正的 NUL 字节 (`\0`) 分隔的 stdin 流传给 Python（利用 Shell 变量不可含 NUL 的保证），绝对不可传入 argv、临时文件或日志**；`validate_api_key` 的 ASCII 控制字符检测同样经 NUL-delimited stdin 执行；测试需验证：PATH 伪造的 `python3` 记录 argv 但录不到 API_KEY 证明。
6. **Key 校验**：拒绝含 CR/LF 的 Key（防止经 `curl --config -` stdin 注入额外配置行）；拒绝含双引号的 Key（会破坏 `header = "..."` 行）。校验失败立即清空并退出，不进 argv/文件/日志。
7. **错误截断**：错误摘要单行化、截断（≤200 字符），Markdown 转义 `|` `\` 换行。
8. **报告仅 `--report PATH` 时写**；父目录缺失明确报错，不自动建目录。
9. **不创建/删除临时凭据文件**；TTS 音频正文直接丢 `/dev/null`，不存二进制临时文件。
10. **统一依赖检查**：dry-run 与 live 均在读取 API Key、确认付费及发请求前检查 `curl`/`python3`，缺失即明确退出 1。

> 实现注：Authorization 经 `curl --config -` stdin 传递。为避免凭据落盘，config 内容在内存（变量）中拼接后通过管道喂给 curl stdin；不写任何 key 文件。报告/输出里绝不回显该 header。

---

## 6. 模型矩阵

### 6.1 文本（`/v1/chat/completions`）

`deepseek-v4-flash`、`deepseek-v4-pro`、`Doubao-Seed-2.0-Code`、`Doubao-Seed-2.0-pro`、`Doubao-Seed-2.0-lite`、`Doubao-Seed-2.0-mini`

payload：`{model, messages:[{role:user, content:"Hello, say hi in one word."}], max_tokens:10}`

### 6.2 图片（`/v1/images/generations`）

| 模型 | size |
|------|------|
| `Doubao-Seedream-4.0` | `1024x1024` |
| `Doubao-Seedream-4.5` | `2048x2048` |
| `Doubao-Seedream-5.0-lite` | `2048x2048` |

payload：`{model, prompt:"A cute cat sitting on a windowsill", n:1, size}`

### 6.3 视频（`/v1/video/generations`，异步）

`Doubao-Seedance-1.5-pro`、`Doubao-Seedance-2.0-fast`、`Doubao-Seedance-2.0`

payload：`{model, prompt:"A cat walking slowly", size:"1280x720"}`

### 6.4 3D（`/v1/video/generations`，异步）

| 模型 | 入参 | live SKIP 条件 | dry-run 行为 |
|------|------|-----------|--------------|
| `Hyper3D-Gen2` | 纯文本 `{model, prompt:"A simple cube"}` | 不 SKIP（允许纯文本） | 校验 payload，计 DRY-RUN |
| `Hitem3D-2.0` | `{model, prompt, images:["$VANCINE_3D_IMAGE_URL"]}` | 未设 `VANCINE_3D_IMAGE_URL` → SKIP | 用固定占位 `https://example.invalid/reference.png` 生成并校验 `images[]`，计 DRY-RUN，不联网 |
| `Doubao-Seed3D-2.0` | `{model, prompt, images:["$VANCINE_3D_IMAGE_URL"]}` | 未设 `VANCINE_3D_IMAGE_URL` → SKIP | 同上 |

> 统一用 `images` 数组，**不用** `image_data`，**不用** `/v1/3d/generations`。dry-run 的占位 URL 用 `.invalid` TLD，确保即使误发请求也无法解析。

### 6.5 TTS（`/v1/audio/speech`）

| 模型 | voice（匹配版本后缀） |
|------|----------------------|
| `Doubao-tts`（1.0 / mars） | `zh_female_cancan_mars_bigtts` |
| `Doubao-tts2.0`（2.0 / uranus） | `zh_female_vv_uranus_bigtts`（devlog 已验证可用） |

payload：`{model, input:"Hello, this is a test.", voice, response_format:"mp3"}`

> TTS 二进制响应：正文 `-o /dev/null`，curl write-out 用 `%{size_download} %{content_type}\n%{http_code}`（body 进 `/dev/null`，stdout 首字符即 write-out 文本，**无前导换行**）。`split_resp` 取最后一段为 HTTP code、首行为 `size content_type`。前导 `\n` 会导致把 `size content_type` 误当作 code。

### 6.6 live 代表集（`--live` 不带 `--all`）

每类 1 个：文本 `deepseek-v4-flash`、图片 `Doubao-Seedream-4.0`、TTS `Doubao-tts`、视频 `Doubao-Seedance-1.5-pro`、3D `Hyper3D-Gen2`。视频/3D 仍受 `--allow-expensive` 门禁。

---

## 7. 结果判定与退出码

| 类型 | PASS 条件 |
|------|-----------|
| 文本 | 2xx + 响应可解析为有效结构（有 `choices` 或 `object`） |
| 图片 | 2xx + 响应有 `data` 数组 |
| TTS | 2xx + Content-Type 含 `audio` + 下载字节数 > 0；正文丢 `/dev/null` |
| 视频/3D | 提交取到 task_id + 轮询到 `SUCCESS`（存在结果 URL/字段，不打印 URL） |

- 汇总含 `PASS / FAIL / SKIP / DRY-RUN` 计数。
- live 任一 FAIL → exit 1；SKIP 不算失败。
- dry-run 全合法 → exit 0；任一配置非法 → exit 1。
- Ctrl-C：trap SIGINT，设置中止标志，不再发新请求，已发请求自然结束，退出码非 0。

---

## 8. TDD 离线测试设计

`tests/test_models_test.sh`：通过 **函数 seam** 注入 fake curl / clock，全部离线。

### 8.1 seam 机制

- `test_models.sh` 内所有网络调用收敛到一个函数 `http_request()`，测试通过 `source` 脚本后 override 它（或通过环境变量 `VANCINE_FAKE_FIXTURE_DIR` 指向预制响应）。
- 为允许 source 而不执行主流程：脚本顶部 `if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi` 守卫。
- 轮询通过 `VANCINE_FAKE_POLL_SEQ`（每行一个状态）驱动 fake curl 按序返回 SUBMITTED→IN_PROGRESS→SUCCESS。
- 中止 seam：`VANCINE_ABORT_AFTER` 控制 N 次调用后触发中止标志，验证不再发请求。

### 8.2 用例（每个独立，断言计数 + 退出码 + 输出不含 Key）

1. 默认 dry-run 不调 curl、不要 Key、exit 0。
2. API Key 不出现在 stdout/stderr/报告。
3. 错误响应脱敏 + 截断 + 单行。
4. 各类型 endpoint 与 payload 正确（含 Seedream 尺寸、TTS 音色、3D images 数组）。
5. 视频/3D task_id 提取（顶层 / data 包装）。
6. SUBMITTED→IN_PROGRESS→SUCCESS PASS。
7. FAILURE / 未知状态 / 超时 → FAIL。
8. `--live` 无 `--allow-expensive` 跑视频 → SKIP。
9. `--live --all` 非 `--yes` → 确认门禁（stdin 喂 'n' → abort）。
10. 缺 `VANCINE_3D_IMAGE_URL` → Hitem3D/Seed3D SKIP。
11. `--models` 筛选 + 无匹配失败 + 空筛选失败。
12. `--report` 开关 + 父目录不存在失败。
13. 退出码：live FAIL→1；dry-run→0。
14. Ctrl-C seam：中止后不再发请求。
15. `--api-key` 出现 → 失败；未知参数 → 失败；非法时间 → 失败。

### 8.3 兼容性

- macOS Bash 3.2 + Linux Bash。**禁用** 关联数组、`mapfile`、`wait -n`、`read -N`（3.2 受限）。
- 仅依赖 bash / curl / python3 / 标准 Unix 工具。
- 不访问 vancine.com，不发起真实付费任务，不删文件，不靠清理临时目录通过。

---

## 9. 不做（严格限制）

- 不调用真实 API / 不用生产 Key。
- 不改 Go / 前端 / package-lock.json / 部署文件。
- 不改/删 new-api、QuantumNous 信息（AGENTS.md Rule 6）。
- 不删任何文件。
- 不 commit / stage / push / Docker / deploy。
- 不改 `docs/devlog/2026-07.md`。

---

## 10. 验证命令

```
bash -n test_models.sh
bash -n tests/test_models_test.sh
bash tests/test_models_test.sh
./test_models.sh
rg -n '/v1/videos/generations|/v1/3d/generations|API_KEY=""|Authorization: Bearer' test_models.sh
git diff --check
git status --short
git diff --stat
```

`rg` 对错误端点 / 硬编码空 Key / 明文 Authorization 必须 **0 命中**。
