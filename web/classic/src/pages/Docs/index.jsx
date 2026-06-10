import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
    sub: 'Integrate Vancine AI models into your application with a single API.',
    lastUpdated: 'Last updated: June 2026',
    nav: [
      { k: 'quickstart', t: 'Quick Start' },
      { k: 'auth', t: 'Authentication' },
      { k: 'models', t: 'Models & Pricing' },
      { k: 'chat', t: 'Chat Completions' },
      { k: 'image', t: 'Image Generation' },
      { k: 'video', t: 'Video Generation' },
      { k: 'td', t: '3D Generation' },
      { k: 'audio', t: 'Audio' },
      { k: 'streaming', t: 'Streaming' },
      { k: 'errors', t: 'Error Codes' },
      { k: 'sdks', t: 'SDKs & Tools' },
      { k: 'agents', t: 'Agent Integration' },
      { k: 'faq', t: 'FAQ' },
    ],
  },
  zh: {
    title: 'API 文档',
    sub: '通过一个 API 将 Vancine AI 模型集成到您的应用中。',
    lastUpdated: '最近更新：2026年6月',
    nav: [
      { k: 'quickstart', t: '快速开始' },
      { k: 'auth', t: '认证方式' },
      { k: 'models', t: '模型与定价' },
      { k: 'chat', t: '对话补全' },
      { k: 'image', t: '图片生成' },
      { k: 'video', t: '视频生成' },
      { k: 'td', t: '3D 生成' },
      { k: 'audio', t: '音频' },
      { k: 'streaming', t: '流式输出' },
      { k: 'errors', t: '错误码' },
      { k: 'sdks', t: 'SDK 与工具' },
      { k: 'agents', t: 'Agent 接入' },
      { k: 'faq', t: '常见问题' },
    ],
  },
};

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

const ParamTable = ({ params, isZh }) => (
  <div style={{ overflowX: 'auto', marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px' }}>
    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: C.bg.light }}>
          {[isZh ? '参数' : 'Parameter', isZh ? '类型' : 'Type', isZh ? '必填' : 'Required', isZh ? '说明' : 'Description'].map((h) => (
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
              {req === 'Yes' || req === '是' ? <Badge color="red">{isZh ? '是' : 'Yes'}</Badge> : <Badge color="gray">{isZh ? '否' : 'No'}</Badge>}
            </td>
            <td style={{ padding: '12px 16px', color: C.text.muted }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CodeBlock = ({ code, title }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ marginBottom: '24px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: C.bg.light, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: C.text.muted }}>{title}</span>
          <button onClick={copy} style={{ fontSize: '12px', color: C.text.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy'}
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

const H2 = ({ id, children }) => (
  <h2 id={id} style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: C.text.h1, scrollMarginTop: '80px' }}>{children}</h2>
);

const H3 = ({ children }) => (
  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', marginTop: '24px', color: C.text.h1 }}>{children}</h3>
);

const P = ({ children }) => (
  <p style={{ color: C.text.muted, marginBottom: '16px', lineHeight: 1.7 }}>{children}</p>
);

/* ──────────────────── Code Samples ──────────────────── */

const SAMPLES = {
  chat: {
    curl: {
      title: 'cURL',
      code: `curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Explain quantum computing in simple terms." }
    ],
    "temperature": 0.7,
    "max_tokens": 2048,
    "stream": true
  }'`,
    },
    python: {
      title: 'Python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="https://vancine.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing."}
    ],
    temperature=0.7,
    max_tokens=2048
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in stream:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)`,
    },
    node: {
      title: 'Node.js',
      code: `import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "sk-your-api-key",
    baseURL: "https://vancine.com/v1",
});

const response = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Explain quantum computing." }
    ],
    temperature: 0.7,
    max_tokens: 2048,
});
console.log(response.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
});
for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`,
    },
  },
  image: {
    curl: {
      title: 'cURL',
      code: `curl -X POST https://vancine.com/v1/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "seedream-3.0",
    "prompt": "A serene Japanese garden with cherry blossoms",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'`,
    },
    python: {
      title: 'Python',
      code: `import requests

response = requests.post(
    "https://vancine.com/v1/images/generations",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json"
    },
    json={
        "model": "seedream-3.0",
        "prompt": "A serene Japanese garden with cherry blossoms",
        "n": 1,
        "size": "1024x1024",
        "response_format": "url"
    }
)

data = response.json()
for img in data["data"]:
    print(img["url"])`,
    },
    node: {
      title: 'Node.js',
      code: `const response = await fetch(
    "https://vancine.com/v1/images/generations",
    {
        method: "POST",
        headers: {
            Authorization: "Bearer sk-your-api-key",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "seedream-3.0",
            prompt: "A serene Japanese garden with cherry blossoms",
            n: 1,
            size: "1024x1024",
            response_format: "url",
        }),
    }
);

const data = await response.json();
console.log(data.data[0].url);`,
    },
  },
  video: {
    curl: {
      title: 'cURL',
      code: `# Step 1: Submit generation task
curl -X POST https://vancine.com/v1/video/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "wan-2.2-t2v",
    "prompt": "A cat walking on the beach at golden hour",
    "size": "1280x720"
  }'

# Response: {"task_id": "task-abc123", "status": "pending"}

# Step 2: Poll task status
curl https://vancine.com/api/task/task-abc123 \\
  -H "Authorization: Bearer sk-your-api-key"

# Response when done:
# {"status": "succeeded", "output": {"video_url": "https://..."}}`,
    },
    python: {
      title: 'Python',
      code: `import requests, time

API_KEY = "sk-your-api-key"
BASE = "https://vancine.com/v1"

# Submit task
resp = requests.post(
    f"{BASE}/video/generations",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "wan-2.2-t2v",
        "prompt": "A cat walking on the beach at golden hour",
    }
)
task_id = resp.json()["task_id"]
print(f"Task submitted: {task_id}")

# Poll until complete
while True:
    result = requests.get(
        f"https://vancine.com/api/task/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()

    status = result.get("status")
    print(f"Status: {status}")

    if status == "succeeded":
        print(f"Video: {result['output']['video_url']}")
        break
    elif status == "failed":
        print(f"Error: {result.get('error')}")
        break

    time.sleep(5)`,
    },
    node: {
      title: 'Node.js',
      code: `const API_KEY = "sk-your-api-key";
const BASE = "https://vancine.com/v1";

// Submit task
const resp = await fetch(\`\${BASE}/video/generations\`, {
    method: "POST",
    headers: {
        Authorization: \`Bearer \${API_KEY}\`,
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        model: "wan-2.2-t2v",
        prompt: "A cat walking on the beach at golden hour",
    }),
});
const { task_id } = await resp.json();
console.log("Task:", task_id);

// Poll until complete
let result;
do {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(
        \`https://vancine.com/api/task/\${task_id}\`,
        { headers: { Authorization: \`Bearer \${API_KEY}\` } }
    );
    result = await res.json();
    console.log("Status:", result.status);
} while (result.status === "pending" || result.status === "processing");

if (result.status === "succeeded") {
    console.log("Video URL:", result.output.video_url);
}`,
    },
  },
};

const CodeSampleTabs = ({ section }) => {
  const [tab, setTab] = useState('curl');
  const items = SAMPLES[section];
  const tabs = Object.keys(items).map((k) => ({ key: k, label: items[k].title }));
  return (
    <div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <CodeBlock code={items[tab].code} />
    </div>
  );
};

/* ──────────────────── Table helpers ──────────────────── */

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
        {rows.map((row, i) => renderRow(row, i, i < rows.length - 1))}
      </tbody>
    </table>
  </div>
);

const Td = ({ children, style }) => (
  <td style={{ padding: '12px 16px', ...style }}>{children}</td>
);

const Tr = ({ last, children }) => (
  <tr style={{ borderBottom: last ? 'none' : `1px solid ${C.bg.light}` }}>{children}</tr>
);

/* ──────────────────── Main Component ──────────────────── */

const Docs = () => {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh' || i18n.language === 'zh-CN';
  const d = L[isZh ? 'zh' : 'en'];
  const [activeSection, setActiveSection] = useState('quickstart');

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

  return (
    <div style={{ width: '100%', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '96px 16px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 700, color: C.text.h1, marginBottom: '12px' }}>{d.title}</h1>
          <p style={{ fontSize: '18px', color: C.text.muted, marginBottom: '4px' }}>{d.sub}</p>
          <span style={{ fontSize: '12px', color: C.text.subtle }}>{d.lastUpdated}</span>
        </div>

        <div style={{ display: 'flex', gap: '40px' }}>
          {/* Sidebar */}
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

          {/* Content */}
          <main style={{ flex: 1, minWidth: 0, maxWidth: '768px' }}>

            {/* ── Quick Start ── */}
            <section id="quickstart" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '快速开始' : 'Quick Start'}</H2>
              <P>{isZh ? 'Vancine 使用 OpenAI 兼容的 API 格式。如果您使用过 OpenAI SDK，只需修改 Base URL 和 API Key 即可切换到 Vancine。' : 'Vancine uses an OpenAI-compatible API format. If you have used the OpenAI SDK, simply change the Base URL and API Key to switch to Vancine.'}</P>

              <div style={{ border: tableBorder, borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Base URL', 'https://vancine.com/v1'],
                      [isZh ? 'API 格式' : 'API Format', isZh ? 'OpenAI 兼容 (JSON)' : 'OpenAI Compatible (JSON)'],
                      [isZh ? '认证方式' : 'Authentication', 'Bearer Token'],
                      [isZh ? '流式输出' : 'Streaming', 'SSE (Server-Sent Events)'],
                    ].map(([k, v], i, arr) => (
                      <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.bg.light}` : 'none' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: C.text.body, width: '160px', background: C.bg.light }}>{k}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: C.accent }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Callout type="tip">
                {isZh ? '所有 SDK（OpenAI、Anthropic 等）只需将 base_url 改为 https://vancine.com/v1 即可使用。' : 'All SDKs (OpenAI, Anthropic, etc.) work by changing base_url to https://vancine.com/v1.'}
              </Callout>
            </section>

            {/* ── Authentication ── */}
            <section id="auth" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '认证方式' : 'Authentication'}</H2>
              <P>{isZh ? '所有 API 请求需要在 Authorization 请求头中携带 API Key。' : 'All API requests require an API Key in the Authorization header.'}</P>

              <H3>{isZh ? '获取 API Key' : 'Getting an API Key'}</H3>
              <ol style={{ listStyle: 'decimal', paddingLeft: '20px', marginBottom: '16px', fontSize: '14px', color: C.text.muted, lineHeight: 2 }}>
                <li>{isZh ? '登录 Vancine 控制台' : 'Log in to Vancine Console'}</li>
                <li>{isZh ? '进入 令牌管理 → 新建令牌' : 'Go to Token Management → New Token'}</li>
                <li>{isZh ? '复制生成的 API Key（以 sk- 开头）' : 'Copy the generated API Key (starts with sk-)'}</li>
              </ol>

              <H3>{isZh ? '请求头格式' : 'Header Format'}</H3>
              <CodeBlock code="Authorization: Bearer sk-your-api-key" title="HTTP Header" />

              <Callout type="warning">
                {isZh ? '请妥善保管您的 API Key，不要将其暴露在前端代码或公开仓库中。' : 'Keep your API Key secure. Never expose it in client-side code or public repositories.'}
              </Callout>
            </section>

            {/* ── Models ── */}
            <section id="models" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '模型与定价' : 'Models & Pricing'}</H2>
              <P>{isZh ? '访问 /pricing 页面查看所有可用模型及其定价。也可通过 API 获取：' : 'Visit the /pricing page for all available models and pricing. Or fetch via API:'}</P>
              <CodeBlock code="curl https://vancine.com/api/pricing" title="Get all models" />

              <H3>{isZh ? '主要模型列表' : 'Featured Models'}</H3>
              <Table
                headers={[isZh ? '模型' : 'Model', isZh ? '类型' : 'Type', isZh ? '说明' : 'Description']}
                rows={[
                  ['deepseek-v4-flash', 'text', isZh ? 'DeepSeek V4 快速版' : 'DeepSeek V4 Flash'],
                  ['seedream-3.0', 'image', isZh ? '火山方舟文生图' : 'VolcEngine text-to-image'],
                  ['wan-2.2-t2v', 'video', isZh ? '万象文生视频' : 'Wan text-to-video'],
                  ['seedance-1.0-lite', 'video', isZh ? '火山方舟文/图生视频' : 'VolcEngine video generation'],
                  ['hitem3d-2.0', '3d', isZh ? '数美科技 3D 生成' : 'Shumei 3D generation'],
                  ['doubao-tts', 'audio', isZh ? '豆包语音合成' : 'Doubao text-to-speech'],
                ]}
                renderRow={([model, type, desc], i, last) => (
                  <Tr key={i} last={last}>
                    <Td style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{model}</Td>
                    <Td><Badge color={type === 'text' ? 'blue' : type === 'image' ? 'green' : type === 'video' ? 'purple' : type === '3d' ? 'orange' : 'gray'}>{type}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{desc}</Td>
                  </Tr>
                )}
              />
            </section>

            {/* ── Chat Completions ── */}
            <section id="chat" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '对话补全' : 'Chat Completions'}</H2>
              <Endpoint method="POST" path="/v1/chat/completions" />
              <P>{isZh ? '向语言模型发送消息并获取回复。支持多轮对话、流式输出和视觉输入（图片）。' : 'Send messages to language models and receive responses. Supports multi-turn conversation, streaming, and vision (image input).'}</P>

              <H3>{isZh ? '请求参数' : 'Request Parameters'}</H3>
              <ParamTable
                isZh={isZh}
                params={[
                  ['model', 'string', isZh ? '是' : 'Yes', isZh ? '模型名称' : 'Model name'],
                  ['messages', 'array', isZh ? '是' : 'Yes', isZh ? '消息对象数组' : 'Array of message objects'],
                  ['stream', 'boolean', isZh ? '否' : 'No', isZh ? '启用流式输出（默认 false）' : 'Enable streaming (default: false)'],
                  ['temperature', 'number', isZh ? '否' : 'No', isZh ? '采样温度 0-2（默认 1）' : 'Sampling temperature 0-2 (default: 1)'],
                  ['max_tokens', 'integer', isZh ? '否' : 'No', isZh ? '最大生成 token 数' : 'Maximum tokens to generate'],
                  ['top_p', 'number', isZh ? '否' : 'No', isZh ? '核采样参数' : 'Nucleus sampling parameter'],
                  ['frequency_penalty', 'number', isZh ? '否' : 'No', isZh ? '频率惩罚' : 'Frequency penalty'],
                ]}
              />

              <H3>{isZh ? '消息格式' : 'Message Format'}</H3>
              <CodeBlock
                code={`// Text message
{ "role": "user", "content": "Hello!" }

// System message
{ "role": "system", "content": "You are a helpful assistant." }

// Vision message (with image)
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/photo.jpg" }
    }
  ]
}`}
                title="Message Object"
              />

              <H3>{isZh ? '示例代码' : 'Code Examples'}</H3>
              <CodeSampleTabs section="chat" />
            </section>

            {/* ── Image Generation ── */}
            <section id="image" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '图片生成' : 'Image Generation'}</H2>
              <Endpoint method="POST" path="/v1/images/generations" />
              <P>{isZh ? '从文本提示生成图片，或使用参考图片进行图生图。支持 Seedream、FLUX 等模型。' : 'Generate images from text prompts or use reference images for image-to-image. Supports Seedream, FLUX, and more.'}</P>

              <H3>{isZh ? '请求参数' : 'Request Parameters'}</H3>
              <ParamTable
                isZh={isZh}
                params={[
                  ['model', 'string', isZh ? '是' : 'Yes', isZh ? '模型名称，如 seedream-3.0、flux-2.0-pro' : 'Model name, e.g. seedream-3.0, flux-2.0-pro'],
                  ['prompt', 'string', isZh ? '是' : 'Yes', isZh ? '图片的文字描述' : 'Text description of the image'],
                  ['image', 'string/array', isZh ? '否' : 'No', isZh ? '参考图片 URL（单张字符串或多张数组）' : 'Reference image URL(s) for img2img'],
                  ['n', 'integer', isZh ? '否' : 'No', isZh ? '生成数量（默认 1）' : 'Number of images (default: 1)'],
                  ['size', 'string', isZh ? '否' : 'No', isZh ? '尺寸，如 1024x1024、1920x1920' : 'Size, e.g. 1024x1024, 1920x1920'],
                  ['response_format', 'string', isZh ? '否' : 'No', '"url" 或 "b64_json"（默认 url）'],
                ]}
              />

              <Callout type="info">
                {isZh ? '图生图：传入 image 参数，可以是单张图片 URL（字符串）或多张参考图（数组）。' : 'Image-to-image: Pass the image parameter as a single URL (string) or multiple references (array).'}
              </Callout>

              <H3>{isZh ? '示例代码' : 'Code Examples'}</H3>
              <CodeSampleTabs section="image" />
            </section>

            {/* ── Video Generation ── */}
            <section id="video" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '视频生成' : 'Video Generation'}</H2>
              <Endpoint method="POST" path="/v1/video/generations" />
              <P>{isZh ? '从文本提示或参考图片生成视频。视频生成是异步的，提交后通过轮询获取结果。' : 'Generate videos from text prompts or reference images. Video generation is asynchronous — poll for results after submission.'}</P>

              <H3>{isZh ? '请求参数' : 'Request Parameters'}</H3>
              <ParamTable
                isZh={isZh}
                params={[
                  ['model', 'string', isZh ? '是' : 'Yes', isZh ? '模型名称，如 wan-2.2-t2v、seedance-1.0-lite' : 'Model name, e.g. wan-2.2-t2v, seedance-1.0-lite'],
                  ['prompt', 'string', isZh ? '是' : 'Yes', isZh ? '视频的文字描述' : 'Text description of the video'],
                  ['images', 'array', isZh ? '否' : 'No', isZh ? '参考图片 URL 数组（图生视频）' : 'Reference image URLs for img2vid'],
                  ['size', 'string', isZh ? '否' : 'No', isZh ? '分辨率，如 1280x720' : 'Resolution, e.g. 1280x720'],
                  ['duration', 'integer', isZh ? '否' : 'No', isZh ? '视频时长（秒）' : 'Duration in seconds'],
                ]}
              />

              <H3>{isZh ? '任务轮询' : 'Task Polling'}</H3>
              <Endpoint method="GET" path="/api/task/{taskId}" desc={isZh ? '查询任务状态和结果' : 'Check task status and result'} />
              <P>{isZh ? '提交后返回 task_id，轮询直到 status 为 succeeded 或 failed：' : 'After submission, a task_id is returned. Poll until status is succeeded or failed:'}</P>

              <Table
                headers={[isZh ? '状态' : 'Status', isZh ? '说明' : 'Description']}
                rows={[
                  ['pending', isZh ? '任务排队中' : 'Task is queued'],
                  ['processing', isZh ? '正在生成' : 'Generating'],
                  ['succeeded', isZh ? '生成完成' : 'Completed'],
                  ['failed', isZh ? '生成失败' : 'Failed'],
                ]}
                renderRow={([s, desc], i, last) => (
                  <Tr key={i} last={last}>
                    <Td><Badge color={s === 'succeeded' ? 'green' : s === 'failed' ? 'red' : 'blue'}>{s}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{desc}</Td>
                  </Tr>
                )}
              />

              <H3>{isZh ? '示例代码' : 'Code Examples'}</H3>
              <CodeSampleTabs section="video" />
            </section>

            {/* ── 3D Generation ── */}
            <section id="td" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '3D 模型生成' : '3D Generation'}</H2>
              <Endpoint method="POST" path="/v1/3d/generations" />
              <P>{isZh ? '从文本提示或参考图片生成 3D 模型（GLB/OBJ 格式）。支持 Hitem3D、Hyper3D 等模型。' : 'Generate 3D models (GLB/OBJ) from text prompts or reference images. Supports Hitem3D, Hyper3D, and more.'}</P>

              <ParamTable
                isZh={isZh}
                params={[
                  ['model', 'string', isZh ? '是' : 'Yes', isZh ? '模型名称，如 hitem3d-2.0、hyper3d-gen2' : 'Model name, e.g. hitem3d-2.0, hyper3d-gen2'],
                  ['prompt', 'string', isZh ? '是' : 'Yes', isZh ? '3D 模型的文字描述' : 'Text description of the 3D model'],
                  ['images', 'array', isZh ? '否' : 'No', isZh ? '参考图片 URL 数组' : 'Reference image URLs'],
                ]}
              />

              <Callout type="info">
                {isZh ? '3D 生成同样使用异步任务机制，提交后通过 /api/task/{taskId} 轮询。' : '3D generation uses the same async task mechanism. Poll via /api/task/{taskId} after submission.'}
              </Callout>
            </section>

            {/* ── Audio ── */}
            <section id="audio" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '音频' : 'Audio'}</H2>
              <P>{isZh ? '支持文本转语音（TTS）和语音转文本（STT）。' : 'Supports Text-to-Speech (TTS) and Speech-to-Text (STT).'}</P>

              <H3>{isZh ? '文本转语音' : 'Text to Speech'}</H3>
              <Endpoint method="POST" path="/v1/audio/speech" />
              <ParamTable
                isZh={isZh}
                params={[
                  ['model', 'string', isZh ? '是' : 'Yes', 'e.g. doubao-tts'],
                  ['input', 'string', isZh ? '是' : 'Yes', isZh ? '要转换的文本' : 'Text to convert'],
                  ['voice', 'string', isZh ? '否' : 'No', isZh ? '语音 ID' : 'Voice ID'],
                ]}
              />

              <H3>{isZh ? '语音转文本' : 'Speech to Text'}</H3>
              <Endpoint method="POST" path="/v1/audio/transcriptions" />
              <P>{isZh ? '上传音频文件，返回转录文本（Whisper 兼容格式）。' : 'Upload an audio file and get transcribed text (Whisper-compatible).'}</P>
            </section>

            {/* ── Streaming ── */}
            <section id="streaming" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '流式输出' : 'Streaming'}</H2>
              <P>{isZh ? '设置 stream: true 启用 SSE 流式输出，实时接收生成内容。' : 'Set stream: true to enable SSE streaming and receive content in real-time.'}</P>

              <H3>{isZh ? '流式响应格式' : 'Stream Response Format'}</H3>
              <CodeBlock
                code={`data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" world"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]`}
                title="SSE Format"
              />

              <Callout type="tip">
                {isZh ? '使用 OpenAI SDK 时，设置 stream=True 即可自动处理 SSE 格式，无需手动解析。' : 'With the OpenAI SDK, set stream=True to automatically handle SSE parsing.'}
              </Callout>
            </section>

            {/* ── Error Codes ── */}
            <section id="errors" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '错误码' : 'Error Codes'}</H2>
              <Table
                headers={[isZh ? '状态码' : 'Code', isZh ? '说明' : 'Description', isZh ? '处理方式' : 'Action']}
                rows={[
                  ['400', isZh ? '请求参数错误' : 'Bad Request', isZh ? '检查请求参数格式' : 'Check request parameters'],
                  ['401', isZh ? 'API Key 无效' : 'Unauthorized', isZh ? '检查 API Key 是否正确' : 'Verify your API Key'],
                  ['403', isZh ? '配额不足或权限不够' : 'Forbidden', isZh ? '检查余额或联系管理员' : 'Check quota or contact support'],
                  ['404', isZh ? '模型或端点不存在' : 'Not Found', isZh ? '检查模型名称和端点路径' : 'Check model name and endpoint'],
                  ['429', isZh ? '请求频率超限' : 'Rate Limited', isZh ? '降低请求频率后重试' : 'Reduce request rate and retry'],
                  ['500', isZh ? '服务器内部错误' : 'Internal Error', isZh ? '稍后重试或联系支持' : 'Retry later or contact support'],
                  ['503', isZh ? '上游服务不可用' : 'Service Unavailable', isZh ? '稍后重试' : 'Retry later'],
                ]}
                renderRow={([code, desc, action], i, last) => (
                  <Tr key={i} last={last}>
                    <Td><Badge color={code.startsWith('4') ? 'orange' : 'red'}>{code}</Badge></Td>
                    <Td style={{ color: C.text.muted }}>{desc}</Td>
                    <Td style={{ color: C.text.subtle, fontSize: '13px' }}>{action}</Td>
                  </Tr>
                )}
              />

              <H3>{isZh ? '错误响应格式' : 'Error Response Format'}</H3>
              <CodeBlock
                code={`{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}`}
                title="JSON"
              />
            </section>

            {/* ── SDKs ── */}
            <section id="sdks" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? 'SDK 与工具' : 'SDKs & Tools'}</H2>
              <P>{isZh ? '由于 Vancine API 兼容 OpenAI 格式，以下 SDK 和工具可直接使用：' : 'Since Vancine is OpenAI-compatible, the following SDKs and tools work directly:'}</P>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {[
                  { name: 'OpenAI Python SDK', install: 'pip install openai' },
                  { name: 'OpenAI Node.js SDK', install: 'npm install openai' },
                  { name: 'Anthropic SDK', install: 'pip install anthropic' },
                  { name: 'cURL', install: 'Built-in' },
                ].map((sdk) => (
                  <div key={sdk.name} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '4px' }}>{sdk.name}</h4>
                    <code style={{ fontSize: '12px', color: C.text.muted, background: C.bg.light, padding: '2px 8px', borderRadius: '4px' }}>{sdk.install}</code>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Agent Integration ── */}
            <section id="agents" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? 'Agent 接入指南' : 'Agent Integration'}</H2>
              <P>{isZh ? '将 Vancine 作为 AI 编程 Agent 的后端，享受更低成本的 AI 辅助编程。' : 'Use Vancine as the backend for AI coding agents to enjoy lower-cost AI-assisted programming.'}</P>

              {[
                {
                  h: 'Cursor',
                  steps: isZh
                    ? ['打开 Cursor → Settings → Models', '点击 "OpenAI API Key"', '输入 Vancine API Key', '设置 Base URL 为 https://vancine.com/v1', '选择模型（如 deepseek-v4-flash）']
                    : ['Open Cursor → Settings → Models', 'Click "OpenAI API Key"', 'Enter your Vancine API Key', 'Set Base URL to https://vancine.com/v1', 'Select model (e.g. deepseek-v4-flash)'],
                },
                {
                  h: 'Windsurf',
                  steps: isZh
                    ? ['打开 Windsurf 设置', '进入 AI → Custom Model', '输入 API Key 和 Base URL', '选择模型并保存']
                    : ['Open Windsurf Settings', 'Navigate to AI → Custom Model', 'Enter API Key and Base URL', 'Select model and save'],
                },
                {
                  h: 'Cline (VS Code)',
                  steps: isZh
                    ? ['安装 Cline 扩展', '打开 Cline 设置', '选择 Provider: OpenAI Compatible', '输入 Base URL: https://vancine.com/v1', '输入 API Key', '选择模型']
                    : ['Install Cline extension', 'Open Cline settings', 'Select Provider: OpenAI Compatible', 'Enter Base URL: https://vancine.com/v1', 'Enter API Key', 'Select model'],
                },
                {
                  h: 'Cherry Studio',
                  steps: isZh
                    ? ['打开 设置 → 供应商', '添加自定义供应商', '设置 Base URL', '输入 API Key', '选择模型']
                    : ['Open Settings → Providers', 'Add Custom Provider', 'Set Base URL', 'Enter API Key', 'Select model'],
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

            {/* ── FAQ ── */}
            <section id="faq" style={{ marginBottom: '64px' }}>
              <H2>{isZh ? '常见问题' : 'FAQ'}</H2>
              {[
                { q: isZh ? '如何获取 API Key？' : 'How to get an API Key?', a: isZh ? '注册账号后，在控制台 → 令牌管理中创建。' : 'After registration, create one in Console → Token Management.' },
                { q: isZh ? '支持哪些模型？' : 'Which models are supported?', a: isZh ? '访问 /pricing 页面查看完整模型列表，或调用 GET /api/pricing 接口。' : 'Visit /pricing for the full list, or call GET /api/pricing.' },
                { q: isZh ? '如何切换到 Vancine？' : 'How to switch to Vancine?', a: isZh ? '将 SDK 的 base_url 改为 https://vancine.com/v1，替换 API Key 即可。' : 'Change your SDK base_url to https://vancine.com/v1 and replace the API Key.' },
                { q: isZh ? '视频生成为什么没有直接返回结果？' : "Why doesn't video generation return results immediately?", a: isZh ? '视频生成是异步任务，提交后返回 task_id，需要轮询 /api/task/{taskId} 获取结果。' : 'Video generation is async. A task_id is returned after submission — poll /api/task/{taskId} for results.' },
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
