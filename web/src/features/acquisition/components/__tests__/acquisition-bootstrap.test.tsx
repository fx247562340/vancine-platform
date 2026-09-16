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
/**
 * AcquisitionBootstrap behavior tests. The component is exercised with the
 * real acquisition module (only fetch is mocked). vi.resetModules + dynamic
 * import gives every test a fresh per-page-load module state.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type FetchCall = {
  url: string
  init?: RequestInit
  body: Record<string, unknown> | null
  /** Explicit completion signal for this request. */
  completed: Promise<void>
}

let fetchCalls: FetchCall[] = []

beforeEach(() => {
  vi.resetModules()
  fetchCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const rawBody = init?.body
      let markCompleted!: () => void
      const completed = new Promise<void>((resolve) => {
        markCompleted = resolve
      })
      fetchCalls.push({
        url: String(url),
        init,
        body: typeof rawBody === 'string' ? JSON.parse(rawBody) : null,
        completed,
      })
      const response = new Response(null, { status: 200 })
      markCompleted()
      return response
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

describe('AcquisitionBootstrap', () => {
  it('renders no visible UI', async () => {
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

    const { container } = render(<AcquisitionBootstrap />)

    expect(container.innerHTML).toBe('')
  })

  it('sends exactly one landing_view under React.StrictMode', async () => {
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

    render(
      <StrictMode>
        <AcquisitionBootstrap />
      </StrictMode>
    )

    await waitFor(() => expect(fetchCalls).toHaveLength(1))
    // Even after the single request fully completes, no second call arrives.
    await fetchCalls[0].completed
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('/api/acquisition/touch')
    expect(fetchCalls[0].body).toMatchObject({ event: 'landing_view' })
  })

  it('does not resend landing_view after unmount and remount', async () => {
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

    const first = render(<AcquisitionBootstrap />)
    await waitFor(() => expect(fetchCalls).toHaveLength(1))
    await fetchCalls[0].completed
    first.unmount()

    // The remounted effect runs synchronously during commit and hits the
    // module's per-page-load dedupe, so no new request can be recorded.
    render(<AcquisitionBootstrap />)

    expect(fetchCalls).toHaveLength(1)
  })

  it('captures allowlisted UTM and the landing path from the current URL', async () => {
    window.history.pushState(
      {},
      '',
      '/pricing?utm_source=hn&utm_medium=social&fbclid=leak&aff=7'
    )
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

    render(<AcquisitionBootstrap />)

    await waitFor(() => expect(fetchCalls).toHaveLength(1))
    expect(fetchCalls[0].body).toEqual({
      event: 'landing_view',
      utm_source: 'hn',
      utm_medium: 'social',
      landing_path: '/pricing',
    })
  })

  // -------------------------------------------------------------------------
  // Internal admin paths are not acquisition landings. Recording them would
  // leak an internal, unlisted path into first-party attribution and pollute
  // the funnel, so the bootstrap must not call captureLandingView at all.
  // The effect runs synchronously during commit and postTouch calls fetch
  // synchronously, so a zero-length assertion right after render is the same
  // technique the remount test above uses to prove "no second request".
  // -------------------------------------------------------------------------

  const internalPathCases = [
    '/acquisition-funnel',
    '/acquisition-funnel/',
    '/acquisition-funnel?utm_source=hn&utm_medium=social',
    '/acquisition-funnel/?redirect=%2Fpricing',
  ]

  for (const path of internalPathCases) {
    it(`records no first-party touch for the internal admin path ${path}`, async () => {
      window.history.pushState({}, '', path)
      const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

      render(
        <StrictMode>
          <AcquisitionBootstrap />
        </StrictMode>
      )

      expect(fetchCalls).toHaveLength(0)
      // Precise negative assertion on the endpoint itself: no landing_view
      // may ever be posted from an internal admin path.
      expect(
        fetchCalls.filter((call) => call.url === '/api/acquisition/touch')
      ).toHaveLength(0)
    })
  }

  it('still records exactly one landing_view for ordinary public pages', async () => {
    for (const path of ['/', '/pricing']) {
      window.history.pushState({}, '', path)
      fetchCalls = []
      vi.resetModules()
      const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

      render(<AcquisitionBootstrap />)

      await waitFor(() => expect(fetchCalls).toHaveLength(1))
      expect(fetchCalls[0].url).toBe('/api/acquisition/touch')
      expect(fetchCalls[0].body).toMatchObject({ event: 'landing_view' })
      cleanup()
    }
  })

  // Regression pinned by the local browser matrix: the router resolves the
  // internal-path redirect (anonymous -> /sign-in, non-admin -> /403) BEFORE
  // the root tree mounts, so an effect that reads window.location.pathname
  // sees the post-redirect public path and records a landing_view for what is
  // really a bounce off an internal admin URL. The guard must use the initial
  // pathname of the document load instead.
  it('records no touch when the router redirects away from the internal path before render', async () => {
    // The document load starts on the internal path: the module captures it
    // at evaluation time.
    window.history.pushState({}, '', '/acquisition-funnel')
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

    // The router then redirects to a public path before the tree mounts.
    window.history.pushState({}, '', '/sign-in?redirect=%2Facquisition-funnel')

    render(
      <StrictMode>
        <AcquisitionBootstrap />
      </StrictMode>
    )

    expect(fetchCalls).toHaveLength(0)
    expect(
      fetchCalls.filter((call) => call.url === '/api/acquisition/touch')
    ).toHaveLength(0)
  })

  // Percent-encoded internal document paths: the server decodes URL.Path and
  // serves the private shell, so the browser-side guard must classify the same
  // URL as internal. Without decoding, the post-redirect pathname (/sign-in or
  // /403) would look public and a landing_view would be recorded for a bounce
  // off an internal admin URL.
  const encodedInternalCases: Array<{ initial: string; redirected: string }> = [
    {
      initial: '/%61cquisition-funnel',
      redirected: '/sign-in?redirect=%2F%61cquisition-funnel',
    },
    { initial: '/%61cquisition-funnel', redirected: '/403' },
    { initial: '/acquisition%2Dfunnel', redirected: '/sign-in' },
    { initial: '/acquisition%2Dfunnel/', redirected: '/403' },
    {
      initial: '/%61cquisition%2Dfunnel?utm_source=hn',
      redirected: '/sign-in',
    },
    { initial: '/acquisition-funnel%2F', redirected: '/403' },
  ]

  for (const testCase of encodedInternalCases) {
    it(`records no touch for the encoded internal document path ${testCase.initial} redirecting to ${testCase.redirected}`, async () => {
      window.history.pushState({}, '', testCase.initial)
      const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')

      // The router resolves the redirect before the root tree mounts.
      window.history.pushState({}, '', testCase.redirected)

      render(
        <StrictMode>
          <AcquisitionBootstrap />
        </StrictMode>
      )

      expect(fetchCalls).toHaveLength(0)
      expect(
        fetchCalls.filter((call) => call.url === '/api/acquisition/touch')
      ).toHaveLength(0)
    })
  }

  it('still records one landing_view when an encoded PUBLIC path redirects', async () => {
    // Negative control for the encoding rule: a double-encoded internal path
    // is a public unknown SPA path on both sides, so normal capture applies.
    window.history.pushState({}, '', '/%2561cquisition-funnel')
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')
    window.history.pushState({}, '', '/sign-in')

    render(<AcquisitionBootstrap />)

    await waitFor(() => expect(fetchCalls).toHaveLength(1))
    expect(fetchCalls[0].url).toBe('/api/acquisition/touch')
    expect(fetchCalls[0].body).toMatchObject({ event: 'landing_view' })
  })

  it('still records a landing_view for a public document load that later navigates internally', async () => {
    // Mirror image of the regression above: a public initial pathname keeps
    // the normal capture even if the SPA later moves to another route.
    window.history.pushState({}, '', '/pricing')
    const { AcquisitionBootstrap } = await import('../acquisition-bootstrap')
    window.history.pushState({}, '', '/sign-up')

    render(<AcquisitionBootstrap />)

    await waitFor(() => expect(fetchCalls).toHaveLength(1))
    expect(fetchCalls[0].body).toMatchObject({ event: 'landing_view' })
  })
})
