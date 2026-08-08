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

/**
 * Complete, explicitly typed page metadata managed by `usePageMetadata`.
 * All values are required except the Twitter pair, so a page can never
 * partially overwrite head state by accident.
 */
export interface PageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogUrl: string
  canonical: string
  /** Optional Twitter card metadata; managed with identical cleanup rules. */
  twitterTitle?: string
  twitterDescription?: string
}

/** One head element the hook manages, addressed by a unique selector. */
interface MetadataTarget {
  selector: string
  tagName: 'meta' | 'link'
  identityAttr: 'name' | 'property' | 'rel'
  identityValue: string
  valueAttr: 'content' | 'href'
  /** Undefined marks an optional target that is absent from this metadata. */
  value: string | undefined
}

function buildTargets(metadata: PageMetadata): MetadataTarget[] {
  return [
    {
      selector: 'meta[name="description"]',
      tagName: 'meta',
      identityAttr: 'name',
      identityValue: 'description',
      valueAttr: 'content',
      value: metadata.description,
    },
    {
      selector: 'meta[property="og:title"]',
      tagName: 'meta',
      identityAttr: 'property',
      identityValue: 'og:title',
      valueAttr: 'content',
      value: metadata.ogTitle,
    },
    {
      selector: 'meta[property="og:description"]',
      tagName: 'meta',
      identityAttr: 'property',
      identityValue: 'og:description',
      valueAttr: 'content',
      value: metadata.ogDescription,
    },
    {
      selector: 'meta[property="og:url"]',
      tagName: 'meta',
      identityAttr: 'property',
      identityValue: 'og:url',
      valueAttr: 'content',
      value: metadata.ogUrl,
    },
    {
      selector: 'meta[name="twitter:title"]',
      tagName: 'meta',
      identityAttr: 'name',
      identityValue: 'twitter:title',
      valueAttr: 'content',
      value: metadata.twitterTitle,
    },
    {
      selector: 'meta[name="twitter:description"]',
      tagName: 'meta',
      identityAttr: 'name',
      identityValue: 'twitter:description',
      valueAttr: 'content',
      value: metadata.twitterDescription,
    },
    {
      selector: 'link[rel="canonical"]',
      tagName: 'link',
      identityAttr: 'rel',
      identityValue: 'canonical',
      valueAttr: 'href',
      value: metadata.canonical,
    },
  ]
}

/**
 * Apply one metadata value to its target element, returning a restore
 * closure that puts the head back exactly as it was found. The restore
 * distinguishes all four pre-existing states:
 * 1. element absent              -> the created element is removed again
 * 2. element present, attr set   -> the previous value is restored (even '')
 * 3. element present, attr missing -> the attribute is removed again
 * 4. attr present but empty      -> restored to the empty string, not removed
 */
function applyTarget(target: MetadataTarget): (() => void) | null {
  // Optional metadata that is absent must neither create nor touch elements.
  if (target.value === undefined) return null

  const existing = document.head.querySelector<
    HTMLMetaElement | HTMLLinkElement
  >(target.selector)

  if (existing) {
    const hadAttribute = existing.hasAttribute(target.valueAttr)
    const previousValue = existing.getAttribute(target.valueAttr)
    existing.setAttribute(target.valueAttr, target.value)
    return () => {
      if (hadAttribute) {
        existing.setAttribute(target.valueAttr, previousValue ?? '')
      } else {
        existing.removeAttribute(target.valueAttr)
      }
    }
  }

  const created = document.createElement(target.tagName)
  created.setAttribute(target.identityAttr, target.identityValue)
  created.setAttribute(target.valueAttr, target.value)
  document.head.appendChild(created)
  return () => {
    created.remove()
  }
}

/**
 * Set document metadata on mount (and whenever `metadata` changes), then
 * restore the exact previous head state on unmount or before re-applying.
 * Elements created by the hook are removed again; nothing leaks across
 * routes. Values only ever come from the explicit `metadata` argument —
 * never from host headers or user input — so canonical URLs stay fixed.
 */
export function usePageMetadata(metadata: PageMetadata): void {
  useEffect(() => {
    const previousTitle = document.title
    const restores: Array<() => void> = []

    document.title = metadata.title
    for (const target of buildTargets(metadata)) {
      const restore = applyTarget(target)
      if (restore) restores.push(restore)
    }

    return () => {
      document.title = previousTitle
      for (let index = restores.length - 1; index >= 0; index -= 1) {
        restores[index]()
      }
    }
  }, [metadata])
}
