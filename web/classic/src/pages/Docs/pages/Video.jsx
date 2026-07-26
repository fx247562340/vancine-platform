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
import Tabs from '../components/Tabs';
import ParamTable from '../components/ParamTable';
import Endpoint from '../components/Endpoint';
import { Table, Td, Tr } from '../components/Table';
import Badge from '../components/Badge';

const Video = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [codeTab, setCodeTab] = useState('curl');

  const samples = useMemo(() => ({
    curl: {
      label: 'cURL',
      code: `# 1. Submit the async task
curl -X POST ${baseUrl}/video/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "a cat walking on a beach",
    "size": "1280x720"
  }'

# Save task_id from the response
# {"task_id":"task_xxx","status":"queued"}

# 2. Poll task status
curl ${baseUrl}/video/generations/task_xxx \\
  -H "Authorization: Bearer sk-your-api-key"`,
    },
    python: {
      label: 'Python',
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
      label: 'Node.js',
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
  }), [baseUrl]);

  const codeTabs = [
    { key: 'curl', label: samples.curl.label },
    { key: 'python', label: samples.python.label },
    { key: 'node', label: samples.node.label },
  ];

  const params = [
    ['model', 'string', true, t('video.params.model')],
    ['prompt', 'string', true, t('video.params.prompt')],
    ['size', 'string', false, t('video.params.size')],
  ];

  const statusRows = [
    ['queued', t('video.status.queued')],
    ['IN_PROGRESS', t('video.status.inProgress')],
    ['SUCCESS', t('video.status.success')],
    ['FAILURE', t('video.status.failure')],
  ];

  return (
    <div>
      <H2 id="video-title">{t('video.title')}</H2>
      <Endpoint method="POST" path="/v1/video/generations" desc={t('video.endpointSubmit')} />
      <Endpoint method="GET" path="/v1/video/generations/{task_id}" desc={t('video.endpointPoll')} />
      <P>{t('video.desc')}</P>

      <H3 id="video-params">{t('video.paramsTitle')}</H3>
      <ParamTable params={params} />

      <H3 id="video-status">{t('video.statusTitle')}</H3>
      <Table
        headers={[t('common.status'), t('common.meaning')]}
        rows={statusRows}
        renderRow={([status, meaning], i, last) => (
          <Tr key={i} last={last}>
            <Td><Badge color={status === 'SUCCESS' ? 'green' : status === 'FAILURE' ? 'red' : 'blue'}>{status}</Badge></Td>
            <Td style={{ color: C.text.muted }}>{meaning}</Td>
          </Tr>
        )}
      />

      <H3 id="video-examples">{t('video.examplesTitle')}</H3>
      <Tabs tabs={codeTabs} active={codeTab} onChange={setCodeTab} />
      <CodeBlock
        code={samples[codeTab].code}
        language={codeTab === 'curl' ? 'bash' : codeTab === 'python' ? 'python' : 'javascript'}
      />
    </div>
  );
};

export default Video;
