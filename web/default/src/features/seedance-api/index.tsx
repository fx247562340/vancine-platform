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
  SeedanceHeader,
  HeroSection,
  WorkflowSection,
  CodeExamplesSection,
  ConversionSections,
} from './components'
import { getSeedanceMetadata, VANCINE_SEEDANCE_DOCS_URL } from './lib/landing'

interface MetaSnapshot {
  el: HTMLMetaElement | HTMLLinkElement | null
  existed: boolean
  hadAttribute: boolean
  value: string
}

// Snapshot a meta/link element's original state BEFORE Seedance mutates it.
// We track all four distinct cases the cleanup phase must handle:
//   1. element did not exist → Seedance must remove the element it creates
//   2. element existed, had the attribute → restore the original value (''
//      included)
//   3. element existed, lacked the attribute → remove the attribute Seedance
//      added
//   4. element existed, attribute had a normal value → restore that value
//
// After the effect (possibly) creates a new element, it writes that element
// back into `snapshot.el` so cleanup can find and remove it.
function snapshotMeta(selector: string, attr?: string): MetaSnapshot {
  const el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(
    selector
  )
  const attribute = attr ?? 'content'
  return {
    el: el ?? null,
    existed: !!el,
    hadAttribute: el ? el.hasAttribute(attribute) : false,
    value: el?.getAttribute(attribute) ?? '',
  }
}

function restoreOrRemoveMeta(snapshot: MetaSnapshot, attr?: string): void {
  const { el, existed, hadAttribute, value } = snapshot
  if (!el) return
  const attribute = attr ?? 'content'
  if (!existed) {
    // Seedance created this element from scratch; remove it so it does not
    // leak onto other routes.
    el.remove()
  } else if (hadAttribute) {
    // Restore the original attribute value verbatim — including '' — so the
    // element returns to its exact pre-Seedance state.
    el.setAttribute(attribute, value)
  } else {
    // The element existed but did NOT have this attribute; Seedance added
    // it, so we remove the attribute to restore the original state.
    el.removeAttribute(attribute)
  }
}

// Resolve the element a snapshot should operate on. If the snapshot's
// element already exists, reuse it. Otherwise create the element with its
// identity attribute (name / property / rel), append it, and record the
// created element back onto the snapshot so cleanup can remove it.
function prepareElement(
  snapshot: MetaSnapshot,
  tag: string,
  identityAttr: string,
  identityValue: string
): HTMLMetaElement | HTMLLinkElement {
  let el = snapshot.el
  if (!el) {
    el =
      tag === 'link'
        ? document.createElement('link')
        : document.createElement('meta')
    el.setAttribute(identityAttr, identityValue)
    document.head.appendChild(el)
    snapshot.el = el
  }
  return el as HTMLMetaElement | HTMLLinkElement
}

export function SeedanceApi() {
  const { i18n } = useTranslation()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { systemName, logo } = useSystemConfig()

  const language = i18n.language

  useEffect(() => {
    const meta = getSeedanceMetadata(language)

    // Snapshot BEFORE any mutation so we can distinguish "pre-existing" from
    // "Seedance-created" in the cleanup phase.
    const snapshots = {
      description: snapshotMeta('meta[name="description"]'),
      ogTitle: snapshotMeta('meta[property="og:title"]'),
      ogDescription: snapshotMeta('meta[property="og:description"]'),
      ogUrl: snapshotMeta('meta[property="og:url"]'),
      canonical: snapshotMeta('link[rel="canonical"]', 'href'),
    }
    const prevTitle = document.title

    document.title = meta.title

    prepareElement(
      snapshots.description,
      'meta',
      'name',
      'description'
    ).setAttribute('content', meta.description)
    prepareElement(
      snapshots.ogTitle,
      'meta',
      'property',
      'og:title'
    ).setAttribute('content', meta.ogTitle)
    prepareElement(
      snapshots.ogDescription,
      'meta',
      'property',
      'og:description'
    ).setAttribute('content', meta.ogDescription)
    prepareElement(snapshots.ogUrl, 'meta', 'property', 'og:url').setAttribute(
      'content',
      meta.canonical
    )
    prepareElement(
      snapshots.canonical,
      'link',
      'rel',
      'canonical'
    ).setAttribute('href', meta.canonical)

    return () => {
      document.title = prevTitle
      restoreOrRemoveMeta(snapshots.description)
      restoreOrRemoveMeta(snapshots.ogTitle)
      restoreOrRemoveMeta(snapshots.ogDescription)
      restoreOrRemoveMeta(snapshots.ogUrl)
      restoreOrRemoveMeta(snapshots.canonical, 'href')
    }
  }, [language])

  return (
    <div className='bg-background text-foreground flex min-h-svh flex-col'>
      <SeedanceHeader
        isAuthenticated={isAuthenticated}
        siteName={systemName}
        logo={logo}
      />
      <main className='flex-1'>
        <HeroSection isAuthenticated={isAuthenticated} />
        <WorkflowSection />
        <CodeExamplesSection />
        <ConversionSections isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  )
}

// Kept for parity with the AiMediaApi module API.
export { VANCINE_SEEDANCE_DOCS_URL }
