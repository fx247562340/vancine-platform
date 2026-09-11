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
import { notFound } from '@tanstack/react-router'
import { Suspense, lazy, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'

import { DocsToc } from './components/headings'
import { DocsFeedback, DocsPrevNext } from './components/prev-next'
import { DocsSidebar } from './components/sidebar'
import { TocProvider } from './components/toc-context'
import { DocsI18nProvider } from './i18n/docs-i18n'
import { useDocsI18n } from './i18n/docs-i18n-context'
import { DOCS_NS } from './i18n/loader'
import type { DocsAgentToolKey } from './lib/agents'
import { normalizeApiBaseUrl } from './lib/base-url'
import {
  DOCS_LAYOUT_CONTAINER_CLASS,
  DOCS_MAIN_CLASS,
  DOCS_TOC_CLASS,
} from './lib/layout-classes'
import { getModelEntry } from './lib/model-registry'
import { isDocsSlug } from './nav'
import { PAGE_REGISTRY } from './registry'
import type { DocsSlug } from './types'

/**
 * Stable cold-load fallback. Deliberately uses only the GLOBAL translation
 * namespace (always bundled) so it never flashes a raw `docs` key before the
 * lazy Docs bundle has loaded.
 */
function DocsColdLoading() {
  const { t } = useTranslation()
  return (
    <div className='flex items-center justify-center gap-2 py-16' role='status'>
      <span
        aria-hidden='true'
        className='border-primary text-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent'
      />
      <span className='text-muted-foreground text-sm'>{t('Loading')}</span>
    </div>
  )
}

/**
 * Terminal error state for an unrecoverable Docs bundle failure. Uses existing
 * GLOBAL i18n keys (never the failed `docs` namespace, never hard-coded copy).
 */
function DocsLoadError() {
  const { t } = useTranslation()
  return (
    <div className='py-16 text-center' role='alert'>
      <p className='text-foreground text-sm font-medium'>
        {t('Loading failed')}
      </p>
      <p className='text-muted-foreground mt-1 text-sm'>
        {t('Please try again later.')}
      </p>
    </div>
  )
}

function DocsNotFound() {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  return (
    <div className='flex min-h-[300px] flex-col items-center justify-center text-center'>
      <div className='mb-4 text-5xl' aria-hidden='true'>
        🚧
      </div>
      <h2 className='text-foreground mb-2 text-2xl font-bold'>
        {t('common.notFound', { defaultValue: 'Page not found' })}
      </h2>
      <p className='text-muted-foreground'>
        {t('common.notFoundDesc', {
          defaultValue:
            'The documentation page you are looking for does not exist.',
        })}
      </p>
    </div>
  )
}

/**
 * Renders the registered page for a slug. The page component is read from the
 * module-level PAGE_REGISTRY via member access (not a call expression), so the
 * JSX tag is a static reference per react-hooks/static-components.
 */
function DocsPageSlot(props: { slug: DocsSlug; baseUrl: string }) {
  const Page = PAGE_REGISTRY[props.slug]
  return (
    <Suspense fallback={<DocsColdLoading />}>
      <Page baseUrl={props.baseUrl} />
    </Suspense>
  )
}

/**
 * Lazy-loaded nested agent setup guide (/docs/agents/<tool>). Kept out of
 * the shared Docs layout chunk so hub and slug pages never pay for it.
 */
const LazyDocsAgentDetailPage = lazy(() => import('./pages/agent-detail'))

/**
 * Lazy-loaded model detail page (/docs/models/<slug>). The slug is
 * passed through to the page so the page resolves the registry entry
 * once and never reads the URL again. Model pages are below the
 * "models" docs slug for sidebar highlighting.
 */
const LazyDocsModelDetailPage = lazy(() => import('./pages/model-detail'))

function DocsAgentSlot(props: { tool: DocsAgentToolKey; baseUrl: string }) {
  return (
    <Suspense fallback={<DocsColdLoading />}>
      <LazyDocsAgentDetailPage tool={props.tool} baseUrl={props.baseUrl} />
    </Suspense>
  )
}

function DocsModelDetailSlot(props: { slug: string; baseUrl: string }) {
  return (
    <Suspense fallback={<DocsColdLoading />}>
      <LazyDocsModelDetailPage slug={props.slug} baseUrl={props.baseUrl} />
    </Suspense>
  )
}

function resolveActiveSlug(props: {
  agentTool?: DocsAgentToolKey
  modelSlug?: string | null
  slug: DocsSlug | null
}): DocsSlug | null {
  if (props.agentTool) return 'agents'
  if (props.modelSlug) return 'models'
  return props.slug
}

function DocsLayoutReady(props: {
  slug: DocsSlug | null
  baseUrl: string
  agentTool?: DocsAgentToolKey
  modelSlug?: string | null
}) {
  const { locale } = useDocsI18n()
  let tocKey: string
  if (props.agentTool) {
    tocKey = `agent-${props.agentTool}-${locale}`
  } else if (props.modelSlug) {
    tocKey = `model-${props.modelSlug}-${locale}`
  } else {
    tocKey = `${props.slug ?? 'none'}-${locale}`
  }

  let mainContent: ReactNode
  if (props.agentTool) {
    mainContent = (
      <DocsAgentSlot tool={props.agentTool} baseUrl={props.baseUrl} />
    )
  } else if (props.modelSlug) {
    mainContent = (
      <>
        <DocsModelDetailSlot slug={props.modelSlug} baseUrl={props.baseUrl} />
        <DocsFeedback key={`model-${props.modelSlug}`} slug='models' />
        <DocsPrevNext slug='models' />
      </>
    )
  } else if (props.slug) {
    mainContent = (
      <>
        <DocsPageSlot slug={props.slug} baseUrl={props.baseUrl} />
        <DocsFeedback key={props.slug} slug={props.slug} />
        <DocsPrevNext slug={props.slug} />
      </>
    )
  } else {
    mainContent = <DocsNotFound />
  }

  return (
    <div className='mx-auto max-w-[1200px] px-4 pt-20 pb-8'>
      {/* Keyed by page+locale so headings reset on page/language change. */}
      <TocProvider key={tocKey}>
        <div className={DOCS_LAYOUT_CONTAINER_CLASS}>
          {/* Navigation (stacks above content on mobile). Agent setup guides
              keep the "Agent Integration" parent item group-active while the
              matching child link owns aria-current. */}
          <DocsSidebar
            activeSlug={resolveActiveSlug(props)}
            activeAgentTool={props.agentTool ?? null}
          />

          {/* Main content */}
          <main className={DOCS_MAIN_CLASS}>{mainContent}</main>

          {/* TOC — lg (1024px) and up */}
          <aside className={DOCS_TOC_CLASS}>
            <DocsToc />
          </aside>
        </div>
      </TocProvider>
    </div>
  )
}

function DocsLayoutInner(props: {
  slugParam: string
  agentTool?: DocsAgentToolKey
  modelSlug?: string
}) {
  const { ready, status } = useDocsI18n()
  const { status: systemStatus } = useStatus()

  const baseUrl = useMemo(() => {
    const raw = (systemStatus as Record<string, unknown> | null)?.server_address
    return normalizeApiBaseUrl(typeof raw === 'string' ? raw : undefined)
  }, [systemStatus])

  // When the route param carries a model slug, look it up in the
  // registry. Unknown slugs are routed to the standard notFound() view
  // (noindex, neutral metadata) instead of rendering an empty detail
  // shell. The lookup runs before any bundle readiness gate so the
  // unknown-slug path is identical to the standard docs notFound().
  if (props.modelSlug !== undefined) {
    const entry = getModelEntry(props.modelSlug)
    if (!entry) {
      throw notFound()
    }
  }

  const slug: DocsSlug | null = isDocsSlug(props.slugParam)
    ? props.slugParam
    : null

  // Until the Docs bundle is ready, render only docs-independent fallbacks so
  // no raw `common.*` / `nav.*` keys can appear on a cold first load.
  if (status === 'error') {
    return <DocsLoadError />
  }
  if (!ready) {
    return <DocsColdLoading />
  }

  return (
    <DocsLayoutReady
      slug={slug}
      baseUrl={baseUrl}
      agentTool={props.agentTool}
      modelSlug={props.modelSlug ?? null}
    />
  )
}

export function DocsLayout(props: {
  slugParam: string
  agentTool?: DocsAgentToolKey
  modelSlug?: string
}) {
  return (
    <PublicLayout showMainContainer={false}>
      <DocsI18nProvider>
        <DocsLayoutInner
          slugParam={props.slugParam}
          agentTool={props.agentTool}
          modelSlug={props.modelSlug}
        />
      </DocsI18nProvider>
    </PublicLayout>
  )
}
