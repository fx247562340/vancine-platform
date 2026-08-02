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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DocsCodeTabs } from '../components/code-tabs'
import { buildCodeTabItems } from '../lib/code-tabs'
import { initTestI18n, setDocsBundle, EN_DOCS } from './test-utils'

const items = buildCodeTabItems(
  {
    curl: { label: 'cURL', code: 'curl --marker-curl' },
    python: { label: 'Python', code: 'print("marker-python")' },
    node: { label: 'Node.js', code: 'console.log("marker-node")' },
  },
  ['curl', 'python', 'node'],
  { curl: 'bash', python: 'python', node: 'javascript' }
)

// Shiki splits code into token spans, so assert on the panel's concatenated
// text content rather than an exact text node.
async function expectPanelContains(marker: string) {
  await waitFor(() => {
    const panel = screen.getByRole('tabpanel')
    expect(panel.textContent).toContain(marker)
  })
}

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
})

describe('DocsCodeTabs', () => {
  it('renders a tablist with one tab per item, each wired to a panel', async () => {
    render(<DocsCodeTabs items={items} />)

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'cURL',
      'Python',
      'Node.js',
    ])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')

    // Every tab has a stable id (used as the panel's aria-labelledby).
    for (const tab of tabs) {
      expect(tab.id).toBeTruthy()
    }

    // The selected tab is wired to a real, existing tabpanel.
    const controls = tabs[0].getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    const panel = document.getElementById(controls as string)
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[0].id)

    // The selected tab's panel shows its code.
    await expectPanelContains('curl --marker-curl')
  })

  it('clicking a tab switches the visible panel', async () => {
    const user = userEvent.setup()
    render(<DocsCodeTabs items={items} />)

    await user.click(screen.getByRole('tab', { name: 'Python' }))
    expect(
      screen.getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')
    ).toBe('true')
    await expectPanelContains('marker-python')
  })

  it('ArrowRight/ArrowLeft/Home/End move focus (roving tabindex)', async () => {
    const user = userEvent.setup()
    render(<DocsCodeTabs items={items} />)
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3))

    const curl = screen.getByRole('tab', { name: 'cURL' })
    const python = screen.getByRole('tab', { name: 'Python' })
    const node = screen.getByRole('tab', { name: 'Node.js' })

    // Focus the first tab via a real (act-wrapped) user interaction, then
    // drive roving-tabindex focus with arrow/Home/End keys. waitFor flushes
    // Base UI's deferred focus updates inside act (no act warnings).
    await user.click(curl)
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(document.activeElement).toBe(python))

    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(document.activeElement).toBe(curl))

    await user.keyboard('{End}')
    await waitFor(() => expect(document.activeElement).toBe(node))

    await user.keyboard('{Home}')
    await waitFor(() => expect(document.activeElement).toBe(curl))
  })

  it('Enter activates the focused tab', async () => {
    const user = userEvent.setup()
    render(<DocsCodeTabs items={items} />)
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3))

    await user.click(screen.getByRole('tab', { name: 'cURL' }))
    await user.keyboard('{ArrowRight}') // focus Python
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(
        screen
          .getByRole('tab', { name: 'Python' })
          .getAttribute('aria-selected')
      ).toBe('true')
    )
    await expectPanelContains('marker-python')
  })
})
