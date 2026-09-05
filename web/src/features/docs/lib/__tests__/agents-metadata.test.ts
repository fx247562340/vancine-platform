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
  DOCS_AGENT_CLINE_CANONICAL,
  DOCS_AGENT_OPENCODE_CANONICAL,
  DOCS_AGENT_ROO_CODE_CANONICAL,
  DOCS_AGENTS_CANONICAL,
  DOCS_CANONICAL,
  getDocsAgentNotFoundPageMetadata,
  getDocsAgentsPageMetadata,
  getDocsAgentToolPageMetadata,
} from '../agents-metadata.ts'

/**
 * Client-side mirror of the server-rendered SEO blocks in
 * router/web_metadata.go. The Go suite pins the served copy; this suite
 * pins the SPA copy. Both must stay byte-identical, so each side
 * asserts its exact strings independently.
 */

describe('Agent Integration Center canonicals', () => {
  it('uses fixed lowercase vancine.com paths with no trailing slash', () => {
    assert.equal(DOCS_AGENTS_CANONICAL, 'https://vancine.com/docs/agents')
    assert.equal(
      DOCS_AGENT_OPENCODE_CANONICAL,
      'https://vancine.com/docs/agents/opencode'
    )
    assert.equal(
      DOCS_AGENT_CLINE_CANONICAL,
      'https://vancine.com/docs/agents/cline'
    )
    assert.equal(
      DOCS_AGENT_ROO_CODE_CANONICAL,
      'https://vancine.com/docs/agents/roo-code'
    )
    assert.equal(DOCS_CANONICAL, 'https://vancine.com/docs')
  })
})

describe('Agent Integration Center metadata contract', () => {
  it('hub metadata matches the approved English copy byte-for-byte', () => {
    assert.deepEqual(getDocsAgentsPageMetadata(), {
      title: 'Coding Agent Integration Center | Vancine',
      description:
        'Connect Pi, OpenCode, Cline and Roo Code to the Vancine API. Install the Vancine Pi Provider from npm or follow tool-specific setup guides.',
      ogTitle: 'Coding Agent Integration Center',
      ogDescription:
        'Connect Pi, OpenCode, Cline and Roo Code to the Vancine API. Install the Vancine Pi Provider from npm or follow tool-specific setup guides.',
      twitterTitle: 'Coding Agent Integration Center | Vancine',
      twitterDescription:
        'Connect Pi, OpenCode, Cline and Roo Code to the Vancine API. Install the Vancine Pi Provider from npm or follow tool-specific setup guides.',
      ogUrl: 'https://vancine.com/docs/agents',
      canonical: 'https://vancine.com/docs/agents',
    })
  })

  it('opencode metadata matches the approved English copy byte-for-byte', () => {
    assert.deepEqual(getDocsAgentToolPageMetadata('opencode'), {
      title: 'OpenCode Setup Guide for the Vancine API | Vancine',
      description:
        'Add Vancine in OpenCode with /connect from the Models.dev Provider catalog — no manual provider JSON required. Paste your Vancine API Key, then choose a model with /models.',
      ogTitle: 'OpenCode Setup Guide for the Vancine API',
      ogDescription:
        'Add Vancine in OpenCode with /connect from the Models.dev Provider catalog — no manual provider JSON required. Paste your Vancine API Key, then choose a model with /models.',
      twitterTitle: 'OpenCode Setup Guide for the Vancine API | Vancine',
      twitterDescription:
        'Add Vancine in OpenCode with /connect from the Models.dev Provider catalog — no manual provider JSON required. Paste your Vancine API Key, then choose a model with /models.',
      ogUrl: 'https://vancine.com/docs/agents/opencode',
      canonical: 'https://vancine.com/docs/agents/opencode',
    })
  })

  it('cline metadata matches the approved English copy byte-for-byte', () => {
    assert.deepEqual(getDocsAgentToolPageMetadata('cline'), {
      title: 'Cline Setup Guide for the Vancine API | Vancine',
      description:
        'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      ogTitle: 'Cline Setup Guide for the Vancine API',
      ogDescription:
        'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      twitterTitle: 'Cline Setup Guide for the Vancine API | Vancine',
      twitterDescription:
        'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      ogUrl: 'https://vancine.com/docs/agents/cline',
      canonical: 'https://vancine.com/docs/agents/cline',
    })
  })

  it('roo-code metadata matches the approved English copy byte-for-byte', () => {
    assert.deepEqual(getDocsAgentToolPageMetadata('rooCode'), {
      title: 'Roo Code Setup Guide for the Vancine API | Vancine',
      description:
        'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      ogTitle: 'Roo Code Setup Guide for the Vancine API',
      ogDescription:
        'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      twitterTitle: 'Roo Code Setup Guide for the Vancine API | Vancine',
      twitterDescription:
        'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
      ogUrl: 'https://vancine.com/docs/agents/roo-code',
      canonical: 'https://vancine.com/docs/agents/roo-code',
    })
  })

  it('unknown-subpath takeover metadata reuses the /docs block byte-for-byte', () => {
    assert.deepEqual(getDocsAgentNotFoundPageMetadata(), {
      title: 'Vancine API Documentation | OpenAI-Compatible Chinese Models',
      description:
        'Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.',
      ogTitle: 'Vancine API Documentation | OpenAI-Compatible Chinese Models',
      ogDescription:
        'Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.',
      twitterTitle:
        'Vancine API Documentation | OpenAI-Compatible Chinese Models',
      twitterDescription:
        'Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.',
      ogUrl: 'https://vancine.com/docs',
      canonical: 'https://vancine.com/docs',
    })
  })
})
