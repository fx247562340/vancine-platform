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
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  isPublicMarketingMetadataActive,
  resetMetadataRegistry,
  safeApplySystemName,
  usePageMetadata,
  type PageMetadata,
} from '@/hooks/use-page-metadata'

const BASE_METADATA: PageMetadata = {
  title: 'Kimi K3 API for Coding Agents | Vancine',
  description: 'Connect coding agents to Kimi K3 with one API key.',
  ogTitle: 'Kimi K3 for Coding Agents',
  ogDescription: 'One OpenAI-compatible key for coding agents.',
  ogUrl: 'https://vancine.com/kimi-k3-api',
  canonical: 'https://vancine.com/kimi-k3-api',
}

const OTHER_METADATA: PageMetadata = {
  title: 'Seedance API | Vancine',
  description: 'Video generation through one API key.',
  ogTitle: 'Seedance for video',
  ogDescription: 'One key for video generation.',
  ogUrl: 'https://vancine.com/seedance-api',
  canonical: 'https://vancine.com/seedance-api',
}

function headSnapshot(): string[] {
  return [...document.head.children].map((child) =>
    child.outerHTML.split('>').slice(0, -1).join('>')
  )
}

beforeEach(() => {
  // Every case starts from a bare head and a known title; nothing leaks
  // between cases.
  // Removing while iterating a live collection would skip nodes, so drain
  // the head explicitly.
  while (document.head.firstElementChild) {
    document.head.firstElementChild.remove()
  }
  document.title = 'Baseline Title'
  // Clear the module-level lock between cases so one test cannot leak
  // its public-marketing lock into the next case.
  act(() => {
    resetMetadataRegistry()
  })
})

describe('usePageMetadata', () => {
  it('sets title, meta tags, og:url, and canonical on mount', () => {
    renderHook(() => usePageMetadata(BASE_METADATA))

    expect(document.title).toBe(BASE_METADATA.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(BASE_METADATA.title)
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
    ).toBe(BASE_METADATA.description)
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe(BASE_METADATA.ogTitle)
    expect(
      document.head
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content')
    ).toBe(BASE_METADATA.ogDescription)
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe(BASE_METADATA.ogUrl)
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe(BASE_METADATA.canonical)
  })

  it('manages Twitter metadata with identical cleanup when provided', () => {
    const metadata: PageMetadata = {
      ...BASE_METADATA,
      twitterTitle: 'Kimi K3 for agents',
      twitterDescription: 'One key, many coding agents.',
    }
    const { unmount } = renderHook(() => usePageMetadata(metadata))

    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe(metadata.twitterTitle)
    expect(
      document.head
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute('content')
    ).toBe(metadata.twitterDescription)

    unmount()
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull()
    expect(
      document.head.querySelector('meta[name="twitter:description"]')
    ).toBeNull()
  })

  it('does not touch Twitter tags when the metadata omits them', () => {
    const existing = document.createElement('meta')
    existing.setAttribute('name', 'twitter:title')
    existing.setAttribute('content', 'pre-existing')
    document.head.appendChild(existing)

    renderHook(() => usePageMetadata(BASE_METADATA))

    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('pre-existing')
  })

  it('removes elements it created and restores the prior title on unmount', () => {
    const before = headSnapshot()
    const { unmount } = renderHook(() => usePageMetadata(BASE_METADATA))
    expect(headSnapshot()).not.toEqual(before)

    unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull()
    expect(
      document.head.querySelector('meta[property="og:description"]')
    ).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(headSnapshot()).toEqual(before)
  })

  it('restores previously existing values exactly on unmount', () => {
    const description = document.createElement('meta')
    description.setAttribute('name', 'description')
    description.setAttribute('content', 'original description')
    const canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    canonical.setAttribute('href', 'https://vancine.com/original')
    document.head.append(description, canonical)
    document.title = 'Original Page'

    const { unmount } = renderHook(() => usePageMetadata(BASE_METADATA))
    expect(description.getAttribute('content')).toBe(BASE_METADATA.description)

    unmount()
    expect(document.title).toBe('Original Page')
    expect(description.getAttribute('content')).toBe('original description')
    expect(canonical.getAttribute('href')).toBe('https://vancine.com/original')
  })

  it('restores an element that existed without the attribute by removing the attribute', () => {
    const description = document.createElement('meta')
    description.setAttribute('name', 'description')
    document.head.appendChild(description)

    const { unmount } = renderHook(() => usePageMetadata(BASE_METADATA))
    expect(description.getAttribute('content')).toBe(BASE_METADATA.description)

    unmount()
    expect(description.isConnected).toBe(true)
    expect(description.hasAttribute('content')).toBe(false)
  })

  it('restores an empty-string attribute value instead of removing it', () => {
    const description = document.createElement('meta')
    description.setAttribute('name', 'description')
    description.setAttribute('content', '')
    document.head.appendChild(description)

    const { unmount } = renderHook(() => usePageMetadata(BASE_METADATA))
    expect(description.getAttribute('content')).toBe(BASE_METADATA.description)

    unmount()
    expect(description.hasAttribute('content')).toBe(true)
    expect(description.getAttribute('content')).toBe('')
  })

  it('updates the head when the metadata changes and leaves no leak after unmount', () => {
    const before = headSnapshot()
    const { rerender, unmount } = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: BASE_METADATA } }
    )

    rerender({ metadata: OTHER_METADATA })
    expect(document.title).toBe(OTHER_METADATA.title)
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
    ).toBe(OTHER_METADATA.description)
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe(OTHER_METADATA.canonical)
    // No duplicate tags accumulate across metadata changes.
    expect(
      document.head.querySelectorAll('link[rel="canonical"]')
    ).toHaveLength(1)

    unmount()
    expect(document.title).toBe('Baseline Title')
    expect(headSnapshot()).toEqual(before)
  })
})

// Lock-concurrency and deferred-system-name contracts live in
// owner-lifecycle.test.tsx ("deferred system name on final unlock");
// this block keeps only the single-owner lock basics and the
// safeApplySystemName refusal contract the branding IIFE depends on.
describe('usePageMetadata — public marketing lock', () => {
  it('does not activate the public marketing lock by default', () => {
    const { unmount } = renderHook(() => usePageMetadata(BASE_METADATA))
    expect(isPublicMarketingMetadataActive()).toBe(false)
    unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
  })

  it('activates the lock while a public marketing page is mounted and releases on unmount', () => {
    const { unmount } = renderHook(() =>
      usePageMetadata(BASE_METADATA, { publicMarketingPage: true })
    )
    expect(isPublicMarketingMetadataActive()).toBe(true)

    unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
  })

  it('does not overwrite title or meta[name="title"] while the lock is held', () => {
    const { unmount: unmountHook } = renderHook(() =>
      usePageMetadata(BASE_METADATA, { publicMarketingPage: true })
    )
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(BASE_METADATA.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(BASE_METADATA.title)

    unmountHook()
    // After the route unmounts (e.g. user navigates to /dashboard), the
    // branding IIFE may legitimately overwrite the title with the system
    // name.
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe('Acme Cloud')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud')
  })
})
