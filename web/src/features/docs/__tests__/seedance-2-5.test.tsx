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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { TocProvider } from '../components/toc-context'
import enDocs from '../i18n/locales/en.json'
import ModelsPage from '../pages/models'
import VideoPage from '../pages/video'

const TARGET_MODEL = 'Doubao-Seedance-2.5'
const OLD_MODELS = [
  'Doubao-Seedance-1.5-pro',
  'Doubao-Seedance-2.0-fast',
  'Doubao-Seedance-2.0',
] as const
const OLD_PRICES = ['¥0.24', '¥0.55', '¥0.68'] as const
const BASE_URL = 'https://vancine.com/v1'

// A dedicated i18next instance per suite keeps these tests independent of the
// shared global instance the rest of the Docs suite mutates, so nothing here
// can leak into (or be polluted by) other files' language/resource state.
async function makeDocsI18n() {
  const instance = i18n.createInstance()
  await instance.use(initReactI18next).init({
    resources: {},
    lng: 'en',
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  instance.addResourceBundle(
    'en',
    'docs',
    enDocs as unknown as Record<string, unknown>,
    true,
    true
  )
  return instance
}

// Forbidden request fields: the minimal Seedance 2.5 example must not pin
// size, resolution, duration, or ratio to a fixed value. A field is only
// recognized at a true field boundary (line start or right after `{` / `,`),
// with optional quoting and optional whitespace before the colon, so
// `negative_prompt`, comments, or prose containing the word never satisfy the
// assertion. Covers JSON/cURL ("key":), Python ('key':), and Node.js (key:)
// spellings.
const FORBIDDEN_REQUEST_FIELDS = ['size', 'resolution', 'duration', 'ratio']

const TARGET_MODEL_ESCAPED = TARGET_MODEL.replaceAll(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&'
)

// `model` key bound to the exact value `Doubao-Seedance-2.5`. The opening quote
// is captured and back-referenced so the same quote char closes the value, and
// a lookahead requires a legal terminator (optional whitespace then `,` or `}`).
// This rejects `Doubao-Seedance-2.5-preview`, `Doubao-Seedance-2.50`,
// `Doubao-Seedance-2.5-old`, and any unterminated value.
const MODEL_FIELD = new RegExp(
  `(?:^|[,{]\\s*)["']?model["']?\\s*:\\s*(["'])${TARGET_MODEL_ESCAPED}\\1(?=\\s*[,}])`,
  'm'
)
const PROMPT_FIELD = /(?:^|[,{]\s*)["']?prompt["']?\s*:/m

function forbiddenFieldPatterns(): RegExp[] {
  return FORBIDDEN_REQUEST_FIELDS.map(
    (field) => new RegExp(`(?:^|[,{]\\s*)["']?${field}["']?\\s*:`, 'm')
  )
}

// Each Seedance 2.5 example must carry model (bound to its value) + prompt and
// nothing that fixes a resolution, duration, or ratio. Asserted per active
// tabpanel.
async function expectActivePanelIsMinimalSeedanceRequest() {
  await waitFor(() => {
    const panel = screen.getByRole('tabpanel')
    const text = panel.textContent ?? ''
    expect(text).toMatch(MODEL_FIELD)
    expect(text).toMatch(PROMPT_FIELD)
    for (const pattern of forbiddenFieldPatterns()) {
      expect(text).not.toMatch(pattern)
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

describe('Docs VideoPage converges to Doubao-Seedance-2.5', () => {
  it('renders the real page with translated title and async contract copy', async () => {
    const instance = await makeDocsI18n()
    render(
      <I18nextProvider i18n={instance}>
        <TocProvider>
          <VideoPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )

    // The page renders its real translated H2, not a raw i18n key.
    expect(
      screen.getByRole('heading', { name: 'Video Generation' })
    ).toBeInTheDocument()

    // Async submit/poll endpoint contract + status vocabulary stay intact.
    expect(screen.getByText('/v1/video/generations')).toBeInTheDocument()
    expect(
      screen.getByText('/v1/video/generations/{task_id}')
    ).toBeInTheDocument()
    expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    expect(screen.getByText('FAILURE')).toBeInTheDocument()
    // result_url / fail_reason live inside the translated status copy.
    expect(screen.getByText(/result_url/)).toBeInTheDocument()
    expect(screen.getByText(/fail_reason/)).toBeInTheDocument()
  })

  it('switches cURL / Python / Node.js tabs, each a minimal model + prompt request', async () => {
    const instance = await makeDocsI18n()
    const user = userEvent.setup()
    const { container } = render(
      <I18nextProvider i18n={instance}>
        <TocProvider>
          <VideoPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )

    // Default active tab is cURL.
    await expectActivePanelIsMinimalSeedanceRequest()

    await switchTab(user, 'Python')
    await expectActivePanelIsMinimalSeedanceRequest()

    await switchTab(user, 'Node.js')
    await expectActivePanelIsMinimalSeedanceRequest()

    // None of the three examples carry a legacy Seedance ID.
    for (const old of OLD_MODELS) {
      expect(container.textContent).not.toContain(old)
    }
    // No fixed pricing leaks into the video examples.
    for (const price of OLD_PRICES) {
      expect(container.textContent).not.toContain(price)
    }
  })

  it('uses the canonical v1 endpoint with no fixed price or real secret', async () => {
    const instance = await makeDocsI18n()
    const { container } = render(
      <I18nextProvider i18n={instance}>
        <TocProvider>
          <VideoPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )

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

describe('Docs ModelsPage lists only Doubao-Seedance-2.5 video model', () => {
  async function renderModels() {
    const instance = await makeDocsI18n()
    return render(
      <I18nextProvider i18n={instance}>
        <TocProvider>
          <ModelsPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )
  }

  it('shows the Seedance 2.5 video row with a live-pricing note', async () => {
    await renderModels()

    // Find the row by its semantic (accessible) name — the model, its video
    // type badge, and the live-pricing note — without querySelector / nth-child.
    const targetRow = screen.getByRole('row', {
      name: /Doubao-Seedance-2\.5.*video.*Fetch model pricing/,
    })
    expect(targetRow).toBeInTheDocument()

    // Assert in-row content through the scoped within() wrapper.
    expect(
      within(targetRow).getByText(/Doubao-Seedance-2\.5/)
    ).toBeInTheDocument()
    expect(
      within(targetRow).getByText('Fetch model pricing')
    ).toBeInTheDocument()
  })

  it('removes the three legacy Seedance IDs and their fixed prices', async () => {
    const { container } = await renderModels()
    const text = container.textContent ?? ''

    for (const old of OLD_MODELS) {
      expect(text).not.toContain(old)
    }
    for (const price of OLD_PRICES) {
      expect(text).not.toContain(price)
    }
  })

  it('keeps the live /api/pricing entry', async () => {
    await renderModels()

    // The pricing code block points at the live pricing endpoint.
    expect(document.body.textContent ?? '').toContain('/api/pricing')
  })
})
