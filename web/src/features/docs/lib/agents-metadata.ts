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

import type { DocsAgentToolKey } from './agents'

/**
 * Server/client metadata contract for the Agent Integration Center.
 *
 * These English values are the SPA mirror of the server-rendered blocks
 * in router/web_metadata.go (publicMarketingPages entries /docs/agents,
 * /docs/agents/opencode, /docs/agents/cline, /docs/agents/roo-code).
 * Both sides must stay byte-identical; the Go SEO tests and the
 * frontend agents-metadata tests each pin their own copy so a drift on
 * either side fails its own suite.
 *
 * The canonicals are fixed constants: UTM, query strings and request
 * headers must never influence them, so they are never derived from
 * window.location at call time.
 */

export const DOCS_AGENTS_CANONICAL = 'https://vancine.com/docs/agents'
export const DOCS_AGENT_OPENCODE_CANONICAL =
  'https://vancine.com/docs/agents/opencode'
export const DOCS_AGENT_CLINE_CANONICAL =
  'https://vancine.com/docs/agents/cline'
export const DOCS_AGENT_ROO_CODE_CANONICAL =
  'https://vancine.com/docs/agents/roo-code'
export const DOCS_CANONICAL = 'https://vancine.com/docs'

/**
 * Metadata takeover for unknown /docs/agents/<unknown> paths. The guide
 * pages own their tool metadata while mounted; after SPA-navigating away
 * from them to an unknown subpath, the head must not keep a stale tool
 * title/description/canonical. This block mirrors the server-rendered
 * /docs metadata in router/web_metadata.go and is applied by the splat
 * route's not-found view.
 */
export function getDocsAgentNotFoundPageMetadata(): PageMetadata {
  return {
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
    ogUrl: DOCS_CANONICAL,
    canonical: DOCS_CANONICAL,
  }
}

export function getDocsAgentsPageMetadata(): PageMetadata {
  return {
    title: 'Coding Agent Integration Center | Vancine',
    description:
      'Connect OpenCode, Cline, Roo Code and other coding agents to the Vancine API. Base URL, API key and model setup guides for each tool.',
    ogTitle: 'Coding Agent Integration Center',
    ogDescription:
      'Connect OpenCode, Cline, Roo Code and other coding agents to the Vancine API. Base URL, API key and model setup guides for each tool.',
    twitterTitle: 'Coding Agent Integration Center | Vancine',
    twitterDescription:
      'Connect OpenCode, Cline, Roo Code and other coding agents to the Vancine API. Base URL, API key and model setup guides for each tool.',
    ogUrl: DOCS_AGENTS_CANONICAL,
    canonical: DOCS_AGENTS_CANONICAL,
  }
}

export function getDocsAgentToolPageMetadata(
  tool: DocsAgentToolKey
): PageMetadata {
  switch (tool) {
    case 'opencode':
      return {
        title: 'OpenCode Setup Guide for the Vancine API | Vancine',
        description:
          'Connect OpenCode to Vancine through a project-level opencode.json: Base URL, API key and model setup, with a dedicated verification evidence section.',
        ogTitle: 'OpenCode Setup Guide for the Vancine API',
        ogDescription:
          'Connect OpenCode to Vancine through a project-level opencode.json: Base URL, API key and model setup, with a dedicated verification evidence section.',
        twitterTitle: 'OpenCode Setup Guide for the Vancine API | Vancine',
        twitterDescription:
          'Connect OpenCode to Vancine through a project-level opencode.json: Base URL, API key and model setup, with a dedicated verification evidence section.',
        ogUrl: DOCS_AGENT_OPENCODE_CANONICAL,
        canonical: DOCS_AGENT_OPENCODE_CANONICAL,
      }
    case 'cline':
      return {
        title: 'Cline Setup Guide for the Vancine API | Vancine',
        description:
          'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        ogTitle: 'Cline Setup Guide for the Vancine API',
        ogDescription:
          'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        twitterTitle: 'Cline Setup Guide for the Vancine API | Vancine',
        twitterDescription:
          'Configure the Cline extension for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        ogUrl: DOCS_AGENT_CLINE_CANONICAL,
        canonical: DOCS_AGENT_CLINE_CANONICAL,
      }
    case 'rooCode':
      return {
        title: 'Roo Code Setup Guide for the Vancine API | Vancine',
        description:
          'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        ogTitle: 'Roo Code Setup Guide for the Vancine API',
        ogDescription:
          'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        twitterTitle: 'Roo Code Setup Guide for the Vancine API | Vancine',
        twitterDescription:
          'Configure Roo Code for the Vancine API: OpenAI-compatible Base URL, API key, model ID and fixes for the most common setup errors.',
        ogUrl: DOCS_AGENT_ROO_CODE_CANONICAL,
        canonical: DOCS_AGENT_ROO_CODE_CANONICAL,
      }
  }
}
