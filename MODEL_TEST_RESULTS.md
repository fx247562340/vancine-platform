# Vancine 模型可用性测试报告

> 测试时间：2026-06-09
> 测试环境：https://api.vancine.com

## 测试结果汇总

### 文本模型 ✅ 全部可用

| 模型 | 状态 | 说明 |
|------|------|------|
| deepseek-v4-flash | ✅ 成功 | DeepSeek V4 Flash，快速响应 |
| deepseek-v4-pro | ✅ 成功 | DeepSeek V4 Pro，高质量 |
| Doubao-Seed-2.0-pro | ✅ 成功 | 豆包 Seed 2.0 Pro |
| Doubao-Seed-2.0-lite | ✅ 成功 | 豆包 Seed 2.0 Lite |
| Doubao-Seed-2.0-mini | ✅ 成功 | 豆包 Seed 2.0 Mini |
| Doubao-Seed-2.0-Code | ✅ 成功 | 豆包 Seed 2.0 Code（代码专用） |

### 图片模型 ✅ 全部可用

| 模型 | 状态 | 最小分辨率 | 说明 |
|------|------|------------|------|
| Doubao-Seedream-4.0 | ✅ 成功 | 960×960 | 豆包 Seedream 4.0 |
| Doubao-Seedream-4.5 | ✅ 成功 | 1920×1920 | 豆包 Seedream 4.5 |
| Doubao-Seedream-5.0-lite | ✅ 成功 | 1920×1920 | 豆包 Seedream 5.0 Lite |

**注意**：图片模型有最小分辨率限制，请求时需要指定足够大的 size。

### 视频模型 ✅ 全部可用

| 模型 | 状态 | API 端点 | 说明 |
|------|------|----------|------|
| Doubao-Seedance-1.5-pro | ✅ 成功 | POST /v1/videos | 豆包 Seedance 1.5 Pro |
| Doubao-Seedance-2.0 | ✅ 成功 | POST /v1/videos | 豆包 Seedance 2.0 |
| Doubao-Seedance-2.0-fast | ✅ 成功 | POST /v1/videos | 豆包 Seedance 2.0 Fast |

### 3D 模型 ⚠️ 仅限 Playground

| 模型 | 状态 | 说明 |
|------|------|------|
| Doubao-Seed3D-2.0 | ⚠️ Playground | 仅在 Playground 中可用 |
| Hyper3D-Gen2 | ⚠️ Playground | 仅在 Playground 中可用 |
| Hitem3D-2.0 | ⚠️ Playground | 仅在 Playground 中可用 |

**说明**：3D 模型当前只在 Playground 路由中实现，API 端点 `/v1/3d/generations` 暂未开放。

### 语音合成模型 ✅ 可用

| 模型 | 状态 | 说明 |
|------|------|------|
| Doubao-tts | ✅ 成功 | 豆包 TTS |
| Doubao-tts2.0 | ✅ 成功 | 豆包 TTS 2.0 |

---

## API 使用示例

### 文本生成

```bash
curl -X POST "https://api.vancine.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

### 图片生成

```bash
curl -X POST "https://api.vancine.com/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "Doubao-Seedream-4.0",
    "prompt": "A cute cat",
    "n": 1,
    "size": "1024x1024"
  }'
```

### 视频生成

```bash
curl -X POST "https://api.vancine.com/v1/videos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "A cat walking slowly"
  }'
```

### 语音合成

```bash
curl -X POST "https://api.vancine.com/v1/audio/speech" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "Doubao-tts",
    "input": "Hello, this is a test.",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

---

## 模型定价

| 模型 | 类型 | 价格（$/1M tokens） |
|------|------|---------------------|
| deepseek-v4-flash | 文本 | $0.14 |
| deepseek-v4-pro | 文本 | $0.42 |
| Doubao-Seed-2.0-pro | 文本 | $0.73 |
| Doubao-Seed-2.0-lite | 文本 | $0.14 |
| Doubao-Seed-2.0-mini | 文本 | $0.28 |
| Doubao-Seedream-4.0 | 图片 | $0.027/张 |
| Doubao-Seedream-4.5 | 图片 | $0.034/张 |
| Doubao-Seedream-5.0-lite | 图片 | $0.030/张 |
| Doubao-Seedance-1.5-pro | 视频 | $0.24/秒 |
| Doubao-Seedance-2.0 | 视频 | $0.68/秒 |
| Doubao-Seedance-2.0-fast | 视频 | $0.55/秒 |
| Doubao-tts | 语音 | $0.004/1K字符 |
| Doubao-tts2.0 | 语音 | $0.008/1K字符 |

---

## 总结

- **可用模型总数**：16 个
- **文本模型**：6 个 ✅
- **图片模型**：3 个 ✅
- **视频模型**：3 个 ✅
- **语音模型**：2 个 ✅
- **3D 模型**：3 个 ⚠️（仅限 Playground）

**推荐主推模型**：
1. **文本**：deepseek-v4-flash（性价比高）、Doubao-Seed-2.0-pro（高质量）
2. **图片**：Doubao-Seedream-4.0（速度快）、Doubao-Seedream-4.5（质量高）
3. **视频**：Doubao-Seedance-1.5-pro（性价比高）、Doubao-Seedance-2.0（最新）
4. **语音**：Doubao-tts2.0（最新版本）

---

*文档版本：v1.0*
*测试日期：2026-06-09*
