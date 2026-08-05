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
import { Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatus } from '@/hooks/use-status'
import { PublicLayout } from '@/components/layout'
import { DocsToc } from './components/headings'
import { DocsFeedback, DocsPrevNext } from './components/prev-next'
import { DocsSidebar } from './components/sidebar'
import { TocProvider } from './components/toc-context'
import { DocsI18nProvider } from './i18n/docs-i18n'
import { useDocsI18n } from './i18n/docs-i18n-context'
import { DOCS_NS } from './i18n/loader'
import { normalizeApiBaseUrl } from './lib/base-url'
import {
  DOCS_LAYOUT_CONTAINER_CLASS,
  DOCS_MAIN_CLASS,
  DOCS_TOC_CLASS,
} from './lib/layout-classes'
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

function DocsLayoutReady(props: { slug: DocsSlug | null; baseUrl: string }) {
  const { locale } = useDocsI18n()
  return (
    <div className='mx-auto max-w-[1200px] px-4 pt-20 pb-8'>
      {/* Keyed by slug+locale so headings reset on page/language change. */}
      <TocProvider key={`${props.slug ?? 'none'}-${locale}`}>
        <div className={DOCS_LAYOUT_CONTAINER_CLASS}>
          {/* Navigation (stacks above content on mobile) */}
          <DocsSidebar activeSlug={props.slug} />

          {/* Main content */}
          <main className={DOCS_MAIN_CLASS}>
            {props.slug ? (
              <>
                <DocsPageSlot slug={props.slug} baseUrl={props.baseUrl} />
                <DocsFeedback key={props.slug} slug={props.slug} />
                <DocsPrevNext slug={props.slug} />
              </>
            ) : (
              <DocsNotFound />
            )}
          </main>

          {/* TOC — lg (1024px) and up */}
          <aside className={DOCS_TOC_CLASS}>
            <DocsToc />
          </aside>
        </div>
      </TocProvider>
    </div>
  )
}

function DocsLayoutInner(props: { slugParam: string }) {
  const { ready, status } = useDocsI18n()
  const { status: systemStatus } = useStatus()

  const baseUrl = useMemo(() => {
    const raw = (systemStatus as Record<string, unknown> | null)?.server_address
    return normalizeApiBaseUrl(typeof raw === 'string' ? raw : undefined)
  }, [systemStatus])

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

  return <DocsLayoutReady slug={slug} baseUrl={baseUrl} />
}

export function DocsLayout(props: { slugParam: string }) {
  return (
    <PublicLayout showMainContainer={false}>
      <DocsI18nProvider>
        <DocsLayoutInner slugParam={props.slugParam} />
      </DocsI18nProvider>
    </PublicLayout>
  )
}
