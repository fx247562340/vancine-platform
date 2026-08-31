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
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { DocsSearchBox } from '../components/search-box'
import { DocsI18nProvider } from '../i18n/docs-i18n'
import type { DocsBundleLoader, DocsLocale } from '../i18n/loader'
import { EN_DOCS, initTestI18n } from './test-i18n'
import { renderWithProviders } from './test-utils'

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
  const input = await screen.findByRole('combobox', {}, { timeout: 2000 })
  await user.type(input, query)
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeNull(), {
    timeout: 2000,
  })
}

beforeEach(async () => {
  await initTestI18n('en')
})

describe('DocsSearchBox agent guide navigation', () => {
  it.each([
    ['OpenCode', 'OpenCode setup guide', '/docs/agents/opencode'],
    ['Cline', 'Cline setup guide', '/docs/agents/cline'],
    ['Roo Code', 'Roo Code setup guide', '/docs/agents/roo-code'],
  ] as const)(
    'searching %s finds the guide and navigates to %s',
    async (query, title, path) => {
      const user = userEvent.setup()
      const { router } = renderSearch()
      await typeAndWaitForResults(user, query)

      const option = await screen.findByText(title)
      await user.click(option)

      await waitFor(() => expect(router.history.location.pathname).toBe(path))
    }
  )

  it.each([
    ['Models.dev', 'OpenCode setup guide', '/docs/agents/opencode'],
    ['Provider catalog', 'OpenCode setup guide', '/docs/agents/opencode'],
    ['connect', 'OpenCode setup guide', '/docs/agents/opencode'],
    ['/connect', 'OpenCode setup guide', '/docs/agents/opencode'],
  ] as const)(
    'searching %s finds the OpenCode catalog entry and navigates to %s',
    async (query, title, path) => {
      const user = userEvent.setup()
      const { router } = renderSearch()
      await typeAndWaitForResults(user, query)

      const option = await screen.findByText(title)
      await user.click(option)

      await waitFor(() => expect(router.history.location.pathname).toBe(path))
    }
  )

  it.each([
    ['CORS', 'Cline setup guide', '/docs/agents/cline'],
    ['invalid API key', 'OpenCode setup guide', '/docs/agents/opencode'],
  ] as const)(
    'shared troubleshooting term %s reaches the concrete guide %s, not just the hub',
    async (query, title, path) => {
      const user = userEvent.setup()
      const { router } = renderSearch()
      await typeAndWaitForResults(user, query)

      // The merged agentGuides.common troubleshooting copy makes every
      // guide a hit; picking one navigates to that guide's nested path.
      const option = await screen.findByText(title)
      await user.click(option)

      await waitFor(() => expect(router.history.location.pathname).toBe(path))
      expect(router.history.location.pathname).not.toBe('/docs/agents')
    }
  )
})
