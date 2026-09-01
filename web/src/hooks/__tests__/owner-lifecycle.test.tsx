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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getHomePageMetadata } from '@/features/home/lib/seo'
import { getKimiK3PageMetadata } from '@/features/kimi-k3-api/lib/landing'
import { getPricingPageMetadata } from '@/features/pricing/lib/seo'
import { getSeedancePageMetadata } from '@/features/seedance-api/lib/landing'
import {
  isPublicMarketingMetadataActive,
  resetMetadataRegistry,
  safeApplySystemName,
  usePageMetadata,
  type PageMetadata,
} from '@/hooks/use-page-metadata'

const PAGE_A: PageMetadata = {
  title: 'Page A — Vancine',
  description: 'Description A',
  ogTitle: 'Page A',
  ogDescription: 'OG Description A',
  ogUrl: 'https://vancine.com/a',
  canonical: 'https://vancine.com/a',
}

const PAGE_A_UPDATED: PageMetadata = {
  title: 'Page A (updated) — Vancine',
  description: 'Description A updated',
  ogTitle: 'Page A updated',
  ogDescription: 'OG Description A updated',
  ogUrl: 'https://vancine.com/a-updated',
  canonical: 'https://vancine.com/a-updated',
}

const PAGE_B: PageMetadata = {
  title: 'Page B — Vancine',
  description: 'Description B',
  ogTitle: 'Page B',
  ogDescription: 'OG Description B',
  ogUrl: 'https://vancine.com/b',
  canonical: 'https://vancine.com/b',
}

const PAGE_C: PageMetadata = {
  title: 'Page C — Vancine',
  description: 'Description C',
  ogTitle: 'Page C',
  ogDescription: 'OG Description C',
  ogUrl: 'https://vancine.com/c',
  canonical: 'https://vancine.com/c',
}

const PAGE_WITH_TWITTER: PageMetadata = {
  ...PAGE_A,
  twitterTitle: 'Twitter Title A',
  twitterDescription: 'Twitter Description A',
}

function clearHead(): void {
  while (document.head.firstElementChild) {
    document.head.firstElementChild.remove()
  }
  document.title = ''
}

function headElementsBySelector(): string[] {
  return [...document.head.children]
    .map((c) => c.outerHTML.replaceAll(/\s+/g, ' ').trim())
    .sort()
}

function descriptionContent(): string | null {
  return (
    document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute('content') ?? null
  )
}

function canonicalHref(): string | null {
  return (
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute('href') ?? null
  )
}

beforeEach(() => {
  clearHead()
  document.title = 'Baseline Title'
  act(() => {
    resetMetadataRegistry()
  })
})

afterEach(() => {
  clearHead()
  act(() => {
    resetMetadataRegistry()
  })
})

describe('owner identity is a token, not the metadata reference', () => {
  it('two hooks with identical metadata: first unmount keeps the second intact', () => {
    const shared = PAGE_A
    const first = renderHook(() => usePageMetadata(shared))
    const second = renderHook(() => usePageMetadata(shared))

    expect(document.title).toBe(PAGE_A.title)
    expect(descriptionContent()).toBe(PAGE_A.description)
    expect(canonicalHref()).toBe(PAGE_A.canonical)

    first.unmount()
    // The second hook is still mounted; the first's cleanup must NOT
    // have touched the head.
    expect(document.title).toBe(PAGE_A.title)
    expect(descriptionContent()).toBe(PAGE_A.description)
    expect(canonicalHref()).toBe(PAGE_A.canonical)
    expect(
      document.head.querySelectorAll('link[rel="canonical"]')
    ).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="title"]')).toHaveLength(1)

    second.unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('mount order is independent of metadata updates', () => {
  // A metadata update mutates the owner record IN PLACE. It must not
  // remove / re-insert the owner, which would move it to the end of
  // the mount order and make it win over pages that mounted later.
  it('A mounts, B mounts, A metadata updates: B is still displayed', () => {
    const a = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: PAGE_A } }
    )
    const b = renderHook(() => usePageMetadata(PAGE_B))
    expect(document.title).toBe(PAGE_B.title)

    // A's metadata changes (e.g. language switch on page A while page B
    // is on top). B must remain the displayed owner.
    a.rerender({ metadata: PAGE_A_UPDATED })
    expect(document.title).toBe(PAGE_B.title)
    expect(descriptionContent()).toBe(PAGE_B.description)
    expect(canonicalHref()).toBe(PAGE_B.canonical)
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe(PAGE_B.ogUrl)

    b.unmount()
  })

  it('after B unmounts, A displays its UPDATED metadata', () => {
    const a = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: PAGE_A } }
    )
    const b = renderHook(() => usePageMetadata(PAGE_B))
    a.rerender({ metadata: PAGE_A_UPDATED })
    expect(document.title).toBe(PAGE_B.title)

    b.unmount()
    // A survives with the updated record; the updated values win.
    expect(document.title).toBe(PAGE_A_UPDATED.title)
    expect(descriptionContent()).toBe(PAGE_A_UPDATED.description)
    expect(canonicalHref()).toBe(PAGE_A_UPDATED.canonical)
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe(PAGE_A_UPDATED.ogUrl)

    a.unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('metadata updates never disturb the public-marketing lock count', () => {
    const a = renderHook(
      ({ metadata }: { metadata: PageMetadata }) =>
        usePageMetadata(metadata, { publicMarketingPage: true }),
      { initialProps: { metadata: PAGE_A } }
    )
    expect(isPublicMarketingMetadataActive()).toBe(true)
    a.rerender({ metadata: PAGE_A_UPDATED })
    expect(isPublicMarketingMetadataActive()).toBe(true)
    expect(document.title).toBe(PAGE_A_UPDATED.title)
    a.unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
  })
})

describe('A→B→C mount, A→C unmount leaves B; B unmount restores baseline', () => {
  it('last surviving owner is B; final unmount restores every baseline tag exactly', () => {
    const description = document.createElement('meta')
    description.setAttribute('name', 'description')
    description.setAttribute('content', 'baseline description')
    const canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    canonical.setAttribute('href', 'https://vancine.com/baseline')
    document.head.append(description, canonical)
    document.title = 'Baseline Title (with elements)'

    const baselineBefore = headElementsBySelector()

    const a = renderHook(() => usePageMetadata(PAGE_A))
    const b = renderHook(() => usePageMetadata(PAGE_B))
    const c = renderHook(() => usePageMetadata(PAGE_C))

    expect(document.title).toBe(PAGE_C.title)
    expect(descriptionContent()).toBe(PAGE_C.description)
    expect(canonicalHref()).toBe(PAGE_C.canonical)

    a.unmount()
    expect(document.title).toBe(PAGE_C.title)
    expect(descriptionContent()).toBe(PAGE_C.description)

    c.unmount()
    // Only B survives; the registry deterministically re-applies B.
    expect(document.title).toBe(PAGE_B.title)
    expect(descriptionContent()).toBe(PAGE_B.description)
    expect(canonicalHref()).toBe(PAGE_B.canonical)
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe(PAGE_B.ogTitle)
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe(PAGE_B.ogUrl)
    expect(
      document.head.querySelectorAll('link[rel="canonical"]')
    ).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="title"]')).toHaveLength(1)

    b.unmount()
    // Registry empty: head returns EXACTLY to the baseline.
    expect(document.title).toBe('Baseline Title (with elements)')
    expect(descriptionContent()).toBe('baseline description')
    expect(canonicalHref()).toBe('https://vancine.com/baseline')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull()
    expect(
      document.head.querySelector('meta[property="og:description"]')
    ).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()
    expect(headElementsBySelector()).toEqual(baselineBefore)
  })
})

describe('metadata update + final unmount restores baseline', () => {
  it('rerender with new metadata then unmount: head is exactly the baseline', () => {
    const description = document.createElement('meta')
    description.setAttribute('name', 'description')
    description.setAttribute('content', 'baseline description')
    const canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    canonical.setAttribute('href', 'https://vancine.com/baseline')
    document.head.append(description, canonical)
    document.title = 'Baseline Title'

    const baselineBefore = headElementsBySelector()

    const { rerender, unmount } = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: PAGE_A } }
    )
    expect(document.title).toBe(PAGE_A.title)

    rerender({ metadata: PAGE_B })
    expect(document.title).toBe(PAGE_B.title)
    expect(descriptionContent()).toBe(PAGE_B.description)
    expect(canonicalHref()).toBe(PAGE_B.canonical)

    rerender({ metadata: PAGE_C })
    expect(document.title).toBe(PAGE_C.title)

    unmount()
    expect(document.title).toBe('Baseline Title')
    expect(descriptionContent()).toBe('baseline description')
    expect(canonicalHref()).toBe('https://vancine.com/baseline')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(headElementsBySelector()).toEqual(baselineBefore)
  })
})

describe('optional Twitter fields never carry over between owners', () => {
  it('an owner without an optional field clears the previous owner value', () => {
    const first = renderHook(() => usePageMetadata(PAGE_WITH_TWITTER))
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe(PAGE_WITH_TWITTER.twitterTitle)
    expect(
      document.head
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute('content')
    ).toBe(PAGE_WITH_TWITTER.twitterDescription)

    // The newest owner has no Twitter fields; the previous owner's
    // values must NOT linger in the head.
    const second = renderHook(() => usePageMetadata(PAGE_B))
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull()
    expect(
      document.head.querySelector('meta[name="twitter:description"]')
    ).toBeNull()

    second.unmount()
    first.unmount()
    expect(document.title).toBe('Baseline Title')
  })

  it('clearing an optional field restores the baseline value when the baseline had one', () => {
    const preExisting = document.createElement('meta')
    preExisting.setAttribute('name', 'twitter:title')
    preExisting.setAttribute('content', 'baseline twitter')
    document.head.appendChild(preExisting)

    const first = renderHook(() => usePageMetadata(PAGE_WITH_TWITTER))
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe(PAGE_WITH_TWITTER.twitterTitle)

    const second = renderHook(() => usePageMetadata(PAGE_B))
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('baseline twitter')

    second.unmount()
    first.unmount()
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('baseline twitter')
  })

  it('metadata update that drops an optional field clears it in place', () => {
    const { rerender, unmount } = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: PAGE_WITH_TWITTER } }
    )
    expect(
      document.head.querySelector('meta[name="twitter:title"]')
    ).not.toBeNull()

    rerender({ metadata: PAGE_A })
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull()
    expect(
      document.head.querySelector('meta[name="twitter:description"]')
    ).toBeNull()
    // The required fields are still applied.
    expect(document.title).toBe(PAGE_A.title)

    unmount()
    expect(document.title).toBe('Baseline Title')
  })
})

describe('baseline removal only touches registry-created nodes', () => {
  it('does not remove same-selector elements inserted by other code while the baseline says absent', () => {
    const a = renderHook(() => usePageMetadata(PAGE_WITH_TWITTER))
    const registryNode = document.head.querySelector(
      'meta[name="twitter:title"]'
    )
    expect(registryNode).not.toBeNull()

    // Other code replaces the registry-created node during the
    // lifecycle. The baseline says twitter:title was absent, but the
    // final restore must NOT remove the third-party replacement.
    registryNode?.remove()
    const thirdParty = document.createElement('meta')
    thirdParty.setAttribute('name', 'twitter:title')
    thirdParty.setAttribute('content', 'third-party')
    document.head.appendChild(thirdParty)

    a.unmount()
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBe(
      thirdParty
    )
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('third-party')
  })

  it('still removes its own created nodes on final unmount', () => {
    const a = renderHook(() => usePageMetadata(PAGE_WITH_TWITTER))
    expect(
      document.head.querySelector('meta[name="twitter:title"]')
    ).not.toBeNull()
    a.unmount()
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull()
  })
})

describe('public marketing page metadata switches', () => {
  // Home → Kimi K3 and Pricing → Seedance transitions. The newest page
  // owns the head during the overlap; every managed tag — including the
  // Twitter pair — must reflect the new page with no leftovers from the
  // previous one.
  it('Home → Kimi K3: the head fully reflects Kimi K3 with no Home leftovers', () => {
    const home = renderHook(() =>
      usePageMetadata(getHomePageMetadata('en'), { publicMarketingPage: true })
    )
    expect(document.title).toBe(
      'Chinese Frontier & Fast AI Models API | Vancine'
    )

    const kimi = renderHook(() =>
      usePageMetadata(getKimiK3PageMetadata('en'), {
        publicMarketingPage: true,
      })
    )

    expect(document.title).toBe('Kimi K3 API for Coding Agents | Vancine')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Kimi K3 API for Coding Agents | Vancine')
    expect(descriptionContent()).toBe(
      'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.'
    )
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe('Kimi K3 for Coding Agents')
    expect(
      document.head
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content')
    ).toBe(
      'Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier models.'
    )
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/kimi-k3-api')
    expect(canonicalHref()).toBe('https://vancine.com/kimi-k3-api')
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('Kimi K3 API for Coding Agents')
    expect(
      document.head
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute('content')
    ).toBe(
      'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.'
    )

    home.unmount()
    // Kimi still owns the head after Home unmounts.
    expect(document.title).toBe('Kimi K3 API for Coding Agents | Vancine')
    expect(canonicalHref()).toBe('https://vancine.com/kimi-k3-api')
    expect(isPublicMarketingMetadataActive()).toBe(true)

    kimi.unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('meta[name="title"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('Pricing → Seedance: the head fully reflects Seedance with no Pricing leftovers', () => {
    const pricing = renderHook(() =>
      usePageMetadata(getPricingPageMetadata('en'), {
        publicMarketingPage: true,
      })
    )
    expect(document.title).toBe('Chinese AI Model API Pricing | Vancine')

    const seedance = renderHook(() =>
      usePageMetadata(getSeedancePageMetadata('en'), {
        publicMarketingPage: true,
      })
    )

    expect(document.title).toBe(
      'Seedance 2.5 API for Async Video Generation | Vancine'
    )
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Seedance 2.5 API for Async Video Generation | Vancine')
    expect(descriptionContent()).toBe(
      'Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.'
    )
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe('Seedance 2.5 for Async Video Generation')
    expect(
      document.head
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content')
    ).toBe(
      'Submit, poll, and retrieve Doubao-Seedance-2.5 video tasks through one API key and documented endpoints.'
    )
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/seedance-api')
    expect(canonicalHref()).toBe('https://vancine.com/seedance-api')
    expect(
      document.head
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute('content')
    ).toBe('Seedance 2.5 API for Async Video Generation')
    expect(
      document.head
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute('content')
    ).toBe(
      'Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.'
    )

    pricing.unmount()
    expect(document.title).toBe(
      'Seedance 2.5 API for Async Video Generation | Vancine'
    )
    expect(canonicalHref()).toBe('https://vancine.com/seedance-api')
    expect(isPublicMarketingMetadataActive()).toBe(true)

    seedance.unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('deferred system name on final unlock', () => {
  it('end-to-end: marketing mount → status → unlock → final title is the queued system name', () => {
    document.title = 'SSR Title'

    const home = renderHook(() =>
      usePageMetadata(PAGE_A, { publicMarketingPage: true })
    )
    expect(isPublicMarketingMetadataActive()).toBe(true)
    expect(document.title).toBe(PAGE_A.title)

    safeApplySystemName('Acme Cloud (admin-configured)')
    expect(document.title).toBe(PAGE_A.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(PAGE_A.title)

    home.unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
    expect(document.title).toBe('Acme Cloud (admin-configured)')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud (admin-configured)')
  })

  it('keeps the most recent queued name and applies it only after the last marketing owner unmounts', () => {
    const a = renderHook(() =>
      usePageMetadata(PAGE_A, { publicMarketingPage: true })
    )
    const b = renderHook(() =>
      usePageMetadata(PAGE_B, { publicMarketingPage: true })
    )
    safeApplySystemName('Acme Cloud')
    safeApplySystemName('Acme Cloud v2')
    safeApplySystemName('Acme Cloud v3')
    expect(document.title).toBe(PAGE_B.title)

    a.unmount()
    // B is still mounted — the queued name must still be refused.
    expect(document.title).toBe(PAGE_B.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(PAGE_B.title)

    b.unmount()
    expect(document.title).toBe('Acme Cloud v3')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud v3')
  })
})

describe('registry-created node cleanup is by stored node identity', () => {
  // Baseline absent for the selector. The registry creates node A.
  // Other code then inserts node B at the SAME selector, placed BEFORE
  // A (insertBefore). The registry must keep addressing its own node
  // A by its stored reference — updates must never write into B, and
  // the final restore must remove A by reference even though a
  // querySelector for the selector now returns B first.
  it('insertBefore(B, A): updates write into A, final unmount removes A and keeps B', () => {
    const { rerender, unmount } = renderHook(
      ({ metadata }: { metadata: PageMetadata }) => usePageMetadata(metadata),
      { initialProps: { metadata: PAGE_WITH_TWITTER } }
    )
    const registryNode = document.head.querySelector<HTMLMetaElement>(
      'meta[name="twitter:title"]'
    )
    expect(registryNode).not.toBeNull()
    expect(registryNode?.getAttribute('content')).toBe(
      PAGE_WITH_TWITTER.twitterTitle
    )

    // Third-party node B at the same selector, inserted BEFORE A.
    const thirdParty = document.createElement('meta')
    thirdParty.setAttribute('name', 'twitter:title')
    thirdParty.setAttribute('content', 'third-party')
    document.head.insertBefore(thirdParty, registryNode)
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBe(
      thirdParty
    )

    // Metadata updates must write into the registry node A, never into B.
    rerender({
      metadata: { ...PAGE_WITH_TWITTER, twitterTitle: 'Twitter Title A v2' },
    })
    expect(thirdParty.isConnected).toBe(true)
    expect(thirdParty.getAttribute('content')).toBe('third-party')
    expect(registryNode?.isConnected).toBe(true)
    expect(registryNode?.getAttribute('content')).toBe('Twitter Title A v2')
    expect(
      document.head.querySelectorAll('meta[name="twitter:title"]')
    ).toHaveLength(2)

    unmount()
    // Final restore removes A by stored reference; B is untouched and
    // remains the only node at the selector.
    expect(registryNode?.isConnected).toBe(false)
    expect(thirdParty.isConnected).toBe(true)
    expect(thirdParty.getAttribute('content')).toBe('third-party')
    const remaining = document.head.querySelectorAll(
      'meta[name="twitter:title"]'
    )
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toBe(thirdParty)
  })
})

describe('publicMarketingPage flag flip true → false', () => {
  it('last unlock applies the queued system name as final title and meta[name=title]', () => {
    const { rerender, unmount } = renderHook(
      ({ marketing }: { marketing: boolean }) =>
        usePageMetadata(PAGE_A, { publicMarketingPage: marketing }),
      { initialProps: { marketing: true } }
    )
    expect(isPublicMarketingMetadataActive()).toBe(true)
    expect(document.title).toBe(PAGE_A.title)

    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(PAGE_A.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(PAGE_A.title)

    // The page opts out of the marketing contract. This is the final
    // unlock: the queued system name must become the final title and
    // meta[name="title"] — the owner's title must NOT be re-applied
    // afterwards.
    rerender({ marketing: false })
    expect(isPublicMarketingMetadataActive()).toBe(false)
    expect(document.title).toBe('Acme Cloud')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud')

    unmount()
    expect(document.title).toBe('Baseline Title')
  })

  it('with several marketing owners the queued name applies only when the count reaches zero', () => {
    const a = renderHook(() =>
      usePageMetadata(PAGE_A, { publicMarketingPage: true })
    )
    const b = renderHook(
      ({ marketing }: { marketing: boolean }) =>
        usePageMetadata(PAGE_B, { publicMarketingPage: marketing }),
      { initialProps: { marketing: true } }
    )
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(PAGE_B.title)

    // B opts out but A is still marketing: count 2 → 1, no flush.
    b.rerender({ marketing: false })
    expect(isPublicMarketingMetadataActive()).toBe(true)
    expect(document.title).toBe(PAGE_B.title)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(PAGE_B.title)

    // A unmounts: count 1 → 0, the queued name is applied last.
    a.unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
    expect(document.title).toBe('Acme Cloud')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud')

    b.unmount()
    expect(document.title).toBe('Baseline Title')
  })
})
