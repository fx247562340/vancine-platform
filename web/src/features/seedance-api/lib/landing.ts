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
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * Pure business logic for the Seedance 2.5 developer landing page: CTA
 * resolution, SEO metadata, the async task code examples, and the page
 * content contract. Everything here is deterministic and unit-testable;
 * nothing reads request headers, user input, or live configuration.
 *
 * Claims stay restrained and verifiable: no fixed prices, no availability
 * guarantees, no official-partner claims. Pricing is dynamic and the live
 * Pricing page is authoritative.
 */

// ---------------------------------------------------------------------------
// Anonymous analytics event contract (shared event names)
// ---------------------------------------------------------------------------

export const SEEDANCE_CTA_EVENT = 'get_started_clicked'

export const SEEDANCE_CTA_LOCATIONS = [
  'seedance_hero',
  'seedance_quickstart',
  'seedance_final_cta',
] as const

export type SeedanceCtaLocation = (typeof SEEDANCE_CTA_LOCATIONS)[number]

export const SEEDANCE_RESOURCE_EVENT = 'developer_resource_clicked'

export const SEEDANCE_RESOURCE_VALUES = ['docs', 'pricing'] as const

export type SeedanceResourceValue = (typeof SEEDANCE_RESOURCE_VALUES)[number]

export const SEEDANCE_RESOURCE_LOCATIONS = [
  'hero',
  'async_workflow',
  'quickstart',
  'final_cta',
] as const

export type SeedanceResourceLocation =
  (typeof SEEDANCE_RESOURCE_LOCATIONS)[number]

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** The fixed canonical origin for every public link on this page. */
export const SEEDANCE_CANONICAL = 'https://vancine.com/seedance-api'

/** Only standard UTM attribution parameters survive CTA URL building. */
const ALLOWED_UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

/**
 * Resolve the internal CTA destination for the current auth state while
 * retaining only allowlisted UTM parameters. The path itself is fixed by
 * the auth state; everything else is dropped, so no sensitive value and no
 * user-controlled target can ride along.
 */
export function getSeedanceCtaDestination(
  isAuthenticated: boolean,
  search = ''
): string {
  const destination = isAuthenticated ? '/playground' : '/sign-up'
  const source = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  )
  const allowed = new URLSearchParams()

  for (const [key, value] of source) {
    if (ALLOWED_UTM_KEYS.has(key)) {
      allowed.append(key, value)
    }
  }

  const query = allowed.toString()
  return query ? `${destination}?${query}` : destination
}

export interface SeedanceCtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

/**
 * Split a resolved CTA destination into a TanStack Link-ready target so
 * internal navigation keeps the allowlisted UTM parameters without building
 * hrefs by string concatenation in components.
 */
export function getSeedanceCtaTarget(
  isAuthenticated: boolean,
  search = ''
): SeedanceCtaTarget {
  const destination = getSeedanceCtaDestination(isAuthenticated, search)
  const [path, query = ''] = destination.split('?')
  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(query)) {
    params[key] = value
  }
  return {
    to: path === '/playground' ? '/playground' : '/sign-up',
    search: params,
  }
}

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface SeedanceLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const SEEDANCE_METADATA: Record<
  InterfaceLanguageCode,
  SeedanceLanguageMetadata
> = {
  // The English twitter pair is pinned byte-for-byte against
  // router/web_metadata.go's /seedance-api entry.
  en: {
    title: 'Seedance 2.5 API for Async Video Generation | Vancine',
    description:
      'Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.',
    ogTitle: 'Seedance 2.5 for Async Video Generation',
    ogDescription:
      'Submit, poll, and retrieve Doubao-Seedance-2.5 video tasks through one API key and documented endpoints.',
    twitterTitle: 'Seedance 2.5 API for Async Video Generation',
    twitterDescription:
      'Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.',
  },
  zhCN: {
    title: 'Seedance 2.5 异步视频生成 API | Vancine',
    description:
      '通过 Vancine 提交 Doubao-Seedance-2.5 视频任务并使用一个 API 密钥获取结果。提交、轮询、获取，遵循标准化的异步工作流。',
    ogTitle: 'Seedance 2.5 异步视频生成',
    ogDescription:
      '通过一个 API 密钥和标准化接口，提交、轮询并获取 Doubao-Seedance-2.5 视频任务。',
    twitterTitle: 'Seedance 2.5 异步视频生成 API',
    twitterDescription:
      '通过 Vancine 提交 Doubao-Seedance-2.5 视频任务并使用一个 API 密钥获取结果。提交、轮询、获取，遵循标准化的异步工作流。',
  },
  zhTW: {
    title: 'Seedance 2.5 非同步影片產生 API | Vancine',
    description:
      '透過 Vancine 提交 Doubao-Seedance-2.5 影片工作並使用一個 API 金鑰取得結果。提交、輪詢、取得，遵循標準化的非同步工作流程。',
    ogTitle: 'Seedance 2.5 非同步影片產生',
    ogDescription:
      '透過一個 API 金鑰與標準化端點，提交、輪詢並取得 Doubao-Seedance-2.5 影片工作。',
    twitterTitle: 'Seedance 2.5 非同步影片產生 API',
    twitterDescription:
      '透過 Vancine 提交 Doubao-Seedance-2.5 影片工作並使用一個 API 金鑰取得結果。提交、輪詢、取得，遵循標準化的非同步工作流程。',
  },
  fr: {
    title: 'API Seedance 2.5 pour la génération vidéo asynchrone | Vancine',
    description:
      'Soumettez des tâches vidéo Doubao-Seedance-2.5 via Vancine et récupérez le résultat avec une seule clé API. Soumettez, interrogez et récupérez via un flux de travail asynchrone documenté.',
    ogTitle: 'Seedance 2.5 pour la vidéo asynchrone',
    ogDescription:
      'Soumettez, interrogez et récupérez des tâches vidéo Doubao-Seedance-2.5 avec une seule clé API et des endpoints documentés.',
    twitterTitle: 'API Seedance 2.5 pour la génération vidéo asynchrone',
    twitterDescription:
      'Soumettez des tâches vidéo Doubao-Seedance-2.5 via Vancine et récupérez le résultat avec une seule clé API. Soumettez, interrogez et récupérez via un flux de travail asynchrone documenté.',
  },
  ru: {
    title: 'Seedance 2.5 API для асинхронной генерации видео | Vancine',
    description:
      'Отправляйте задачи Doubao-Seedance-2.5 через Vancine и получайте результат с одним API-ключом. Отправляйте, опрашивайте и получайте через документированный асинхронный рабочий процесс.',
    ogTitle: 'Seedance 2.5 для асинхронной генерации видео',
    ogDescription:
      'Отправляйте, опрашивайте и получайте задачи Doubao-Seedance-2.5 с одним API-ключом и документированными эндпоинтами.',
    twitterTitle: 'Seedance 2.5 API для асинхронной генерации видео',
    twitterDescription:
      'Отправляйте задачи Doubao-Seedance-2.5 через Vancine и получайте результат с одним API-ключом. Отправляйте, опрашивайте и получайте через документированный асинхронный рабочий процесс.',
  },
  ja: {
    title: 'Seedance 2.5 非同期動画生成 API | Vancine',
    description:
      'Vancine で Doubao-Seedance-2.5 動画タスクを送信し、1 つの API キーで結果を取得できます。ドキュメント化された非同期ワークフローで、送信、ポーリング、取得を行います。',
    ogTitle: 'Seedance 2.5 非同期動画生成',
    ogDescription:
      '1 つの API キーとドキュメント化されたエンドポイントで、Doubao-Seedance-2.5 動画タスクを送信、ポーリング、取得できます。',
    twitterTitle: 'Seedance 2.5 非同期動画生成 API',
    twitterDescription:
      'Vancine で Doubao-Seedance-2.5 動画タスクを送信し、1 つの API キーで結果を取得できます。ドキュメント化された非同期ワークフローで、送信、ポーリング、取得を行います。',
  },
  vi: {
    title: 'API Seedance 2.5 cho tạo video không đồng bộ | Vancine',
    description:
      'Gửi tác vụ video Doubao-Seedance-2.5 qua Vancine và lấy kết quả bằng một khóa API. Gửi, thăm dò và lấy qua quy trình làm việc không đồng bộ được tài liệu hóa.',
    ogTitle: 'Seedance 2.5 cho tạo video không đồng bộ',
    ogDescription:
      'Gửi, thăm dò và lấy tác vụ video Doubao-Seedance-2.5 bằng một khóa API và các endpoint được tài liệu hóa.',
    twitterTitle: 'API Seedance 2.5 cho tạo video không đồng bộ',
    twitterDescription:
      'Gửi tác vụ video Doubao-Seedance-2.5 qua Vancine và lấy kết quả bằng một khóa API. Gửi, thăm dò và lấy qua quy trình làm việc không đồng bộ được tài liệu hóa.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is normalized
 * (zhCN / zhTW / BCP-47 variants), and any unknown language falls back to
 * English. The canonical URL and og:url are fixed constants — they are never
 * derived from host headers or user input.
 */
export function getSeedancePageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = SEEDANCE_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: SEEDANCE_CANONICAL,
    canonical: SEEDANCE_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// API example contract
// ---------------------------------------------------------------------------

export const SEEDANCE_API_BASE_URL = 'https://vancine.com/v1'
export const SEEDANCE_SUBMIT_ENDPOINT =
  'https://vancine.com/v1/video/generations'
export const SEEDANCE_MODEL_ID = 'Doubao-Seedance-2.5'
export const SEEDANCE_API_KEY_ENV_VAR = 'VANCINE_API_KEY'

export interface SeedanceCodeExample {
  id: 'curl' | 'python' | 'node'
  label: string
  code: string
}

/**
 * Quickstart examples for the async video workflow. Every example targets
 * the public Vancine endpoint, uses the Doubao-Seedance-2.5 model id, reads
 * the API key exclusively from the VANCINE_API_KEY environment variable,
 * handles non-2xx responses, validates the task id, polls with a bounded
 * attempt count and explicit timeout, and handles both the success and
 * failure terminal states. The minimal request carries only model + prompt;
 * no unverified optional parameters (e.g. size) are published.
 */
export const SEEDANCE_CODE_EXAMPLES: readonly SeedanceCodeExample[] = [
  {
    id: 'curl',
    label: 'cURL',
    code: `# 1. Submit the video generation task
HTTP_CODE=$(curl -s -o /tmp/seedance_submit.json -w "%{http_code}" \\
  -X POST https://vancine.com/v1/video/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"Doubao-Seedance-2.5","prompt":"a cat walking on a beach"}')

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  echo "Submit returned non-2xx HTTP $HTTP_CODE" >&2
  cat /tmp/seedance_submit.json >&2
  exit 1
fi

# 2. Extract and validate the task id (top-level id)
TASK_ID=$(python3 -c "import json; print(json.load(open('/tmp/seedance_submit.json')).get('id',''))")
if [ -z "$TASK_ID" ]; then
  echo "No task id in response" >&2
  exit 1
fi

# 3. Poll until the task reaches a terminal state (bounded).
# Vancine returns {code, data: {status, result_url, fail_reason}}; every GET
# must check its own HTTP status before reading data.status.
MAX_ATTEMPTS=24
ATTEMPT=0
while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
  ATTEMPT=$((ATTEMPT + 1))
  POLL_HTTP=$(curl -s -o /tmp/seedance_poll.json -w "%{http_code}" \\
    -X GET "https://vancine.com/v1/video/generations/$TASK_ID" \\
    -H "Authorization: Bearer $VANCINE_API_KEY")
  if [ "$POLL_HTTP" -lt 200 ] || [ "$POLL_HTTP" -ge 300 ]; then
    echo "Poll returned non-2xx HTTP $POLL_HTTP" >&2
    cat /tmp/seedance_poll.json >&2
    exit 1
  fi
  STATUS=$(python3 -c "import json; print(json.load(open('/tmp/seedance_poll.json')).get('data',{}).get('status',''))")
  if [ "$STATUS" = "SUCCESS" ]; then
    python3 -c "import json; print(json.load(open('/tmp/seedance_poll.json')).get('data',{}).get('result_url',''))"
    exit 0
  elif [ "$STATUS" = "FAILURE" ]; then
    echo "Task reached FAILURE state after $ATTEMPT attempts" >&2
    python3 -c "import json; print(json.load(open('/tmp/seedance_poll.json')).get('data',{}).get('fail_reason',''))" >&2
    exit 1
  fi
  sleep 5
done

echo "Timed out after $MAX_ATTEMPTS attempts waiting for task $TASK_ID" >&2
exit 1`,
  },
  {
    id: 'python',
    label: 'Python',
    code: `import os
import time
import requests

# POST https://vancine.com/v1/video/generations
response = requests.post(
    "https://vancine.com/v1/video/generations",
    headers={
        "Authorization": f"Bearer {os.environ['VANCINE_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={"model": "Doubao-Seedance-2.5", "prompt": "a cat walking on a beach"},
)
if not response.ok:
    raise SystemExit(f"Submit returned non-2xx HTTP {response.status_code}: {response.text}")
task_id = (response.json() or {}).get("id")
if not task_id:
    raise SystemExit("No task id in response")

# Poll until the task reaches a terminal state (bounded).
# Vancine returns {code, data: {status, result_url, fail_reason}}.
for _ in range(24):
    poll_response = requests.get(
        f"https://vancine.com/v1/video/generations/{task_id}",
        headers={"Authorization": f"Bearer {os.environ['VANCINE_API_KEY']}"},
    )
    if not poll_response.ok:
        raise SystemExit(f"Poll returned non-2xx HTTP {poll_response.status_code}: {poll_response.text}")
    payload = poll_response.json()
    data = payload.get("data") or {}
    status = data.get("status")
    if status == "SUCCESS":
        print(data.get("result_url", ""))
        break
    if status == "FAILURE":
        raise SystemExit(f"Task FAILURE: {data.get('fail_reason', 'unknown error')}")
    time.sleep(5)
else:
    raise SystemExit("Timed out waiting for task")`,
  },
  {
    id: 'node',
    label: 'Node.js',
    code: `// POST https://vancine.com/v1/video/generations
const submitResponse = await fetch('https://vancine.com/v1/video/generations', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.VANCINE_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: 'Doubao-Seedance-2.5', prompt: 'a cat walking on a beach' }),
})
if (!submitResponse.ok) {
  throw new Error(\`Submit returned non-2xx HTTP \${submitResponse.status}: \${await submitResponse.text()}\`)
}
const submitBody = await submitResponse.json()
const taskId = submitBody?.id
if (!taskId) {
  throw new Error('No task id in response')
}

// Poll until the task reaches a terminal state (bounded).
// Vancine returns {code, data: {status, result_url, fail_reason}}.
let result
for (let attempt = 0; attempt < 24; attempt += 1) {
  const taskResponse = await fetch(
    \`https://vancine.com/v1/video/generations/\${taskId}\`,
    { headers: { Authorization: \`Bearer \${process.env.VANCINE_API_KEY}\` } },
  )
  if (!taskResponse.ok) {
    throw new Error(\`Poll returned non-2xx HTTP \${taskResponse.status}: \${await taskResponse.text()}\`)
  }
  const taskPayload = await taskResponse.json()
  const data = taskPayload?.data
  if (data?.status === 'SUCCESS') {
    result = data.result_url
    break
  }
  if (data?.status === 'FAILURE') {
    throw new Error(\`Task FAILURE: \${data.fail_reason ?? 'unknown error'}\`)
  }
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
if (!result) {
  throw new Error('Timed out waiting for task')
}
console.log(result)`,
  },
]

// ---------------------------------------------------------------------------
// Page content contract (i18n key registries for data-driven sections)
// ---------------------------------------------------------------------------

export interface SeedanceFaqEntry {
  questionKey: string
  answerKey: string
}

export const SEEDANCE_FAQ: readonly SeedanceFaqEntry[] = [
  {
    questionKey: 'How does async video generation work?',
    answerKey:
      'Video generation uses an async task workflow: submit a generation request, receive a task ID, then poll the task status and retrieve the result.',
  },
  {
    questionKey: 'How does pricing work for video generation?',
    answerKey:
      'Pricing is dynamic and follows the live Pricing page. Model ratios can change, so this page does not hardcode per-video prices.',
  },
  {
    questionKey: 'How do I get an API key and start testing?',
    answerKey:
      'Create a Vancine account, generate an API key in the console, and follow the quickstart above to submit and poll your first video task.',
  },
]

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the Seedance 2.5 landing page passes to t(). Locale
 * completeness tests iterate this list; product-name literals that are
 * intentionally not localized are excluded.
 */
export const SEEDANCE_I18N_KEYS = [
  'Seedance 2.5 API for Async Video Generation',
  'Submit a Doubao-Seedance-2.5 video task and retrieve the result through one Vancine API key.',
  'Start free',
  'Go to Playground',
  'View quickstart',
  'How async video generation works',
  'Seedance 2.5 async task workflow',
  'Three steps: submit the task, poll until it reaches a terminal state, then retrieve the video or the error.',
  'Submit',
  'Send a generation request with your prompt. Vancine returns a task id.',
  'Poll',
  'Poll the task status by task id until it reaches a terminal state. Completion time varies by task and load.',
  'Result',
  'Retrieve the video URL on success, or the error details on failure.',
  'Quickstart',
  'Send your first Doubao-Seedance-2.5 task with an environment variable, not a pasted secret.',
  'Quickstart languages',
  'Read API documentation',
  'Create an API key',
  'Copy',
  'Code copied',
  'Unable to copy code',
  'Copy example code to clipboard',
  'View live pricing and availability',
  'Browse the Docs model catalog',
  ...SEEDANCE_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
  'Build your first Seedance 2.5 video today',
  'Submit, poll, and retrieve video through one documented async workflow.',
  'Get started with Vancine',
  'View pricing',
] as const
