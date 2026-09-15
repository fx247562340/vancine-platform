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
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsI18nProvider } from '../i18n/docs-i18n'
import { getHermesChatCommand } from '../lib/agents'
import { DOCS_FALLBACK_TEXT_MODEL } from '../lib/example-generation'
import DocsAgentDetailPage from '../pages/agent-detail'
import {
  EN_DOCS,
  clearDocsBundle,
  initTestI18n,
  setDocsBundle,
} from './test-i18n'
import { renderWithProviders } from './test-utils'

vi.mock('@/features/pricing/api', () => ({
  getPricing: vi.fn(),
}))

import { getPricing } from '@/features/pricing/api'

const BASE_URL = 'https://vancine.com/v1'

/**
 * The Hermes call example must track the live catalog: the resolved
 * id when the catalog answers, and exactly the shared verified
 * fallback id when it cannot. Both retired ids — deepseek-flash and
 * its distinct replacement deepseek-v4-flash — must never surface.
 */

function pricingPayload(modelNames: string[]) {
  return {
    success: true,
    data: modelNames.map((name) => ({
      model_name: name,
      vendor_name: 'Vancine',
      description: '',
      tags: '',
      supported_endpoint_types: ['openai'],
    })),
  }
}

async function renderHermesGuide() {
  const result = renderWithProviders(
    <DocsI18nProvider>
      <DocsAgentDetailPage tool='hermes' baseUrl={BASE_URL} />
    </DocsI18nProvider>
  )
  await screen.findByRole(
    'heading',
    { name: /Hermes Agent setup guide/ },
    { timeout: 3000 }
  )
  return result
}

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
})

afterEach(() => {
  clearDocsBundle('en')
  vi.mocked(getPricing).mockReset()
})

describe('Hermes call example follows the live catalog', () => {
  it('uses the live-catalog recommended model id when the catalog resolves', async () => {
    vi.mocked(getPricing).mockResolvedValue(
      pricingPayload(['kimi-k3', 'glm-5.1']) as never
    )
    const { container } = await renderHermesGuide()

    const liveCommand = getHermesChatCommand('kimi-k3')
    expect(
      await screen.findByText(liveCommand, {}, { timeout: 3000 })
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain(DOCS_FALLBACK_TEXT_MODEL)
  })

  it('falls back to the verified deepseek-v4.1-flash id when the catalog fails', async () => {
    vi.mocked(getPricing).mockRejectedValue(new Error('catalog down') as never)
    const { container } = await renderHermesGuide()

    await screen.findByText(
      getHermesChatCommand(DOCS_FALLBACK_TEXT_MODEL),
      {},
      { timeout: 3000 }
    )
    expect(container.textContent).toContain('deepseek-v4.1-flash')
  })

  it('never renders either retired id in any catalog state', async () => {
    for (const behavior of [
      () =>
        vi
          .mocked(getPricing)
          .mockResolvedValue(pricingPayload(['kimi-k3']) as never),
      () => vi.mocked(getPricing).mockRejectedValue(new Error('down') as never),
    ]) {
      vi.mocked(getPricing).mockReset()
      behavior()
      const { container } = await renderHermesGuide()
      // Wait for the catalog-driven command to render before asserting
      // absence of the retired ids.
      const rendered = await screen.findAllByText(
        /hermes chat --provider vancine -m /,
        {},
        { timeout: 3000 }
      )
      expect(rendered.length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain('deepseek-flash')
      expect(container.textContent).not.toContain('deepseek-v4-flash')
    }
  })
})
