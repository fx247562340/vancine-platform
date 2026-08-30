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
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'

import { Badge } from '@/components/ui/badge'
import { usePageMetadata } from '@/hooks/use-page-metadata'

import { DocsCallout } from '../components/callout'
import { DocsCodeBlock } from '../components/code-block'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import { DOCS_AGENT_TOOLS } from '../lib/agents'
import { getDocsAgentsPageMetadata } from '../lib/agents-metadata'
import type { TocHeading } from '../types'

/**
 * Module-level constant: the canonical English metadata mirrors the
 * server-rendered /docs/agents block in router/web_metadata.go.
 */
const AGENTS_HUB_METADATA = getDocsAgentsPageMetadata()

interface AgentCliConfig {
  nameKey: 'codex' | 'openclaw' | 'hermes'
  title: string
  language: BundledLanguage
  codeTemplate: (baseUrl: string) => string
}

/**
 * Generic CLI configurations kept on the hub. OpenCode, Cline and Roo Code
 * have dedicated setup guides under /docs/agents/<tool>; their full
 * configuration is intentionally NOT duplicated here.
 */
const AGENT_CLI_CONFIGS: AgentCliConfig[] = [
  {
    nameKey: 'codex',
    title: 'Codex CLI',
    language: 'bash',
    codeTemplate: (baseUrl) => `# ~/.codex/config.toml
model = "glm-5.1"
model_provider = "vancine"

[model_providers.vancine]
name = "Vancine"
base_url = "${baseUrl}"
env_key = "VANCINE_API_KEY"
wire_api = "responses"

# shell
# export VANCINE_API_KEY="sk-your-api-key"`,
  },
  {
    nameKey: 'openclaw',
    title: 'OpenClaw',
    language: 'bash',
    codeTemplate: (baseUrl) => `Provider: OpenAI Compatible
Base URL: ${baseUrl}
API Key: sk-your-api-key
Model: glm-5.1

# If the tool supports environment variables:
VANCINE_BASE_URL=${baseUrl}
VANCINE_API_KEY=sk-your-api-key
VANCINE_MODEL=glm-5.1`,
  },
  {
    nameKey: 'hermes',
    title: 'Hermes Agent',
    language: 'yaml',
    codeTemplate: (baseUrl) => `# ~/.hermes/config.yaml
openai_compatible:
  base_url: "${baseUrl}"
  api_key: "sk-your-api-key"
  model: "glm-5.1"

# or environment variables
export OPENAI_COMPATIBLE_BASE_URL="${baseUrl}"
export OPENAI_COMPATIBLE_API_KEY="sk-your-api-key"`,
  },
]

const AGENT_GUI_TOOLS = ['cursor', 'cherryStudio'] as const

const GUI_STEPS = [1, 2, 3, 4, 5] as const

export default function Agents(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  // Public marketing route: the metadata is owned by this page. The
  // `publicMarketingPage: true` flag prevents the system branding
  // bootstrap in main.tsx from overwriting the route-level title.
  usePageMetadata(AGENTS_HUB_METADATA, { publicMarketingPage: true })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'agents-title', title: t('agents.title'), level: 2 },
        { id: 'agents-hub', title: t('agents.hub.title'), level: 3 },
        { id: 'agents-cli', title: t('agents.cliTitle'), level: 3 },
        { id: 'agents-gui', title: t('agents.guiTitle'), level: 3 },
      ],
      [t]
    )
  )

  const agentConfigs = useMemo(
    () =>
      AGENT_CLI_CONFIGS.map((agent) => ({
        ...agent,
        code: agent.codeTemplate(baseUrl),
        note: t(`agents.cli.${agent.nameKey}`),
      })),
    [baseUrl, t]
  )

  return (
    <div>
      <DocsH2 id='agents-title'>{t('agents.title')}</DocsH2>
      <DocsP>{t('agents.desc')}</DocsP>
      <DocsP>
        <Link
          to='/coding-agent-benchmark'
          className='text-primary font-medium underline underline-offset-4'
        >
          {t('agents.benchmarkLink')}
        </Link>
      </DocsP>

      <DocsCallout type='tip'>
        {t('agents.universalTip', { baseUrl })}
      </DocsCallout>

      <DocsH3 id='agents-hub'>{t('agents.hub.title')}</DocsH3>
      <DocsP>{t('agents.hub.desc')}</DocsP>
      <div className='mb-6 grid gap-4 md:grid-cols-3'>
        {DOCS_AGENT_TOOLS.map((tool) => {
          return (
            <div
              key={tool.key}
              className='border-border bg-card flex flex-col rounded-xl border p-5 transition-shadow hover:shadow-md'
            >
              <div className='mb-2 flex flex-wrap items-center gap-2'>
                <h4 className='text-foreground text-lg font-semibold'>
                  {tool.displayName}
                </h4>
                {/* One unified public status: same copy and same visual
                    variant on every card. */}
                <Badge variant='outline'>
                  {t('agents.hub.status.configurationReady')}
                </Badge>
              </div>
              <p className='text-muted-foreground mb-2 text-xs font-medium'>
                {t(`agents.hub.cards.${tool.key}.protocol`)}
              </p>
              <p className='text-muted-foreground mb-4 flex-1 text-sm leading-relaxed'>
                {t('agents.hub.cardBoundary')}
              </p>
              <Link
                to={tool.path}
                className='text-primary text-sm font-medium underline underline-offset-4'
              >
                {t('agents.hub.viewGuide')}
              </Link>
            </div>
          )
        })}
      </div>

      <DocsH3 id='agents-cli'>{t('agents.cliTitle')}</DocsH3>
      {agentConfigs.map((agent) => (
        <div
          key={agent.nameKey}
          className='border-border bg-card mb-6 rounded-xl border p-5 transition-shadow hover:shadow-md'
        >
          <div className='mb-2 flex items-center gap-2.5'>
            <h4 className='text-foreground text-lg font-semibold'>
              {agent.title}
            </h4>
            <Badge variant='secondary'>CLI</Badge>
          </div>
          <p className='text-muted-foreground mb-3 text-sm leading-relaxed'>
            {agent.note}
          </p>
          <div className='-mb-4'>
            <DocsCodeBlock
              code={agent.code}
              title={t('agents.configExample')}
              language={agent.language}
            />
          </div>
        </div>
      ))}

      <DocsH3 id='agents-gui'>{t('agents.guiTitle')}</DocsH3>
      {AGENT_GUI_TOOLS.map((toolKey) => (
        <div
          key={toolKey}
          className='border-border bg-card mb-6 rounded-xl border p-5 transition-shadow hover:shadow-md'
        >
          <h4 className='text-foreground mb-3 text-lg font-semibold'>
            {t(`agents.gui.${toolKey}.title`)}
          </h4>
          <ol className='text-muted-foreground marker:text-primary list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-semibold'>
            {GUI_STEPS.map((step) => (
              <li key={step}>
                {t(`agents.gui.${toolKey}.step${step}`, { baseUrl })}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
