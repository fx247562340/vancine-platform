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

For commercial licensing, please contact support@quantumnous.com.
*/
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { TocProvider } from '../components/toc-context'
import enDocs from '../i18n/locales/en.json'
import VideoPage from '../pages/video'
import { renderWithProviders } from './test-utils'

// After the media-model docs revamp, the /docs/video overview no
// longer pins its example to a single vendor-specific model — every
// model has its own /docs/models/<slug> detail page. The overview
// sends the minimum legal request (model + prompt) using whichever
// text-capable model the live catalog returns first. This file
// therefore focuses on the overview's "minimum legal request"
// contract and the forbidden-field guard that keeps the overview
// from silently reverting to a vendor-specific schema.

const OLD_PRICES = ['¥0.24', '¥0.55', '¥0.68'] as const
const BASE_URL = 'https://vancine.com/v1'

// Initialize the shared i18next instance so the page's docs bundle
// (resolved through the global i18n in `DocsI18nProvider`) is found
// the same way docs.test.ts wires it.
await i18n.init({
  resources: {},
  fallbackLng: 'en',
  lng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
})

// Fields the overview must NEVER pin: every video model exposes a
// different wire (duration vs seconds string, size vs
// metadata.resolution, metadata.content vs metadata.input.media),
// so an example that fixes any of these silently misrepresents the
// rest. The overview only sends `model` and `prompt`.
const FORBIDDEN_REQUEST_FIELDS = [
  'size',
  'resolution',
  'duration',
  'seconds',
  'ratio',
  'metadata',
]

const FIELD_PATTERN = (field: string) =>
  new RegExp(`(?:^|[,{]\\s*)["']?${field}["']?\\s*:`, 'm')
const MODEL_FIELD = /(?:^|[,{]\s*)["']?model["']?\s*:/m
const PROMPT_FIELD = /(?:^|[,{]\s*)["']?prompt["']?\s*:/m

/**
 * The overview example must always carry model + prompt and must
 * never pin a per-model field such as duration / size / resolution.
 * The check is per active tabpanel so a single failing example
 * never poisons the other tabs' coverage.
 */
async function expectActivePanelIsMinimumOverviewRequest() {
  await waitFor(() => {
    const panel = screen.getByRole('tabpanel')
    const text = panel.textContent ?? ''
    expect(text).toMatch(MODEL_FIELD)
    expect(text).toMatch(PROMPT_FIELD)
    for (const field of FORBIDDEN_REQUEST_FIELDS) {
      expect(text).not.toMatch(FIELD_PATTERN(field))
    }
  })
}

async function switchTab(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByRole('tab', { name }))
  await waitFor(() =>
    expect(
      screen.getByRole('tab', { name }).getAttribute('aria-selected')
    ).toBe('true')
  )
}

describe('Docs VideoPage overview keeps the minimum request shape', () => {
  beforeEach(() => {
    // The DocsI18nProvider reads the docs namespace through the
    // shared global i18n; reset it before each test so order and
    // prior callers can never affect bundle resolution.
    i18n.removeResourceBundle('en', 'docs')
    i18n.addResourceBundle(
      'en',
      'docs',
      enDocs as unknown as Record<string, unknown>,
      true,
      true
    )
  })

  function renderVideo() {
    return renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl={BASE_URL} />
      </TocProvider>
    )
  }

  it('renders the overview with translated title and async endpoint copy', async () => {
    renderVideo()

    // The VideoPage reads the live model catalog, so the heading and
    // the endpoint text both resolve asynchronously. `findBy*` waits
    // for them instead of asserting on a not-yet-rendered DOM.
    expect(
      await screen.findByRole('heading', { name: 'Video Generation' })
    ).toBeInTheDocument()

    // Async submit/poll endpoint contract + status vocabulary stay intact.
    expect(await screen.findByText('/v1/video/generations')).toBeInTheDocument()
    expect(
      await screen.findByText('/v1/video/generations/{id}')
    ).toBeInTheDocument()
    expect(await screen.findByText('SUCCESS')).toBeInTheDocument()
    expect(await screen.findByText('FAILURE')).toBeInTheDocument()
    expect(await screen.findByText(/result_url/)).toBeInTheDocument()
    expect(await screen.findByText(/fail_reason/)).toBeInTheDocument()
  })

  it('switches cURL / Python / Node.js tabs, each a minimal model + prompt request', async () => {
    const user = userEvent.setup()
    const { container } = renderVideo()

    // Default active tab is cURL.
    await expectActivePanelIsMinimumOverviewRequest()

    await switchTab(user, 'Python')
    await expectActivePanelIsMinimumOverviewRequest()

    await switchTab(user, 'Node.js')
    await expectActivePanelIsMinimumOverviewRequest()

    // No fixed pricing leaks into the video examples.
    for (const price of OLD_PRICES) {
      expect(container.textContent).not.toContain(price)
    }
  })

  it('uses the canonical v1 endpoint with no fixed price or real secret', async () => {
    const { container } = renderVideo()

    await waitFor(() =>
      expect(screen.getByRole('tabpanel')).toBeInTheDocument()
    )
    const panel = screen.getByRole('tabpanel')
    expect(panel.textContent ?? '').toContain('POST https://vancine.com/v1')
    // Docs examples use the documented placeholder, never a real secret.
    expect(panel.textContent ?? '').toContain('sk-your-api-key')
    for (const price of OLD_PRICES) {
      expect(container.textContent).not.toContain(price)
    }
  })
})
