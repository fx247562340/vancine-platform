/*
Copyright (C) 2025 QuantumNous

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

import i18n from '../../i18n/i18n';

export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-k3-api';

const UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);

export function getKimiK3CtaDestination(isAuthenticated, search = '') {
  const destination = isAuthenticated
    ? '/console/playground'
    : '/register?source=kimi-k3-api';
  const source = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const allowed = new URLSearchParams();

  for (const [key, value] of source) {
    if (UTM_KEYS.has(key)) allowed.append(key, value);
  }

  const query = allowed.toString();
  if (!query) return destination;
  return `${destination}${destination.includes('?') ? '&' : '?'}${query}`;
}

// SEO metadata is now sourced from the `kimi` namespace at runtime. The
// caller is expected to invoke this inside a useEffect (i18n has been
// initialized by then) and refresh on language change. Other landing
// constants (copyTextToClipboard, KIMI_K3_CODE_EXAMPLES, KIMI_K3_OPENCODE_CONFIG,
// KIMI_K3_PORTFOLIO, KIMI_K3_EVIDENCE_*, KIMI_K3_API_COMPATIBILITY,
// KIMI_K3_OPENCODE_VERIFICATION, KIMI_K3_MEASURED_USAGE) are still pure data.
export function getKimiK3Metadata() {
  const tt = (key) => i18n.t(key, { ns: 'kimi' });
  return {
    title: tt('meta.title'),
    description: tt('meta.description'),
    ogTitle: tt('meta.ogTitle'),
    ogDescription: tt('meta.ogDescription'),
    canonical: KIMI_K3_CANONICAL,
  };
}

export async function copyTextToClipboard(text, clipboard) {
  if (!clipboard || typeof clipboard.writeText !== 'function') return 'error';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch (_error) {
    return 'error';
  }
}

export const KIMI_K3_CODE_EXAMPLES = Object.freeze([
  {
    id: 'curl',
    label: 'cURL',
    code: `curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k3",
    "messages": [{"role": "user", "content": "Review this pull request."}]
  }'`,
  },
  {
    id: 'python',
    label: 'Python',
    code: `import os
import requests

response = requests.post(
    "https://vancine.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['VANCINE_API_KEY']}"},
    json={"model": "kimi-k3", "messages": [{"role": "user", "content": "Review this pull request."}]},
)
print(response.json())`,
  },
  {
    id: 'node',
    label: 'Node.js',
    code: `const response = await fetch('https://vancine.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.VANCINE_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'kimi-k3',
    messages: [{ role: 'user', content: 'Review this pull request.' }],
  }),
})
console.log(await response.json())`,
  },
]);

export const KIMI_K3_OPENCODE_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vancine": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vancine",
      "options": {
        "baseURL": "https://vancine.com/v1",
        "apiKey": "{env:VANCINE_API_KEY}"
      },
      "models": {
        "kimi-k3": { "name": "Kimi K3" }
      }
    }
  }
}`;

export const KIMI_K3_PORTFOLIO = Object.freeze([
  'Kimi K3',
  'GLM-5.2',
  'DeepSeek V4',
  'Qwen 3.7',
  'MiniMax',
]);

/**
 * Evidence section status. Live verification against the real Kimi K3 model
 * has been completed: an OpenAI-compatible API probe (HTTP 200 with
 * temperature:0) and one completed OpenCode v1.18.3 coding-agent run. The
 * page renders three evidence sections — API compatibility, OpenCode agent,
 * and measured usage — using only the values recorded below.
 *
 * Only OpenCode has a live coding-agent verification; Cline and Roo Code
 * configs are available but NOT independently live verified, and the copy
 * must never expand the claim to "all coding agents verified". Do NOT use an
 * agent event cost of 0 as a price, and do NOT show upstream/Kimi costs.
 *
 * KIMI_K3_EVIDENCE_STARTER_REPO is the public starter repository. The internal
 * verification kit is deliberately not linked from the public page.
 */
export const KIMI_K3_EVIDENCE_STATUS = 'verified';

export const KIMI_K3_EVIDENCE_STARTER_REPO =
  'https://github.com/VancineAI/kimi-k3-api-starter';

export const KIMI_K3_EVIDENCE_URL =
  'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json?utm_source=vancine&utm_medium=developer_resource&utm_campaign=kimi_k3_launch&utm_content=opencode_verified_evidence';

/**
 * Live API compatibility probe against the real kimi-k3 model. The 16-token
 * budget was mostly consumed by reasoning, so visible content is recorded as
 * inconclusive — this must NOT be described as a content-generation failure.
 */
export const KIMI_K3_API_COMPATIBILITY = Object.freeze({
  status: 'verified',
  temperature: 0,
  httpStatus: 200,
  requestedModel: 'kimi-k3',
  responseModel: 'kimi-k3',
  maxTokens: 16,
  usage: Object.freeze({
    prompt: 92,
    completion: 16,
    total: 108,
    reasoning: 13,
  }),
  finishReason: 'length',
  visibleContent: 'inconclusive',
});

/**
 * Live OpenCode coding-agent verification (real kimi-k3, run completed).
 * Public evidence artifact: results/opencode-agent.verified.json in the
 * starter repository (KIMI_K3_EVIDENCE_URL).
 */
export const KIMI_K3_OPENCODE_VERIFICATION = Object.freeze({
  status: 'verified',
  client: 'OpenCode',
  clientVersion: '1.18.3',
  model: 'kimi-k3',
  runStatus: 'completed',
  durationMs: 84345,
  rounds: 1,
  modelSteps: 6,
  toolCalls: Object.freeze({
    read: Object.freeze({ completed: 5, failed: 0 }),
    edit: Object.freeze({ completed: 1, failed: 0 }),
    bash: Object.freeze({ completed: 1, failed: 0 }),
  }),
  testsPassed: true,
  sourceModified: 'src/leap-year.js',
  testFileModified: false,
  unexpectedFiles: 0,
  exitStatus: 0,
  runId: 'e52f78b7-0bfa-430f-b8b0-1ad813ea0695',
});

/**
 * Operator-verified console record for the single controlled OpenCode run
 * above. Amount is Vancine-measured usage only — never an upstream cost.
 */
export const KIMI_K3_MEASURED_USAGE = Object.freeze({
  agentTelemetryTokens: 28707,
  amount: 0.19,
  currency: 'USD',
});

export const KIMI_K3_VERIFICATION_SCOPE = Object.freeze({
  liveVerifiedAgents: Object.freeze(['OpenCode']),
  configOnlyAgents: Object.freeze(['Cline', 'Roo Code']),
});
