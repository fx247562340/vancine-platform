/*
Copyright (C) 2023-2026 QuantumNous

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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { DocsTable, DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems, type CodeTabSample } from '../lib/code-tabs'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

type CodeTab = keyof typeof CODE_LANGUAGES
const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

const STATUS_BADGE_CLASSES: Record<string, string> = {
  queued: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SUCCESS: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  FAILURE: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export default function VideoPage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'video-title', title: t('video.title'), level: 2 },
        { id: 'video-params', title: t('video.paramsTitle'), level: 3 },
        { id: 'video-status', title: t('video.statusTitle'), level: 3 },
        { id: 'video-examples', title: t('video.examplesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const samples = useMemo<Record<CodeTab, CodeTabSample>>(
    () => ({
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
    }),
    [baseUrl]
  )

  const codeTabItems = useMemo(
    () => buildCodeTabItems(samples, CODE_TAB_ORDER, CODE_LANGUAGES),
    [samples]
  )

  const params = useMemo<ParamRow[]>(
    () => [
      {
        name: 'model',
        type: 'string',
        required: true,
        description: t('video.params.model'),
      },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: t('video.params.prompt'),
      },
      {
        name: 'image',
        type: 'string',
        required: false,
        description: t('video.params.image'),
      },
      {
        name: 'images',
        type: 'array',
        required: false,
        description: t('video.params.images'),
      },
      {
        name: 'size',
        type: 'string',
        required: false,
        description: t('video.params.size'),
      },
      {
        name: 'duration',
        type: 'integer',
        required: false,
        description: t('video.params.duration'),
      },
      {
        name: 'metadata',
        type: 'object',
        required: false,
        description: t('video.params.metadata'),
      },
    ],
    [t]
  )

  const statusRows: ReadonlyArray<readonly [string, string]> = [
    ['queued', t('video.status.queued')],
    ['IN_PROGRESS', t('video.status.inProgress')],
    ['SUCCESS', t('video.status.success')],
    ['FAILURE', t('video.status.failure')],
  ]

  return (
    <div>
      <DocsH2 id='video-title'>{t('video.title')}</DocsH2>
      <DocsEndpoint
        method='POST'
        path='/v1/video/generations'
        desc={t('video.endpointSubmit')}
      />
      <DocsEndpoint
        method='GET'
        path='/v1/video/generations/{task_id}'
        desc={t('video.endpointPoll')}
      />
      <DocsP>{t('video.desc')}</DocsP>

      <DocsH3 id='video-params'>{t('video.paramsTitle')}</DocsH3>
      <DocsParamTable params={params} />
      <DocsCallout type='info'>{t('video.metadataCallout')}</DocsCallout>

      <DocsH3 id='video-status'>{t('video.statusTitle')}</DocsH3>
      <DocsTable headers={[t('common.status'), t('common.meaning')]}>
        {statusRows.map(([status, meaning], i) => (
          <DocsTr key={status} last={i === statusRows.length - 1}>
            <DocsTd>
              <Badge
                className={
                  STATUS_BADGE_CLASSES[status] ??
                  'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                }
              >
                {status}
              </Badge>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>{meaning}</DocsTd>
          </DocsTr>
        ))}
      </DocsTable>

      <DocsH3 id='video-examples'>{t('video.examplesTitle')}</DocsH3>
      <DocsCodeTabs items={codeTabItems} />
    </div>
  )
}
