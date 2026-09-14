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
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useLiveModelCatalog } from '@/features/live-model-catalog/hooks/use-live-model-catalog'
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
  OPENCLAW_INSTALL_CLAWHUB_COMMAND,
  OPENCLAW_INSTALL_NPM_COMMAND,
  OPENCLAW_MODELS_COMMAND,
  OPENCLAW_ONBOARD_COMMAND,
  PI_LOGIN_COMMAND,
  PI_MODEL_COMMAND,
  PI_PROVIDER_INSTALL_COMMAND,
  VANCINE_MODELS_DEV_PROVIDER_URL,
  VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_NPM_URL,
  VANCINE_PI_PROVIDER_CATALOG_URL,
  VANCINE_PI_PROVIDER_GITHUB_URL,
  VANCINE_PI_PROVIDER_NPM_URL,
  type DocsAgentToolKey,
} from '../lib/agents'
import { getDocsAgentToolPageMetadata } from '../lib/agents-metadata'
import { pickDocsTextModel } from '../lib/text-model-choice'
import type { TocHeading } from '../types'

/**
 * Module-level metadata constants: the canonical English blocks mirror
 * router/web_metadata.go byte-for-byte and never depend on request data.
 */
const AGENT_TOOL_METADATA: Record<DocsAgentToolKey, PageMetadata> = {
  opencode: getDocsAgentToolPageMetadata('opencode'),
  cline: getDocsAgentToolPageMetadata('cline'),
  rooCode: getDocsAgentToolPageMetadata('rooCode'),
  pi: getDocsAgentToolPageMetadata('pi'),
  openclaw: getDocsAgentToolPageMetadata('openclaw'),
}

const SHARED_STEP_NUMBERS = [1, 2, 3, 4, 5] as const
const OPENCODE_STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const
const OPENCODE_CONNECT_COMMAND = '/connect'
const OPENCODE_MODELS_COMMAND = '/models'

const ERROR_KEYS = ['baseUrl', 'apiKey', 'model', 'protocol'] as const

/**
 * Community provider-plugin guides (Pi, OpenClaw) install an extension and
 * sign in inside the tool; they never show the manual Base URL / config
 * sections shared by Cline and Roo Code. The install commands below are
 * language-neutral code from the published packages and always install the
 * latest version (never a pinned version number).
 */
const PROVIDER_TOOL_KEYS = ['pi', 'openclaw'] as const
type ProviderToolKey = (typeof PROVIDER_TOOL_KEYS)[number]

/** Code blocks rendered under the numbered setup steps of a provider guide. */
const PROVIDER_STEP_CODES: Record<ProviderToolKey, Record<number, string>> = {
  pi: {
    1: PI_PROVIDER_INSTALL_COMMAND,
    3: PI_LOGIN_COMMAND,
    5: PI_MODEL_COMMAND,
  },
  openclaw: {
    1: OPENCLAW_INSTALL_NPM_COMMAND,
    2: OPENCLAW_INSTALL_CLAWHUB_COMMAND,
    3: OPENCLAW_ONBOARD_COMMAND,
    4: OPENCLAW_MODELS_COMMAND,
  },
}

const PROVIDER_STEP_COUNTS: Record<ProviderToolKey, number> = {
  pi: 7,
  openclaw: 5,
}

/** Public package sources shown as links on each provider guide. */
const PROVIDER_SOURCE_LINKS: Record<
  ProviderToolKey,
  { href: string; labelKey: string }[]
> = {
  pi: [
    // Pi's own catalog entry first (discovery), then the real distribution
    // source (npm) and the public repository.
    {
      href: VANCINE_PI_PROVIDER_CATALOG_URL,
      labelKey: 'agentGuides.pi.catalogLabel',
    },
    { href: VANCINE_PI_PROVIDER_NPM_URL, labelKey: 'agentGuides.pi.npmLabel' },
    {
      href: VANCINE_PI_PROVIDER_GITHUB_URL,
      labelKey: 'agentGuides.pi.githubLabel',
    },
  ],
  openclaw: [
    {
      href: VANCINE_OPENCLAW_PROVIDER_NPM_URL,
      labelKey: 'agentGuides.openclaw.npmLabel',
    },
    {
      href: VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
      labelKey: 'agentGuides.openclaw.clawhubLabel',
    },
    {
      href: VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
      labelKey: 'agentGuides.openclaw.githubLabel',
    },
  ],
}

/** Provider-specific troubleshooting entries (under agentGuides.<tool>.errors). */
const PROVIDER_ERROR_KEYS: Record<ProviderToolKey, readonly string[]> = {
  pi: ['providerMissing', 'apiKey', 'modelMissing', 'catalogUnavailable'],
  openclaw: [
    'pluginMissing',
    'authFailed',
    'noModels',
    'modelRefused',
    'doubleInstall',
  ],
}

function isProviderTool(tool: DocsAgentToolKey): tool is ProviderToolKey {
  return (PROVIDER_TOOL_KEYS as readonly string[]).includes(tool)
}

/**
 * Shared layout for the five nested agent setup guides (/docs/agents/opencode,
 * /docs/agents/cline, /docs/agents/roo-code, /docs/agents/pi,
 * /docs/agents/openclaw). All copy comes from the Docs i18n bundle;
 * configuration examples are language-neutral code templates with
 * placeholder credentials only.
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
  const { catalog } = useLiveModelCatalog()
  const recommendedModelId = pickDocsTextModel(catalog).modelId

  const profile = getDocsAgentToolProfile(props.tool)
  const isOpenCode = props.tool === 'opencode'
  // Community provider-plugin guides own their layout branch; Cline and Roo
  // Code share the manual Base URL/configuration branch. A single narrowed
  // const keeps every branch below type-safe without repeated casts.
  const providerTool: ProviderToolKey | null = isProviderTool(props.tool)
    ? props.tool
    : null
  const isProvider = providerTool !== null
  const stepNumbers = isOpenCode ? OPENCODE_STEP_NUMBERS : SHARED_STEP_NUMBERS
  const configBlocks = useMemo(
    () =>
      getDocsAgentConfigExample(props.tool, props.baseUrl, recommendedModelId),
    [props.tool, props.baseUrl, recommendedModelId]
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
    } else if (isProviderTool(props.tool)) {
      keys.push(
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

  const interpolation = {
    tool: profile.displayName,
    baseUrl: props.baseUrl,
    modelId: recommendedModelId,
  }
  // One unified public status on every guide: "Configuration-ready". The
  // OpenCode-only v1.18.3 fact remains in the Verification evidence section
  // below and never re-enters a badge or status tier.
  const statusLabel = t('agents.hub.status.configurationReady')
  // The numbered steps list is computed once per render (no single-use
  // nested render function): one branch per guide family.
  let renderedSteps: ReactNode[]
  if (isOpenCode) {
    renderedSteps = stepNumbers.map((step) => (
      <li key={step}>
        <div>{t(`agentGuides.${props.tool}.step${step}`, interpolation)}</div>
        {step === 3 ? (
          <DocsCodeBlock
            compact
            code={OPENCODE_CONNECT_COMMAND}
            language='bash'
          />
        ) : null}
        {step === 6 ? (
          <DocsCodeBlock
            compact
            code={OPENCODE_MODELS_COMMAND}
            language='bash'
          />
        ) : null}
      </li>
    ))
  } else if (providerTool !== null) {
    renderedSteps = Array.from(
      { length: PROVIDER_STEP_COUNTS[providerTool] },
      (_, index) => index + 1
    ).map((step) => {
      const code = PROVIDER_STEP_CODES[providerTool][step]
      return (
        <li key={step}>
          <div>
            {t(`agentGuides.${providerTool}.step${step}`, interpolation)}
          </div>
          {code ? <DocsCodeBlock compact code={code} language='bash' /> : null}
        </li>
      )
    })
  } else {
    renderedSteps = stepNumbers.map((step) => (
      <li key={step}>
        {t(`agentGuides.${props.tool}.step${step}`, interpolation)}
      </li>
    ))
  }
  // Which troubleshooting entries the guide lists.
  const errorKeys =
    providerTool !== null ? PROVIDER_ERROR_KEYS[providerTool] : ERROR_KEYS

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
      {providerTool !== null ? (
        <p className='mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm'>
          {PROVIDER_SOURCE_LINKS[providerTool].map((source) => (
            <a
              key={source.href}
              href={source.href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary font-medium underline underline-offset-4'
            >
              {t(source.labelKey)}
            </a>
          ))}
        </p>
      ) : null}
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
        {props.tool === 'openclaw' ? (
          <li>{t('agentGuides.openclaw.compatNote')}</li>
        ) : null}
      </ul>

      {isOpenCode || isProvider ? null : (
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
      {props.tool === 'openclaw' ? (
        <DocsCallout type='tip'>
          {t('agentGuides.openclaw.installChoice')}
        </DocsCallout>
      ) : null}
      <ol className='text-muted-foreground marker:text-primary mb-6 list-decimal space-y-3 pl-6 text-sm leading-relaxed marker:font-semibold'>
        {renderedSteps}
      </ol>

      <DocsH3 id={`agent-${profile.segment}-models`}>
        {t('agentGuides.common.modelsTitle')}
      </DocsH3>
      {providerTool !== null ? (
        <DocsCallout type='tip'>
          {t(`agentGuides.${providerTool}.catalogNote`)}
        </DocsCallout>
      ) : null}
      {/* Provider guides scope model choice to their own verified list;
          the generic all-models line stays manual-config only here. */}
      {providerTool !== null ? (
        <DocsP>{t(`agentGuides.${providerTool}.modelsNote`)}</DocsP>
      ) : (
        <DocsP>{t('agentGuides.common.modelsDesc')}</DocsP>
      )}
      <p className='mb-6 flex flex-wrap gap-3'>
        {/* Models/Pricing are reference links. Manual-config guides keep
            their existing primary-styled Models button; provider-plugin
            guides stay auxiliary so the page keeps exactly one visual
            conversion CTA in the footer. */}
        <Link
          to='/docs/$slug'
          params={{ slug: 'models' }}
          className={
            isProvider
              ? 'border-border bg-card text-foreground hover:bg-muted/50 rounded-lg border px-4 py-2 text-sm font-medium transition-colors'
              : 'bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90'
          }
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
        {errorKeys.map((errorKey) => {
          const errorBase =
            providerTool !== null
              ? `agentGuides.${providerTool}.errors`
              : 'agentGuides.common.errors'
          return (
            <div
              key={errorKey}
              className='border-border bg-card rounded-xl border p-4'
            >
              <p className='text-foreground mb-1 text-sm font-semibold'>
                {t(`${errorBase}.${errorKey}.symptom`)}
              </p>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {!isProvider && errorKey === 'model' && isOpenCode
                  ? t('agentGuides.opencode.errors.model.fix')
                  : t(`${errorBase}.${errorKey}.fix`, interpolation)}
              </p>
            </div>
          )
        })}
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

      {props.tool === 'openclaw' ? (
        <>
          <DocsCallout type='info'>
            {t('agentGuides.openclaw.zeroCredentialNote')}
          </DocsCallout>
          <DocsCallout type='info'>
            {t('agentGuides.openclaw.limitationsNote')}
          </DocsCallout>
        </>
      ) : null}

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
