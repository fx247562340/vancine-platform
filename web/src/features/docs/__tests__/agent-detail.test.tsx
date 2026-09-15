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
  getHermesChatCommand,
  HERMES_API_KEY_COMMAND,
  HERMES_MODEL_COMMAND,
  HERMES_PROVIDER_INSTALL_COMMAND,
  OPENCLAW_INSTALL_CLAWHUB_COMMAND,
  OPENCLAW_INSTALL_NPM_COMMAND,
  PI_PROVIDER_INSTALL_COMMAND,
  VANCINE_HERMES_PROVIDER_GITHUB_URL,
  VANCINE_MODELS_DEV_PROVIDER_URL,
  VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
  VANCINE_OPENCLAW_PROVIDER_NPM_URL,
  VANCINE_PI_PROVIDER_CATALOG_URL,
  VANCINE_PI_PROVIDER_GITHUB_URL,
  VANCINE_PI_PROVIDER_NPM_URL,
  type DocsAgentToolKey,
} from '../lib/agents'
import { DOCS_FALLBACK_TEXT_MODEL } from '../lib/example-generation'
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
    // Models.dev stays presented as the real catalog source; the OpenCode
    // relationship disclaimer itself is no longer rendered.
    expect(container.textContent).toContain('Models.dev')
    expect(container.textContent).not.toMatch(
      /does not imply an official partnership or endorsement/
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
      screen.getByText(
        'Basic setup does not require creating or editing opencode.json.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('In OpenCode, run /connect.')).toBeInTheDocument()
    expect(
      screen.getByText('Search for and select Vancine.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Paste your own Vancine API Key.')
    ).toBeInTheDocument()
    expect(screen.getByText('Run /models.')).toBeInTheDocument()
    // step7 references the live-catalog model via the {{modelId}}
    // placeholder; the rendered string is "vancine/<modelId>".
    expect(
      screen.getByText(
        /Choose vancine\/[A-Za-z0-9._-]+, or another model under the vancine Provider/
      )
    ).toBeInTheDocument()

    const stepsList = container.querySelector('ol')
    if (!stepsList) {
      throw new Error('OpenCode primary steps list is missing')
    }
    expect(stepsList.textContent).toContain('/connect')
    expect(stepsList.textContent).toContain('/models')
    expect(stepsList.textContent).toMatch(/vancine\/[A-Za-z0-9._-]+/)
    expect(stepsList.textContent).not.toContain('opencode.json')

    const advanced = screen.getByRole('heading', {
      name: 'Advanced configuration (optional)',
    })
    expect(
      stepsList.compareDocumentPosition(advanced) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(container.textContent).toContain('"provider"')
    // The model id in the opencode.json block mirrors the live catalog
    // (or the verified fallback when the catalog is unavailable). The
    // JSON is pretty-printed and may be HTML-escaped in the rendered
    // tree, so we look for the two adjacent tokens (`"models"` and the
    // dynamic model id) rather than for a single contiguous JSON literal.
    expect(container.textContent).toMatch(/"models"/)
    expect(container.textContent).toMatch(/"deepseek-v4\.1-flash"/)
    expect(container.textContent).not.toContain('glm-5.1')
    expect(container.textContent).not.toContain('glm-5.3-flash')
    expect(container.textContent).not.toContain('# shell')
    expect(container.textContent).toContain(
      'export VANCINE_API_KEY="sk-your-api-key"'
    )
    expect(container.textContent).not.toContain('"limit"')
    expect(container.textContent).not.toContain('"context"')
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

  it.each([
    'opencode',
    'cline',
    'rooCode',
    'pi',
    'openclaw',
    'hermes',
  ] as const)(
    '%s guide renders no relationship disclaimer and no false official claim',
    async (tool) => {
      const { container } = renderGuide(tool)

      await waitForHeading(/setup guide/)
      const text = container.textContent ?? ''
      // The removed relationship-disclaimer sentences: the product decision is
      // to publish no distancing copy at all and simply never assert a false
      // relationship.
      expect(text).not.toMatch(
        /not an official provider, partner or built-in integration/
      )
      expect(text).not.toMatch(
        /does not imply an official partnership or endorsement/
      )
      expect(text).not.toMatch(/does not constitute official cooperation/)
      expect(text).not.toMatch(/is not an official, built-in, or certified/)
      // No replacement distancing wording may appear either, in any language.
      expect(text).not.toMatch(/不构成官方|不構成官方|官方合作|官方背書/)
      // And the page still must never claim a relationship it does not have.
      expect(text).not.toMatch(/is an official partner/i)
      expect(text).not.toMatch(/official supplier/i)
      expect(text).not.toMatch(
        /official (?:Pi|OpenClaw|OpenCode|Cline|Roo Code) provider/i
      )
    }
  )

  it('keeps the OpenClaw technical boundary callouts without any relationship disclaimer', async () => {
    const { container } = renderGuide('openclaw')

    await waitForHeading(/OpenClaw setup guide/)
    const text = container.textContent ?? ''
    // Zero-credential boundary and compatibility-scope notes stay public.
    expect(text).toContain('verified catalog state for the current credential')
    expect(text).toContain(
      'has not yet been exercised across the full range of OpenClaw versions'
    )
    expect(text).not.toMatch(/is not an official, built-in, or certified/)
  })
})

describe('Provider plugin guides (Pi, OpenClaw, Hermes)', () => {
  it.each([
    ['pi', 'Pi setup guide'],
    ['openclaw', 'OpenClaw setup guide'],
    ['hermes', 'Hermes Agent setup guide'],
  ] as const)(
    '%s renders prerequisites, steps, models, errors and the CTA sections',
    async (tool, title) => {
      renderGuide(tool)

      await waitForHeading(new RegExp(title))
      expect(screen.getByText('Prerequisites')).toBeInTheDocument()
      expect(screen.getByText('Step-by-step setup')).toBeInTheDocument()
      expect(screen.getByText('Recommended models')).toBeInTheDocument()
      expect(screen.getByText('Common errors')).toBeInTheDocument()
      expect(screen.getByText('Get started')).toBeInTheDocument()
      // Provider guides never show the manual Base URL / config sections.
      expect(
        screen.queryByRole('heading', { name: 'Vancine Base URL' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Configuration example' })
      ).not.toBeInTheDocument()
    }
  )

  it('pi shows the exact unversioned install command and login/model flow', async () => {
    const { container } = renderGuide('pi')

    await waitForHeading(/Pi setup guide/)
    expect(screen.getByText(PI_PROVIDER_INSTALL_COMMAND)).toBeInTheDocument()
    // The published flow: install → /login → choose Vancine → /model.
    const stepsList = container.querySelector('ol')
    expect(stepsList?.textContent).toContain('/login')
    expect(stepsList?.textContent).toContain('/model')
    expect(stepsList?.textContent).toContain('Choose Vancine')
    expect(screen.getAllByText('Prerequisites').length).toBeGreaterThan(0)
    // Never a pinned version in the displayed install command.
    expect(container.textContent).not.toContain('pi-provider-vancine@')
  })

  it('openclaw shows both install sources, onboarding and the verified-list step', async () => {
    const { container } = renderGuide('openclaw')

    await waitForHeading(/OpenClaw setup guide/)
    expect(screen.getByText(OPENCLAW_INSTALL_NPM_COMMAND)).toBeInTheDocument()
    expect(
      screen.getByText(OPENCLAW_INSTALL_CLAWHUB_COMMAND)
    ).toBeInTheDocument()
    const stepsList = container.querySelector('ol')
    expect(stepsList?.textContent).toContain('openclaw onboard')
    expect(stepsList?.textContent).toContain('openclaw models list')
    // Onboarding enters the key at the interactive secret prompt; no CLI
    // flag may put the key on the command line.
    expect(stepsList?.textContent).not.toContain('--vancine-api-key')
    // The legacy manual env config must never reappear on the guide.
    expect(container.textContent).not.toContain('VANCINE_MODEL')
    expect(container.textContent).not.toContain('VANCINE_BASE_URL')
    // The compatibility requirement names the exact required OpenClaw
    // version on the page.
    expect(container.textContent).toContain('2026.9.4')
  })

  it.each([
    ['pi', VANCINE_PI_PROVIDER_NPM_URL, VANCINE_PI_PROVIDER_GITHUB_URL],
    [
      'openclaw',
      VANCINE_OPENCLAW_PROVIDER_NPM_URL,
      VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
    ],
  ] as const)(
    '%s links its npm, GitHub (and the exact ClawHub package page) as external links',
    async (tool, npmUrl, githubUrl) => {
      const { container } = renderGuide(tool)

      await waitForHeading(
        new RegExp(`${tool === 'pi' ? 'Pi' : 'OpenClaw'} setup guide`)
      )
      const links = [...container.querySelectorAll('a')].map((a) =>
        a.getAttribute('href')
      )
      expect(links).toContain(npmUrl)
      expect(links).toContain(githubUrl)
      if (tool === 'pi') {
        // Pi's own catalog page is a third, discovery-only source.
        expect(links).toContain(VANCINE_PI_PROVIDER_CATALOG_URL)
      }
      if (tool === 'openclaw') {
        // The exact package page, never the bare ClawHub homepage.
        expect(links).toContain(VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL)
        expect(VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL).toBe(
          'https://clawhub.ai/vancine/plugins/openclaw-provider'
        )
        expect(links).not.toContain('https://clawhub.ai/')
      }
    }
  )

  it('orders the Pi package sources catalog, npm, then GitHub, and keeps the npm install command', async () => {
    const { container } = renderGuide('pi')

    await waitForHeading(/Pi setup guide/)
    // The three source links render as one paragraph in this order: Pi's
    // catalog entry first, then the actual npm distribution, then the repo.
    const sourceRow = container.querySelector(
      `a[href="${VANCINE_PI_PROVIDER_CATALOG_URL}"]`
    )?.parentElement
    expect(sourceRow).not.toBeNull()
    expect(
      [...(sourceRow?.querySelectorAll('a') ?? [])].map((a) =>
        a.getAttribute('href')
      )
    ).toEqual([
      VANCINE_PI_PROVIDER_CATALOG_URL,
      VANCINE_PI_PROVIDER_NPM_URL,
      VANCINE_PI_PROVIDER_GITHUB_URL,
    ])
    // The catalog lists the package; installation still comes from npm, so the
    // published command must stay the unversioned npm: form.
    expect(PI_PROVIDER_INSTALL_COMMAND).toBe(
      'pi install npm:pi-provider-vancine'
    )
    expect(screen.getByText(PI_PROVIDER_INSTALL_COMMAND)).toBeInTheDocument()
    // No fixed package version may be advertised anywhere on the guide.
    expect(container.textContent).not.toMatch(/\b0\.1\.\d/)
  })

  it('keeps the OpenClaw source links unchanged: npm, ClawHub, then GitHub', async () => {
    const { container } = renderGuide('openclaw')

    await waitForHeading(/OpenClaw setup guide/)
    const sourceRow = container.querySelector(
      `a[href="${VANCINE_OPENCLAW_PROVIDER_NPM_URL}"]`
    )?.parentElement
    expect(sourceRow).not.toBeNull()
    expect(
      [...(sourceRow?.querySelectorAll('a') ?? [])].map((a) =>
        a.getAttribute('href')
      )
    ).toEqual([
      VANCINE_OPENCLAW_PROVIDER_NPM_URL,
      VANCINE_OPENCLAW_PROVIDER_CLAWHUB_URL,
      VANCINE_OPENCLAW_PROVIDER_GITHUB_URL,
    ])
    // OpenClaw has no Pi catalog entry and must not gain one.
    expect(
      container.querySelector(`a[href="${VANCINE_PI_PROVIDER_CATALOG_URL}"]`)
    ).toBeNull()
  })

  it.each(['pi', 'openclaw', 'hermes'] as const)(
    '%s scopes model choice to its own list instead of the generic all-models line',
    async (tool) => {
      const { container } = renderGuide(tool)

      await waitForHeading('Recommended models')
      // The shared "use any Vancine text (chat) model" line must not render
      // on provider guides.
      expect(container.textContent).not.toContain(
        'Use any Vancine text (chat) model'
      )
      if (tool === 'pi') {
        expect(container.textContent).toContain('/model')
      } else if (tool === 'openclaw') {
        expect(container.textContent).toContain(
          'openclaw models list --provider vancine --refresh --json'
        )
      } else {
        expect(container.textContent).toContain('hermes model')
      }
    }
  )

  it.each(['pi', 'openclaw', 'hermes'] as const)(
    '%s shows exactly one primary-colored CTA (anonymous → /sign-up) and reference links stay secondary',
    async (tool) => {
      const { container } = renderGuide(tool)

      await waitForHeading('Get started')
      // Visual hierarchy: exactly ONE bg-primary anchor on the whole page.
      const primaryLinks = [...container.querySelectorAll('a.bg-primary')]
      expect(primaryLinks).toHaveLength(1)
      expect(primaryLinks[0]?.getAttribute('href')).toBe('/sign-up')
      // Models and Pricing are plain secondary links without bg-primary.
      for (const href of ['/docs/models', '/pricing']) {
        for (const link of container.querySelectorAll(`a[href="${href}"]`)) {
          expect(link.className).not.toContain('bg-primary')
        }
      }
    }
  )

  it.each(['pi', 'openclaw', 'hermes'] as const)(
    '%s shows exactly one primary-colored CTA when logged in (→ /keys)',
    async (tool) => {
      useAuthStore.setState({
        auth: {
          ...useAuthStore.getState().auth,
          user: { id: 1, username: 'dev', role: 1 },
        },
      })
      const { container } = renderGuide(tool)

      await waitForHeading('Get started')
      const primaryLinks = [...container.querySelectorAll('a.bg-primary')]
      expect(primaryLinks).toHaveLength(1)
      expect(primaryLinks[0]?.getAttribute('href')).toBe('/keys')
      expect(
        screen.queryByRole('link', { name: 'Create a free account' })
      ).not.toBeInTheDocument()
    }
  )

  it.each(['opencode', 'cline', 'rooCode'] as const)(
    '%s keeps its primary-styled Models button and auxiliary Pricing link',
    async (tool) => {
      const { container } = renderGuide(tool)

      await waitForHeading('Recommended models')
      // Manual-config guides keep the pre-existing primary-styled Models
      // button visible to users.
      const modelsLink = [
        ...container.querySelectorAll('a[href="/docs/models"]'),
      ]
      expect(modelsLink.length).toBeGreaterThanOrEqual(1)
      for (const link of modelsLink) {
        expect(link.className).toContain('bg-primary')
      }
      // Pricing stays auxiliary.
      for (const link of container.querySelectorAll('a[href="/pricing"]')) {
        expect(link.className).not.toContain('bg-primary')
      }
    }
  )

  it('logged-in users get the keys CTA on the OpenClaw guide', async () => {
    useAuthStore.setState({
      auth: {
        ...useAuthStore.getState().auth,
        user: { id: 1, username: 'dev', role: 1 },
      },
    })
    renderGuide('openclaw')

    await waitForHeading('Get started')
    expect(
      screen.getByRole('link', { name: 'Manage your API keys' })
    ).toHaveAttribute('href', '/keys')
    expect(
      screen.queryByRole('link', { name: 'Create a free account' })
    ).not.toBeInTheDocument()
  })

  it.each(['pi', 'openclaw', 'hermes'] as const)(
    '%s keeps the technical boundaries and shows no official/built-in claim',
    async (tool) => {
      const { container } = renderGuide(tool)

      await waitForHeading(/setup guide/)
      const text = container.textContent ?? ''
      if (tool === 'openclaw') {
        // The accurate zero-credential boundary must be present.
        expect(text).toContain(
          'verified catalog state for the current credential'
        )
      }
      // Banned claims must never appear.
      expect(text).not.toMatch(/official Pi provider/i)
      expect(text).not.toMatch(/official OpenClaw provider/i)
      expect(text).not.toMatch(/permanently free/i)
      expect(text).not.toMatch(/Live-verified/)
      expect(text).not.toMatch(/all models/i)
    }
  )

  it.each(['pi', 'openclaw'] as const)(
    '%s covers provider-specific troubleshooting entries',
    async (tool) => {
      renderGuide(tool)

      await waitForHeading('Common errors')
      if (tool === 'pi') {
        expect(
          screen.getByText('The Vancine provider does not appear in /login.')
        ).toBeInTheDocument()
        expect(
          screen.getByText('The API key is rejected (401 / invalid API key).')
        ).toBeInTheDocument()
        expect(
          screen.getByText('A model id is missing or was delisted.')
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'The model catalog is temporarily unavailable or /model stays empty.'
          )
        ).toBeInTheDocument()
      } else {
        expect(
          screen.getByText(
            'The plugin is not loaded or no vancine models appear after install.'
          )
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'Authentication fails (401/403) or the key is rejected.'
          )
        ).toBeInTheDocument()
        expect(
          screen.getByText('No usable Vancine models appear for your key.')
        ).toBeInTheDocument()
        expect(
          screen.getByText('A delisted or unauthorized model is refused.')
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'Both the npm and the ClawHub copies of the plugin are installed.'
          )
        ).toBeInTheDocument()
      }
    }
  )

  it('provider guide pages keep the fixed query-free metadata while mounted', async () => {
    renderGuide('pi')

    await waitForHeading(/Pi setup guide/)
    await waitFor(() =>
      expect(document.title).toBe(
        'Pi Setup Guide for the Vancine API | Vancine'
      )
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/docs/agents/pi')
  })
})

describe('Hermes Agent provider guide', () => {
  it('shows the GitHub install, the API key export, and the model/chat commands', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    expect(
      screen.getByText(HERMES_PROVIDER_INSTALL_COMMAND)
    ).toBeInTheDocument()
    expect(screen.getByText(HERMES_API_KEY_COMMAND)).toBeInTheDocument()
    expect(screen.getByText(HERMES_MODEL_COMMAND)).toBeInTheDocument()

    const stepsList = container.querySelector('ol')
    expect(stepsList?.textContent).toContain('hermes plugins install')
    expect(stepsList?.textContent).toContain('VANCINE_API_KEY')
    expect(stepsList?.textContent).toContain('hermes model')
    expect(stepsList?.textContent).toContain('hermes chat --provider vancine')
    // The published flow: install → enable vancine-provider → key → restart
    // the backend → pick a model → call it.
    expect(stepsList?.textContent).toContain("Enable 'vancine-provider' now?")
    expect(stepsList?.textContent).toMatch(
      /Restart the Hermes CLI, Gateway, or Desktop backend/
    )
    // Each command sits under its own step, in this exact order.
    const stepText = [...(stepsList?.children ?? [])].map(
      (li) => li.textContent ?? ''
    )
    expect(stepText).toHaveLength(6)
    expect(stepText[0]).toContain(HERMES_PROVIDER_INSTALL_COMMAND)
    expect(stepText[1]).toContain("Enable 'vancine-provider' now?")
    expect(stepText[1]).not.toContain(HERMES_API_KEY_COMMAND)
    expect(stepText[2]).toContain(HERMES_API_KEY_COMMAND)
    expect(stepText[3]).toMatch(/Restart the Hermes CLI, Gateway, or Desktop/)
    expect(stepText[3]).not.toContain('hermes model')
    expect(stepText[4]).toContain(HERMES_MODEL_COMMAND)
    expect(stepText[5]).toContain(
      getHermesChatCommand(DOCS_FALLBACK_TEXT_MODEL)
    )
  })

  it('embeds the live-catalog recommended model in the call example, never a retired id', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    // The rendered command uses the shared verified fallback id exactly
    // when the live catalog is unavailable in the test environment.
    const command = getHermesChatCommand(DOCS_FALLBACK_TEXT_MODEL)
    expect(screen.getByText(command)).toBeInTheDocument()
    expect(command).toBe(
      'hermes chat --provider vancine -m deepseek-v4.1-flash'
    )
    // A delisted snapshot id must never be hardcoded on the page, and the
    // page must not maintain a static full model whitelist.
    expect(container.textContent).not.toContain('deepseek-flash')
    expect(container.textContent).not.toContain('deepseek-v4-flash')
    expect(container.textContent).not.toContain('hy4-preview')
    expect(container.textContent).not.toContain('glm-5.3-flash')
    expect(container.textContent).toContain(
      'The plugin ships no hardcoded full model list.'
    )
    expect(container.textContent).toContain(
      'this page never maintains a static model whitelist'
    )
  })

  it('picks the live-catalog model id over the fallback when the catalog resolves', () => {
    // The catalog-backed pick: any resolved id flows through the same
    // command builder, so a live catalog never shows the fallback id.
    const live = getHermesChatCommand('kimi-k3')
    expect(live).toBe('hermes chat --provider vancine -m kimi-k3')
    expect(live).not.toContain(DOCS_FALLBACK_TEXT_MODEL)
  })

  it('links only the public GitHub source — no npm, PyPI, ClawHub or catalog link', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    const links = [...container.querySelectorAll('a')].map((a) =>
      a.getAttribute('href')
    )
    expect(links).toContain(VANCINE_HERMES_PROVIDER_GITHUB_URL)
    for (const forbidden of [
      'npmjs.com',
      'npm:',
      'pypi.org',
      'clawhub.ai',
      'pi.dev',
      'models.dev',
    ]) {
      expect(
        links.filter((href) => (href ?? '').includes(forbidden)),
        `no Hermes source link may point at ${forbidden}`
      ).toEqual([])
    }
    const external = links.filter((href) => (href ?? '').startsWith('https://'))
    expect(new Set(external)).toEqual(
      new Set([VANCINE_HERMES_PROVIDER_GITHUB_URL])
    )
    expect(container.textContent).not.toContain('official plugin catalog')
  })

  it('covers the CLI, Gateway, Desktop local and Desktop remote install locations', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    expect(screen.getByText('Where to install the plugin')).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).toContain('Hermes CLI: install it in the HERMES_HOME')
    expect(text).toContain(
      "Hermes Gateway: install it in the Gateway host's HERMES_HOME"
    )
    expect(text).toContain('Hermes Desktop with a local backend')
    expect(text).toContain('Hermes Desktop with a remote Gateway')
    // The remote-Gateway entry names the wrong-host mistake explicitly.
    expect(text).toContain('not only on the machine showing the Desktop UI')
    // One install serves the CLI, Gateway and Desktop: no separate Desktop
    // plugin exists.
    expect(text).toContain('there is no separate Desktop plugin')
  })

  it('covers plugin, key, model, wrong-host and delisted-model errors', async () => {
    renderGuide('hermes')

    await waitForHeading('Common errors')
    expect(
      screen.getByText(
        'The vancine provider does not appear in Hermes after installing.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('The API key is rejected (401 / invalid API key).')
    ).toBeInTheDocument()
    expect(
      screen.getByText('No Vancine models appear in the model list.')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Hermes Desktop shows no Vancine provider while the CLI on another machine works.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('model not found, or the model id is rejected.')
    ).toBeInTheDocument()
  })

  it('never puts the API key on the command line or into a URL', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    const commandBlocks = [...container.querySelectorAll('code')].map(
      (el) => el.textContent ?? ''
    )
    for (const block of commandBlocks) {
      expect(block).not.toMatch(/VANCINE_API_KEY="sk-[A-Za-z0-9]{20,}"/)
      expect(block).not.toMatch(/[?&]api[_-]?key=/i)
    }
    // The key export uses the obvious placeholder only.
    expect(container.textContent).toContain(
      'export VANCINE_API_KEY="sk-your-api-key"'
    )
    expect(container.textContent).not.toMatch(REAL_KEY_PATTERN)
  })

  it('renders the shared guide sections in order, with the surface block between steps and models', async () => {
    const { container } = renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    const sectionOrder = [...container.querySelectorAll('h3')].map((heading) =>
      heading.textContent?.trim()
    )
    expect(sectionOrder).toEqual([
      'Prerequisites',
      'Step-by-step setup',
      'Recommended models',
      'Common errors',
      'Get started',
    ])

    // Within the setup section: the enable note, the numbered steps, then the
    // install-location block, then the Models section.
    const enableNote = screen.getByText(/there is no separate Desktop plugin/)
    const stepsList = container.querySelector('ol')
    const surfaces = screen.getByText('Where to install the plugin')
    const modelsHeading = screen.getByRole('heading', {
      name: 'Recommended models',
    })
    expect(stepsList).not.toBeNull()
    expect(
      enableNote.compareDocumentPosition(stepsList as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(
      (stepsList as Node).compareDocumentPosition(surfaces) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(
      surfaces.compareDocumentPosition(modelsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  it('keeps the fixed query-free Hermes metadata while mounted', async () => {
    renderGuide('hermes')

    await waitForHeading(/Hermes Agent setup guide/)
    await waitFor(() =>
      expect(document.title).toBe(
        'Hermes Agent Setup Guide for the Vancine API | Vancine'
      )
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/docs/agents/hermes')
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
