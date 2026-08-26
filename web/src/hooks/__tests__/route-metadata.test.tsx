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

import { getHomePageMetadata } from '@/features/home/lib/seo'
import { getPricingPageMetadata } from '@/features/pricing/lib/seo'
import {
  isPublicMarketingMetadataActive,
  resetMetadataRegistry,
  safeApplySystemName,
  usePageMetadata,
  type PageMetadata,
} from '@/hooks/use-page-metadata'

function clearHead(): void {
  while (document.head.firstElementChild) {
    document.head.firstElementChild.remove()
  }
  document.title = ''
}

beforeEach(() => {
  clearHead()
  act(() => {
    resetMetadataRegistry()
  })
})

describe('Home route metadata contract', () => {
  it('applies the English home page metadata to the head and acquires the lock', () => {
    const { unmount } = renderHook(
      ({ language }: { language: string }) => {
        // The Home page wires usePageMetadata exactly this way. The flag is
        // what tells the branding bootstrap in main.tsx to step aside.
        usePageMetadata(getHomePageMetadata(language), {
          publicMarketingPage: true,
        })
      },
      { initialProps: { language: 'en' } }
    )

    const expectedTitle =
      'Chinese AI Models API for Global Developers | Vancine'
    expect(document.title).toBe(expectedTitle)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(expectedTitle)
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
    ).toBe(
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.'
    )
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe('Chinese AI Models API for Global Developers')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com')
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com')

    // The lock is held while the page is mounted.
    expect(isPublicMarketingMetadataActive()).toBe(true)

    // The system branding bootstrap would call this; the title must not
    // be overwritten.
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(expectedTitle)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(expectedTitle)

    unmount()
    // Lock is released after unmount.
    expect(isPublicMarketingMetadataActive()).toBe(false)
  })

  it('keeps the English home page title as the only source of truth on /', () => {
    // Regression for the production symptom where / loaded with
    // `meta[name="title"]` still showing the system brand. The Home page
    // now drives the title through the hook, so the SPA-side copy and the
    // server-rendered <title> agree.
    const { unmount } = renderHook(() => {
      usePageMetadata(getHomePageMetadata('en'), {
        publicMarketingPage: true,
      })
    })
    const headTitleTags = document.head.querySelectorAll('meta[name="title"]')
    expect(headTitleTags).toHaveLength(1)
    expect(headTitleTags[0].getAttribute('content')).toBe(
      'Chinese AI Models API for Global Developers | Vancine'
    )
    unmount()
  })
})

describe('Pricing route metadata contract', () => {
  it('applies the English pricing page metadata to the head and acquires the lock', () => {
    const { unmount } = renderHook(
      ({ language }: { language: string }) => {
        usePageMetadata(getPricingPageMetadata(language), {
          publicMarketingPage: true,
        })
      },
      { initialProps: { language: 'en' } }
    )

    const expectedTitle = 'Chinese AI Model API Pricing | Vancine'
    expect(document.title).toBe(expectedTitle)
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe(expectedTitle)
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
    ).toBe(
      "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API."
    )
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/pricing')
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/pricing')

    expect(isPublicMarketingMetadataActive()).toBe(true)

    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(expectedTitle)

    unmount()
    expect(isPublicMarketingMetadataActive()).toBe(false)
  })
})

describe('route metadata — non-public-marketing pages do not block branding', () => {
  // A page that calls usePageMetadata WITHOUT the publicMarketingPage flag
  // is the canonical pattern for login pages, dashboard pages, and any
  // authenticated surface that wants the admin's system name as its
  // title. The system branding bootstrap must still be able to write
  // that name while such a page is mounted.
  it('releases the lock when only a non-public-marketing page is mounted', () => {
    const dashboardMetadata: PageMetadata = {
      title: 'Dashboard',
      description: 'Admin overview.',
      ogTitle: 'Dashboard',
      ogDescription: 'Admin overview.',
      ogUrl: 'https://vancine.com/dashboard',
      canonical: 'https://vancine.com/dashboard',
    }
    const { unmount } = renderHook(() => usePageMetadata(dashboardMetadata))
    expect(isPublicMarketingMetadataActive()).toBe(false)

    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe('Acme Cloud')
    expect(
      document.head.querySelector('meta[name="title"]')?.getAttribute('content')
    ).toBe('Acme Cloud')

    unmount()
  })
})
