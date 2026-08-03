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
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DocsSearchBox } from '../components/search-box'
import { DocsI18nProvider } from '../i18n/docs-i18n'
import type { DocsBundleLoader, DocsLocale } from '../i18n/loader'
import { initTestI18n, EN_DOCS, renderWithProviders } from './test-utils'

const enLoaders = {
  en: async () => EN_DOCS,
} as unknown as Record<DocsLocale, DocsBundleLoader>

function renderSearch() {
  return renderWithProviders(
    <DocsI18nProvider loaders={enLoaders}>
      <DocsSearchBox />
    </DocsI18nProvider>
  )
}

async function typeAndWaitForResults(
  user: ReturnType<typeof userEvent.setup>,
  query: string
) {
  // The router renders the subject asynchronously; wait for the input first.
  const input = await screen.findByRole('combobox', {}, { timeout: 2000 })
  await user.type(input, query)
  // Wait for debounce + lazy bundle + results to render.
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeNull(), {
    timeout: 2000,
  })
}

beforeEach(async () => {
  await initTestI18n('en')
})

describe('DocsSearchBox', () => {
  it('renders results and navigates on click', async () => {
    const user = userEvent.setup()
    const { router } = renderSearch()
    await typeAndWaitForResults(user, 'Authentication')

    const option = await screen.findByText('Authentication')
    await user.click(option)

    await waitFor(() =>
      expect(router.history.location.pathname).toBe('/docs/auth')
    )
  })

  it('supports ArrowDown/ArrowUp/Enter keyboard selection', async () => {
    const user = userEvent.setup()
    const { router } = renderSearch()
    await typeAndWaitForResults(user, 'Chat')

    const input = screen.getByRole('combobox')
    await user.keyboard('{ArrowDown}')

    // aria-activedescendant points at a real, existing option element.
    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBeTruthy()
    expect(document.getElementById(activeId as string)).not.toBeNull()

    // Enter selects the active result and navigates.
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(router.history.location.pathname).toMatch(/^\/docs\//)
    )
  })

  it('Escape closes the listbox', async () => {
    const user = userEvent.setup()
    renderSearch()
    await typeAndWaitForResults(user, 'Chat')
    expect(screen.queryByRole('listbox')).not.toBeNull()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('caps results at eight', async () => {
    const user = userEvent.setup()
    renderSearch()
    // A broad term that appears across many page bodies.
    await typeAndWaitForResults(user, 'the')

    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(options.length).toBeLessThanOrEqual(8)
  })

  it('option is the sole interactive target (no focusable child)', async () => {
    const user = userEvent.setup()
    renderSearch()
    await typeAndWaitForResults(user, 'Chat')

    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(
        option.querySelector('button, a, input, select, textarea, [tabindex]')
      ).toBeNull()
    }
  })

  it('two instances have unique listbox/option ids', async () => {
    renderWithProviders(
      <DocsI18nProvider loaders={enLoaders}>
        <DocsSearchBox />
        <DocsSearchBox />
      </DocsI18nProvider>
    )

    const inputs = await screen.findAllByRole('combobox', {}, { timeout: 2000 })
    expect(inputs.length).toBe(2)
    const controls0 = inputs[0].getAttribute('aria-controls')
    const controls1 = inputs[1].getAttribute('aria-controls')
    expect(controls0).toBeTruthy()
    expect(controls1).toBeTruthy()
    expect(controls0).not.toEqual(controls1)
  })

  it('shows a localized no-results message', async () => {
    const user = userEvent.setup()
    renderSearch()
    await typeAndWaitForResults(user, 'zzzznotreal')
    expect(screen.getByText('No matching results')).toBeInTheDocument()
  })
})
