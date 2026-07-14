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
/**
 * Pure, dependency-free landing-page contract for the Default theme's
 * Seedance API page.
 *
 * Holds the conversion-path destinations, the allowed analytics locations,
 * the static API code examples, and the localized SEO/social metadata.
 *
 * Kept free of React/DOM so the Node native test runner can verify the
 * acquisition contract without a browser. Components consume these helpers;
 * they never hard-code destinations, locations, or metadata strings.
 */

/** Primary CTA event name shared with the analytics layer. */
export const SEEDANCE_CTA_EVENT = 'get_started_clicked'

/**
 * Ordered, immutable list of the only analytics location values this page
 * may send. Every primary CTA must use one of these. The order matches the
 * page flow: hero -> pricing -> final.
 */
export const SEEDANCE_CTA_LOCATIONS = Object.freeze([
  'seedance_hero',
  'seedance_pricing',
  'seedance_final_cta',
] as const)

export type SeedanceCtaLocation = (typeof SEEDANCE_CTA_LOCATIONS)[number]

/** Resource-link event name shared with the analytics layer. */
export const SEEDANCE_RESOURCE_EVENT = 'developer_resource_clicked'

/**
 * Ordered, immutable list of the only resource values this page may send.
 * Every resource navigation must use one of these.
 */
export const SEEDANCE_RESOURCE_VALUES = Object.freeze(['docs'] as const)

export type SeedanceResourceValue = (typeof SEEDANCE_RESOURCE_VALUES)[number]

/**
 * Ordered, immutable list of the only resource locations this page may
 * send. Every resource navigation must use one of these.
 */
export const SEEDANCE_RESOURCE_LOCATIONS = Object.freeze([
  'header',
  'code_examples',
  'final_cta',
] as const)

export type SeedanceResourceLocation =
  (typeof SEEDANCE_RESOURCE_LOCATIONS)[number]

/** Default-theme CTA destinations, keyed by authentication state. */
const DEFAULT_CTA_DESTINATION: Record<'authenticated' | 'guest', string> = {
  guest: '/sign-up',
  authenticated: '/playground',
}

/**
 * Returns the primary CTA destination for the Default theme.
 *
 * @param isAuthenticated whether a user session is active
 */
export function getSeedanceCtaDestination(isAuthenticated: boolean): string {
  return isAuthenticated
    ? DEFAULT_CTA_DESTINATION.authenticated
    : DEFAULT_CTA_DESTINATION.guest
}

/** Canonical landing URL, identical across languages in version one. */
export const SEEDANCE_CANONICAL = 'https://vancine.com/seedance-api'

/**
 * Vancine's Seedance documentation URL. All user-facing docs entry points
 * on this page resolve here — never directly to the upstream provider docs
 * (which remain referenced in non-navigational attribution text only).
 */
export const VANCINE_SEEDANCE_DOCS_URL = 'https://vancine.com/docs#video'

/**
 * Returns the Vancine Seedance documentation URL.
 *
 * @returns a `vancine.com/docs#video` URL
 */
export function getSeedanceDocsUrl(): string {
  return VANCINE_SEEDANCE_DOCS_URL
}

interface SeedanceMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  canonical: string
}

interface SeedanceLocalizedMetadata {
  en: SeedanceMetadata
  zh: SeedanceMetadata
}

const SEEDANCE_METADATA: SeedanceLocalizedMetadata = {
  en: {
    title: 'Seedance API for Video Generation | Vancine',
    description:
      'Integrate supported Seedance text-to-video and image-to-video workflows with one API key. Start with $1 in free credit and no card required.',
    ogTitle: 'Build with Seedance Through One API',
    ogDescription:
      "Submit an async video task, poll its status, and retrieve the result through Vancine's documented API.",
    canonical: SEEDANCE_CANONICAL,
  },
  zh: {
    title: 'Seedance 视频生成 API | Vancine',
    description:
      '使用一个 API 密钥接入受支持的 Seedance 文生视频和图生视频工作流。注册即得 1 美元免费额度，无需信用卡。',
    ogTitle: '通过一个 API 接入 Seedance',
    ogDescription:
      '通过 Vancine 文档化的 API 提交异步视频任务、轮询状态并获取结果。',
    canonical: SEEDANCE_CANONICAL,
  },
}

/**
 * Returns the route-specific SEO/social metadata for the given language.
 *
 * Chinese is selected for `zh` and any `zh-*` tag (e.g. `zh-CN`, `zh-TW`).
 * Every other language falls back to English so that fr/ja/ru/vi never
 * render an empty or key-only metadata string.
 *
 * @param language an i18next language tag (e.g. 'en', 'zh', 'zh-CN')
 */
export function getSeedanceMetadata(language: string): SeedanceMetadata {
  const normalized = (language ?? '').trim().toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return SEEDANCE_METADATA.zh
  }
  return SEEDANCE_METADATA.en
}

export interface SeedanceCodeExample {
  /** Stable id; also selects the code tab id. */
  id: 'curl' | 'python' | 'node'
  /** i18next key for the tab label (e.g. 'cURL'). */
  labelKey: string
  /** The copyable example body. Uses $VANCINE_API_KEY / os.environ / process.env. */
  code: string
}

/**
 * Static, dependency-free Seedance API code examples. These mirror the
 * documented Seedance async workflow and use documented endpoints only. No
 * real credential, prompt, user data, or fixed model price appears here.
 */
export const SEEDANCE_CODE_EXAMPLES: readonly SeedanceCodeExample[] =
  Object.freeze([
    {
      id: 'curl',
      labelKey: 'cURL',
      code: `# 1. Submit a Seedance video generation task
# The real backend returns the task id at the top level: {"task_id":"task_xxx","id":"task_xxx","status":"queued",...}
SUBMIT=$(curl -s -X POST https://vancine.com/v1/video/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "A timelapse of a flower blooming at sunrise",
    "size": "1280x720"
  }')

# 2. Extract the task id (top-level task_id first, fall back to top-level id)
TASK_ID=$(echo "$SUBMIT" | jq -r '.task_id // .id // empty')
if [ -z "$TASK_ID" ]; then
  echo "error: no task_id in submit response: $SUBMIT" >&2
  exit 1
fi
echo "task_id = $TASK_ID"

# 3. Poll the status with a fixed limit (every 5s, up to 60 attempts)
# Terminal states: completed / failed (current API), SUCCESS / FAILURE (legacy)
for i in $(seq 1 60); do
  RESULT=$(curl -s https://vancine.com/v1/video/generations/"$TASK_ID" \\
    -H "Authorization: Bearer $VANCINE_API_KEY")
  STATUS=$(echo "$RESULT" | jq -r '.status // .data.status // empty')
  echo "poll $i: status = $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "SUCCESS" ]; then
    URL=$(echo "$RESULT" | jq -r '.metadata.url // .data.result_url // .data.data.content.video_url // empty')
    echo "result_url = $URL"
    exit 0
  fi
  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "FAILURE" ]; then
    echo "error: task failed: $TASK_ID" >&2
    exit 1
  fi
  sleep 5
done

echo "error: polling exceeded 60 attempts" >&2
exit 1`,
    },
    {
      id: 'python',
      labelKey: 'Python',
      code: `import os
import time
import requests

BASE = "https://vancine.com/v1/video/generations"
API_KEY = os.environ["VANCINE_API_KEY"]
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 1. Submit a Seedance video generation task
payload = {
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "A timelapse of a flower blooming at sunrise",
    "size": "1280x720",
}
resp = requests.post(BASE, json=payload, headers=headers)
if not resp.ok:
    raise RuntimeError(f"submit failed ({resp.status_code}): {resp.text}")
submit = resp.json()

# 2. Read the task id from the real top-level field first, fall back to id,
# then to the legacy nested data.task_id / data.id shapes.
task_id = (
    submit.get("task_id")
    or submit.get("id")
    or (submit.get("data") or {}).get("task_id")
    or (submit.get("data") or {}).get("id")
)
if not task_id:
    raise RuntimeError(f"no task_id in submit response: {submit}")
print("task_id =", task_id)

# 3. Poll the status with a fixed limit (every 5s, up to 120 attempts).
# Terminal states: completed / failed (current API), SUCCESS / FAILURE (legacy).
terminal = ("completed", "failed", "SUCCESS", "FAILURE")
last = None
for _ in range(120):
    r = requests.get(f"{BASE}/{task_id}", headers=headers)
    if not r.ok:
        raise RuntimeError(f"poll failed ({r.status_code}): {r.text}")
    last = r.json()
    status = last.get("status") or (last.get("data") or {}).get("status")
    if status in terminal:
        break
    time.sleep(5)
else:
    raise TimeoutError("polling exceeded 120 attempts")

if status in ("failed", "FAILURE"):
    err = (last.get("error") or {}).get("message") or "unknown error"
    raise RuntimeError(f"task failed ({task_id}): {err}")

# 4. Retrieve the result URL: metadata.url first (current API), then legacy paths.
meta = last.get("metadata") or {}
result_url = (
    meta.get("url")
    or (last.get("data") or {}).get("result_url")
    or ((last.get("data") or {}).get("data") or {}).get("content", {}).get("video_url")
)
print("result_url =", result_url)`,
    },
    {
      id: 'node',
      labelKey: 'Node.js',
      code: `const BASE = "https://vancine.com/v1/video/generations";
const API_KEY = process.env.VANCINE_API_KEY;
const headers = {
  Authorization: \`Bearer \${API_KEY}\`,
  "Content-Type": "application/json",
};

// 1. Submit a Seedance video generation task
const submit = await fetch(BASE, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "Doubao-Seedance-1.5-pro",
    prompt: "A timelapse of a flower blooming at sunrise",
    size: "1280x720",
  }),
});
if (!submit.ok) {
  const body = await submit.text();
  throw new Error(\`submit failed (\${submit.status}): \${body}\`);
}
const submitJson = await submit.json();

// 2. Read the task id from the real top-level field first, fall back to id,
// then to the legacy nested data.task_id / data.id shapes.
const data = submitJson.data || {};
const taskId =
  submitJson.task_id || submitJson.id || data.task_id || data.id;
if (!taskId) {
  throw new Error(\`no task_id in submit response: \${JSON.stringify(submitJson)}\`);
}
console.log("task_id =", taskId);

// 3. Poll the status with a fixed limit (every 5s, up to 120 attempts).
// Terminal states: completed / failed (current API), SUCCESS / FAILURE (legacy).
const terminal = ["completed", "failed", "SUCCESS", "FAILURE"];
let last = null;
let status = null;
for (let i = 0; i < 120; i += 1) {
  const r = await fetch(\`\${BASE}/\${taskId}\`, { headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(\`poll failed (\${r.status}): \${body}\`);
  }
  last = await r.json();
  status = last.status || (last.data && last.data.status);
  if (terminal.includes(status)) break;
  await new Promise((res) => setTimeout(res, 5000));
}
if (!terminal.includes(status)) {
  throw new Error("polling exceeded 120 attempts");
}
if (status === "failed" || status === "FAILURE") {
  const reason = (last.error && last.error.message) || "unknown error";
  throw new Error(\`task failed (\${taskId}): \${reason}\`);
}

// 4. Retrieve the result URL: metadata.url first (current API), then legacy paths.
const meta = last.metadata || {};
const inner = last.data || {};
const resultUrl =
  meta.url || inner.result_url || (inner.data && inner.data.content && inner.data.content.video_url);
console.log("result_url =", resultUrl);`,
    },
  ])

export interface SeedanceFaqItem {
  /** i18next key for the question. */
  questionKey: string
  /** i18next key for the answer. */
  answerKey: string
}

/**
 * FAQ items for the Seedance API page. Each question/answer pair is an
 * i18next key; English values equal the key text, other locales translate.
 */
export const SEEDANCE_FAQ: readonly SeedanceFaqItem[] = Object.freeze([
  {
    questionKey: 'How does the Seedance API workflow work?',
    answerKey:
      'The Seedance API workflow lets you submit supported text-to-video and image-to-video tasks, poll their status, and retrieve the result as documented.',
  },
  {
    questionKey: 'Which Seedance models are available?',
    answerKey:
      'Current documented examples include Doubao-Seedance-1.5-pro, Doubao-Seedance-2.0-fast, and Doubao-Seedance-2.0. Live documentation and pricing remain authoritative.',
  },
  {
    questionKey: 'Can I use text and image inputs?',
    answerKey:
      'Supported workflows include both text-to-video and image-to-video inputs as documented for each model.',
  },
  {
    questionKey: 'Do I need a credit card to start?',
    answerKey:
      'No. After signing up you receive $1 in free credit with no credit card required to start.',
  },
  {
    questionKey: 'Where can I see current pricing and limits?',
    answerKey:
      'See the live pricing page and API documentation. Model pricing and limits can change, so this landing page does not hard-code them.',
  },
  {
    questionKey: 'Is this an unrestricted or safety-bypass API?',
    answerKey:
      'No. Vancine does not bypass model safety requirements. Model capabilities, input requirements, availability, and safety behavior still follow their documented requirements.',
  },
])
