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
import { Table, Td, Tr } from '../components/Table';
import Badge from '../components/Badge';

const IMAGE_MODELS = [
  ['qwen-image-2.0', '1024x1024', ''],
  ['qwen-image-2.0-pro', '1024x1024', '2K'],
  ['Doubao-Seedream-5.0-pro', '1K / 2K / WxH', '921,600 ~ 4,624,220 px'],
  ['Doubao-Seedream-5.0-lite', '2K / 3K / 4K / WxH', '≥ 3,686,400 px'],
  ['wan2.7-image', 'WxH', ''],
  ['wan2.7-image-pro', 'WxH', ''],
];

const Image = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [codeTab, setCodeTab] = useState('curl');

  const samples = useMemo(() => ({
    curl: {
      label: 'cURL',
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
      label: 'Python',
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
      label: 'Node.js',
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
  }), [baseUrl]);

  const codeTabs = [
    { key: 'curl', label: samples.curl.label },
    { key: 'python', label: samples.python.label },
    { key: 'node', label: samples.node.label },
  ];

  const params = [
    ['model', 'string', true, t('image.params.model')],
    ['prompt', 'string', true, t('image.params.prompt')],
    ['n', 'integer', false, t('image.params.n')],
    ['size', 'string', false, t('image.params.size')],
  ];

  return (
    <div>
      <H2 id="image-title">{t('image.title')}</H2>
      <Endpoint method="POST" path="/v1/images/generations" />
      <P>{t('image.desc')}</P>

      <H3 id="image-params">{t('image.paramsTitle')}</H3>
      <ParamTable params={params} />

      <H3 id="image-sizes">{t('image.sizesTitle')}</H3>
      <Table
        headers={[t('common.model'), t('image.colWorkingSize'), t('common.notes')]}
        rows={IMAGE_MODELS}
        renderRow={([model, size, note], i, last) => (
          <Tr key={i} last={last}>
            <Td style={{ fontFamily: 'monospace', color: C.accent }}>{model}</Td>
            <Td><Badge color="green">{size}</Badge></Td>
            <Td style={{ color: C.text.muted }}>{note || t('image.defaultSizeSupported')}</Td>
          </Tr>
        )}
      />

      <Callout type="warning">{t('image.sizeWarning')}</Callout>

      <H3 id="image-examples">{t('image.examplesTitle')}</H3>
      <Tabs tabs={codeTabs} active={codeTab} onChange={setCodeTab} />
      <CodeBlock
        code={samples[codeTab].code}
        language={codeTab === 'curl' ? 'bash' : codeTab === 'python' ? 'python' : 'javascript'}
      />
    </div>
  );
};

export default Image;
