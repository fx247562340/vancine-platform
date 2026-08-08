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
})
