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
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { RichContent } from '@/components/rich-content'
import { useTheme } from '@/context/theme-provider'
import { usePageMetadata } from '@/hooks/use-page-metadata'
import { isLikelyHtml } from '@/lib/content-format'
import { useAuthStore } from '@/stores/auth-store'

import {
  ApiCodeSection,
  AvailableNow,
  CTA,
  Evidence,
  FastModels,
  Hero,
  ToolsAndAccess,
  Why,
} from './components'
import {
  useHomePageContent,
  useHomepagePricing,
  useHomepageStats,
} from './hooks'
import { getHomePageMetadata } from './lib/seo'

// v1.12.0 default built-in homepage section order (frozen).
//   1. Hero — brand ribbons + headline + 3 live stats + dual CTAs.
//   2. Available now (flagship models — data-driven from /api/pricing "featured" tag).
//   3. Fast models (data-driven from /api/pricing "fast" tag, deduped vs flagship).
//   4. Tools and access — universal SDK chips + OpenCode / Pi Agent + active-vendor count.
//   5. API code demo — live OpenAI-compatible request samples.
//   6. Why Vancine — three pillars.
//   7. Verified evidence — Kimi K3 OpenCode agent run summary.
//   8. Final CTA.
//   9. Footer.
//
// The Stack / DeveloperSolutions / Marketplace sections are kept in the
// codebase for the docs sidebar and shared registry consumers, but the
// built-in homepage no longer renders them as standalone blocks. When an
// admin configures a custom URL / HTML / Markdown homepage, none of these
// sections are mounted — the override replaces the entire built-in shell.
export function Home() {
  const { i18n, t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { content, isUrl } = useHomePageContent()
  const pricing = useHomepagePricing(!content)
  // The stats hook MUST be disabled when an admin-configured custom
  // home page is in effect. The custom page owns the render surface
  // (URL iframe, HTML, or Markdown) and the in-built stats tile is
  // never mounted, so issuing the request would burn a /api call,
  // a Redis hit, and a SQL aggregate for a number no one will see.
  const stats = useHomepageStats({ enabled: !content })

  // Public marketing route: the metadata is owned by this page even when
  // an admin-configured custom home content (URL / HTML / Markdown) replaces
  // the built-in shell. The `publicMarketingPage: true` flag prevents the
  // system branding bootstrap in main.tsx from overwriting the route-level
  // title. The useMemo keeps the metadata reference stable across
  // unrelated re-renders (theme toggle, pricing data refresh, auth state
  // change) so the head is not re-applied on every render.
  const homeMetadata = useMemo(
    () => getHomePageMetadata(i18n.language),
    [i18n.language]
  )
  usePageMetadata(homeMetadata, { publicMarketingPage: true })

  const syncIframePreferences = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { themeMode: resolvedTheme },
        '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        { lang: i18n.language },
        '*'
      )
    } catch {
      // Cross-origin frames may reject access while navigating.
    }
  }, [i18n.language, resolvedTheme])

  useEffect(() => {
    if (isUrl) {
      syncIframePreferences()
    }
  }, [isUrl, syncIframePreferences])

  // Custom content: render as soon as content is non-empty (from cache or API).
  // The built-in homepage shell renders immediately when there is no cached
  // override and the API has not yet responded, so visitors never see blank.
  if (content) {
    if (isUrl) {
      return (
        <PublicLayout showMainContainer={false}>
          {/*
            allow-top-navigation-by-user-activation: the custom home page URL is
            admin-configured (trusted); this lets its target="_top" nav/menu links
            navigate the top-level window on user click. The default sandbox blocks
            this on desktop, while some mobile browsers allow it via allow-popups,
            causing inconsistent behavior. This token only permits user-activated
            top-level navigation and does NOT grant same-origin access.
          */}
          <iframe
            ref={iframeRef}
            src={content}
            className='h-screen w-full border-none'
            title={t('Custom Home Page')}
            sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
            onLoad={syncIframePreferences}
          />
        </PublicLayout>
      )
    }

    const contentIsHtml = isLikelyHtml(content)

    if (contentIsHtml) {
      return (
        <PublicLayout showMainContainer={false}>
          <RichContent
            mode='html'
            htmlVariant='isolated'
            content={content}
            className='custom-home-content'
          />
        </PublicLayout>
      )
    }

    return (
      <PublicLayout>
        <div className='mx-auto max-w-6xl px-4 py-8'>
          <RichContent
            mode='markdown'
            content={content}
            className='custom-home-content'
          />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <Hero
        isAuthenticated={isAuthenticated}
        pricing={pricing}
        stats={stats}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      />
      <AvailableNow pricing={pricing} />
      <FastModels pricing={pricing} />
      <ToolsAndAccess stats={stats} />
      <ApiCodeSection />
      <Why />
      <Evidence />
      <CTA isAuthenticated={isAuthenticated} />
      <Footer />
    </PublicLayout>
  )
}
