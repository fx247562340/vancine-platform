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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Footer } from '@/components/layout/components/footer'
import {
  AiMediaHeader,
  ApiExamplesSection,
  ContentSections,
  HeroSection,
} from './components'
import { getAiMediaMetadata, VANCINE_DOCS_URL } from './lib/landing'

function ensureMeta(id: string, selector: string, attribute?: string) {
  let el = document.head.querySelector<HTMLLinkElement | HTMLMetaElement>(
    selector
  )
  if (!el) {
    el =
      attribute === 'href' || selector.startsWith('link')
        ? document.createElement('link')
        : document.createElement('meta')
    el.id = id
    document.head.appendChild(el)
  }
  return el
}

export function AiMediaApi() {
  const { i18n } = useTranslation()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { systemName, logo } = useSystemConfig()

  const language = i18n.language

  useEffect(() => {
    const meta = getAiMediaMetadata(language)
    const previous = {
      title: document.title,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') ?? '',
      ogTitle:
        document
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content') ?? '',
      ogDescription:
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute('content') ?? '',
      ogUrl:
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute('content') ?? '',
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
        '',
    }

    document.title = meta.title

    const descriptionEl = ensureMeta(
      'ai-media-meta-description',
      'meta[name="description"]'
    )
    descriptionEl.setAttribute('content', meta.description)

    const ogTitleEl = ensureMeta(
      'ai-media-meta-og-title',
      'meta[property="og:title"]'
    )
    ogTitleEl.setAttribute('content', meta.ogTitle)

    const ogDescEl = ensureMeta(
      'ai-media-meta-og-description',
      'meta[property="og:description"]'
    )
    ogDescEl.setAttribute('content', meta.ogDescription)

    const ogUrlEl = ensureMeta(
      'ai-media-meta-og-url',
      'meta[property="og:url"]'
    )
    ogUrlEl.setAttribute('content', meta.canonical)

    const canonicalEl = ensureMeta(
      'ai-media-link-canonical',
      'link[rel="canonical"]',
      'href'
    ) as HTMLLinkElement
    canonicalEl.setAttribute('rel', 'canonical')
    canonicalEl.setAttribute('href', meta.canonical)

    return () => {
      document.title = previous.title
      if (previous.description)
        ensureMeta(
          'ai-media-meta-description',
          'meta[name="description"]'
        ).setAttribute('content', previous.description)
      if (previous.ogTitle)
        ensureMeta(
          'ai-media-meta-og-title',
          'meta[property="og:title"]'
        ).setAttribute('content', previous.ogTitle)
      if (previous.ogDescription)
        ensureMeta(
          'ai-media-meta-og-description',
          'meta[property="og:description"]'
        ).setAttribute('content', previous.ogDescription)
      if (previous.ogUrl)
        ensureMeta(
          'ai-media-meta-og-url',
          'meta[property="og:url"]'
        ).setAttribute('content', previous.ogUrl)
      const canon = document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]'
      )
      if (canon) {
        if (previous.canonical) canon.setAttribute('href', previous.canonical)
        else canon.remove()
      }
    }
  }, [language])

  return (
    <div className='bg-background text-foreground flex min-h-svh flex-col'>
      <AiMediaHeader
        docsUrl={VANCINE_DOCS_URL}
        isAuthenticated={isAuthenticated}
        siteName={systemName}
        logo={logo}
      />
      <main className='flex-1'>
        <HeroSection isAuthenticated={isAuthenticated} />
        <ContentSections isAuthenticated={isAuthenticated} />
        <ApiExamplesSection />
      </main>
      <Footer />
    </div>
  )
}
