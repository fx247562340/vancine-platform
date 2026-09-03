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
// Home-page first-topup-bonus wiring regression.
//
// The Hero must:
//   - open normally on the real first-topup-bonus configuration
//     (QuotaForFirstTopUp=500000, quota_per_unit=500000), including on
//     browsers whose interface language is one of the project's
//     internal non-BCP-47 codes (zhCN / zhTW, see
//     src/i18n/config.ts supportedLngs) — before the locale fix,
//     `new Intl.NumberFormat('zhCN')` threw
//     `RangeError: Invalid language tag: zhCN`, which tore down the
//     entire home subtree.
//   - render the bonus callout, the EXACT 500,000 Bonus Credits
//     value, the EXACT $1 / US$1 USD API-balance equivalent, and the
//     Unlock entry, when the promotion is active.
//   - route the guest Unlock entry to /sign-up and the signed-in
//     entry to /wallet — and the user-visible click must land on the
//     corresponding registered route, not just match the href.
//   - hide the entire bonus block when the promotion is inactive
//     (active=false), even if a positive quota is present, so the
//     off-state layout is unchanged.
//
// The only mock is the HTTP boundary: `@/lib/api`'s `getStatus` (and
// the home page's secondary data endpoints). The real `useStatus`
// → React Query → `useFirstTopUpBonus` → `formatFirstTopUpBonus` →
// `toIntlLocale` → `Intl.NumberFormat` chain is exercised end to end.
// The i18next instance is created with `createInstance` and provided
// via `<I18nextProvider>` so the global i18next singleton is never
// touched and tests stay order-independent across the full
// `bun run test` run.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Per-test mutable status payload. Flipping a field here is observed
// by the real `useStatus` → React Query chain on its next fetch
// (no `useStatus` mock — the regression is precisely that the real
// hook + the real hook chain survives the zhCN Intl path).
const statusMock = vi.hoisted(() => ({
  current: {
    system_name: 'Vancine',
    quota_per_unit: 500000,
    first_topup_bonus_quota: 500000,
    first_topup_bonus_active: true,
  } as Record<string, unknown>,
}))

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    getStatus: vi.fn(async () => statusMock.current),
    api: {
      get: vi.fn(async (url: string) => {
        if (url === '/api/homepage/stats') {
          return {
            data: {
              window_days: 30,
              successful_requests: { value: 0, availability: 'unavailable' },
              processed_tokens: { value: 0, availability: 'unavailable' },
              active_vendor_count: { value: 0, availability: 'unavailable' },
              available_model_count: { value: 0, availability: 'unavailable' },
              as_of: 0,
            },
          }
        }
        return { data: null }
      }),
    },
  }
})

vi.mock('@/features/home/api', () => ({
  getHomePageContent: vi.fn(async () => ({ data: '', success: true })),
}))
vi.mock('@/features/pricing/api', () => ({
  getPricing: vi.fn(async () => ({
    data: { auto_groups: ['default'], data: [] },
    success: true,
  })),
}))

import { Hero } from '@/features/home/components/sections/hero'
import enLocale from '@/i18n/locales/en.json'
import zhLocale from '@/i18n/locales/zh.json'

let i18nInstance: typeof i18next

beforeAll(async () => {
  // Per-test isolated i18next instance: the global i18next is a
  // module-level singleton shared by every test file in one vitest
  // worker, and other suites initialize it in their own order. An
  // isolated instance with its own resources guarantees the locale
  // contract this test guards is exactly what the production runtime
  // sees when the user picks 简体中文.
  i18nInstance = i18next.createInstance()
  await i18nInstance.use(initReactI18next).init({
    // The project's internal code, NOT a BCP-47 tag. This is the
    // exact value i18next reports at runtime on the live site when
    // the user picks 简体中文 from the language switcher.
    lng: 'zhCN',
    fallbackLng: 'en',
    ns: ['translation'],
    defaultNS: 'translation',
    // Both en and zhCN resources are loaded so any missing zh key
    // falls back to en instead of returning the raw key string.
    resources: {
      zhCN: {
        translation: (zhLocale as { translation: Record<string, string> })
          .translation,
      },
      en: {
        translation: (enLocale as { translation: Record<string, string> })
          .translation,
      },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })
})

afterEach(() => {
  cleanup()
  // `useStatus` persists its payload to localStorage; clear it so
  // the next test starts from a clean status (no stale active /
  // inactive payload bleeding across the two suites in this file).
  try {
    window.localStorage.clear()
  } catch {
    /* jsdom without localStorage: ignore */
  }
  // Reset to the active-500000 default so the next test starts
  // from a known state; tests that want inactive overwrite before
  // render.
  statusMock.current = {
    system_name: 'Vancine',
    quota_per_unit: 500000,
    first_topup_bonus_quota: 500000,
    first_topup_bonus_active: true,
  }
})

// Build a real TanStack Router with /sign-up and /wallet registered as
// real routes. Each route's `component` is a stand-in (renders a
// data-testid identifying itself), so the post-click assertion can
// look up the destination page by its testid rather than reading the
// href or guessing at the URL. This is the contract that proves the
// click actually navigated.
function buildRouterWithDestinations(opts: { isAuthenticated?: boolean } = {}) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Hero isAuthenticated={opts.isAuthenticated} />,
  })
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: () => <div data-testid='page-sign-up' />,
  })
  const walletRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/wallet',
    component: () => <div data-testid='page-wallet' />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, signUpRoute, walletRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return router
}

function renderHeroRoute(opts: { isAuthenticated?: boolean } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const router = buildRouterWithDestinations(opts)
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18nInstance}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  )
  return router
}

describe('home hero first-topup-bonus wiring (active + zhCN)', () => {
  it('mounts the hero without crashing and never renders the Intl error overlay', async () => {
    renderHeroRoute()

    // The hero must mount. Before the locale fix, the Intl.RangeError
    // inside useFirstTopUpBonus tore the whole subtree down and the
    // page collapsed into the React error overlay; the hero testid
    // would not appear.
    const hero = await screen.findByTestId('homepage-hero')
    expect(hero).toBeInTheDocument()

    // The page must NOT be the React error overlay. The broken Intl
    // path produced the literal "Something went wrong!" banner with
    // a "Incorrect locale information provided" code block; both
    // markers are part of the user-visible failure surface this
    // regression guards.
    await waitFor(() => {
      expect(document.body.textContent ?? '').not.toContain(
        'Something went wrong!'
      )
    })
    expect(document.body.textContent ?? '').not.toContain(
      'Incorrect locale information provided'
    )
  })

  it('renders the bonus callout with the exact 500,000 Bonus Credits and $1 / US$1 USD API balance', async () => {
    renderHeroRoute()
    await screen.findByTestId('homepage-hero')

    // The bonus callout (Alert with a fixed data-testid) must mount.
    const callout = await screen.findByTestId('first-topup-bonus-callout')
    expect(callout).toBeInTheDocument()

    // Exact bonus-amount assertion. The user-visible bonus surface
    // carries the literal "500,000 Bonus Credits" string in the
    // Unlock link (the callout body translates "Bonus Credits" to
    // 额度 in zh locales, but the product unit "Bonus Credits" is
    // intentionally preserved on the Unlock CTA per the project's
    // product-name policy). Asserting the full "500,000 Bonus
    // Credits" substring pins the bonus amount AND the English
    // product unit together — a bare "500,000" would also pass for
    // any other 500,000 quantity, and a bare "Bonus Credits" would
    // miss the configured value.
    const hero = await screen.findByTestId('homepage-hero')
    expect(hero.textContent ?? '').toMatch(/500,000 Bonus Credits/)

    // Exact USD API-balance assertion. The regex `/(?:US)?\$1(?![\d.,])/u`
    // matches `$1` or `US$1` only when the next character is NOT a
    // digit, a dot, or a comma — so the assertion explicitly rejects
    // `$10`, `$1.5`, `$1.99`, `$1,000` and any longer / fractional
    // form. Intl.NumberFormat with currency:'USD' produces `$1` in
    // en and `US$1` in zh-CN/zh-TW; both are accepted.
    const calloutText = callout.textContent ?? ''
    expect(calloutText).toMatch(/(?:US)?\$1(?![\d.,])/u)
  })

  it('shows an Unlock entry whose accessible name includes "Bonus Credits"', async () => {
    renderHeroRoute()
    const hero = await screen.findByTestId('homepage-hero')

    // The Unlock link's accessible name is localized ("Unlock 500,000
    // Bonus Credits" in en, "解锁 500,000 Bonus Credits" in zh);
    // "Bonus Credits" is the locale-agnostic tail.
    const link = await within(hero).findByRole('link', {
      name: /Bonus Credits/,
    })
    expect(link).toBeInTheDocument()
  })

  it('routes the guest Unlock click to /sign-up and the signed-in click to /wallet', async () => {
    // Guest path: the user-visible click must land on the /sign-up
    // route. The router is registered with /sign-up rendering a
    // stand-in with data-testid="page-sign-up", so after the click
    // we assert that testid is present and the hero is no longer
    // mounted on /. The href alone is NOT asserted here because the
    // contract is the user-visible navigation outcome, not the
    // anchor attribute.
    {
      const user = userEvent.setup()
      const router = renderHeroRoute()
      await screen.findByTestId('homepage-hero')
      const link = await screen.findByRole('link', {
        name: /Bonus Credits/,
      })
      // href sanity-check: still asserted because the production
      // user-visible affordance is the anchor's href, but the
      // navigation itself is the primary contract.
      expect(link.getAttribute('href')).toBe('/sign-up')
      await user.click(link)
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/sign-up')
      })
      await waitFor(() => {
        expect(screen.getByTestId('page-sign-up')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('homepage-hero')).not.toBeInTheDocument()
    }
    cleanup()

    // Signed-in path: rerender the hero with isAuthenticated and
    // confirm the user-visible click lands on the /wallet route.
    {
      const user = userEvent.setup()
      const router = renderHeroRoute({ isAuthenticated: true })
      await screen.findByTestId('homepage-hero')
      const link = await screen.findByRole('link', {
        name: /Bonus Credits/,
      })
      expect(link.getAttribute('href')).toBe('/wallet')
      await user.click(link)
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/wallet')
      })
      await waitFor(() => {
        expect(screen.getByTestId('page-wallet')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('homepage-hero')).not.toBeInTheDocument()
    }
  })
})

describe('home hero first-topup-bonus wiring (inactive)', () => {
  it('hides the bonus callout and Unlock entry when the promotion is inactive even with a positive quota', async () => {
    // active=false with a positive quota is the explicit "admin
    // configured the field but disabled the promotion" case; the
    // hero must render exactly as before, with NO bonus block.
    statusMock.current = {
      system_name: 'Vancine',
      quota_per_unit: 500000,
      first_topup_bonus_quota: 500000,
      first_topup_bonus_active: false,
    }
    renderHeroRoute()
    const hero = await screen.findByTestId('homepage-hero')
    expect(hero).toBeInTheDocument()
    // The bonus block must stay gone even after the React Query
    // fetch settles with active=false, so wait long enough for
    // the re-render.
    await waitFor(() => {
      expect(
        screen.queryByTestId('first-topup-bonus-callout')
      ).not.toBeInTheDocument()
    })
    expect(
      within(hero).queryByRole('link', { name: /Bonus Credits/ })
    ).not.toBeInTheDocument()
  })
})
