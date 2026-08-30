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
import { describe, it } from 'node:test'

import { DOCS_AGENT_TOOLS, getDocsAgentConfigExample } from '../agents.ts'

// A real Vancine/OpenAI-style key: sk- followed by 20+ alphanumerics.
// Config examples must only ever carry obvious placeholders.
const REAL_KEY_PATTERN = /sk-[A-Za-z0-9]{20,}/

describe('Docs agent tool profiles', () => {
  it('declares exactly the three first-batch tools with canonical paths', () => {
    assert.deepEqual(
      DOCS_AGENT_TOOLS.map((tool) => tool.path),
      ['/docs/agents/opencode', '/docs/agents/cline', '/docs/agents/roo-code']
    )
    for (const tool of DOCS_AGENT_TOOLS) {
      assert.equal(tool.path, `/docs/agents/${tool.segment}`)
    }
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
})

describe('Docs agent config examples', () => {
  const baseUrl = 'https://vancine.com/v1'

  it('embed the recommended Base URL and only placeholder credentials', () => {
    for (const tool of DOCS_AGENT_TOOLS) {
      const blocks = getDocsAgentConfigExample(tool.key, baseUrl)
      const code = blocks.map((block) => block.code).join('\n')
      assert.ok(
        code.includes(baseUrl),
        `${tool.key} example must embed the Base URL`
      )
      assert.ok(
        code.includes('sk-your-api-key') || code.includes('VANCINE_API_KEY'),
        `${tool.key} example must use obvious placeholders`
      )
      assert.doesNotMatch(
        code,
        REAL_KEY_PATTERN,
        `${tool.key} example must never contain a real-looking key`
      )
    }
  })

  it('OpenCode json blocks are copy-paste parseable by JSON.parse', () => {
    const blocks = getDocsAgentConfigExample('opencode', baseUrl)
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
    const blocks = getDocsAgentConfigExample('opencode', baseUrl)
    const opencodeJson = blocks.find((block) => block.language === 'json')?.code
    assert.ok(opencodeJson, 'opencode json block must exist')
    const parsed = JSON.parse(opencodeJson) as {
      provider?: {
        vancine?: { models?: Record<string, unknown> }
      }
    }
    const models = parsed.provider?.vancine?.models ?? {}
    assert.ok(Object.keys(models).length > 0, 'models map must not be empty')
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
