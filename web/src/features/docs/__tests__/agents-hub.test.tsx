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
import {
  DOCS_AGENT_TOOLS,
  OPENCLAW_INSTALL_CLAWHUB_COMMAND,
  OPENCLAW_INSTALL_NPM_COMMAND,
  VANCINE_MODELS_DEV_PROVIDER_URL,
  VANCINE_PI_PROVIDER_CATALOG_URL,
  VANCINE_PI_PROVIDER_GITHUB_URL,
  VANCINE_PI_PROVIDER_NPM_URL,
} from '../lib/agents'
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
  it('shows one card per registered tool with the correct guide link', async () => {
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
    expect(screen.getByRole('heading', { name: 'Pi' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'OpenClaw' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hermes' })).toBeInTheDocument()

    const guideLinks = screen.getAllByRole('link', {
      name: 'View setup guide',
    })
    expect(guideLinks).toHaveLength(6)
    const hrefs = guideLinks.map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(DOCS_AGENT_TOOLS.map((tool) => tool.path))
    // The Hermes card links the dedicated Hermes guide.
    expect(hrefs).toContain('/docs/agents/hermes')
  })

  it('shows the protocol line per card', async () => {
    renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    expect(
      screen.getByText(
        "Vancine is available through OpenCode's Models.dev provider catalog."
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('OpenAI-compatible provider in the Cline extension')
    ).toBeInTheDocument()
    expect(
      screen.getByText('OpenAI-compatible provider in Roo Code')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Provider plugin for the Pi coding agent, installed from npm.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Community provider plugin for OpenClaw, installed from npm or ClawHub.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Provider plugin for Hermes Agent, installed from its public GitHub source.'
      )
    ).toBeInTheDocument()
  })

  it('shows the unified Configuration-ready status on all six cards', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // One unified public status: same copy on every card.
    const badges = screen.getAllByText('Configuration-ready')
    expect(badges).toHaveLength(6)
    // The former two-tier status vocabulary is gone from the public UI.
    expect(container.textContent).not.toContain('Live-verified')
    expect(container.textContent).not.toContain('live-verified')
    // Identical visual variant on all six badges.
    const classNames = badges.map((badge) => badge.className)
    expect(new Set(classNames).size).toBe(1)
    // One neutral, shared boundary sentence per card (no per-tool
    // verification-tier wording left on the hub).
    expect(
      screen.getAllByText(
        'The OpenAI-compatible setup for this tool is ready. Follow its guide to connect it to Vancine.'
      )
    ).toHaveLength(6)
  })

  it('shows the Models.dev catalog proof only on the OpenCode card', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    const catalogLink = screen.getByRole('link', {
      name: 'Available in OpenCode through the Models.dev provider catalog',
    })
    expect(catalogLink).toHaveAttribute('href', VANCINE_MODELS_DEV_PROVIDER_URL)
    expect(catalogLink).toHaveAttribute('target', '_blank')
    expect(catalogLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.getAllByRole('link', {
        name: 'Available in OpenCode through the Models.dev provider catalog',
      })
    ).toHaveLength(1)
    // Catalog proof is not a status and does not replace Configuration-ready.
    expect(screen.getAllByText('Configuration-ready')).toHaveLength(6)
    expect(container.textContent).not.toContain('official partner')
    expect(container.textContent).not.toContain('official supplier')
  })

  it('keeps the benchmark link, the Codex configuration, and the plugin pointers', async () => {
    renderHub()

    const benchmarkLink = await screen.findByRole('link', {
      name: 'See the 8-model Pi coding-agent benchmark',
    })
    expect(benchmarkLink).toHaveAttribute('href', '/coding-agent-benchmark')

    await screen.findByRole('heading', { name: 'OpenCode' })
    expect(
      screen.getByRole('heading', { name: 'Codex CLI' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cursor' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Cherry Studio' })
    ).toBeInTheDocument()
    // Hermes and OpenClaw each keep a CLI-section pointer that links their
    // dedicated guide instead of a manual configuration block.
    expect(
      screen.getByRole('link', { name: 'Open the Hermes provider guide' })
    ).toHaveAttribute('href', '/docs/agents/hermes')
    expect(
      screen.getByRole('link', { name: 'Open the OpenClaw provider guide' })
    ).toHaveAttribute('href', '/docs/agents/openclaw')
  })

  it('drops the legacy Hermes Agent config.yaml card and its manual env template', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // The old generic Hermes card showed a manual config.yaml block plus
    // OPENAI_COMPATIBLE_* environment variables. Both are gone: Hermes is a
    // provider-plugin guide now.
    expect(
      screen.queryByRole('heading', { name: 'Hermes Agent' })
    ).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('~/.hermes/config.yaml')
    expect(container.textContent).not.toContain('OPENAI_COMPATIBLE_BASE_URL')
    expect(container.textContent).not.toContain('OPENAI_COMPATIBLE_API_KEY')
    expect(container.textContent).not.toContain('openai_compatible')
    // The Codex CLI card (no dedicated guide) keeps its full configuration.
    expect(container.textContent).toContain('model_provider = "vancine"')
    // The Hermes install command belongs on the guide page, not on the hub.
    expect(
      screen.queryByText(
        'hermes plugins install fx247562340/vancine-hermes-provider'
      )
    ).not.toBeInTheDocument()
  })

  it('no longer duplicates full configurations nor any manual OpenClaw Base URL block', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // The full opencode.json provider block now lives on the dedicated page.
    expect(container.textContent).not.toContain('opencode.ai/config.json')
    // The combined "Cline / Roo Code" GUI block was replaced by the guides.
    expect(screen.queryByText('Cline / Roo Code')).not.toBeInTheDocument()
    // The old generic OpenClaw manual configuration is gone: no Base URL,
    // no VANCINE_MODEL env template. OpenClaw connects via its plugin guide.
    expect(container.textContent).not.toContain('VANCINE_MODEL')
    expect(container.textContent).not.toContain('VANCINE_BASE_URL')
    expect(container.textContent).not.toContain('Provider: OpenAI Compatible')
    // Codex (no dedicated guide) keeps its full configuration on the hub.
    expect(container.textContent).toContain('model_provider = "vancine"')
  })

  it('links the OpenClaw CLI card to the dedicated provider guide, not a config block', async () => {
    renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    const openclawPointer = screen.getByRole('link', {
      name: 'Open the OpenClaw provider guide',
    })
    expect(openclawPointer).toHaveAttribute('href', '/docs/agents/openclaw')
    // OpenClaw install commands belong on the guide page, not the hub.
    expect(
      screen.queryByText(OPENCLAW_INSTALL_NPM_COMMAND)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(OPENCLAW_INSTALL_CLAWHUB_COMMAND)
    ).not.toBeInTheDocument()
  })

  it('migrates the Pi quick-start into the dedicated guide card and drops the hub section', async () => {
    renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // The standalone Pi section is gone: Pi is now a registry card.
    expect(
      screen.queryByRole('heading', { name: 'Pi Coding Agent' })
    ).not.toBeInTheDocument()
    expect(document.querySelector('#agents-pi')).toBeNull()
    // The Pi card links the dedicated guide with the Pi displayName.
    const piCard = screen.getByRole('heading', { name: 'Pi' })
    expect(piCard).toBeInTheDocument()
  })

  it('exposes the Pi npm and GitHub sources only via the dedicated guide card links', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // The hub no longer carries its own npm/GitHub source row; those links
    // (and the Pi catalog entry) moved to the dedicated /docs/agents/pi guide
    // page.
    expect(
      container.querySelector(`a[href="${VANCINE_PI_PROVIDER_NPM_URL}"]`)
    ).toBeNull()
    expect(
      container.querySelector(`a[href="${VANCINE_PI_PROVIDER_GITHUB_URL}"]`)
    ).toBeNull()
    expect(
      container.querySelector(`a[href="${VANCINE_PI_PROVIDER_CATALOG_URL}"]`)
    ).toBeNull()
  })

  it('renders no relationship disclaimer on the hub', async () => {
    const { container } = renderHub()

    await screen.findAllByRole('link', { name: 'View setup guide' })
    // Product decision: the hub cards carry only the neutral shared boundary
    // sentence; no distancing copy is rendered anywhere.
    expect(
      screen.queryByText(
        'pi-provider-vancine is a community extension published and maintained by Vancine. It does not constitute official cooperation, certification, or endorsement between Pi, Earendil Works, or their maintainers and Vancine.'
      )
    ).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('Earendil Works')
    expect(container.textContent).not.toContain('ClawHub provider')
    expect(container.textContent).not.toMatch(/official cooperation/)
    expect(container.textContent).not.toMatch(/official partner/i)
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
