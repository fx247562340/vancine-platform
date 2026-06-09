# Vancine 快速开始

> 3 分钟完成第一次 API 调用

## 1. 获取 API Key

1. 访问 [vancine.com](https://vancine.com)
2. 点击「注册」创建账号
3. 登录后进入「控制台」→「令牌」
4. 点击「新建令牌」，复制生成的 API Key

新用户自动获得 **$1.00 免费额度**，足够完成多次测试调用。

---

## 2. 选择你的第一个模型

| 需求 | 推荐模型 | 价格 |
|------|----------|------|
| 文本对话 | `deepseek-v4-flash` | $0.14/1M tokens |
| 图片生成 | `Doubao-Seedream-4.0` | $0.027/张 |
| 视频生成 | `Doubao-Seedance-1.5-pro` | $0.24/秒 |
| 语音合成 | `Doubao-tts` | $0.004/1K字符 |

---

## 3. 发送第一个请求

### 方式一：curl（推荐新手）

**文本对话**：

```bash
curl -X POST "https://vancine.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "Hello! Say hi in one sentence."}],
    "max_tokens": 50
  }'
```

**图片生成**：

```bash
curl -X POST "https://vancine.com/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "Doubao-Seedream-4.0",
    "prompt": "A cute cat sitting on a windowsill, digital art",
    "n": 1,
    "size": "1024x1024"
  }'
```

### 方式二：Python

```python
import requests

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://vancine.com/v1"

# 文本对话
response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "model": "deepseek-v4-flash",
        "messages": [{"role": "user", "content": "Hello!"}],
        "max_tokens": 50
    }
)

print(response.json()["choices"][0]["message"]["content"])
```

### 方式三：Node.js

```javascript
const response = await fetch('https://vancine.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Hello!' }],
    max_tokens: 50,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### 方式四：OpenAI SDK（推荐）

Vancine 完全兼容 OpenAI API 格式，可以直接使用 OpenAI SDK：

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://vancine.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=50
)

print(response.choices[0].message.content)
```

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'YOUR_API_KEY',
  baseURL: 'https://vancine.com/v1',
});

const response = await client.chat.completions.create({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 50,
});

console.log(response.choices[0].message.content);
```

---

## 4. 理解响应

成功的响应格式：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

- `choices[0].message.content` — 模型的回复内容
- `usage.total_tokens` — 本次请求消耗的 token 数量

---

## 5. 常见错误排查

### 401 Unauthorized

```
{"error": {"message": "Invalid API key"}}
```

**解决**：检查 API Key 是否正确，是否有多余的空格。

### 402 Insufficient Quota

```
{"error": {"message": "用户额度不足"}}
```

**解决**：在控制台查看余额，或充值后重试。

### 404 Model Not Found

```
{"error": {"message": "Model not found"}}
```

**解决**：检查模型名称是否正确，参考[模型列表](#2-选择你的第一个模型)。

### 429 Rate Limited

```
{"error": {"message": "Rate limit exceeded"}}
```

**解决**：降低请求频率，或联系管理员提高限制。

---

## 6. 下一步

- 📖 查看 [完整 API 文档](https://vancine.com/docs)
- 💰 查看 [模型定价](https://vancine.com/pricing)
- 🔧 查看 [可用模型列表](MODEL_TEST_RESULTS.md)
- 💬 遇到问题？联系 support@vancine.com

---

## 7. 支持的 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 文本对话 |
| `/v1/images/generations` | POST | 图片生成 |
| `/v1/videos` | POST | 视频生成（异步） |
| `/v1/audio/speech` | POST | 语音合成 |
| `/v1/models` | GET | 获取模型列表 |
| `/v1/dashboard/billing/usage` | GET | 查询用量 |

所有端点都需要在 Header 中携带：
```
Authorization: Bearer YOUR_API_KEY
```

---

*文档版本：v1.0*
*更新日期：2026-06-09*
