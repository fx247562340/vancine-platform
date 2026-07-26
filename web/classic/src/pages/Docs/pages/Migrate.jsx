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
import { Table, Td, Tr } from '../components/Table';
import Badge from '../components/Badge';

const Migrate = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [codeTab, setCodeTab] = useState('python');

  // Minimal "only 2 changes" Python example
  const minimalExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",       # ← Change to your Vancine API key
    base_url="${baseUrl}"             # ← Change to Vancine base URL
)

resp = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(resp.choices[0].message.content)`;

  // Full examples in 3 languages
  const samples = useMemo(() => ({
    python: {
      label: 'Python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}],
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
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
    },
    curl: {
      label: 'cURL',
      code: `curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ],
    "max_tokens": 100
  }'`,
    },
  }), [baseUrl]);

  const codeTabs = [
    { key: 'python', label: samples.python.label },
    { key: 'node', label: samples.node.label },
    { key: 'curl', label: samples.curl.label },
  ];

  // "What stays the same" items
  const sameItems = [
    t('migrate.sameItems.endpoint'),
    t('migrate.sameItems.sdk'),
    t('migrate.sameItems.response'),
    t('migrate.sameItems.streaming'),
    t('migrate.sameItems.functionCalling'),
  ];

  // Migration comparison table rows
  const comparisonRows = [
    ['base_url', t('migrate.comparison.baseUrlOpenai'), baseUrl, t('migrate.comparison.baseUrlNote')],
    ['api_key', t('migrate.comparison.apiKeyOpenai'), 'sk-your-vancine-key', t('migrate.comparison.apiKeyNote')],
    ['model', t('migrate.comparison.modelOpenai'), 'deepseek-v4-flash', t('migrate.comparison.modelNote')],
  ];

  return (
    <div>
      {/* Title + hook */}
      <H2 id="migrate-title">{t('migrate.title')}</H2>
      <P>{t('migrate.hook')}</P>

      {/* "Only 2 changes" core block */}
      <H2 id="two-changes">{t('migrate.twoChanges.title')}</H2>
      <P>{t('migrate.twoChanges.desc')}</P>
      <CodeBlock code={minimalExample} language="python" title="Python" />

      {/* Full examples */}
      <H2 id="full-examples">{t('migrate.fullExamples.title')}</H2>
      <P>{t('migrate.fullExamples.desc')}</P>
      <Tabs tabs={codeTabs} active={codeTab} onChange={setCodeTab} />
      <CodeBlock
        code={samples[codeTab].code}
        language={codeTab === 'curl' ? 'bash' : codeTab === 'python' ? 'python' : 'javascript'}
      />

      {/* "What stays the same" reassurance block */}
      <H2 id="what-stays-same">{t('migrate.whatStaysSame.title')}</H2>
      <P>{t('migrate.whatStaysSame.desc')}</P>
      <Callout type="tip">
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          {sameItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </Callout>

      {/* Migration comparison table */}
      <H2 id="comparison-table">{t('migrate.comparison.title')}</H2>
      <Table
        headers={[t('migrate.comparison.colField'), t('migrate.comparison.colOpenai'), t('migrate.comparison.colVancine'), t('migrate.comparison.colNote')]}
        rows={comparisonRows}
        renderRow={([field, openai, vancine, note], i, last) => (
          <Tr key={i} last={last}>
            <Td style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{field}</Td>
            <Td style={{ color: C.text.muted, fontSize: '13px' }}>{openai}</Td>
            <Td style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{vancine}</Td>
            <Td style={{ color: C.text.muted, fontSize: '13px' }}>{note}</Td>
          </Tr>
        )}
      />

      {/* Next steps */}
      <H2 id="next-steps">{t('migrate.nextSteps.title')}</H2>
      <P>{t('migrate.nextSteps.desc')}</P>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
      }}>
        <Link
          to="/docs/models"
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
          <span style={{ fontSize: '20px' }}>📋</span>
          {t('migrate.nextSteps.models')} →
        </Link>
        <Link
          to="/docs/quickstart"
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
          <span style={{ fontSize: '20px' }}>🔑</span>
          {t('migrate.nextSteps.quickstart')} →
        </Link>
      </div>
    </div>
  );
};

export default Migrate;
