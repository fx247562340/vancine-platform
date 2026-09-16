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
 * Every coding agent with a dedicated Vancine setup guide.
 *
 * The `key` is the i18n identifier (agentGuides.<key>.*) and the `path`
 * is the canonical lowercase TanStack Router path. Every guide carries the
 * single public status "Configuration-ready"; there are no verification
 * tiers in the UI. Factual verification evidence (for OpenCode: the
 * v1.18.3 boundary) lives only in the dedicated "Verification evidence"
 * section of the OpenCode guide and must never be widened without new
 * evidence or promoted into a status badge.
 *
 * Six guides form the Agent guide registry: OpenCode, Cline, Roo Code
 * (manual OpenAI-compatible configuration) plus Pi, OpenClaw and Hermes
 * (provider plugins with their own install commands).
 */
/**
 * Module doc: Pi, OpenClaw and Hermes carry provider-plugin install flows
 * (/docs/agents/pi, /docs/agents/openclaw, /docs/agents/hermes). The package
 * and repository links below are the only provenance facts shown in the UI:
 * for Pi, its public package-catalog listing page plus the npm and GitHub
 * sources; for OpenClaw, the npm, ClawHub and GitHub sources; for Hermes, the
 * public GitHub repository only, because the plugin is distributed solely from
 * that repository (no npm package, no PyPI package, no Hermes plugin catalog).
 * Where a package is distributed through a registry, install commands always
 * name the real distribution source and never a catalog.
 */
import type { DocsAgentGuidePath } from '../types'

export type DocsAgentToolKey =
  | 'opencode'
  | 'cline'
  | 'rooCode'
  | 'pi'
  | 'openclaw'
  | 'hermes'

export type DocsAgentToolPath = DocsAgentGuidePath

/** Live Models.dev provider catalog page for Vancine. */
export const VANCINE_MODELS_DEV_PROVIDER_URL =
  'https://models.dev/providers/vancine/'

/**
 * Pi's public package-catalog entry for this extension. Discovery and display
 * only: Pi's docs state packages are shared through npm or git, so the package
 * is installed from npm, never "from" this page.
 */
export const VANCINE_PI_PROVIDER_CATALOG_URL =
  'https://pi.dev/packages/pi-provider-vancine'

/** Published Vancine Pi Provider on npm. Always install latest; never pin a version in docs. */
export const VANCINE_PI_PROVIDER_NPM_URL =
  'https://www.npmjs.com/package/pi-provider-vancine'

/** Public source for the Vancine-maintained Pi community extension. */
export const VANCINE_PI_PROVIDER_GITHUB_URL =
  'https://github.com/VancineAI/vancine-pi-provider'

export const PI_PROVIDER_INSTALL_COMMAND = 'pi install npm:pi-provider-vancine'
export const PI_LOGIN_COMMAND = '/login'
export const PI_MODEL_COMMAND = '/model'

/** Published Vancine OpenClaw provider plugin on npm. Always install latest; never pin a version in docs. */
export const VANCINE_OPENCLAW_PROVIDER_NPM_URL =
  'https://www.npmjs.com/package/@vancine/openclaw-provider'

/** Public ClawHub package page for the `clawhub:` install source of this plugin. */
export const VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL =
  'https://clawhub.ai/vancine/plugins/openclaw-provider'

/** Public source for the Vancine-maintained OpenClaw community provider plugin. */
export const VANCINE_OPENCLAW_PROVIDER_GITHUB_URL =
  'https://github.com/VancineAI/vancine-openclaw-provider'

export const OPENCLAW_INSTALL_NPM_COMMAND =
  'openclaw plugins install @vancine/openclaw-provider'
export const OPENCLAW_INSTALL_CLAWHUB_COMMAND =
  'openclaw plugins install clawhub:@vancine/openclaw-provider'
export const OPENCLAW_ONBOARD_COMMAND = 'openclaw onboard'
export const OPENCLAW_MODELS_COMMAND =
  'openclaw models list --provider vancine --refresh --json'

/**
 * Public source for the Vancine-authored Hermes model-provider plugin. It is
 * the ONLY distribution and provenance source for this plugin: there is no npm
 * package, no PyPI package, and no listing in a Hermes plugin catalog, so the
 * guide must never render such a link.
 */
export const VANCINE_HERMES_PROVIDER_GITHUB_URL =
  'https://github.com/VancineAI/vancine-hermes-provider'

export const HERMES_PROVIDER_INSTALL_COMMAND =
  'hermes plugins install VancineAI/vancine-hermes-provider'
export const HERMES_API_KEY_COMMAND = 'export VANCINE_API_KEY="sk-your-api-key"'
export const HERMES_MODEL_COMMAND = 'hermes model'

/**
 * The Hermes invocation form. The model id is always the caller's live-catalog
 * pick (both the hub and the guide pass `pickDocsTextModel`), never a hardcoded
 * id, because Vancine retires model ids upstream.
 */
export function getHermesChatCommand(modelId: string): string {
  return `hermes chat --provider vancine -m ${modelId}`
}

export interface DocsAgentToolProfile {
  key: DocsAgentToolKey
  /** Canonical lowercase path segment (also the route suffix). */
  segment: 'opencode' | 'cline' | 'roo-code' | 'pi' | 'openclaw' | 'hermes'
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
  {
    key: 'pi',
    segment: 'pi',
    path: '/docs/agents/pi',
    displayName: 'Pi',
  },
  {
    key: 'openclaw',
    segment: 'openclaw',
    path: '/docs/agents/openclaw',
    displayName: 'OpenClaw',
  },
  {
    key: 'hermes',
    segment: 'hermes',
    path: '/docs/agents/hermes',
    displayName: 'Hermes',
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
 * The recommended model id shown in the configuration example is
 * passed in by the caller (the agents page), which reads the live
 * catalog and only falls back to a verified default when the catalog
 * is unavailable. The placeholder is rendered as
 * `<RECOMMENDED_MODEL_ID>` so a reader never copies a model that the
 * upstream admin has retired.
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
  baseUrl: string,
  recommendedModelId: string
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
        "${recommendedModelId}": {}
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
Model ID:      ${recommendedModelId}

# or, in Cline's settings JSON:
# "apiProvider": "openai",
# "openAiBaseUrl": "${baseUrl}",
# "openAiApiKey": "$VANCINE_API_KEY",
# "openAiModelId": "${recommendedModelId}"`,
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
Model ID:      ${recommendedModelId}

# or, in Roo Code's provider settings JSON:
# "apiProvider": "openai",
# "openAiBaseUrl": "${baseUrl}",
# "openAiApiKey": "$VANCINE_API_KEY",
# "openAiModelId": "${recommendedModelId}"`,
        },
      ]
    case 'pi':
    case 'openclaw':
    case 'hermes':
      // Provider-plugin guides never show a manual Base URL/config block:
      // their install + credential flow lives in the numbered steps instead.
      return []
  }
}
