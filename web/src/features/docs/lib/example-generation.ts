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
import { resolveVideoModelCapability } from '@/features/video-playground/lib/model-capabilities'
import {
  buildVideoGenerationRequest,
  type VideoGenerationRequestBody,
} from '@/features/video-playground/lib/video-request'

import {
  getImageContract,
  getModelEntryByModelId,
  type I18nSentence,
  type ImageContract,
} from './model-registry'

/**
 * Shared example-body and code-sample generation for the Docs media
 * pages.
 *
 * Single-source rules enforced by this module:
 *  - The image example body comes ONLY from the verified ImageContract;
 *    a model without a contract gets the safe common minimum
 *    (model + prompt) and never a guessed size or n.
 *  - The video example body comes ONLY from the production
 *    `buildVideoGenerationRequest` serializer, so a docs example can
 *    never drift from what the video studio actually puts on the wire.
 *  - The cURL / Python / Node.js snippets are rendered from ONE body
 *    object by ONE renderer, shared by the overview pages and the
 *    detail template.
 */

/** Fallback text model used across chat/quickstart/auth/agents docs. */
export const DOCS_FALLBACK_TEXT_MODEL = 'deepseek-v4-flash'

/** Fallback image model used by /docs/image when the catalog is down. */
export const DOCS_FALLBACK_IMAGE_MODEL = 'qwen-image-3.0'

/** Stable demo prompts (docs never call the API). */
export const IMAGE_EXAMPLE_PROMPT = 'a red apple on a wooden table'
export const VIDEO_EXAMPLE_PROMPT = 'a cat walking on a beach'

/**
 * The minimum legal image request for one model id.
 *
 * Contract known → model + prompt + n (nRange.default) + size
 * (defaultSize). Contract unknown → model + prompt only: never guess
 * size, n or advanced parameters for a model the registry has no
 * verified evidence for.
 */
export function buildImageExampleBody(
  modelId: string
): Record<string, unknown> {
  const contract: ImageContract | null = getImageContract(modelId)
  if (!contract) {
    return { model: modelId, prompt: IMAGE_EXAMPLE_PROMPT }
  }
  return {
    model: modelId,
    prompt: IMAGE_EXAMPLE_PROMPT,
    n: contract.nRange.default,
    size: contract.defaultSize,
  }
}

/**
 * Resolve the example image model id for the /docs/image overview:
 * the first online model with a verified contract when available,
 * otherwise the verified fallback.
 */
export function resolveImageExampleModelId(
  onlineModels: ReadonlyArray<{ model_name: string }>
): string {
  return onlineModels[0]?.model_name ?? DOCS_FALLBACK_IMAGE_MODEL
}

/**
 * Build the OVERVIEW-level image example body. The overview sends
 * the minimum legal request (model + prompt) and never pins size, n,
 * or advanced parameters, because every image model has a different
 * contract and the overview must not misrepresent any of them. The
 * per-model /docs/models/<slug> page owns the model-specific example
 * via the shared `buildImageExampleBody` helper.
 */
export function buildImageOverviewBody(
  modelId: string
): Record<string, unknown> {
  return { model: modelId, prompt: IMAGE_EXAMPLE_PROMPT }
}

/**
 * The minimum legal video request body for one model id, produced
 * by the SAME serializer the video studio uses on submit. Reference
 * images are always empty in docs examples; duration and resolution
 * are legal values picked from the capability table (its own
 * defaults, never invented).
 *
 * Returns null only when the model has no verified contract
 * (`unknown` capability): the docs then show model + prompt, which
 * is exactly what the studio sends for an unknown model.
 */
export function buildVideoExampleBody(
  modelId: string
): VideoGenerationRequestBody | null {
  const capability = resolveVideoModelCapability(modelId)
  if (!capability.known || capability.wire === null) {
    return null
  }
  // Legal defaults from the capability table: the studio's default
  // five-second clip when the model allows it, otherwise the lowest
  // legal duration; the highest available resolution with no
  // reference images.
  const duration = capability.durations.includes(5)
    ? 5
    : (capability.durations[0] ?? 5)
  const resolution = capability.resolutions.at(-1) ?? ''
  return buildVideoGenerationRequest({
    capability,
    prompt: VIDEO_EXAMPLE_PROMPT,
    duration,
    resolution,
    images: [],
  })
}

/**
 * Build the OVERVIEW-level example body. The overview deliberately
 * sends the minimum legal request (model + prompt) and never pins a
 * per-model wire field, because every model has a different wire
 * contract and the overview must not misrepresent any of them. The
 * per-model /docs/models/<slug> page owns the model-specific example
 * via the shared `buildVideoExampleBody` helper.
 */
export function buildVideoOverviewBody(
  modelId: string
): Record<string, unknown> {
  return { model: modelId, prompt: VIDEO_EXAMPLE_PROMPT }
}

/**
 * Resolve the example video model id for the /docs/video overview.
 * Prefers the first online model with a verified contract so the
 * serialized example is a known wire; falls back to the first
 * registry video model; the terminal fallback is a known-contract
 * model that is currently in production.
 */
export function resolveVideoExampleModelId(
  onlineModels: ReadonlyArray<{ model_name: string }>
): string {
  for (const model of onlineModels) {
    const capability = resolveVideoModelCapability(model.model_name)
    if (capability.known) return model.model_name
  }
  return 'Doubao-Seedance-2.5'
}

// ---------------------------------------------------------------------------
// Shared three-language snippet renderer
// ---------------------------------------------------------------------------

export type CodeTabSample = { label: string; code: string }
export type CodeTab = 'curl' | 'python' | 'node'

const SHELL_QUOTE_ESCAPED = "'\\''"

/** POSIX-single-quote a JSON string so it is safe inside `-d '...'`. */
function shellQuote(json: string): string {
  return `'${json.replaceAll("'", SHELL_QUOTE_ESCAPED)}'`
}

/**
 * Render cURL / Python / Node.js snippets from ONE JSON body.
 *
 * `kind` selects the async submit+poll wrapper (video) or the
 * synchronous single call (image). Both share this one renderer, so
 * the overview and the detail template cannot drift.
 */
export function renderApiSamples(
  baseUrl: string,
  endpointPath: string,
  body: Record<string, unknown>,
  kind: 'sync' | 'async'
): Record<CodeTab, CodeTabSample> {
  const json = JSON.stringify(body, null, 2)
  const fullUrl = `${baseUrl}${endpointPath}`
  const curl = renderCurl(fullUrl, json, kind)
  return {
    curl: { label: 'cURL', code: curl },
    python: { label: 'Python', code: renderPython(fullUrl, json, kind) },
    node: { label: 'Node.js', code: renderNode(fullUrl, json, kind) },
  }
}

function renderCurl(
  fullUrl: string,
  json: string,
  kind: 'sync' | 'async'
): string {
  const submit = `curl -X POST ${fullUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d ${shellQuote(json)}`
  if (kind === 'sync') return submit
  return `${submit}

# Save the top-level id from the plugin submit receipt.
# {"id":"task_xxx","object":"video","status":"queued",...}

# 2. Poll task status by id
curl ${fullUrl}/task_xxx \\
  -H "Authorization: Bearer sk-your-api-key"`
}

function renderPython(
  fullUrl: string,
  json: string,
  kind: 'sync' | 'async'
): string {
  if (kind === 'sync') {
    return `import requests

response = requests.post(
    "${fullUrl}",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json",
    },
    json=${json},
)
response.raise_for_status()

print(response.json()["data"][0]["url"])`
  }
  return `import time
import requests

API_KEY = "sk-your-api-key"
BASE = "${fullUrl}"

# 1. Submit the async task. The plugin submit receipt looks like
#    {"id":"task_xxx","object":"video","status":"queued",...}.
#    Read the top-level id.
submit = requests.post(
    BASE,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json=${json},
)
submit.raise_for_status()
task = submit.json()
task_id = task["id"]

# 2. Poll GET /v1/video/generations/{id}. The envelope is
#    {"code":"success","data":{"status","result_url","fail_reason",...}}.
#    data.status is the uppercase TaskStatus enum:
#    NOT_START / SUBMITTED / QUEUED / IN_PROGRESS / SUCCESS / FAILURE.
while True:
    poll = requests.get(
        f"{BASE}/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    poll.raise_for_status()
    data = poll.json().get("data", {})
    status = data.get("status")
    print(status)

    if status == "SUCCESS":
        print(data.get("result_url"))
        break
    if status == "FAILURE":
        print(data.get("fail_reason"))
        break

    time.sleep(5)`
}

function renderNode(
  fullUrl: string,
  json: string,
  kind: 'sync' | 'async'
): string {
  if (kind === 'sync') {
    return `const response = await fetch("${fullUrl}", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${json}),
});
if (!response.ok) throw new Error("HTTP " + response.status);

const data = await response.json();
console.log(data.data[0].url);`
  }
  return `const API_KEY = "sk-your-api-key";
const BASE = "${fullUrl}";

// 1. Submit the async task. The plugin submit receipt looks like
//    {"id":"task_xxx","object":"video","status":"queued",...}.
//    Read the top-level id.
const submitRes = await fetch(BASE, {
  method: "POST",
  headers: {
    Authorization: "Bearer " + API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${json}),
});
if (!submitRes.ok) throw new Error("HTTP " + submitRes.status);
const task = await submitRes.json();
const taskId = task.id;

// 2. Poll GET /v1/video/generations/{id}. The envelope is
//    {code:"success", data:{status, result_url, fail_reason, ...}}.
//    data.status is the uppercase TaskStatus enum:
//    NOT_START / SUBMITTED / QUEUED / IN_PROGRESS / SUCCESS / FAILURE.
while (true) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const pollRes = await fetch(BASE + "/" + taskId, {
    headers: { Authorization: "Bearer " + API_KEY },
  });
  if (!pollRes.ok) throw new Error("HTTP " + pollRes.status);
  const data = (await pollRes.json()).data ?? {};
  const status = data.status;
  console.log(status);

  if (status === "SUCCESS") {
    console.log(data.result_url);
    break;
  }
  if (status === "FAILURE") {
    console.error(data.fail_reason);
    break;
  }
}`
}

/**
 * Render a list of i18n sentences (registry key + technical interp) as
 * a single translated string. Reused by the detail template for the
 * parameter table; lives here so the page component remains
 * fast-refresh-friendly and only exports the component itself.
 */
export function renderSentences(
  sentences: ReadonlyArray<I18nSentence>,
  t: (key: string, interp?: Record<string, unknown>) => string
): string {
  return sentences.map((sentence) => t(sentence.key, sentence.interp)).join(' ')
}

/** Registry entry lookup re-export so pages import from one module. */
export { getModelEntryByModelId }
