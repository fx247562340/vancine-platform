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
import assert from 'node:assert/strict'

import { describe, it } from 'vitest'

import {
  DOCS_AGENT_TOOLS,
  getDocsAgentConfigExample,
  getHermesChatCommand,
  HERMES_API_KEY_COMMAND,
  HERMES_MODEL_COMMAND,
  HERMES_PROVIDER_INSTALL_COMMAND,
  OPENCLAW_INSTALL_CLAWHUB_COMMAND,
  OPENCLAW_INSTALL_NPM_COMMAND,
  PI_LOGIN_COMMAND,
  PI_MODEL_COMMAND,
  PI_PROVIDER_INSTALL_COMMAND,
  VANCINE_HERMES_PROVIDER_GITHUB_URL,
  VANCINE_MODELS_DEV_PROVIDER_URL,
  VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_NPM_URL,
  VANCINE_PI_PROVIDER_CATALOG_URL,
  VANCINE_PI_PROVIDER_GITHUB_URL,
  VANCINE_PI_PROVIDER_NPM_URL,
} from '../agents.ts'

// A real Vancine/OpenAI-style key: sk- followed by 20+ alphanumerics.
// Config examples must only ever carry obvious placeholders.
const REAL_KEY_PATTERN = /sk-[A-Za-z0-9]{20,}/

describe('Docs agent tool profiles', () => {
  it('declares exactly the six agent tools with canonical lowercase paths', () => {
    assert.deepEqual(
      DOCS_AGENT_TOOLS.map((tool) => tool.key),
      ['opencode', 'cline', 'rooCode', 'pi', 'openclaw', 'hermes']
    )
    assert.deepEqual(
      DOCS_AGENT_TOOLS.map((tool) => tool.path),
      [
        '/docs/agents/opencode',
        '/docs/agents/cline',
        '/docs/agents/roo-code',
        '/docs/agents/pi',
        '/docs/agents/openclaw',
        '/docs/agents/hermes',
      ]
    )
    for (const tool of DOCS_AGENT_TOOLS) {
      assert.equal(tool.path, `/docs/agents/${tool.segment}`)
      // Lowercase, no aliases: the segment must never carry uppercase,
      // versions or abbreviations.
      assert.equal(tool.segment, tool.segment.toLowerCase())
    }
    // Hermes is its own guide, at the same level as the other five.
    const hermes = DOCS_AGENT_TOOLS.find((tool) => tool.key === 'hermes')
    assert.ok(hermes, 'Hermes must be a registered agent guide')
    assert.equal(hermes.displayName, 'Hermes')
  })

  it('carries no per-tool verification status in the public registry', () => {
    for (const tool of DOCS_AGENT_TOOLS) {
      assert.equal(
        'status' in tool,
        false,
        `${tool.key} must not expose a status tier`
      )
    }
  })

  it('pins the Models.dev provider catalog URL', () => {
    assert.equal(
      VANCINE_MODELS_DEV_PROVIDER_URL,
      'https://models.dev/providers/vancine/'
    )
  })

  it('pins the Vancine Pi Provider npm and GitHub sources without a version pin', () => {
    assert.equal(
      VANCINE_PI_PROVIDER_NPM_URL,
      'https://www.npmjs.com/package/pi-provider-vancine'
    )
    assert.equal(
      VANCINE_PI_PROVIDER_GITHUB_URL,
      'https://github.com/VancineAI/vancine-pi-provider'
    )
    // Pi's package catalog is a discovery listing that links the npm
    // package; it is not a distribution source, so the URL carries no
    // version either.
    assert.equal(
      VANCINE_PI_PROVIDER_CATALOG_URL,
      'https://pi.dev/packages/pi-provider-vancine'
    )
    assert.equal(
      PI_PROVIDER_INSTALL_COMMAND,
      'pi install npm:pi-provider-vancine'
    )
    assert.equal(PI_LOGIN_COMMAND, '/login')
    assert.equal(PI_MODEL_COMMAND, '/model')
    assert.equal(PI_PROVIDER_INSTALL_COMMAND.includes('@0.'), false)
    assert.equal(PI_PROVIDER_INSTALL_COMMAND.includes('0.1.1'), false)
    assert.equal(PI_PROVIDER_INSTALL_COMMAND.includes('0.1.3'), false)
    for (const url of [
      VANCINE_PI_PROVIDER_CATALOG_URL,
      VANCINE_PI_PROVIDER_NPM_URL,
      VANCINE_PI_PROVIDER_GITHUB_URL,
    ]) {
      assert.equal(/0\.1\.\d/.test(url), false, `${url} must not pin a version`)
    }
  })

  it('pins the Vancine OpenClaw provider npm, ClawHub and GitHub sources and both install commands', () => {
    assert.equal(
      VANCINE_OPENCLAW_PROVIDER_NPM_URL,
      'https://www.npmjs.com/package/@vancine/openclaw-provider'
    )
    assert.equal(
      VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
      'https://github.com/VancineAI/vancine-openclaw-provider'
    )
    assert.equal(
      VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
      'https://clawhub.ai/vancine/plugins/openclaw-provider'
    )
    assert.equal(
      OPENCLAW_INSTALL_NPM_COMMAND,
      'openclaw plugins install @vancine/openclaw-provider'
    )
    assert.equal(
      OPENCLAW_INSTALL_CLAWHUB_COMMAND,
      'openclaw plugins install clawhub:@vancine/openclaw-provider'
    )
    // No version pin may enter either published install command.
    for (const command of [
      OPENCLAW_INSTALL_NPM_COMMAND,
      OPENCLAW_INSTALL_CLAWHUB_COMMAND,
    ]) {
      assert.equal(command.includes('@0.1.0'), false)
      assert.equal(command.includes('2026.9.4'), false)
    }
  })

  it('pins the Vancine Hermes provider GitHub source as its only distribution source', () => {
    assert.equal(
      VANCINE_HERMES_PROVIDER_GITHUB_URL,
      'https://github.com/VancineAI/vancine-hermes-provider'
    )
    assert.equal(
      HERMES_PROVIDER_INSTALL_COMMAND,
      'hermes plugins install VancineAI/vancine-hermes-provider'
    )
    assert.equal(
      HERMES_API_KEY_COMMAND,
      'export VANCINE_API_KEY="sk-your-api-key"'
    )
    assert.equal(HERMES_MODEL_COMMAND, 'hermes model')
    // No version pin may enter the published install command.
    for (const banned of ['@0.', '0.1.0', 'v0.1']) {
      assert.equal(
        HERMES_PROVIDER_INSTALL_COMMAND.includes(banned),
        false,
        `the Hermes install command must not pin a version (${banned})`
      )
    }
  })

  it('builds the Hermes call form from the caller-supplied live-catalog model id', () => {
    assert.equal(
      getHermesChatCommand('deepseek-v4.1-flash'),
      'hermes chat --provider vancine -m deepseek-v4.1-flash'
    )
    assert.equal(
      getHermesChatCommand('glm-5.3-flash'),
      'hermes chat --provider vancine -m glm-5.3-flash'
    )
    assert.ok(getHermesChatCommand('x').includes('--provider vancine'))
  })
})

describe('Docs agent config examples', () => {
  const baseUrl = 'https://vancine.com/v1'

  it('embed the recommended Base URL and only placeholder credentials for manual-config tools', () => {
    for (const tool of ['opencode', 'cline', 'rooCode'] as const) {
      const blocks = getDocsAgentConfigExample(
        tool,
        baseUrl,
        'deepseek-v4.1-flash'
      )
      const code = blocks.map((block) => block.code).join('\n')
      assert.ok(
        code.includes(baseUrl),
        `${tool} example must embed the Base URL`
      )
      assert.ok(
        code.includes('sk-your-api-key') || code.includes('VANCINE_API_KEY'),
        `${tool} example must use obvious placeholders`
      )
      assert.doesNotMatch(
        code,
        REAL_KEY_PATTERN,
        `${tool} example must never contain a real-looking key`
      )
    }
  })

  it('provider-plugin guides carry no manual Base URL/config blocks', () => {
    for (const tool of ['pi', 'openclaw', 'hermes'] as const) {
      const blocks = getDocsAgentConfigExample(
        tool,
        baseUrl,
        'deepseek-v4.1-flash'
      )
      assert.deepEqual(
        blocks,
        [],
        `${tool} connects through its published provider plugin, not a manual config block`
      )
    }
  })

  it('OpenCode json blocks are copy-paste parseable by JSON.parse', () => {
    const blocks = getDocsAgentConfigExample(
      'opencode',
      baseUrl,
      'deepseek-v4.1-flash'
    )
    const jsonBlocks = blocks.filter((block) => block.language === 'json')
    assert.ok(
      jsonBlocks.length >= 1,
      'OpenCode must provide at least one json block'
    )
    for (const block of jsonBlocks) {
      // The copied block is the exact file content: parsing it directly
      // must succeed, so no comments or shell snippets may be appended.
      const parsed = JSON.parse(block.code) as Record<string, unknown>
      assert.ok(
        typeof parsed === 'object' && parsed !== null,
        'parsed opencode.json must be an object'
      )
      assert.ok(
        !block.code.includes('#'),
        'json block must carry no shell/comment leftovers'
      )
    }
    // Shell setup (API key export) lives in its own bash block.
    assert.ok(
      blocks.some(
        (block) =>
          block.language === 'bash' &&
          block.code.includes('export VANCINE_API_KEY')
      ),
      'the export VANCINE_API_KEY line must live in a separate bash block'
    )
  })

  it('OpenCode config carries no context/output limits or model claims', () => {
    const blocks = getDocsAgentConfigExample(
      'opencode',
      baseUrl,
      'deepseek-v4.1-flash'
    )
    const opencodeJson = blocks.find((block) => block.language === 'json')?.code
    assert.ok(opencodeJson, 'opencode json block must exist')
    const parsed = JSON.parse(opencodeJson) as {
      provider?: {
        vancine?: { models?: Record<string, unknown> }
      }
    }
    const models = parsed.provider?.vancine?.models ?? {}
    assert.ok(Object.keys(models).length > 0, 'models map must not be empty')
    assert.ok(
      !opencodeJson.includes('glm-5.1'),
      'OpenCode example must not use glm-5.1'
    )
    assert.ok(
      Object.hasOwn(models, 'deepseek-v4.1-flash'),
      'OpenCode example must reflect the model id passed in by the caller (the live catalog)'
    )
    for (const [modelId, value] of Object.entries(models)) {
      assert.deepEqual(
        value,
        {},
        `model ${modelId} must not duplicate capabilities, limits or prices from the model pages`
      )
    }
    assert.ok(
      !opencodeJson.includes('"context"'),
      'no context limit may be copied into the guide'
    )
    assert.ok(
      !opencodeJson.includes('"output"'),
      'no output limit may be copied into the guide'
    )
    assert.ok(
      !opencodeJson.includes('"limit"'),
      'no limit object may be copied into the guide'
    )
  })
})
