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
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { DocsI18nProvider } from '../i18n/docs-i18n'
import enDocs from '../i18n/locales/en.json'
import frDocs from '../i18n/locales/fr.json'
import jaDocs from '../i18n/locales/ja.json'
import ruDocs from '../i18n/locales/ru.json'
import viDocs from '../i18n/locales/vi.json'
import zhCNDocs from '../i18n/locales/zhCN.json'
import zhTWDocs from '../i18n/locales/zhTW.json'
import {
  VANCINE_MODELS_DEV_PROVIDER_URL,
  type DocsAgentToolKey,
} from '../lib/agents'
import DocsAgentDetailPage from '../pages/agent-detail'
import {
  EN_DOCS,
  clearDocsBundle,
  initTestI18n,
  setDocsBundle,
} from './test-i18n'
import { renderWithProviders } from './test-utils'

const BASE_URL = 'https://vancine.com/v1'

// A real Vancine/OpenAI-style key shape; pages must only ever show
// obvious placeholders.
const REAL_KEY_PATTERN = /sk-[A-Za-z0-9]{20,}/

async function waitForHeading(name: RegExp | string) {
  return screen.findByRole('heading', { name }, { timeout: 3000 })
}

function renderGuide(tool: DocsAgentToolKey) {
  return renderWithProviders(
    <DocsI18nProvider>
      <DocsAgentDetailPage tool={tool} baseUrl={BASE_URL} />
    </DocsI18nProvider>
  )
}

beforeEach(async () => {
  await initTestI18n('en')
  // Preload the English bundle: these subjects do not consume the docs-i18n
  // context themselves, mirroring the agents-benchmark-link test pattern.
  setDocsBundle('en', EN_DOCS)
  useAuthStore.setState({
    auth: { ...useAuthStore.getState().auth, user: null },
  })
})

const ALL_DOCS_LOCALE_CODES = [
  'en',
  'zhCN',
  'zhTW',
  'fr',
  'ru',
  'ja',
  'vi',
] as const

afterEach(() => {
  for (const code of ALL_DOCS_LOCALE_CODES) {
    if (i18n.hasResourceBundle(code, 'docs')) {
      clearDocsBundle(code)
    }
  }
  useAuthStore.setState({
    auth: { ...useAuthStore.getState().auth, user: null },
  })
})

describe('All guides share one unified Configuration-ready status', () => {
  it.each([
    ['opencode', 'OpenCode setup guide'],
    ['cline', 'Cline setup guide'],
    ['rooCode', 'Roo Code setup guide'],
  ] as const)(
    '%s shows only Configuration-ready with the shared neutral callout',
    async (tool, title) => {
      const { container } = renderGuide(tool)

      await waitForHeading(new RegExp(title))
      expect(screen.getAllByText('Configuration-ready').length).toBeGreaterThan(
        0
      )
      // The shared public explanation, identical on every guide.
      expect(
        screen.getByText(
          'The OpenAI-compatible setup for this tool is ready. Follow this guide to connect it to Vancine.'
        )
      ).toBeInTheDocument()
      // No two-tier status vocabulary may survive in the public UI: no tool
      // is marked verified, and no tool is singled out as unverified.
      expect(container.textContent).not.toContain('Live-verified')
      expect(container.textContent).not.toContain('live-verified')
      expect(container.textContent).not.toContain('not marked live-verified')
      expect(container.textContent).not.toContain(
        'live coding-agent verification'
      )
    }
  )
})

describe('OpenCode Models.dev catalog proof', () => {
  it('shows the catalog identifier, explanation, and Models.dev link without replacing Configuration-ready', async () => {
    const { container } = renderGuide('opencode')

    await waitForHeading(/OpenCode setup guide/)
    const catalogProof = screen.getByRole('link', {
      name: 'Available in OpenCode through the Models.dev provider catalog',
    })
    expect(catalogProof).toHaveAttribute(
      'href',
      VANCINE_MODELS_DEV_PROVIDER_URL
    )
    expect(catalogProof).toHaveAttribute('target', '_blank')
    expect(catalogProof).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.getByText(
        'OpenCode loads its provider catalog from Models.dev. Vancine is listed there as an OpenAI-compatible Provider. You still use your own Vancine API Key.'
      )
    ).toBeInTheDocument()
    const catalogLink = screen.getByRole('link', {
      name: 'View Vancine on Models.dev',
    })
    expect(catalogLink).toHaveAttribute('href', VANCINE_MODELS_DEV_PROVIDER_URL)
    expect(catalogLink).toHaveAttribute('target', '_blank')
    expect(catalogLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getAllByText('Configuration-ready').length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'The OpenAI-compatible setup for this tool is ready. Follow this guide to connect it to Vancine.'
      )
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain('official supplier')
    expect(container.textContent).not.toMatch(/is an official partner/)
    expect(container.textContent).toContain(
      'does not imply an official partnership or endorsement by OpenCode'
    )
  })

  it('does not show the catalog proof on Cline or Roo Code', async () => {
    const { unmount } = renderGuide('cline')
    await waitForHeading(/Cline setup guide/)
    expect(
      screen.queryByRole('link', {
        name: 'Available in OpenCode through the Models.dev provider catalog',
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'View Vancine on Models.dev' })
    ).not.toBeInTheDocument()
    unmount()

    renderGuide('rooCode')
    await waitForHeading(/Roo Code setup guide/)
    expect(
      screen.queryByRole('link', {
        name: 'Available in OpenCode through the Models.dev provider catalog',
      })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Configuration-ready').length).toBeGreaterThan(0)
  })
})

describe('OpenCode verification evidence section', () => {
  it('keeps the v1.18.3 fact, the Pi relationship and the benchmark link in one section', async () => {
    renderGuide('opencode')

    // The section exists as a standalone evidence chapter.
    await waitForHeading('Verification evidence')
    // The factual v1.18.3 boundary lives only here.
    expect(
      screen.getByText(/v1\.18\.3 live check described on this page/)
    ).toBeInTheDocument()
    // The same section explains the Pi-vs-OpenCode relationship.
    expect(
      screen.getByText(/run in the Pi coding agent, not in OpenCode/)
    ).toBeInTheDocument()
    const benchmarkLink = screen.getByRole('link', {
      name: 'See the 8-model Pi coding-agent benchmark',
    })
    expect(benchmarkLink).toHaveAttribute('href', '/coding-agent-benchmark')
  })
})

describe('OpenCode /connect primary path', () => {
  it('leads with /connect and /models, and keeps JSON in the optional advanced section', async () => {
    const { container } = renderGuide('opencode')

    await waitForHeading(/OpenCode setup guide/)
    expect(
      screen.getByText('Basic setup does not require creating or editing opencode.json.')
    ).toBeInTheDocument()
    expect(screen.getByText('In OpenCode, run /connect.')).toBeInTheDocument()
    expect(screen.getByText('Search for and select Vancine.')).toBeInTheDocument()
    expect(screen.getByText('Paste your own Vancine API Key.')).toBeInTheDocument()
    expect(screen.getByText('Run /models.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Choose vancine/glm-5.3-flash, or another model under the vancine Provider, then send a prompt.'
      )
    ).toBeInTheDocument()

    const stepsList = container.querySelector('ol')
    if (!stepsList) {
      throw new Error('OpenCode primary steps list is missing')
    }
    expect(stepsList.textContent).toContain('/connect')
    expect(stepsList.textContent).toContain('/models')
    expect(stepsList.textContent).toContain('vancine/glm-5.3-flash')
    expect(stepsList.textContent).not.toContain('opencode.json')

    const advanced = screen.getByRole('heading', {
      name: 'Advanced configuration (optional)',
    })
    expect(
      stepsList.compareDocumentPosition(advanced) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(container.textContent).toContain('"provider"')
    expect(container.textContent).toContain('glm-5.3-flash')
    expect(container.textContent).not.toContain('glm-5.1')
    expect(container.textContent).not.toContain('# shell')
    expect(container.textContent).toContain(
      'export VANCINE_API_KEY="sk-your-api-key"'
    )
    expect(container.textContent).not.toContain('"limit"')
    expect(container.textContent).not.toContain('"context"')
    expect(
      screen.getByText(
        /does not imply an official partnership or endorsement by OpenCode/
      )
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain(
      'built-in integration of OpenCode'
    )
  })
})

describe('Guide prerequisites, Base URL and placeholder-only configuration', () => {
  it.each([
    ['opencode', 'OpenCode'],
    ['cline', 'Cline'],
    ['rooCode', 'Roo Code'],
  ] as const)(
    '%s shows prerequisites, Base URL and placeholder credentials',
    async (tool, toolName) => {
      const { container } = renderGuide(tool)

      await waitForHeading('Prerequisites')
      expect(screen.getByText('A Vancine account.')).toBeInTheDocument()
      expect(screen.getByText('A Vancine API key.')).toBeInTheDocument()
      expect(
        screen.getByText(`${toolName} installed on your machine.`)
      ).toBeInTheDocument()

      if (tool === 'opencode') {
        expect(
          screen.queryByRole('heading', { name: 'Vancine Base URL' })
        ).not.toBeInTheDocument()
      } else {
        expect(
          screen.getByRole('heading', { name: 'Vancine Base URL' })
        ).toBeInTheDocument()
      }
      expect(container.textContent).toContain(BASE_URL)
      if (tool !== 'opencode') {
        expect(screen.getAllByText(BASE_URL).length).toBeGreaterThan(0)
      }

      // Configuration examples use only obvious placeholders.
      expect(container.textContent).toContain('sk-your-api-key')
      expect(container.textContent).not.toMatch(REAL_KEY_PATTERN)
      expect(
        screen.getByText(
          /Replace sk-your-api-key with your own Vancine API key/
        )
      ).toBeInTheDocument()
    }
  )
})

describe('Guide models, troubleshooting and CTAs', () => {
  it.each(['opencode', 'cline', 'rooCode'] as const)(
    '%s links models and pricing to the existing pages',
    async (tool) => {
      renderGuide(tool)

      await waitForHeading('Recommended models')
      const modelsLink = screen.getByRole('link', { name: 'Browse models' })
      expect(modelsLink).toHaveAttribute('href', '/docs/models')
      const pricingLinks = [
        ...screen.getAllByRole('link', { name: 'View pricing' }),
        ...screen.getAllByRole('link', { name: 'Compare models and pricing' }),
      ]
      expect(
        pricingLinks.every((link) => link.getAttribute('href') === '/pricing')
      ).toBe(true)
      // No hard-coded model capability, context or price claims.
      expect(
        screen.getByText(/maintained on the Models and Pricing pages/)
      ).toBeInTheDocument()
    }
  )

  it.each(['opencode', 'cline', 'rooCode'] as const)(
    '%s covers the four common setup errors',
    async (tool) => {
      renderGuide(tool)

      await waitForHeading('Common errors')
      expect(
        screen.getByText(/404, CORS or connection errors/)
      ).toBeInTheDocument()
      expect(screen.getByText(/401 \/ invalid API key/)).toBeInTheDocument()
      expect(
        screen.getByText(/model not found \/ model does not exist/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Unexpected responses or unsupported-endpoint errors/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/most OpenAI-compatible tools use Chat Completions/)
      ).toBeInTheDocument()
    }
  )

  it.each(['opencode', 'cline', 'rooCode'] as const)(
    '%s shows sign-up and pricing CTAs for visitors and a back link',
    async (tool) => {
      renderGuide(tool)

      await waitForHeading('Get started')
      const signUp = screen.getByRole('link', {
        name: 'Create a free account',
      })
      expect(signUp).toHaveAttribute('href', '/sign-up')
      const chatDocs = screen.getByRole('link', {
        name: 'Read the Chat Completions API',
      })
      expect(chatDocs).toHaveAttribute('href', '/docs/chat')
      const back = screen.getByRole('link', {
        name: 'Back to Agent Integration',
      })
      expect(back).toHaveAttribute('href', '/docs/agents')
    }
  )

  it('logged-in users get the key management entry instead of sign-up', async () => {
    useAuthStore.setState({
      auth: {
        ...useAuthStore.getState().auth,
        user: { id: 1, username: 'dev', role: 1 },
      },
    })
    renderGuide('opencode')

    await waitForHeading('Get started')
    const keysLink = screen.getByRole('link', {
      name: 'Manage your API keys',
    })
    expect(keysLink).toHaveAttribute('href', '/keys')
    expect(
      screen.queryByRole('link', { name: 'Create a free account' })
    ).not.toBeInTheDocument()
  })

  it('states that Vancine is not an official provider or partner', async () => {
    renderGuide('cline')

    await waitForHeading(/Cline setup guide/)
    expect(
      screen.getByText(
        /not an official provider, partner or built-in integration of Cline/
      )
    ).toBeInTheDocument()
  })
})

describe('Guide metadata wiring', () => {
  it('applies the per-tool canonical metadata while mounted', async () => {
    renderGuide('rooCode')

    await waitForHeading(/Roo Code setup guide/)
    await waitFor(() =>
      expect(document.title).toBe(
        'Roo Code Setup Guide for the Vancine API | Vancine'
      )
    )
    const canonical = document.head.querySelector('link[rel="canonical"]')
    expect(canonical?.getAttribute('href')).toBe(
      'https://vancine.com/docs/agents/roo-code'
    )
  })
})

describe('OpenCode benchmark TOC translation across all seven locales', () => {
  const locales: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['en', enDocs as Record<string, unknown>],
    ['zhCN', zhCNDocs as Record<string, unknown>],
    ['zhTW', zhTWDocs as Record<string, unknown>],
    ['fr', frDocs as Record<string, unknown>],
    ['ru', ruDocs as Record<string, unknown>],
    ['ja', jaDocs as Record<string, unknown>],
    ['vi', viDocs as Record<string, unknown>],
  ]

  it.each(locales)(
    'locale %s shows the translated benchmark heading, never a raw key',
    async (locale, bundle) => {
      await initTestI18n(locale)
      setDocsBundle(locale, bundle)

      const { container } = renderGuide('opencode')

      const agentGuides = (bundle as { agentGuides: Record<string, unknown> })
        .agentGuides
      const expectedTitle = (
        (agentGuides.opencode as Record<string, unknown>)
          .benchmarkTitle as string
      ).trim()
      expect(expectedTitle.length).toBeGreaterThan(0)

      // The H3 heading and the TOC entry both resolve the correct
      // agentGuides.opencode.benchmarkTitle key.
      await waitForHeading(expectedTitle)
      const headings = screen.getAllByRole('heading', {
        name: expectedTitle,
      })
      expect(headings.length).toBeGreaterThanOrEqual(1)

      // No raw i18n key may leak anywhere in the rendered page.
      expect(container.textContent).not.toContain('agentGuides.')
      expect(container.textContent).not.toContain('agents.hub.')
    }
  )
})
