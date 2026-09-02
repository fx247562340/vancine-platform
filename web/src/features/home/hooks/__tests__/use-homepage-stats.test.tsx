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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomepageStats } from '../use-homepage-stats'

// Real-handler contract regression for the homepage stats hook.
//
// The fixtures under ./fixtures are the EXACT JSON bodies the Go
// handler serves (their shape is pinned by
// controller.TestHomepageStats_WireContract_MatchesFrontendFixture,
// which asserts the live handler's keys match the fixture keys).
// The mock below stands in for @/lib/api only — the hook itself
// runs unmodified, so a regression in the bare-payload parser,
// the availability vocabulary, or the enabled gating shows up here.
//
// Critically: the handler serves the BARE payload. There is no
// {success, data} envelope on this endpoint, and these tests never
// fabricate one.

import statsFixture from './fixtures/homepage-stats.json'
import zeroFixture from './fixtures/homepage-stats-zero.json'
import partialFixture from './fixtures/homepage-stats-partial.json'
import allUnavailableFixture from './fixtures/homepage-stats-all-unavailable.json'

const getMock = vi.fn()
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  getMock.mockReset()
})

describe('useHomepageStats — real handler JSON contract', () => {
  it('parses the real handler payload into metrics', async () => {
    getMock.mockResolvedValue({ data: statsFixture })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats).toEqual({
      window_days: 30,
      successful_requests: { value: 1234, availability: 'ok' },
      processed_tokens: { value: 56789012, availability: 'ok' },
      active_vendor_count: { value: 9, availability: 'ok' },
      available_model_count: { value: 28, availability: 'ok' },
      as_of: 1788200000,
    })
  })

  it('a real zero (availability=ok, value=0) stays 0, never an em-dash', async () => {
    getMock.mockResolvedValue({ data: zeroFixture })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats?.successful_requests).toEqual({
      value: 0,
      availability: 'ok',
    })
    expect(result.current.stats?.processed_tokens.value).toBe(0)
    expect(result.current.stats?.active_vendor_count.value).toBe(0)
    expect(result.current.stats?.available_model_count.value).toBe(0)
  })

  it('one unavailable triple does not invalidate the others', async () => {
    getMock.mockResolvedValue({ data: partialFixture })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats?.successful_requests).toEqual({
      value: 482,
      availability: 'ok',
    })
    expect(result.current.stats?.processed_tokens).toEqual({
      value: 0,
      availability: 'unavailable',
    })
    expect(result.current.stats?.active_vendor_count.value).toBe(9)
  })

  it('a fully-unavailable payload keeps every tile on the em-dash', async () => {
    getMock.mockResolvedValue({ data: allUnavailableFixture })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(
      result.current.stats?.successful_requests.availability
    ).toBe('unavailable')
    expect(result.current.stats?.processed_tokens.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.active_vendor_count.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.available_model_count.availability).toBe(
      'unavailable'
    )
  })

  it('a thrown network error produces an all-unavailable payload (no error UI to the reader)', async () => {
    getMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 4000,
    })
    expect(result.current.stats?.successful_requests.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.processed_tokens.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.active_vendor_count.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.available_model_count.availability).toBe(
      'unavailable'
    )
  })

  it('enabled=false skips the network call entirely (custom homepage case)', async () => {
    getMock.mockResolvedValue({ data: statsFixture })
    const { result } = renderHook(() => useHomepageStats({ enabled: false }), {
      wrapper,
    })
    // The hook must return the loading placeholder and not fire
    // the HTTP call while disabled.
    expect(result.current.status).toBe('loading')
    expect(result.current.stats).toBeNull()
    // Give the runtime a chance to surface any stray fetch — the
    // contract is "no fetch at all".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('never calls the endpoint with ?live=1 (the public bypass was removed)', async () => {
    getMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('live=1')) {
        throw new Error('homepage stats: ?live=1 public bypass must not be used')
      }
      return Promise.resolve({ data: statsFixture })
    })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats?.successful_requests.value).toBe(1234)
  })

  it('an unknown availability state renders as unavailable, never as a number', async () => {
    // Defends the wire contract: a future backend that ships a new
    // or misspelled availability value must downgrade to the
    // em-dash, not leak a misleading number.
    getMock.mockResolvedValue({
      data: {
        ...statsFixture,
        successful_requests: { value: 999, availability: 'degraded' },
        processed_tokens: { value: 'lots', availability: 'ok' },
      },
    })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats?.successful_requests.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.successful_requests.value).toBe(0)
    // Non-numeric value with a legal availability also downgrades.
    expect(result.current.stats?.processed_tokens.availability).toBe(
      'unavailable'
    )
    // A legal 0 with availability=ok still survives.
    expect(result.current.stats?.active_vendor_count).toEqual({
      value: 9,
      availability: 'ok',
    })
  })

  it('rejects negative, decimal, NaN, and Infinity values even when availability is ok', async () => {
    getMock.mockResolvedValue({
      data: {
        ...statsFixture,
        successful_requests: { value: -1, availability: 'ok' },
        processed_tokens: { value: 1.5, availability: 'ok' },
        active_vendor_count: { value: Number.NaN, availability: 'ok' },
        available_model_count: { value: Number.POSITIVE_INFINITY, availability: 'ok' },
      },
    })
    const { result } = renderHook(() => useHomepageStats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stats?.successful_requests.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.processed_tokens.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.active_vendor_count.availability).toBe(
      'unavailable'
    )
    expect(result.current.stats?.available_model_count.availability).toBe(
      'unavailable'
    )
  })
})
