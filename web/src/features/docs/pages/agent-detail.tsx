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

import { Badge } from '@/components/ui/badge'
import { usePageMetadata, type PageMetadata } from '@/hooks/use-page-metadata'
import { useAuthStore } from '@/stores/auth-store'

import { DocsCallout } from '../components/callout'
import { DocsCodeBlock } from '../components/code-block'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import { DOCS_NS } from '../i18n/loader'
import {
  getDocsAgentConfigExample,
  getDocsAgentToolProfile,
  VANCINE_MODELS_DEV_PROVIDER_URL,
  type DocsAgentToolKey,
} from '../lib/agents'
import { getDocsAgentToolPageMetadata } from '../lib/agents-metadata'
import type { TocHeading } from '../types'

/**
 * Module-level metadata constants: the canonical English blocks mirror
 * router/web_metadata.go byte-for-byte and never depend on request data.
 */
const AGENT_TOOL_METADATA: Record<DocsAgentToolKey, PageMetadata> = {
  opencode: getDocsAgentToolPageMetadata('opencode'),
  cline: getDocsAgentToolPageMetadata('cline'),
  rooCode: getDocsAgentToolPageMetadata('rooCode'),
}

const SHARED_STEP_NUMBERS = [1, 2, 3, 4, 5] as const
const OPENCODE_STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const
const OPENCODE_CONNECT_COMMAND = '/connect'
const OPENCODE_MODELS_COMMAND = '/models'

const ERROR_KEYS = ['baseUrl', 'apiKey', 'model', 'protocol'] as const

/**
 * Shared layout for the three nested agent setup guides
 * (/docs/agents/opencode, /docs/agents/cline, /docs/agents/roo-code).
 * All copy comes from the Docs i18n bundle; configuration examples are
 * language-neutral code templates with placeholder credentials only.
 */
export default function DocsAgentDetailPage(props: {
  tool: DocsAgentToolKey
  baseUrl: string
}) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  // Selector subscription: re-render only when the authenticated user
  // actually changes, never on unrelated auth-store writes.
  const user = useAuthStore((state) => state.auth.user)
  const isAuthenticated = !!user

  const profile = getDocsAgentToolProfile(props.tool)
  const isOpenCode = props.tool === 'opencode'
  const stepNumbers = isOpenCode ? OPENCODE_STEP_NUMBERS : SHARED_STEP_NUMBERS
  const configBlocks = useMemo(
    () => getDocsAgentConfigExample(props.tool, props.baseUrl),
    [props.tool, props.baseUrl]
  )

  // Public marketing routes: the metadata is owned by this page. The
  // `publicMarketingPage: true` flag prevents the system branding
  // bootstrap in main.tsx from overwriting the route-level title.
  usePageMetadata(AGENT_TOOL_METADATA[props.tool], {
    publicMarketingPage: true,
  })

  // Every heading carries its FULL i18n key: shared section titles live
  // under agentGuides.common.*, tool-specific titles (pageTitle and the
  // OpenCode-only benchmarkTitle) live under agentGuides.<tool>.*. The
  // TOC must never fall back to a wrong namespace and show a raw key.
  const headingKeys = useMemo(() => {
    const keys: { id: string; titleKey: string; level: 2 | 3 }[] = [
      {
        id: `agent-${profile.segment}-title`,
        titleKey: `agentGuides.${props.tool}.pageTitle`,
        level: 2,
      },
      {
        id: `agent-${profile.segment}-prerequisites`,
        titleKey: 'agentGuides.common.prerequisitesTitle',
        level: 3,
      },
    ]
    if (props.tool === 'opencode') {
      keys.push(
        {
          id: 'agent-opencode-steps',
          titleKey: 'agentGuides.common.stepsTitle',
          level: 3,
        },
        {
          id: 'agent-opencode-models',
          titleKey: 'agentGuides.common.modelsTitle',
          level: 3,
        },
        {
          id: 'agent-opencode-errors',
          titleKey: 'agentGuides.common.troubleshootingTitle',
          level: 3,
        },
        {
          id: 'agent-opencode-advanced',
          titleKey: 'agentGuides.opencode.advancedTitle',
          level: 3,
        },
        {
          id: 'agent-opencode-evidence',
          titleKey: 'agentGuides.opencode.benchmarkTitle',
          level: 3,
        }
      )
    } else {
      keys.push(
        {
          id: `agent-${profile.segment}-base-url`,
          titleKey: 'agentGuides.common.baseUrlTitle',
          level: 3,
        },
        {
          id: `agent-${profile.segment}-config`,
          titleKey: 'agentGuides.common.configTitle',
          level: 3,
        },
        {
          id: `agent-${profile.segment}-steps`,
          titleKey: 'agentGuides.common.stepsTitle',
          level: 3,
        },
        {
          id: `agent-${profile.segment}-models`,
          titleKey: 'agentGuides.common.modelsTitle',
          level: 3,
        },
        {
          id: `agent-${profile.segment}-errors`,
          titleKey: 'agentGuides.common.troubleshootingTitle',
          level: 3,
        }
      )
    }
    keys.push({
      id: `agent-${profile.segment}-cta`,
      titleKey: 'agentGuides.common.ctaTitle',
      level: 3,
    })
    return keys
  }, [props.tool, profile.segment])

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () =>
        headingKeys.map((h) => ({
          id: h.id,
          title: t(h.titleKey),
          level: h.level,
        })),
      [headingKeys, t]
    )
  )

  const interpolation = { tool: profile.displayName, baseUrl: props.baseUrl }
  // One unified public status on every guide: "Configuration-ready". The
  // OpenCode-only v1.18.3 fact remains in the Verification evidence section
  // below and never re-enters a badge or status tier.
  const statusLabel = t('agents.hub.status.configurationReady')

  return (
    <div>
      <DocsH2 id={`agent-${profile.segment}-title`}>
        <span className='mr-3 align-middle'>
          {t(`agentGuides.${props.tool}.pageTitle`)}
        </span>
        <Badge variant='outline'>{statusLabel}</Badge>
      </DocsH2>
      {props.tool === 'opencode' ? (
        <p className='mb-4'>
          <a
            href={VANCINE_MODELS_DEV_PROVIDER_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary text-sm font-medium underline underline-offset-4'
          >
            {t('agentGuides.opencode.catalogProof')}
          </a>
        </p>
      ) : null}
      <DocsP>{t(`agentGuides.${props.tool}.valueProp`)}</DocsP>
      {props.tool === 'opencode' ? (
        <div className='border-border bg-card mb-6 rounded-xl border p-4'>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t('agentGuides.opencode.catalogNote')}
          </p>
          <a
            href={VANCINE_MODELS_DEV_PROVIDER_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary mt-2 inline-block text-sm font-medium underline underline-offset-4'
          >
            {t('agentGuides.opencode.catalogLink')}
          </a>
        </div>
      ) : null}
      <DocsCallout type='info'>
        <strong>{statusLabel}:</strong> {t('agentGuides.common.statusCallout')}
      </DocsCallout>

      <DocsH3 id={`agent-${profile.segment}-prerequisites`}>
        {t('agentGuides.common.prerequisitesTitle')}
      </DocsH3>
      <ul className='text-muted-foreground mb-6 list-disc space-y-1.5 pl-6 text-sm leading-relaxed'>
        <li>{t('agentGuides.common.prereqAccount')}</li>
        <li>{t('agentGuides.common.prereqKey')}</li>
        <li>{t('agentGuides.common.prereqTool', interpolation)}</li>
      </ul>

      {isOpenCode ? null : (
        <>
          <DocsH3 id={`agent-${profile.segment}-base-url`}>
            {t('agentGuides.common.baseUrlTitle')}
          </DocsH3>
          <DocsP>{t('agentGuides.common.baseUrlDesc')}</DocsP>
          <DocsCodeBlock
            code={props.baseUrl}
            language='bash'
            title={t('agentGuides.common.baseUrlTitle')}
          />

          <DocsH3 id={`agent-${profile.segment}-config`}>
            {t('agentGuides.common.configTitle')}
          </DocsH3>
          <DocsP>{t('agentGuides.common.configNote')}</DocsP>
          {configBlocks.map((block) => (
            <DocsCodeBlock
              key={block.language}
              code={block.code}
              language={block.language}
              title={t('agentGuides.common.configTitle')}
            />
          ))}
        </>
      )}

      <DocsH3 id={`agent-${profile.segment}-steps`}>
        {t('agentGuides.common.stepsTitle')}
      </DocsH3>
      {isOpenCode ? (
        <DocsCallout type='tip'>
          {t('agentGuides.opencode.noJsonNote')}
        </DocsCallout>
      ) : null}
      <ol className='text-muted-foreground marker:text-primary mb-6 list-decimal space-y-3 pl-6 text-sm leading-relaxed marker:font-semibold'>
        {stepNumbers.map((step) => (
          <li key={step}>
            <div>
              {t(`agentGuides.${props.tool}.step${step}`, interpolation)}
            </div>
            {isOpenCode && step === 3 ? (
              <DocsCodeBlock
                compact
                code={OPENCODE_CONNECT_COMMAND}
                language='bash'
              />
            ) : null}
            {isOpenCode && step === 6 ? (
              <DocsCodeBlock
                compact
                code={OPENCODE_MODELS_COMMAND}
                language='bash'
              />
            ) : null}
          </li>
        ))}
      </ol>

      <DocsH3 id={`agent-${profile.segment}-models`}>
        {t('agentGuides.common.modelsTitle')}
      </DocsH3>
      <DocsP>{t('agentGuides.common.modelsDesc')}</DocsP>
      <p className='mb-6 flex flex-wrap gap-3'>
        <Link
          to='/docs/$slug'
          params={{ slug: 'models' }}
          className='bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90'
        >
          {t('agentGuides.common.modelsDocsLink')}
        </Link>
        <Link
          to='/pricing'
          className='border-border bg-card text-foreground hover:bg-muted/50 rounded-lg border px-4 py-2 text-sm font-medium transition-colors'
        >
          {t('agentGuides.common.pricingLink')}
        </Link>
      </p>

      <DocsH3 id={`agent-${profile.segment}-errors`}>
        {t('agentGuides.common.troubleshootingTitle')}
      </DocsH3>
      <div className='mb-6 space-y-3'>
        {ERROR_KEYS.map((errorKey) => (
          <div
            key={errorKey}
            className='border-border bg-card rounded-xl border p-4'
          >
            <p className='text-foreground mb-1 text-sm font-semibold'>
              {t(`agentGuides.common.errors.${errorKey}.symptom`)}
            </p>
            <p className='text-muted-foreground text-sm leading-relaxed'>
              {errorKey === 'model' && isOpenCode
                ? t('agentGuides.opencode.errors.model.fix')
                : t(`agentGuides.common.errors.${errorKey}.fix`, interpolation)}
            </p>
          </div>
        ))}
      </div>

      {isOpenCode ? (
        <>
          <DocsH3 id='agent-opencode-advanced'>
            {t('agentGuides.opencode.advancedTitle')}
          </DocsH3>
          <DocsP>{t('agentGuides.opencode.advancedNote')}</DocsP>
          <DocsP>{t('agentGuides.common.configNote')}</DocsP>
          {configBlocks.map((block) => (
            <DocsCodeBlock
              key={block.language}
              code={block.code}
              language={block.language}
              title={t('agentGuides.opencode.advancedTitle')}
            />
          ))}
          <DocsH3 id='agent-opencode-evidence'>
            {t('agentGuides.opencode.benchmarkTitle')}
          </DocsH3>
          <DocsP>{t('agentGuides.opencode.benchmarkNote')}</DocsP>
          <DocsP>
            <Link
              to='/coding-agent-benchmark'
              className='text-primary font-medium underline underline-offset-4'
            >
              {t('agents.benchmarkLink')}
            </Link>
          </DocsP>
        </>
      ) : null}

      <DocsCallout type='info'>
        {isOpenCode
          ? t('agentGuides.opencode.notOfficial')
          : t('agentGuides.common.notOfficial', interpolation)}
      </DocsCallout>

      <DocsH3 id={`agent-${profile.segment}-cta`}>
        {t('agentGuides.common.ctaTitle')}
      </DocsH3>
      <div className='border-border bg-card rounded-xl border p-5'>
        <div className='mb-4 flex flex-wrap gap-3'>
          {isAuthenticated ? (
            <Link
              to='/keys'
              className='bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90'
            >
              {t('agentGuides.common.ctaKeys')}
            </Link>
          ) : (
            <Link
              to='/sign-up'
              className='bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90'
            >
              {t('agentGuides.common.ctaSignUp')}
            </Link>
          )}
          <Link
            to='/pricing'
            className='border-border bg-card text-foreground hover:bg-muted/50 rounded-lg border px-4 py-2 text-sm font-medium transition-colors'
          >
            {t('agentGuides.common.ctaPricing')}
          </Link>
          <Link
            to='/docs/$slug'
            params={{ slug: 'chat' }}
            className='border-border bg-card text-foreground hover:bg-muted/50 rounded-lg border px-4 py-2 text-sm font-medium transition-colors'
          >
            {t('agentGuides.common.ctaDocs')}
          </Link>
        </div>
        <Link
          to='/docs/$slug'
          params={{ slug: 'agents' }}
          // Suppress the router's automatic prefix-match aria-current on
          // this in-content back link: only the sidebar navigation declares
          // page currency.
          activeOptions={{ exact: true }}
          className='text-primary text-sm font-medium underline underline-offset-4'
        >
          {t('agentGuides.backToAgents')}
        </Link>
      </div>
    </div>
  )
}
