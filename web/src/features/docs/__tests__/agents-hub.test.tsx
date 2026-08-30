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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocsI18nProvider } from '../i18n/docs-i18n'
import Agents from '../pages/agents'
import {
  EN_DOCS,
  clearDocsBundle,
  initTestI18n,
  setDocsBundle,
} from './test-i18n'
import { renderWithProviders } from './test-utils'

function renderHub() {
  return renderWithProviders(
    <DocsI18nProvider>
      <Agents baseUrl='https://vancine.com/v1' />
    </DocsI18nProvider>
  )
}

beforeEach(async () => {
  await initTestI18n('en')
  // Preload the English bundle: these subjects do not consume the docs-i18n
  // context themselves, mirroring the agents-benchmark-link test pattern.
  setDocsBundle('en', EN_DOCS)
})

afterEach(() => {
  clearDocsBundle('en')
})

describe('Agent Integration hub cards', () => {
  it('shows one card per first-batch tool with the correct guide link', async () => {
    renderHub()

    // Wait on an i18n-bound element so the lazily loaded Docs bundle is up.
    await screen.findAllByRole('link', { name: 'View setup guide' })
    expect(
      screen.getByRole('heading', { name: 'OpenCode' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cline' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Roo Code' })
    ).toBeInTheDocument()

    const guideLinks = screen.getAllByRole('link', {
      name: 'View setup guide',
    })
    expect(guideLinks).toHaveLength(3)
    const hrefs = guideLinks.map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/docs/agents/opencode',
        '/docs/agents/cline',
        '/docs/agents/roo-code',
      ])
    )
  })

  it('shows the protocol line per card', async () => {
    renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    expect(
      screen.getByText('OpenAI-compatible provider in opencode.json')
    ).toBeInTheDocument()
    expect(
      screen.getByText('OpenAI-compatible provider in the Cline extension')
    ).toBeInTheDocument()
    expect(
      screen.getByText('OpenAI-compatible provider in Roo Code')
    ).toBeInTheDocument()
  })

  it('shows the unified Configuration-ready status on all three cards', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // One unified public status: same copy on every card.
    const badges = screen.getAllByText('Configuration-ready')
    expect(badges).toHaveLength(3)
    // The former two-tier status vocabulary is gone from the public UI.
    expect(container.textContent).not.toContain('Live-verified')
    expect(container.textContent).not.toContain('live-verified')
    // Identical visual variant on all three badges.
    const classNames = badges.map((badge) => badge.className)
    expect(new Set(classNames).size).toBe(1)
    // One neutral, shared boundary sentence per card (no per-tool
    // verification-tier wording left on the hub).
    expect(
      screen.getAllByText(
        'The OpenAI-compatible setup for this tool is ready. Follow its guide to connect it to Vancine.'
      )
    ).toHaveLength(3)
  })

  it('keeps the benchmark link and the non-first-batch configurations', async () => {
    renderHub()

    const benchmarkLink = await screen.findByRole('link', {
      name: 'See the 8-model Pi coding-agent benchmark',
    })
    expect(benchmarkLink).toHaveAttribute('href', '/coding-agent-benchmark')

    await screen.findByRole('heading', { name: 'OpenCode' })
    expect(
      screen.getByRole('heading', { name: 'Codex CLI' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'OpenClaw' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Hermes Agent' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cursor' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Cherry Studio' })
    ).toBeInTheDocument()
  })

  it('no longer duplicates the full OpenCode/Cline/Roo Code configurations', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // The full opencode.json provider block now lives on the dedicated page.
    expect(container.textContent).not.toContain('opencode.ai/config.json')
    // The combined "Cline / Roo Code" GUI block was replaced by the guides.
    expect(screen.queryByText('Cline / Roo Code')).not.toBeInTheDocument()
    // Codex (not first-batch) keeps its full configuration on the hub.
    expect(container.textContent).toContain('model_provider = "vancine"')
  })

  it('applies the /docs/agents page metadata while mounted', async () => {
    renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    await waitFor(() =>
      expect(document.title).toBe('Coding Agent Integration Center | Vancine')
    )
    const canonical = document.head.querySelector('link[rel="canonical"]')
    expect(canonical).not.toBeNull()
    expect(canonical?.getAttribute('href')).toBe(
      'https://vancine.com/docs/agents'
    )
  })
})
