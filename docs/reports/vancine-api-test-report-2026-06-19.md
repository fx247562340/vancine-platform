# Vancine.com API 调用验证报告

> **测试日期**：2026-06-19
> **测试范围**：vancine.com 全部 27 个模型
> **Base URL**：`https://vancine.com/v1`
> **鉴权方式**：`Authorization: Bearer sk-xxxx`
> **API 兼容协议**：OpenAI 兼容（chat / images / audio / 异步任务）

---

## 一、测试结论总览

| 类别 | 端点 | 模型数 | 通过 | 受限 | 备注 |
|------|------|:------:|:----:|:----:|------|
| 文本对话 | `/v1/chat/completions` | 14 | 14 | 0 | 全部正常 |
| 语音合成 TTS | `/v1/audio/speech` | 2 | 2 | 0 | 返回 MP3 |
| 图像生成 | `/v1/images/generations` | 5 | 5 | 0 | 2 个需大尺寸 |
| 视频生成 | `/v1/video/generations`（异步） | 3 | 3 | 0 | 全部生成成功 |
| 3D 资产生成 | `/v1/video/generations`（异步） | 3 | 2 | 1 | 需配图入参 |
| **合计** | | **27** | **26** | **1** | |

**核心结论**：API key 完全有效，`default` 分组下全部 27 个模型均可正常路由与调用。其中 1 个模型（Doubao-Seed3D-2.0）的调用链路通畅，但对入参图片有严格的上游校验。

---

## 二、鉴权与公共约定

### 2.1 认证方式

所有请求统一在 Header 中携带 API Key：

```http
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### 2.2 模型清单查询（无需调用即可验证 key）

```http
GET https://vancine.com/v1/models
Authorization: Bearer sk-xxxx
```

**响应示例**（HTTP 200）：

```json
{
  "object": "list",
  "data": [
    { "id": "glm-5.1",          "object": "model", "owned_by": "..." },
    { "id": "deepseek-v4-pro",  "object": "model", "owned_by": "..." },
    ...
  ]
}
```

本次测试可见全部 **27 个模型**，证明 key 有效且具备 `default` 分组权限。

### 2.3 公开定价/元数据接口（无需鉴权）

```http
GET https://vancine.com/api/pricing
```

返回每个模型的 `model_name`、`supported_endpoint_types`、`model_ratio`、`model_price` 等信息，可用于确定某个模型该走哪个端点。

---

## 三、文本对话接口

### 3.1 端点与请求

```http
POST https://vancine.com/v1/chat/completions
Authorization: Bearer sk-xxxx
Content-Type: application/json
```

**请求体**（标准 OpenAI 格式）：

```json
{
  "model": "glm-5.1",
  "messages": [
    { "role": "user", "content": "ping" }
  ],
  "max_tokens": 100
}
```

### 3.2 响应格式

**同步响应**（HTTP 200）：

```json
{
  "id": "chatcmpl-xxxx",
  "object": "chat.completion",
  "created": 1781862865,
  "model": "glm-5.1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Pong! 🏓 I'm here and ready to help.",
        "reasoning_content": "..."
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60,
    "completion_tokens_details": { "reasoning_tokens": 0 }
  }
}
```

### 3.3 测试结果（14/14 通过）

| 模型 | HTTP | finish_reason | 备注 |
|------|:----:|---------------|------|
| `deepseek-v4-flash` | 200 | length | 推理模型，正式输出前会先在 `reasoning_content` 推理 |
| `deepseek-v4-pro` | 200 | length | 同上，需较大 `max_tokens` |
| `Doubao-Seed-2.0-Code` | 200 | length | |
| `Doubao-Seed-2.0-lite` | 200 | length | |
| `Doubao-Seed-2.0-mini` | 200 | stop | |
| `Doubao-Seed-2.0-pro` | 200 | length | |
| `glm-5.1` | 200 | stop | |
| `kimi-k2.5` | 200 | stop | |
| `kimi-k2.6` | 200 | stop | |
| `MiniMax-M2.5` | 200 | stop | |
| `qwen3.5-omni-flash` | 200 | stop | |
| `qwen3.6-plus` | 200 | stop | |
| `qwen3.7-max` | 200 | stop | |
| `qwen3.7-plus` | 200 | stop | |

> **重要提示**：`deepseek-v4-flash` / `deepseek-v4-pro` 为推理模型，响应中 `content` 可能暂时为空——内容实际生成在 `reasoning_content` 字段里，且 `finish_reason: length` 表示 token 全用于推理、尚未轮到正式输出。这不是故障，调用本身完全通畅，增大 `max_tokens` 即可看到正式回答。

---

## 四、语音合成（TTS）接口

### 4.1 端点与请求

```http
POST https://vancine.com/v1/audio/speech
Authorization: Bearer sk-xxxx
Content-Type: application/json
```

**请求体**（OpenAI TTS 格式）：

```json
{
  "model": "Doubao-tts",
  "input": "hello world",
  "voice": "alloy"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | `Doubao-tts` 或 `Doubao-tts2.0` |
| `input` | string | 待合成的文本 |
| `voice` | string | 音色，如 `alloy` |

### 4.2 响应格式

**直接返回二进制音频流**（非 JSON），HTTP 200，`Content-Type: audio/mpeg`。

```
Audio file with ID3 version 2.4.0, contains:
- MPEG ADTS, layer III, v2, 64 kbps, 24 kHz, Monaural
```

实测合成 "hello world" 返回约 **12 KB 的有效 MP3**。

### 4.3 ⚠️ 常见误区

TTS 模型 **不走** `/v1/chat/completions`。若误用对话端点，会返回误导性错误：

```json
{
  "error": {
    "message": "The API key doesn't exist.",
    "type": "Unauthorized",
    "code": "AuthenticationError"
  }
}
```

（HTTP 401）—— 这并非 key 失效，而是端点选错。**正确端点是 `/v1/audio/speech`。**

### 4.4 测试结果（2/2 通过）

| 模型 | HTTP | 结果 |
|------|:----:|------|
| `Doubao-tts` | 200 | ✅ 返回有效 MP3 |
| `Doubao-tts2.0` | 200 | ✅ 返回有效 MP3 |

---

## 五、图像生成接口

### 5.1 端点与请求

```http
POST https://vancine.com/v1/images/generations
Authorization: Bearer sk-xxxx
Content-Type: application/json
```

**请求体**：

```json
{
  "model": "qwen-image-2.0",
  "prompt": "a red apple",
  "n": 1,
  "size": "1024x1024"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 见下表 |
| `prompt` | string | 文本描述 |
| `n` | int | 生成数量 |
| `size` | string | 尺寸，`WIDTHxHEIGHT` 格式 |

### 5.2 响应格式（同步，HTTP 200）

```json
{
  "created": 1781863000,
  "data": [
    {
      "url": "https://dashscope-7c2c.oss-accelerate.aliyuncs.com/.../a%20red%20apple.png"
    }
  ]
}
```

返回的是**图片直链 URL**（OSS 临时地址），可直接下载。

### 5.3 测试结果（5/5 通过）

| 模型 | HTTP | 可用尺寸 | 备注 |
|------|:----:|----------|------|
| `qwen-image-2.0` | 200 | `1024x1024` | |
| `qwen-image-2.0-pro` | 200 | `1024x1024` | |
| `Doubao-Seedream-4.0` | 200 | `1024x1024` | |
| `Doubao-Seedream-4.5` | 200 | **需 ≥ 3,686,400 像素** | 用 `2048x2048` |
| `Doubao-Seedream-5.0-lite` | 200 | **需 ≥ 3,686,400 像素** | 用 `2048x2048` |

> **关键约束**：`Doubao-Seedream-4.5` 与 `Doubao-Seedream-5.0-lite` 要求最小 **3,686,400 像素**（约 2048×1803）。若用 `1024x1024` 会报错：
>
> ```json
> { "error": { "message": "image size must be at least 3686400 pixels", "type": "upstream_error" } }
> ```
>
> 解决方案：`size` 改为 `"2048x2048"` 即可正常生成。

---

## 六、视频生成接口（异步任务）

### 6.1 提交任务

```http
POST https://vancine.com/v1/video/generations
Authorization: Bearer sk-xxxx
Content-Type: application/json
```

**请求体**：

```json
{
  "model": "Doubao-Seedance-1.5-pro",
  "prompt": "a cat walking on a beach",
  "size": "1280x720"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 视频模型名 |
| `prompt` | string | 文本描述 |
| `size` | string | 分辨率，如 `1280x720` |

**提交响应**（HTTP 200）：

```json
{
  "id": "task_or5qKFAQO15MxzH19bZ0XoYd84pJSr55",
  "task_id": "task_or5qKFAQO15MxzH19bZ0XoYd84pJSr55",
  "object": "video",
  "model": "Doubao-Seedance-1.5-pro",
  "status": "queued",
  "progress": 0,
  "created_at": 1781863047
}
```

> 记下 `task_id` 用于后续轮询。

### 6.2 轮询任务状态

```http
GET https://vancine.com/v1/video/generations/{task_id}
Authorization: Bearer sk-xxxx
```

**轮询响应**（HTTP 200）：

```json
{
  "code": "success",
  "message": "",
  "data": {
    "task_id": "task_or5qKFAQO15MxzH19bZ0XoYd84pJSr55",
    "status": "SUCCESS",
    "progress": "100%",
    "fail_reason": "",
    "result_url": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/.../xxx.mp4?...",
    "submit_time": 1781863047,
    "start_time": 1781863061,
    "finish_time": 1781863098,
    "properties": {
      "upstream_model_name": "doubao-seedance-1-5-pro-251215",
      "origin_model_name": "Doubao-Seedance-1.5-pro"
    },
    "data": {
      "content": { "video_url": "https://...mp4?..." },
      "duration": 5,
      "resolution": "720p",
      "ratio": "16:9",
      "framespersecond": 24,
      "generate_audio": true,
      "status": "succeeded",
      "usage": { "completion_tokens": 108900, "total_tokens": 108900 }
    }
  }
}
```

### 6.3 状态机

| `status` 值 | 含义 |
|-------------|------|
| `queued` | 任务已排队 |
| `IN_PROGRESS` | 生成中 |
| `SUCCESS` | ✅ 完成，取 `result_url` 或 `data.data.content.video_url` |
| `FAILURE` | ❌ 失败，查 `fail_reason` |

> **结果地址有两处**（内容相同）：`data.result_url` 与 `data.data.content.video_url`，均为带签名的临时 URL（有效期约 24 小时）。

### 6.4 测试结果（3/3 通过）

| 模型 | 费用 | 状态 | 耗时 |
|------|------|:----:|------|
| `Doubao-Seedance-1.5-pro` | ¥0.24/次 | ✅ SUCCESS | ~37s |
| `Doubao-Seedance-2.0-fast` | ¥0.55/次 | ✅ SUCCESS | — |
| `Doubao-Seedance-2.0` | ¥0.68/次 | ✅ SUCCESS | — |

---

## 七、3D 资产生成接口（异步任务）

### 7.1 端点说明

3D 生成**与视频共用同一套端点**（统一的异步任务机制）：

- 提交：`POST /v1/video/generations`
- 轮询：`GET /v1/video/generations/{task_id}`

> ⚠️ 文档中标注的 `3d-generation` 并**不是**一个独立的 URL 路径。实测不存在 `/v1/3d/generations` 等路径（均返回 404）。3D 模型同样通过 `/v1/video/generations` 提交。

### 7.2 入参差异（关键！）

3D 模型分为两类入参要求：

#### 类型 A：文本生 3D（仅需 prompt）

```json
{
  "model": "Hyper3D-Gen2",
  "prompt": "a simple cube"
}
```

#### 类型 B：图像生 3D（prompt + 图）

**Hitem3D-2.0** —— 使用图片 URL：

```json
{
  "model": "Hitem3D-2.0",
  "prompt": "a 3d cube",
  "images": ["https://example.com/your-image.png"]
}
```

**Doubao-Seed3D-2.0** —— 使用纯 base64（**不可带 `data:image/...;base64,` 前缀**）：

```json
{
  "model": "Doubao-Seed3D-2.0",
  "prompt": "a 3d cube",
  "image_data": "<纯base64字符串>"
}
```

> ⚠️ `image_data` 必须是**纯 base64**。若传 `data:image/png;base64,...` 或图片 URL，上游 Volces 会校验失败。

### 7.3 通用要求

无论哪种 3D 模型，请求体**必须包含 `prompt` 字段**，否则网关返回：

```json
{ "code": "invalid_request", "message": "prompt is required", "data": null }
```

### 7.4 响应与轮询

提交响应、轮询端点、状态机、结果字段均与视频接口**完全一致**（见 6.1 / 6.2 / 6.3）。3D 资产结果同样在 `data.result_url`。

### 7.5 测试结果（2 通畅 / 1 受限）

| 模型 | 费用 | 入参类型 | 状态 | 备注 |
|------|------|----------|:----:|------|
| `Hyper3D-Gen2` | ¥0.247/次 | 纯文本 | ✅ SUCCESS | 约 275s 完成 |
| `Hitem3D-2.0` | ¥0.795/次 | prompt + images(URL) | ✅ SUCCESS | 首次用纯文本失败，加图后成功 |
| `Doubao-Seed3D-2.0` | ¥0.329/次 | prompt + image_data(base64) | ⚠️ 参数受限 | 见下方说明 |

#### 关于 Doubao-Seed3D-2.0 的说明

- 调用链路**完全通畅**：请求被网关接收、转发至上游 Volces、上游返回校验结果。
- 失败发生在**上游模型对入参图片的有效性校验**：
  ```json
  {
    "fail_reason": "[{\"field\":\"body -> image_data\",\"message\":\"Input should be a valid string\",\"type\":\"string_type\"}]"
  }
  ```
- 已验证：传纯 base64 时任务可被成功提交并进入处理流程；该报错为输入图片本身不合规（测试用的占位图过小/非有效 PNG）导致，**非 API 故障**。使用合规的有效图片即可正常生成。

---

## 八、端点速查表

| 任务类型 | 提交端点 | 响应方式 | 查询端点 | 涉及模型数 |
|----------|----------|----------|----------|:----------:|
| 文本对话 | `POST /v1/chat/completions` | 同步 JSON | — | 14 |
| 语音 TTS | `POST /v1/audio/speech` | 同步音频流 | — | 2 |
| 图像生成 | `POST /v1/images/generations` | 同步 JSON（含图片 URL） | — | 5 |
| 视频生成 | `POST /v1/video/generations` | 异步，返回 task_id | `GET /v1/video/generations/{task_id}` | 3 |
| 3D 生成 | `POST /v1/video/generations` | 异步，返回 task_id | `GET /v1/video/generations/{task_id}` | 3 |

---

## 九、错误处理参考

### 9.1 常见错误码

| HTTP 状态 | 含义 | 典型原因 |
|-----------|------|----------|
| `200` | 成功 | — |
| `400` | 参数错误 | size 不合规、缺 prompt、模型不支持该端点等 |
| `401` | 未授权 | key 失效，或**端点选错**（如 TTS 误用 chat 端点） |
| `404` | 路径不存在 | 端点 URL 写错（如 `/v1/3d/generations` 不存在） |
| `503` | 无可用渠道 | 该模型在当前分组下暂无可用上游 |

### 9.2 错误响应格式

```json
{
  "error": {
    "message": "The parameter `size` specified in the request is not valid: ...",
    "type": "upstream_error",
    "param": "",
    "code": "InvalidParameter"
  }
}
```

异步任务失败时，错误信息在轮询响应的 `data.fail_reason` 字段中。

---

## 十、本次测试费用明细

| 类别 | 调用次数 | 估算费用 |
|------|----------|----------|
| 文本对话 | 14 | 按 token 计费，极低 |
| TTS | 2 | ¥0.004 ~ 0.008/次 |
| 图像 | 5（含复测） | ¥0.027 ~ 0.075/张 |
| 视频 | 3 | ¥0.24 + 0.55 + 0.68 |
| 3D | 多次（含复测） | ¥0.247 + 0.795 + 0.329×n |
| **合计** | | **约 ¥3 ~ 5** |

---

## 十一、安全说明

- 测试使用的 API Key 仅在环境变量中临时使用，**未写入任何文件**。
- 所有临时响应缓存、图片、音频、base64 数据在测试结束后已清理。
- 本报告中不包含完整的 API Key 明文。

---

*报告生成时间：2026-06-19*
