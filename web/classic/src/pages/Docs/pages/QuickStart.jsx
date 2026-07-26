/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your later version).

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import C from '../constants';
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import Callout from '../components/Callout';
import Tabs from '../components/Tabs';
import Badge from '../components/Badge';

const QuickStart = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [codeTab, setCodeTab] = useState('curl');

  // Build code samples with baseUrl interpolation
  const samples = useMemo(() => ({
    curl: {
      label: 'cURL',
      code: `curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "user", "content": "Hello, Vancine!" }
    ],
    "max_tokens": 100
  }'`,
    },
    python: {
      label: 'Python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello, Vancine!"}],
    max_tokens=100,
)

print(response.choices[0].message.content)`,
    },
    node: {
      label: 'Node.js',
      code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-api-key",
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "Hello, Vancine!" }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
    },
  }), [baseUrl]);

  // Expected response JSON
  const expectedResponse = `{
  "id": "chatcmpl-xxxxx",
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
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  }
}`;

  const codeTabs = [
    { key: 'curl', label: samples.curl.label },
    { key: 'python', label: samples.python.label },
    { key: 'node', label: samples.node.label },
  ];

  return (
    <div>
      {/* Page title */}
      <H2 id="quickstart-title">{t('quickstart.title')}</H2>
      <P>{t('quickstart.subtitle')}</P>

      {/* Step 1: Get API Key */}
      <H2 id="step1">{t('quickstart.step1.title')}</H2>
      <P>{t('quickstart.step1.desc')}</P>
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <Link
          to="/console/token"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            borderRadius: '8px',
            background: C.accent,
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          {t('quickstart.step1.cta')} →
        </Link>
      </div>
      <Callout type="warning">{t('quickstart.step1.security')}</Callout>

      {/* Step 2: Choose a model */}
      <H2 id="step2">{t('quickstart.step2.title')}</H2>
      <P>{t('quickstart.step2.desc')}</P>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <Badge color="blue">deepseek-v4-flash</Badge>
        <Badge color="gray">deepseek-v4-pro</Badge>
        <Badge color="gray">glm-5.1</Badge>
        <Badge color="gray">qwen3.7-max</Badge>
        <Badge color="gray">kimi-k2.5</Badge>
      </div>
      <P>
        <Link to="/docs/models" style={{ color: C.accent, textDecoration: 'none' }}>
          {t('quickstart.step2.viewAll')} →
        </Link>
      </P>

      {/* Step 3: Choose calling method */}
      <H2 id="step3">{t('quickstart.step3.title')}</H2>
      <P>{t('quickstart.step3.desc')}</P>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '16px',
        }}>
          <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '4px' }}>HTTP API</h4>
          <p style={{ fontSize: '13px', color: C.text.muted, margin: 0 }}>
            {t('quickstart.step3.httpDesc')}
          </p>
        </div>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '16px',
        }}>
          <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '4px' }}>OpenAI SDK</h4>
          <p style={{ fontSize: '13px', color: C.text.muted, margin: 0 }}>
            {t('quickstart.step3.sdkDesc')}
          </p>
        </div>
      </div>

      {/* Step 4: Make your first call */}
      <H2 id="step4">{t('quickstart.step4.title')}</H2>
      <P>{t('quickstart.step4.desc')}</P>

      <Tabs tabs={codeTabs} active={codeTab} onChange={setCodeTab} />
      <CodeBlock
        code={samples[codeTab].code}
        language={codeTab === 'curl' ? 'bash' : codeTab === 'python' ? 'python' : 'javascript'}
      />

      <H3 id="expected-response">{t('quickstart.step4.expectedResponse')}</H3>
      <CodeBlock code={expectedResponse} language="json" title="JSON" />

      {/* Info table */}
      <H2 id="info-table">{t('quickstart.infoTable.title')}</H2>
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '24px',
      }}>
        <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              [t('quickstart.infoTable.baseUrl'), baseUrl],
              [t('quickstart.infoTable.auth'), 'Authorization: Bearer sk-your-api-key'],
              [t('quickstart.infoTable.modelList'), 'GET /v1/models'],
              [t('quickstart.infoTable.pricing'), 'GET /api/pricing'],
            ].map(([k, v], i, arr) => (
              <tr key={i} style={{
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <td style={{
                  padding: '12px 16px',
                  fontWeight: 600,
                  color: C.text.body,
                  width: '160px',
                  background: C.bg.light,
                }}>{k}</td>
                <td style={{
                  padding: '12px 16px',
                  fontFamily: 'monospace',
                  color: C.accent,
                }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout type="tip">{t('quickstart.infoTable.tip')}</Callout>

      {/* Explore more */}
      <H2 id="explore-more">{t('quickstart.exploreMore.title')}</H2>
      <P>{t('quickstart.exploreMore.desc')}</P>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
      }}>
        {[
          { slug: 'chat', label: t('quickstart.exploreMore.chat'), icon: '💬' },
          { slug: 'image', label: t('quickstart.exploreMore.image'), icon: '🎨' },
          { slug: 'video', label: t('quickstart.exploreMore.video'), icon: '🎬' },
          { slug: 'migrate', label: t('quickstart.exploreMore.migrate'), icon: '🔄' },
        ].map((item) => (
          <Link
            key={item.slug}
            to={`/docs/${item.slug}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '16px',
              border: `1px solid ${C.border}`,
              borderRadius: '12px',
              textDecoration: 'none',
              color: C.text.body,
              fontWeight: 500,
              fontSize: '14px',
            }}
          >
            <span style={{ fontSize: '20px' }}>{item.icon}</span>
            {item.label} →
          </Link>
        ))}
      </div>
    </div>
  );
};

export default QuickStart;
