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
import { useLiveModelCatalog } from '@/features/live-model-catalog/hooks/use-live-model-catalog'
import { usePageMetadata } from '@/hooks/use-page-metadata'

import { DocsCallout } from '../components/callout'
import { DocsCodeBlock } from '../components/code-block'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import {
  DOCS_AGENT_TOOLS,
  VANCINE_MODELS_DEV_PROVIDER_URL,
} from '../lib/agents'
import { getDocsAgentsPageMetadata } from '../lib/agents-metadata'
import { pickDocsTextModel } from '../lib/text-model-choice'
import type { TocHeading } from '../types'

/**
 * Module-level constant: the canonical English metadata mirrors the
 * server-rendered /docs/agents block in router/web_metadata.go.
 */
const AGENTS_HUB_METADATA = getDocsAgentsPageMetadata()

interface AgentCliConfig {
  nameKey: 'codex'
  title: string
  language: BundledLanguage
  codeTemplate: (baseUrl: string, modelId: string) => string
}

/**
 * Generic CLI configurations kept on the hub. OpenCode, Cline, Roo Code, Pi,
 * OpenClaw and Hermes all have dedicated setup guides under
 * /docs/agents/<tool>; their full configuration is intentionally NOT
 * duplicated here. Hermes connects through its provider plugin (never a
 * manual Base URL / config.yaml block) and only links to its guide below.
 */
const AGENT_CLI_CONFIGS: AgentCliConfig[] = [
  {
    nameKey: 'codex',
    title: 'Codex CLI',
    language: 'bash',
    codeTemplate: (baseUrl, modelId) => `# ~/.codex/config.toml
model = "${modelId}"
model_provider = "vancine"

[model_providers.vancine]
name = "Vancine"
base_url = "${baseUrl}"
env_key = "VANCINE_API_KEY"
wire_api = "responses"

# shell
# export VANCINE_API_KEY="sk-your-api-key"`,
  },
]

/**
 * CLI tools whose connection runs entirely through a provider plugin: the hub
 * keeps only a pointer to the dedicated guide, never a manual configuration
 * block. Both entries share one rendering branch.
 */
const AGENT_PLUGIN_POINTERS = [
  {
    tool: 'hermes',
    to: '/docs/agents/hermes',
    noteKey: 'agents.cli.hermes',
    linkKey: 'agents.cli.hermesGuideLink',
  },
  {
    tool: 'openclaw',
    to: '/docs/agents/openclaw',
    noteKey: 'agents.cli.openclaw',
    linkKey: 'agents.cli.openclawGuideLink',
  },
] as const

const AGENT_GUI_TOOLS = ['cursor', 'cherryStudio'] as const

const GUI_STEPS = [1, 2, 3, 4, 5] as const

export default function Agents(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })
  const { catalog } = useLiveModelCatalog()

  const recommendedModelId = pickDocsTextModel(catalog).modelId

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
        code: agent.codeTemplate(baseUrl, recommendedModelId),
        note: t(`agents.cli.${agent.nameKey}`),
      })),
    [baseUrl, recommendedModelId, t]
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
              {tool.key === 'opencode' ? (
                <a
                  href={VANCINE_MODELS_DEV_PROVIDER_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary mb-2 text-xs font-medium underline underline-offset-4'
                >
                  {t('agents.hub.cards.opencode.catalogProof')}
                </a>
              ) : null}
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

      {/* Hermes and OpenClaw have no manual Base URL configuration: both
          connect through a provider plugin, so the hub only links the guide. */}
      {AGENT_PLUGIN_POINTERS.map((pointer) => (
        <p
          key={pointer.tool}
          className='text-muted-foreground mb-6 text-sm leading-relaxed'
        >
          {t(pointer.noteKey)}{' '}
          <Link
            to={pointer.to}
            className='text-primary font-medium underline underline-offset-4'
          >
            {t(pointer.linkKey)}
          </Link>
        </p>
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
