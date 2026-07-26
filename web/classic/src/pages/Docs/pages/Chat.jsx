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
import C from '../constants';
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import Callout from '../components/Callout';
import Tabs from '../components/Tabs';
import ParamTable from '../components/ParamTable';
import Endpoint from '../components/Endpoint';

const Chat = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [codeTab, setCodeTab] = useState('curl');

  const samples = useMemo(() => ({
    curl: {
      label: 'cURL',
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
      label: 'Python',
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
      label: 'Node.js',
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
  }), [baseUrl]);

  const codeTabs = [
    { key: 'curl', label: samples.curl.label },
    { key: 'python', label: samples.python.label },
    { key: 'node', label: samples.node.label },
  ];

  const params = [
    ['model', 'string', true, t('chat.params.model')],
    ['messages', 'array', true, t('chat.params.messages')],
    ['max_tokens', 'integer', false, t('chat.params.maxTokens')],
    ['stream', 'boolean', false, t('chat.params.stream')],
    ['temperature', 'number', false, t('chat.params.temperature')],
  ];

  return (
    <div>
      <H2 id="chat-title">{t('chat.title')}</H2>
      <Endpoint method="POST" path="/v1/chat/completions" />
      <P>{t('chat.desc')}</P>

      <H3 id="chat-params">{t('chat.paramsTitle')}</H3>
      <ParamTable params={params} />

      <H3 id="chat-examples">{t('chat.examplesTitle')}</H3>
      <Tabs tabs={codeTabs} active={codeTab} onChange={setCodeTab} />
      <CodeBlock
        code={samples[codeTab].code}
        language={codeTab === 'curl' ? 'bash' : codeTab === 'python' ? 'python' : 'javascript'}
      />

      <Callout type="info">{t('chat.reasoningCallout')}</Callout>
    </div>
  );
};

export default Chat;
