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
 * First-batch coding agents with a dedicated Vancine setup guide.
 *
 * The `key` is the i18n identifier (agentGuides.<key>.*) and the `path`
 * is the canonical lowercase TanStack Router path. Every guide carries the
 * single public status "Configuration-ready"; there are no verification
 * tiers in the UI. Factual verification evidence (for OpenCode: the
 * v1.18.3 boundary) lives only in the dedicated "Verification evidence"
 * section of the OpenCode guide and must never be widened without new
 * evidence or promoted into a status badge.
 */
import type { DocsAgentGuidePath } from '../types'

export type DocsAgentToolKey = 'opencode' | 'cline' | 'rooCode'

export type DocsAgentToolPath = DocsAgentGuidePath

export interface DocsAgentToolProfile {
  key: DocsAgentToolKey
  /** Canonical lowercase path segment (also the route suffix). */
  segment: 'opencode' | 'cline' | 'roo-code'
  path: DocsAgentToolPath
  /** Language-neutral product name, never translated. */
  displayName: string
}

export const DOCS_AGENT_TOOLS: readonly DocsAgentToolProfile[] = [
  {
    key: 'opencode',
    segment: 'opencode',
    path: '/docs/agents/opencode',
    displayName: 'OpenCode',
  },
  {
    key: 'cline',
    segment: 'cline',
    path: '/docs/agents/cline',
    displayName: 'Cline',
  },
  {
    key: 'rooCode',
    segment: 'roo-code',
    path: '/docs/agents/roo-code',
    displayName: 'Roo Code',
  },
]

export function getDocsAgentToolProfile(
  key: DocsAgentToolKey
): DocsAgentToolProfile {
  const profile = DOCS_AGENT_TOOLS.find((tool) => tool.key === key)
  if (!profile) {
    // The tool registry and the route files are owned together, so an
    // unknown key is a programming error, not a reachable state.
    throw new Error(`Unknown docs agent tool: ${key}`)
  }
  return profile
}

/**
 * Configuration examples use ONLY obvious placeholders
 * (VANCINE_API_KEY / sk-your-api-key). Real credentials must never be
 * added here. The templates are language-neutral code and therefore
 * live in TypeScript, not in the i18n bundles.
 *
 * Contract per block:
 * - 'json' blocks are the exact copyable file content and MUST parse
 *   with JSON.parse as-is (no comments, no shell snippets appended).
 * - No block may duplicate model capabilities, context/output limits or
 *   prices; those facts live only on the Models and Pricing pages.
 * - Shell commands (e.g. exporting the API key) are returned as their
 *   own 'bash' block, never mixed into a JSON block.
 */
export interface DocsAgentConfigBlock {
  language: 'json' | 'bash'
  code: string
}

export function getDocsAgentConfigExample(
  tool: DocsAgentToolKey,
  baseUrl: string
): DocsAgentConfigBlock[] {
  switch (tool) {
    case 'opencode':
      return [
        {
          language: 'json',
          code: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vancine": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vancine",
      "options": {
        "baseURL": "${baseUrl}",
        "apiKey": "{env:VANCINE_API_KEY}"
      },
      "models": {
        "glm-5.1": {}
      }
    }
  }
}`,
        },
        {
          language: 'bash',
          code: `export VANCINE_API_KEY="sk-your-api-key"`,
        },
      ]
    case 'cline':
      return [
        {
          language: 'bash',
          code: `# VS Code → Cline extension → Settings

API Provider:  OpenAI Compatible
Base URL:      ${baseUrl}
API Key:       sk-your-api-key
Model ID:      glm-5.1

# or, in Cline's settings JSON:
# "apiProvider": "openai",
# "openAiBaseUrl": "${baseUrl}",
# "openAiApiKey": "$VANCINE_API_KEY",
# "openAiModelId": "glm-5.1"`,
        },
      ]
    case 'rooCode':
      return [
        {
          language: 'bash',
          code: `# VS Code → Roo Code extension → Settings

API Provider:  OpenAI Compatible
Base URL:      ${baseUrl}
API Key:       sk-your-api-key
Model ID:      glm-5.1

# or, in Roo Code's provider settings JSON:
# "apiProvider": "openai",
# "openAiBaseUrl": "${baseUrl}",
# "openAiApiKey": "$VANCINE_API_KEY",
# "openAiModelId": "glm-5.1"`,
        },
      ]
  }
}
