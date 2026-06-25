/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status';

/* ──────────────────── Color constants ──────────────────── */

const C = {
  text: { h1: '#f0f0f0', body: '#d1d5db', muted: '#9ca3af', subtle: '#6b7280' },
  bg: { light: '#1a1a1a', card: '#141414', code: '#0d0d1a' },
  border: '#2a2a2a',
  accent: '#a78bfa', accentBg: 'rgba(167,139,250,0.1)',
  badge: {
    purple: { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa' },
    green: { bg: 'rgba(52,211,153,0.15)', text: '#34d399' },
    blue: { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa' },
    orange: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
    red: { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
    gray: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af' },
  },
  method: { GET: '#34d399', POST: '#60a5fa', PUT: '#fbbf24', DELETE: '#f87171' },
};

/* ──────────────────── data ──────────────────── */

const L = {
  en: {
    title: 'API Documentation',
    sub: 'Integration guide for Vancine text, image, video, audio, and 3D models.',
    lastUpdated: 'Last updated: June 2026',
    copy: 'Copy',
    copied: '✓ Copied',
    yes: 'Yes',
    no: 'No',
    parameter: 'Parameter',
    type: 'Type',
    required: 'Required',
    description: 'Description',
    model: 'Model',
    category: 'Category',
    endpoint: 'Endpoint',
    result: 'Result',
    notes: 'Notes',
    status: 'Status',
    meaning: 'Meaning',
    action: 'Action',
    nav: [
      { k: 'quickstart', t: 'Quick Start' },
      { k: 'auth', t: 'Authentication' },
      { k: 'capabilities', t: 'Capabilities' },
      { k: 'models', t: 'Models & Pricing' },
      { k: 'chat', t: 'Chat Completions' },
      { k: 'image', t: 'Image Generation' },
      { k: 'video', t: 'Video Generation' },
      { k: 'td', t: '3D Generation' },
      { k: 'audio', t: 'Audio / TTS' },
      { k: 'errors', t: 'Error Handling' },
      { k: 'sdks', t: 'SDKs & Tools' },
      { k: 'agents', t: 'Agent Integration' },
      { k: 'faq', t: 'FAQ' },
    ],
  },
  zh: {
    title: 'API 文档',
    sub: 'Vancine 文本、图片、视频、音频和 3D 模型接入指南。',
    lastUpdated: '最近更新：2026年6月',
    copy: '复制',
    copied: '✓ 已复制',
    yes: '是',
    no: '否',
    parameter: '参数',
    type: '类型',
    required: '必填',
    description: '说明',
    model: '模型',
    category: '类别',
    endpoint: '端点',
    result: '结果',
    notes: '备注',
    status: '状态',
    meaning: '含义',
    action: '处理方式',
    nav: [
      { k: 'quickstart', t: '快速开始' },
      { k: 'auth', t: '认证方式' },
      { k: 'capabilities', t: '能力概览' },
      { k: 'models', t: '模型与定价' },
      { k: 'chat', t: '对话补全' },
      { k: 'image', t: '图片生成' },
      { k: 'video', t: '视频生成' },
      { k: 'td', t: '3D 生成' },
      { k: 'audio', t: '音频 / TTS' },
      { k: 'errors', t: '错误处理' },
      { k: 'sdks', t: 'SDK 与工具' },
      { k: 'agents', t: 'Agent 接入' },
      { k: 'faq', t: '常见问题' },
    ],
  },
};

const TEXT_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'Doubao-Seed-2.0-Code',
  'Doubao-Seed-2.0-lite',
  'Doubao-Seed-2.0-mini',
  'Doubao-Seed-2.0-pro',
  'glm-5.1',
  'kimi-k2.5',
  'kimi-k2.6',
  'MiniMax-M2.5',
  'qwen3.5-omni-flash',
  'qwen3.6-plus',
  'qwen3.7-max',
  'qwen3.7-plus',
];

const IMAGE_MODELS = [
  ['qwen-image-2.0', '1024x1024', ''],
  ['qwen-image-2.0-pro', '1024x1024', ''],
  ['Doubao-Seedream-4.0', '1024x1024', ''],
  ['Doubao-Seedream-4.5', '2048x2048', '≥ 3,686,400 px'],
  ['Doubao-Seedream-5.0-lite', '2048x2048', '≥ 3,686,400 px'],
];

const VIDEO_MODELS = [
  ['Doubao-Seedance-1.5-pro', '¥0.24 / call', '~37s in verification'],
  ['Doubao-Seedance-2.0-fast', '¥0.55 / call', 'async generation'],
  ['Doubao-Seedance-2.0', '¥0.68 / call', 'async generation'],
];

const THREE_D_MODELS = [
  ['Hyper3D-Gen2', 'images optional', 'text or image reference'],
  ['Hitem3D-2.0', 'images optional', 'image reference recommended'],
  ['Doubao-Seed3D-2.0', 'images required', 'image-to-3D only'],
];

/* ──────────────────── UI atoms ──────────────────── */

const Badge = ({ children, color = 'purple' }) => {
  const b = C.badge[color] || C.badge.gray;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '12px', fontWeight: 500, borderRadius: '6px', background: b.bg, color: b.text }}>
      {children}
    </span>
  );
};

const MethodBadge = ({ method }) => (
  <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '12px', fontWeight: 700, color: '#fff', borderRadius: '4px', background: C.method[method] || '#6b7280' }}>
    {method}
  </span>
);

const Endpoint = ({ method, path, desc }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: C.bg.light, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
    <MethodBadge method={method} />
    <div>
      <code style={{ fontSize: '14px', fontWeight: 600, color: C.text.h1 }}>{path}</code>
      {desc && <p style={{ fontSize: '14px', color: C.text.muted, marginTop: '4px' }}>{desc}</p>}
    </div>
  </div>
);

const Callout = ({ type = 'info', children }) => {
  const styles = {
    info: { border: '#60a5fa', bg: 'rgba(96,165,250,0.08)', text: '#93c5fd' },
    warning: { border: '#fbbf24', bg: 'rgba(251,191,36,0.08)', text: '#fcd34d' },
    tip: { border: '#34d399', bg: 'rgba(52,211,153,0.08)', text: '#6ee7b7' },
    danger: { border: '#f87171', bg: 'rgba(248,113,113,0.08)', text: '#fca5a5' },
  };
  const s = styles[type] || styles.info;
  const icons = { info: 'ℹ️', warning: '⚠️', tip: '💡', danger: '🚫' };
  return (
    <div style={{ borderLeft: `4px solid ${s.border}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', background: s.bg, color: s.text }}>
      <span style={{ marginRight: '4px' }}>{icons[type]}</span> {children}
    </div>
  );
};

const ParamTable = ({ params, labels }) => (
  <div style={{ overflowX: 'auto', marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px' }}>
    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: C.bg.light }}>
          {[labels.parameter, labels.type, labels.required, labels.description].map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: C.text.body, borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {params.map(([name, type, req, desc], i) => (
          <tr key={i} style={{ borderBottom: i < params.length - 1 ? `1px solid ${C.bg.light}` : 'none' }}>
            <td style={{ padding: '12px 16px' }}>
              <code style={{ fontSize: '13px', fontFamily: 'monospace', color: C.accent, background: C.accentBg, padding: '2px 6px', borderRadius: '4px' }}>{name}</code>
            </td>
            <td style={{ padding: '12px 16px' }}><Badge color="gray">{type}</Badge></td>
            <td style={{ padding: '12px 16px' }}>
              {req ? <Badge color="red">{labels.yes}</Badge> : <Badge color="gray">{labels.no}</Badge>}
            </td>
            <td style={{ padding: '12px 16px', color: C.text.muted }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CodeBlock = ({ code, title, labels }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ marginBottom: '24px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: C.bg.light, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: C.text.muted }}>{title}</span>
          <button onClick={copy} style={{ fontSize: '12px', color: C.text.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
      )}
      <pre style={{ background: C.bg.code, color: '#e2e8f0', padding: '16px', overflowX: 'auto', fontSize: '13px', lineHeight: 1.7, margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.border}`, marginBottom: '16px' }}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        style={{
          padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', background: 'none',
          borderBottom: `2px solid ${active === tab.key ? C.accent : 'transparent'}`,
          color: active === tab.key ? C.accent : C.text.muted, marginBottom: '-1px',
        }}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const H2 = ({ children }) => (
  <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: C.text.h1, scrollMarginTop: '80px' }}>{children}</h2>
);

const H3 = ({ children }) => (
  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', marginTop: '24px', color: C.text.h1 }}>{children}</h3>
);

const P = ({ children }) => (
  <p style={{ color: C.text.muted, marginBottom: '16px', lineHeight: 1.7 }}>{children}</p>
);

const Table = ({ headers, rows, renderRow }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: C.bg.light }}>
          {headers.map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: C.text.body, borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => renderRow(row, i, i === rows.length - 1))}
      </tbody>
    </table>
  </div>
);

const Td = ({ children, style }) => (
  <td style={{ padding: '12px 16px', verticalAlign: 'top', ...style }}>{children}</td>
);

const Tr = ({ last, children }) => (
  <tr style={{ borderBottom: last ? 'none' : `1px solid ${C.bg.light}` }}>{children}</tr>
);

/* ──────────────────── Code Samples ──────────────────── */

const buildSamples = ({ baseUrl, isZh }) => ({
  chat: {
    curl: {
      title: 'cURL',
      code: `curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "glm-5.1",
    "messages": [
      { "role": "user", "content": "ping" }
    ],
    "max_tokens": 100
  }'`,
    },
    python: {
      title: 'Python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="glm-5.1",
    messages=[{"role": "user", "content": "ping"}],
    max_tokens=100,
)

print(response.choices[0].message.content)
# Reasoning models may also return response.choices[0].message.reasoning_content`,
    },
    node: {
      title: 'Node.js',
      code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-api-key",
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "glm-5.1",
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
    },
  },
  image: {
    curl: {
      title: 'cURL',
      code: `curl -X POST ${baseUrl}/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "qwen-image-2.0",
    "prompt": "a red apple on a wooden table",
    "n": 1,
    "size": "1024x1024"
  }'`,
    },
    python: {
      title: 'Python',
      code: `import requests

response = requests.post(
    "${baseUrl}/images/generations",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json",
    },
    json={
        "model": "qwen-image-2.0",
        "prompt": "a red apple on a wooden table",
        "n": 1,
        "size": "1024x1024",
    },
)

print(response.json()["data"][0]["url"])`,
    },
    node: {
      title: 'Node.js',
      code: `const response = await fetch("${baseUrl}/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen-image-2.0",
    prompt: "a red apple on a wooden table",
    n: 1,
    size: "1024x1024",
  }),
});

const data = await response.json();
console.log(data.data[0].url);`,
    },
  },
  video: {
    curl: {
      title: 'cURL',
      code: `# ${isZh ? '1. 提交异步任务' : '1. Submit the async task'}
curl -X POST ${baseUrl}/video/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "a cat walking on a beach",
    "size": "1280x720"
  }'

# ${isZh ? '响应里保存 task_id' : 'Save task_id from the response'}
# {"task_id":"task_xxx","status":"queued"}

# ${isZh ? '2. 轮询任务状态' : '2. Poll task status'}
curl ${baseUrl}/video/generations/task_xxx \\
  -H "Authorization: Bearer sk-your-api-key"`,
    },
    python: {
      title: 'Python',
      code: `import time
import requests

API_KEY = "sk-your-api-key"
BASE_URL = "${baseUrl}"

submit = requests.post(
    f"{BASE_URL}/video/generations",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "Doubao-Seedance-1.5-pro",
        "prompt": "a cat walking on a beach",
        "size": "1280x720",
    },
).json()

task_id = submit["task_id"]

while True:
    result = requests.get(
        f"{BASE_URL}/video/generations/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()
    status = result.get("data", {}).get("status")
    print(status)

    if status == "SUCCESS":
        print(result["data"].get("result_url"))
        break
    if status == "FAILURE":
        print(result["data"].get("fail_reason"))
        break

    time.sleep(5)`,
    },
    node: {
      title: 'Node.js',
      code: `const API_KEY = "sk-your-api-key";
const BASE_URL = "${baseUrl}";

const submitRes = await fetch(BASE_URL + "/video/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "Doubao-Seedance-1.5-pro",
    prompt: "a cat walking on a beach",
    size: "1280x720",
  }),
});

const { task_id } = await submitRes.json();

while (true) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const pollRes = await fetch(BASE_URL + "/video/generations/" + task_id, {
    headers: { Authorization: "Bearer " + API_KEY },
  });
  const result = await pollRes.json();
  const status = result.data?.status;
  console.log(status);

  if (status === "SUCCESS") {
    console.log(result.data?.result_url || result.data?.data?.content?.video_url);
    break;
  }
  if (status === "FAILURE") {
    console.error(result.data?.fail_reason);
    break;
  }
}`,
    },
  },
  tts: {
    curl: {
      title: 'cURL',
      code: `curl -X POST ${baseUrl}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "Doubao-tts",
    "input": "hello world",
    "voice": "alloy"
  }' \\
  --output speech.mp3`,
    },
    python: {
      title: 'Python',
      code: `import requests

response = requests.post(
    "${baseUrl}/audio/speech",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json",
    },
    json={
        "model": "Doubao-tts",
        "input": "hello world",
        "voice": "alloy",
    },
)

with open("speech.mp3", "wb") as f:
    f.write(response.content)`,
    },
    node: {
      title: 'Node.js',
      code: `import { writeFile } from "node:fs/promises";

const response = await fetch("${baseUrl}/audio/speech", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "Doubao-tts",
    input: "hello world",
    voice: "alloy",
  }),
});

const audio = Buffer.from(await response.arrayBuffer());
await writeFile("speech.mp3", audio);`,
    },
  },
});

const buildAgentConfigs = ({ baseUrl, isZh }) => [
  {
    name: 'Codex CLI',
    note: isZh
      ? 'Codex 官方配置使用 ~/.codex/config.toml。它当前文档示例使用 Responses 协议，所以 wire_api 写 responses。'
      : 'Codex official config uses ~/.codex/config.toml. Current docs show the Responses protocol, so set wire_api to responses.',
    code: `# ~/.codex/config.toml
model = "glm-5.1"
model_provider = "vancine"

[model_providers.vancine]
name = "Vancine"
base_url = "${baseUrl}"
env_key = "VANCINE_API_KEY"
wire_api = "responses"

# shell
# export VANCINE_API_KEY="sk-your-api-key"`,
  },
  {
    name: 'OpenCode',
    note: isZh
      ? 'OpenCode 使用项目内 opencode.json。自定义 OpenAI 兼容供应商使用 @ai-sdk/openai-compatible，并在 options.baseURL / options.apiKey 中配置。'
      : 'OpenCode uses project-level opencode.json. Custom OpenAI-compatible providers use @ai-sdk/openai-compatible with options.baseURL and options.apiKey.',
    code: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vancine": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vancine",
      "options": {
        "baseURL": "${baseUrl}",
        "apiKey": "{env:VANCINE_API_KEY}"
      },
      "models": {
        "glm-5.1": {
          "name": "GLM 5.1",
          "limit": { "context": 128000, "output": 8192 }
        },
        "deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash",
          "limit": { "context": 128000, "output": 8192 }
        }
      }
    }
  }
}`,
  },
  {
    name: 'OpenClaw',
    note: isZh
      ? 'OpenClaw 生态里常见的是 OpenAI-compatible base URL、API Key、模型名三件套。不同发行版字段名可能不同，优先在 Provider 里选择 OpenAI Compatible。'
      : 'OpenClaw-style clients usually need the OpenAI-compatible base URL, API key, and model name. Field names vary by distribution; choose OpenAI Compatible when available.',
    code: `Provider: OpenAI Compatible
Base URL: ${baseUrl}
API Key: sk-your-api-key
Model: glm-5.1

# If the tool supports environment variables:
VANCINE_BASE_URL=${baseUrl}
VANCINE_API_KEY=sk-your-api-key
VANCINE_MODEL=glm-5.1`,
  },
  {
    name: 'Hermes Agent',
    note: isZh
      ? 'Hermes Agent 的 OpenAI-compatible 插件常用 config.yaml 或环境变量配置 base_url / api_key。字段以所安装插件为准。'
      : 'Hermes Agent OpenAI-compatible plugins commonly use config.yaml or environment variables for base_url and api_key. Use the exact fields from the installed plugin.',
    code: `# ~/.hermes/config.yaml
openai_compatible:
  base_url: "${baseUrl}"
  api_key: "sk-your-api-key"
  model: "glm-5.1"

# or environment variables
export OPENAI_COMPATIBLE_BASE_URL="${baseUrl}"
export OPENAI_COMPATIBLE_API_KEY="sk-your-api-key"`,
  },
];

const CodeSampleTabs = ({ samples, section, labels }) => {
  const [tab, setTab] = useState('curl');
  const items = samples[section];
  const tabs = Object.keys(items).map((k) => ({ key: k, label: items[k].title }));
  return (
    <div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <CodeBlock code={items[tab].code} labels={labels} />
    </div>
  );
};

/* ──────────────────── Main Component ──────────────────── */

const Docs = () => {
  const { i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const isZh = i18n.language === 'zh' || i18n.language === 'zh-CN' || i18n.language?.startsWith('zh-');
  const d = L[isZh ? 'zh' : 'en'];
  const [activeSection, setActiveSection] = useState('quickstart');

  const rawServerAddress = statusState?.status?.server_address || 'https://vancine.com';
  const apiOrigin = rawServerAddress.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const baseUrl = `${apiOrigin}/v1`;
  const pricingUrl = `${apiOrigin}/api/pricing`;

  const samples = useMemo(() => buildSamples({ baseUrl, isZh }), [baseUrl, isZh]);
  const agentConfigs = useMemo(() => buildAgentConfigs({ baseUrl, isZh }), [baseUrl, isZh]);

  useEffect(() => {
    const handleScroll = () => {
      for (let i = d.nav.length - 1; i >= 0; i--) {
        const el = document.getElementById(d.nav[i].k);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(d.nav[i].k);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [d.nav]);

  const go = (k) => document.getElementById(k)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const tableBorder = `1px solid ${C.border}`;

  const capabilityRows = isZh
    ? [
      ['文本对话', 'POST /v1/chat/completions', 'OpenAI 兼容 messages 请求体'],
      ['语音合成 TTS', 'POST /v1/audio/speech', '返回 MP3 二进制音频流'],
      ['图片生成', 'POST /v1/images/generations', '返回图片 URL'],
      ['视频生成', 'POST /v1/video/generations', '异步任务，轮询 task_id'],
      ['3D 资产生成', 'POST /v1/video/generations', '异步任务，支持 prompt 和 images'],
    ]
    : [
      ['Chat', 'POST /v1/chat/completions', 'OpenAI-compatible messages request body'],
      ['Text to speech', 'POST /v1/audio/speech', 'Returns binary MP3 audio'],
      ['Image generation', 'POST /v1/images/generations', 'Returns image URLs'],
      ['Video generation', 'POST /v1/video/generations', 'Async task, poll with task_id'],
      ['3D asset generation', 'POST /v1/video/generations', 'Async task with prompt and images support'],
    ];

  return (
    <div style={{ width: '100%', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '96px 16px 32px' }}>
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 700, color: C.text.h1, marginBottom: '12px' }}>{d.title}</h1>
          <p style={{ fontSize: '18px', color: C.text.muted, marginBottom: '4px' }}>{d.sub}</p>
          <span style={{ fontSize: '12px', color: C.text.subtle }}>{d.lastUpdated}</span>
        </div>

        <div style={{ display: 'flex', gap: '40px' }}>
          <aside style={{ width: '224px', flexShrink: 0 }} className="hidden lg:block">
            <nav style={{ position: 'sticky', top: '80px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {d.nav.map((n) => {
                const active = activeSection === n.k;
                return (
                  <button
                    key={n.k}
                    onClick={() => go(n.k)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', cursor: 'pointer', border: 'none',
                      background: active ? C.accentBg : 'transparent',
                      color: active ? C.accent : C.text.muted,
                      fontWeight: active ? 600 : 400,
                      borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent',
                    }}
                  >
                    {n.t}
                  </button>
                );
              })}
            </nav>
          </aside>

          <main style={{ flex: 1, minWidth: 0, maxWidth: '768px' }}>
            <section id="quickstart" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '快速开始' : 'Quick Start'}</H2>
              <P>{isZh ? 'Vancine 使用 OpenAI 兼容 API。已有 OpenAI SDK 代码时，通常只需要替换 Base URL 和 API Key。' : 'Vancine uses an OpenAI-compatible API. If you already use the OpenAI SDK, you usually only need to replace the Base URL and API key.'}</P>

              <div style={{ border: tableBorder, borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Base URL', baseUrl],
                      [isZh ? '鉴权' : 'Authentication', 'Authorization: Bearer sk-your-api-key'],
                      [isZh ? '模型清单' : 'Model list', 'GET /v1/models'],
                      [isZh ? '公开定价' : 'Public pricing', 'GET /api/pricing'],
                    ].map(([k, v], i, arr) => (
                      <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.bg.light}` : 'none' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: C.text.body, width: '160px', background: C.bg.light }}>{k}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: C.accent }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <CodeBlock
                labels={d}
                title={isZh ? '最小请求' : 'Minimal request'}
                code={`curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"ping"}],"max_tokens":100}'`}
              />

              <Callout type="tip">
                {isZh ? 'GET /v1/models 需要 API Key，可用于查看当前令牌可调用的模型。GET /api/pricing 无需鉴权，可用于读取模型端点类型和价格。' : 'GET /v1/models requires an API key and lists models available to the current token. GET /api/pricing is public and exposes endpoint support plus pricing metadata.'}
              </Callout>
            </section>

            <section id="auth" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '认证方式' : 'Authentication'}</H2>
              <P>{isZh ? '所有 /v1 请求都需要在 Authorization 请求头中携带 API Key。' : 'All /v1 requests require an API key in the Authorization header.'}</P>
              <CodeBlock code="Authorization: Bearer sk-your-api-key" title="HTTP Header" labels={d} />
              <Callout type="warning">
                {isZh ? '不要把 API Key 写进前端代码、公开仓库或客户端应用。服务端读取环境变量后再调用 Vancine。' : 'Do not put API keys in frontend code, public repositories, or client apps. Read the key from server-side environment variables before calling Vancine.'}
              </Callout>
            </section>

            <section id="capabilities" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '能力概览' : 'Capabilities'}</H2>
              <P>{isZh ? 'Vancine 将不同类型的生成能力整理成统一的 OpenAI 兼容接口和异步任务接口。' : 'Vancine exposes different generation capabilities through OpenAI-compatible endpoints and async task endpoints.'}</P>
              <Table
                headers={[d.category, d.endpoint, d.notes]}
                rows={capabilityRows}
                renderRow={([category, endpoint, notes], i, last) => (
                  <Tr key={i} last={last}>
                    <Td style={{ color: C.text.body, fontWeight: 600 }}>{category}</Td>
                    <Td><code style={{ color: C.accent }}>{endpoint}</code></Td>
                    <Td style={{ color: C.text.muted }}>{notes}</Td>
                  </Tr>
                )}
              />
            </section>

            <section id="models" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '模型与定价' : 'Models & Pricing'}</H2>
              <P>{isZh ? '调用公开定价接口可读取模型名称、支持端点、倍率和价格。' : 'Call the public pricing endpoint to read model names, supported endpoints, ratios, and prices.'}</P>
              <CodeBlock code={`curl ${pricingUrl}`} title={isZh ? '获取模型价格' : 'Fetch model pricing'} labels={d} />

              <H3>{isZh ? '文本模型（14 个）' : 'Text models (14)'}</H3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                {TEXT_MODELS.map((model) => <Badge key={model} color="blue">{model}</Badge>)}
              </div>

              <H3>{isZh ? '多媒体模型' : 'Multimodal generation models'}</H3>
              <Table
                headers={[d.model, isZh ? '类型' : 'Type', isZh ? '调用说明' : 'Usage notes']}
                rows={[
                  ...IMAGE_MODELS.map(([m, size, note]) => [m, 'image', note || size]),
                  ...VIDEO_MODELS.map(([m, price, note]) => [m, 'video', `${price}; ${note}`]),
                  ...THREE_D_MODELS.map(([m, input, state]) => [m, '3D', `${input}; ${state}`]),
                  ['Doubao-tts', 'audio', isZh ? '返回有效 MP3' : 'Returns valid MP3'],
                  ['Doubao-tts2.0', 'audio', isZh ? '返回有效 MP3' : 'Returns valid MP3'],
                ]}
                renderRow={([model, type, note], i, last) => (
                  <Tr key={i} last={last}>
                    <Td style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{model}</Td>
                    <Td><Badge color={type === 'image' ? 'green' : type === 'video' ? 'purple' : type === '3D' ? 'orange' : 'gray'}>{type}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{note}</Td>
                  </Tr>
                )}
              />
            </section>

            <section id="chat" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '对话补全' : 'Chat Completions'}</H2>
              <Endpoint method="POST" path="/v1/chat/completions" />
              <P>{isZh ? '向语言模型发送 OpenAI 兼容的 messages 数组并获取同步 JSON 响应。' : 'Send an OpenAI-compatible messages array to a language model and receive a synchronous JSON response.'}</P>

              <ParamTable
                labels={d}
                params={[
                  ['model', 'string', true, isZh ? '模型名称，例如 glm-5.1' : 'Model name, for example glm-5.1'],
                  ['messages', 'array', true, isZh ? '消息对象数组' : 'Array of message objects'],
                  ['max_tokens', 'integer', false, isZh ? '最大生成 token 数；推理模型建议设置更大' : 'Maximum generated tokens; use a larger value for reasoning models'],
                  ['stream', 'boolean', false, isZh ? '启用 SSE 流式输出' : 'Enable SSE streaming'],
                  ['temperature', 'number', false, isZh ? '采样温度' : 'Sampling temperature'],
                ]}
              />

              <CodeSampleTabs samples={samples} section="chat" labels={d} />

              <Callout type="info">
                {isZh ? 'deepseek-v4-flash 和 deepseek-v4-pro 是推理模型。content 可能暂时为空，推理内容会在 reasoning_content 中；finish_reason: length 常表示 token 预算被推理消耗完，不代表 API 不通。' : 'deepseek-v4-flash and deepseek-v4-pro are reasoning models. content may be empty while reasoning appears in reasoning_content; finish_reason: length often means the token budget was used by reasoning, not that the API failed.'}
              </Callout>
            </section>

            <section id="image" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '图片生成' : 'Image Generation'}</H2>
              <Endpoint method="POST" path="/v1/images/generations" />
              <P>{isZh ? '从文本提示生成图片。响应为同步 JSON，data 数组中包含图片临时 URL。' : 'Generate images from text prompts. The response is synchronous JSON with temporary image URLs in the data array.'}</P>

              <ParamTable
                labels={d}
                params={[
                  ['model', 'string', true, isZh ? '图片模型名称' : 'Image model name'],
                  ['prompt', 'string', true, isZh ? '图片文字描述' : 'Text prompt for the image'],
                  ['n', 'integer', false, isZh ? '生成数量' : 'Number of images'],
                  ['size', 'string', false, isZh ? '尺寸，格式为 WIDTHxHEIGHT' : 'Size in WIDTHxHEIGHT format'],
                ]}
              />

              <Table
                headers={[d.model, isZh ? '可用尺寸' : 'Working size', d.notes]}
                rows={IMAGE_MODELS}
                renderRow={([model, size, note], i, last) => (
                  <Tr key={i} last={last}>
                    <Td style={{ fontFamily: 'monospace', color: C.accent }}>{model}</Td>
                    <Td><Badge color="green">{size}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{note || (isZh ? '默认尺寸可用' : 'Default size supported')}</Td>
                  </Tr>
                )}
              />

              <Callout type="warning">
                {isZh ? 'Doubao-Seedream-4.5 和 Doubao-Seedream-5.0-lite 要求最小 3,686,400 像素。1024x1024 会报 image size must be at least 3686400 pixels，建议使用 2048x2048。' : 'Doubao-Seedream-4.5 and Doubao-Seedream-5.0-lite require at least 3,686,400 pixels. 1024x1024 returns “image size must be at least 3686400 pixels”; use 2048x2048.'}
              </Callout>

              <CodeSampleTabs samples={samples} section="image" labels={d} />
            </section>

            <section id="video" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '视频生成' : 'Video Generation'}</H2>
              <Endpoint method="POST" path="/v1/video/generations" desc={isZh ? '提交异步生成任务' : 'Submit an async generation task'} />
              <Endpoint method="GET" path="/v1/video/generations/{task_id}" desc={isZh ? '轮询任务状态和结果' : 'Poll task status and result'} />
              <P>{isZh ? '视频生成是异步任务。提交后保存 task_id，然后轮询同一个 /v1/video/generations/{task_id} 路径。' : 'Video generation is asynchronous. Save task_id from the submission response, then poll the same /v1/video/generations/{task_id} path.'}</P>

              <ParamTable
                labels={d}
                params={[
                  ['model', 'string', true, isZh ? '视频模型名称' : 'Video model name'],
                  ['prompt', 'string', true, isZh ? '视频文字描述' : 'Text prompt for the video'],
                  ['size', 'string', false, isZh ? '分辨率，例如 1280x720' : 'Resolution, for example 1280x720'],
                ]}
              />

              <Table
                headers={[d.status, d.meaning]}
                rows={[
                  ['queued', isZh ? '任务已排队' : 'Task is queued'],
                  ['IN_PROGRESS', isZh ? '生成中' : 'Generation is running'],
                  ['SUCCESS', isZh ? '完成，取 data.result_url 或 data.data.content.video_url' : 'Done; read data.result_url or data.data.content.video_url'],
                  ['FAILURE', isZh ? '失败，查看 data.fail_reason' : 'Failed; inspect data.fail_reason'],
                ]}
                renderRow={([status, meaning], i, last) => (
                  <Tr key={i} last={last}>
                    <Td><Badge color={status === 'SUCCESS' ? 'green' : status === 'FAILURE' ? 'red' : 'blue'}>{status}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{meaning}</Td>
                  </Tr>
                )}
              />

              <CodeSampleTabs samples={samples} section="video" labels={d} />
            </section>

            <section id="td" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '3D 资产生成' : '3D Asset Generation'}</H2>
              <Endpoint method="POST" path="/v1/video/generations" desc={isZh ? '3D 也使用视频异步端点提交' : '3D also submits through the video async endpoint'} />
              <Endpoint method="GET" path="/v1/video/generations/{task_id}" desc={isZh ? '轮询 3D 任务结果' : 'Poll 3D task results'} />
              <P>{isZh ? '3D 模型使用统一的异步任务参数。提交任务后用 task_id 轮询结果。' : '3D models use the same async task request shape. Submit a task, then poll with task_id for the result.'}</P>

              <Table
                headers={[d.model, isZh ? 'images 参数' : 'images parameter', isZh ? '说明' : 'Notes']}
                rows={THREE_D_MODELS}
                renderRow={([model, input, state], i, last) => (
                  <Tr key={i} last={last}>
                    <Td style={{ fontFamily: 'monospace', color: C.accent }}>{model}</Td>
                    <Td style={{ color: C.text.muted }}>{input}</Td>
                    <Td><Badge color={state === 'SUCCESS' ? 'green' : 'orange'}>{state}</Badge></Td>
                  </Tr>
                )}
              />

              <ParamTable
                labels={d}
                params={[
                  ['model', 'string', true, isZh ? '3D 模型名称' : '3D model name'],
                  ['prompt', 'string', true, isZh ? '3D 资产描述' : '3D asset description'],
                  ['images', 'array', false, isZh ? '参考图数组。Doubao-Seed3D-2.0 必填；其他 3D 模型可不传或按效果需要传。支持公网 URL 或 data:image/...;base64,...' : 'Reference image array. Required for Doubao-Seed3D-2.0; optional for other 3D models. Supports public URLs or data:image/...;base64,...'],
                ]}
              />

              <H3>{isZh ? '统一请求示例' : 'Unified request examples'}</H3>
              <CodeBlock
                labels={d}
                title={isZh ? '不传图片' : 'Without image'}
                code={`{
  "model": "Hyper3D-Gen2",
  "prompt": "a simple cube"
}`}
              />
              <CodeBlock
                labels={d}
                title={isZh ? '传参考图片' : 'With reference image'}
                code={`{
  "model": "Doubao-Seed3D-2.0",
  "prompt": "turn this reference into a clean 3D asset",
  "images": ["https://example.com/reference.png"]
}`}
              />
              <Callout type="warning">
                {isZh ? 'Doubao-Seed3D-2.0 必须传 images。不要使用 image_data 字段；Vancine 网关会把 images 转成上游需要的 content[].image_url 格式。' : 'Doubao-Seed3D-2.0 requires images. Do not use an image_data field; the Vancine gateway converts images into the upstream content[].image_url format.'}
              </Callout>
            </section>

            <section id="audio" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '语音合成 TTS' : 'Text to Speech'}</H2>
              <Endpoint method="POST" path="/v1/audio/speech" />
              <P>{isZh ? 'TTS 接口使用 OpenAI 兼容请求体，但响应不是 JSON，而是 MP3 二进制音频流。' : 'The TTS endpoint uses an OpenAI-compatible request body, but the response is binary MP3 audio, not JSON.'}</P>

              <ParamTable
                labels={d}
                params={[
                  ['model', 'string', true, isZh ? 'Doubao-tts 或 Doubao-tts2.0' : 'Doubao-tts or Doubao-tts2.0'],
                  ['input', 'string', true, isZh ? '待合成文本' : 'Text to synthesize'],
                  ['voice', 'string', false, isZh ? '音色，例如 alloy' : 'Voice, for example alloy'],
                ]}
              />

              <Callout type="warning">
                {isZh ? 'TTS 不走 /v1/chat/completions。端点选错时可能返回类似 API key 不存在的 401，这通常不是 key 失效，而是路径用错。' : 'TTS does not use /v1/chat/completions. Using the wrong endpoint can return a misleading 401 that looks like a missing API key; the usual cause is the wrong path.'}
              </Callout>

              <CodeSampleTabs samples={samples} section="tts" labels={d} />
            </section>

            <section id="errors" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '错误处理' : 'Error Handling'}</H2>
              <Table
                headers={[isZh ? 'HTTP 状态' : 'HTTP status', d.meaning, isZh ? '典型原因' : 'Typical cause']}
                rows={[
                  ['400', isZh ? '参数错误' : 'Bad request', isZh ? 'size 不合规、缺少 prompt、模型和端点不匹配' : 'Invalid size, missing prompt, or model/endpoint mismatch'],
                  ['401', isZh ? '未授权' : 'Unauthorized', isZh ? 'key 失效，或 TTS 等模型误用了 chat 端点' : 'Invalid key, or wrong endpoint such as sending TTS to chat'],
                  ['404', isZh ? '路径不存在' : 'Path not found', isZh ? '检查 URL 路径是否拼写正确' : 'Check that the URL path is spelled correctly'],
                  ['503', isZh ? '无可用渠道' : 'No available channel', isZh ? '当前分组下该模型暂无可用上游' : 'No upstream channel is available for this model in the current group'],
                ]}
                renderRow={([code, meaning, cause], i, last) => (
                  <Tr key={i} last={last}>
                    <Td><Badge color={code === '503' ? 'red' : 'orange'}>{code}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{meaning}</Td>
                    <Td style={{ color: C.text.subtle, fontSize: '13px' }}>{cause}</Td>
                  </Tr>
                )}
              />

              <H3>{isZh ? '错误响应格式' : 'Error response format'}</H3>
              <CodeBlock
                labels={d}
                title="JSON"
                code={`{
  "error": {
    "message": "The parameter size specified in the request is not valid",
    "type": "upstream_error",
    "param": "",
    "code": "InvalidParameter"
  }
}`}
              />
              <Callout type="info">
                {isZh ? '异步任务失败时，错误详情在轮询响应的 data.fail_reason 字段中。' : 'For async task failures, read details from data.fail_reason in the polling response.'}
              </Callout>
            </section>

            <section id="sdks" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? 'SDK 与工具' : 'SDKs & Tools'}</H2>
              <P>{isZh ? 'Vancine 的文本接口兼容 OpenAI SDK。多媒体端点也可直接用 HTTP 客户端调用。' : 'Vancine text endpoints are compatible with the OpenAI SDK. Multimedia endpoints can also be called with any HTTP client.'}</P>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {[
                  { name: 'OpenAI Python SDK', install: 'pip install openai' },
                  { name: 'OpenAI Node.js SDK', install: 'npm install openai' },
                  { name: 'requests / fetch', install: isZh ? '适合图片、视频、3D、TTS' : 'Good for image, video, 3D, and TTS' },
                  { name: 'cURL', install: isZh ? '系统自带或包管理器安装' : 'Built in or install with package manager' },
                ].map((sdk) => (
                  <div key={sdk.name} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '4px' }}>{sdk.name}</h4>
                    <code style={{ fontSize: '12px', color: C.text.muted, background: C.bg.light, padding: '2px 8px', borderRadius: '4px' }}>{sdk.install}</code>
                  </div>
                ))}
              </div>
            </section>

            <section id="agents" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? 'Agent 接入指南' : 'Agent Integration'}</H2>
              <P>{isZh ? 'Agent 工具接入时先确认它使用的是 Chat Completions 还是 Responses。多数 OpenAI Compatible 工具使用 /v1/chat/completions；Codex CLI 官方配置当前使用 /v1/responses。' : 'Before connecting an agent tool, check whether it uses Chat Completions or Responses. Most OpenAI Compatible tools use /v1/chat/completions; Codex CLI official config currently uses /v1/responses.'}</P>

              <Callout type="tip">
                {isZh ? `通用三件套：Base URL = ${baseUrl}，API Key = sk-your-api-key，Model = glm-5.1 或 deepseek-v4-flash。` : `Universal settings: Base URL = ${baseUrl}, API Key = sk-your-api-key, Model = glm-5.1 or deepseek-v4-flash.`}
              </Callout>

              {agentConfigs.map((agent) => (
                <div key={agent.name} style={{ marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: C.text.h1 }}>{agent.name}</h3>
                  <p style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.7, marginBottom: '12px' }}>{agent.note}</p>
                  <CodeBlock labels={d} title={isZh ? '配置示例' : 'Config example'} code={agent.code} />
                </div>
              ))}

              <H3>{isZh ? '图形化工具' : 'GUI tools'}</H3>
              {[
                {
                  h: 'Cursor',
                  steps: isZh
                    ? ['打开 Settings → Models', '选择 OpenAI Compatible 或自定义 OpenAI API', `Base URL 填 ${baseUrl}`, '填入 Vancine API Key', '模型名填写 glm-5.1、deepseek-v4-flash 等文本模型']
                    : ['Open Settings → Models', 'Choose OpenAI Compatible or custom OpenAI API', `Set Base URL to ${baseUrl}`, 'Enter your Vancine API key', 'Use a text model such as glm-5.1 or deepseek-v4-flash'],
                },
                {
                  h: 'Cline / Roo Code',
                  steps: isZh
                    ? ['选择 Provider: OpenAI Compatible', `Base URL 填 ${baseUrl}`, '填入 API Key', '模型名填写文本模型', '保存后发送一条简单消息确认连接']
                    : ['Select Provider: OpenAI Compatible', `Set Base URL to ${baseUrl}`, 'Enter the API key', 'Enter a text model name', 'Save and send a simple message to confirm the connection'],
                },
                {
                  h: 'Cherry Studio',
                  steps: isZh
                    ? ['打开 设置 → 模型服务 → 添加', '类型选择 OpenAI Compatible', `API 地址填 ${baseUrl}`, '填入 API Key', '同步或手动添加模型']
                    : ['Open Settings → Model Services → Add', 'Choose OpenAI Compatible', `Set API URL to ${baseUrl}`, 'Enter the API key', 'Sync or manually add models'],
                },
              ].map((agent) => (
                <div key={agent.h} style={{ marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: C.text.h1 }}>{agent.h}</h3>
                  <ol style={{ listStyle: 'decimal', paddingLeft: '20px', lineHeight: 2, fontSize: '14px', color: C.text.muted }}>
                    {agent.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              ))}
            </section>

            <section id="faq" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '常见问题' : 'FAQ'}</H2>
              {[
                { q: isZh ? '如何确认 API Key 可用？' : 'How do I verify an API key?', a: isZh ? `调用 GET ${baseUrl}/models。HTTP 200 且返回模型列表，说明 key 有效并具备当前分组权限。` : `Call GET ${baseUrl}/models. HTTP 200 with a model list means the key is valid and has access in the current group.` },
                { q: isZh ? '视频和 3D 结果在哪里取？' : 'Where do I read video and 3D results?', a: isZh ? '轮询 GET /v1/video/generations/{task_id}，成功后读取 data.result_url，或读取 data.data.content.video_url。' : 'Poll GET /v1/video/generations/{task_id}. On success, read data.result_url or data.data.content.video_url.' },
                                { q: isZh ? 'TTS 为什么返回的不是 JSON？' : 'Why does TTS not return JSON?', a: isZh ? 'TTS 成功时直接返回 MP3 二进制音频流，Content-Type 为 audio/mpeg。' : 'Successful TTS calls return binary MP3 audio directly with Content-Type audio/mpeg.' },
                { q: isZh ? '为什么 Seedream 4.5 图片尺寸报错？' : 'Why does Seedream 4.5 reject my image size?', a: isZh ? '它要求至少 3,686,400 像素。建议把 size 设置为 2048x2048。' : 'It requires at least 3,686,400 pixels. Use size 2048x2048.' },
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: '16px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
                  <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '8px' }}>{item.q}</h4>
                  <p style={{ fontSize: '14px', color: C.text.muted }}>{item.a}</p>
                </div>
              ))}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Docs;
