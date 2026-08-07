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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiKeyGroupCombobox } from '../api-key-group-combobox'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Auto: 'Auto',
        Ratio: 'Ratio',
        'Search...': 'Search...',
        'No group found.': 'No group found.',
        'Select a group': 'Select a group',
      },
    },
  },
})

// ----------------------------------------------------------------------------
// matchMedia stub: useMediaQuery uses useSyncExternalStore against
// window.matchMedia, so the returned object must be stable per query and a
// real EventTarget so dispatching a `change` event re-renders the component.
// ----------------------------------------------------------------------------

let shouldReduceMotion = false
const mqlCache = new Map<string, MockMediaQueryList>()

class MockMediaQueryList extends EventTarget {
  media: string
  constructor(query: string) {
    super()
    this.media = query
  }
  get matches(): boolean {
    return shouldReduceMotion
  }
  onchange: ((this: MockMediaQueryList, ev: Event) => unknown) | null = null
  addListener = vi.fn()
  removeListener = vi.fn()
}

beforeEach(() => {
  shouldReduceMotion = false
  mqlCache.clear()
  vi.stubGlobal('matchMedia', (query: string) => {
    let mql = mqlCache.get(query)
    if (!mql) {
      mql = new MockMediaQueryList(query)
      mqlCache.set(query, mql)
    }
    return mql
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setReducedMotion(value: boolean) {
  shouldReduceMotion = value
  mqlCache
    .get('(prefers-reduced-motion: reduce)')
    ?.dispatchEvent(new Event('change'))
}

const options = [
  {
    value: 'auto',
    label: 'auto',
    desc: 'Global automatic routing',
    ratio: '自动',
  },
  { value: 'default', label: 'default', desc: 'User group', ratio: 1 },
  { value: 'vip', label: 'vip', desc: 'Priority group', ratio: 3 },
]

function Harness(props: { initialValue: string }) {
  const [value, setValue] = useState(props.initialValue)

  return (
    <I18nextProvider i18n={i18n}>
      <ApiKeyGroupCombobox
        options={options}
        value={value}
        onValueChange={setValue}
      />
      <output data-testid='selected-group'>{value}</output>
    </I18nextProvider>
  )
}

function getCommandItem(label: string): HTMLElement {
  const item = [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-slot="command-item"]'
    ),
  ].find((candidate) => candidate.textContent?.includes(label))
  expect(item).not.toBeUndefined()
  return item as HTMLElement
}

describe('API key group combobox Auto effect', () => {
  it('rings the selected Auto trigger and its localized ratio without rendering the API ratio text', async () => {
    setReducedMotion(false)
    const user = userEvent.setup()
    const { container } = render(<Harness initialValue='auto' />)

    const trigger = screen.getByRole('combobox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.dataset.autoGroupEffect).toBe('trigger')
    expect(trigger.classList.contains('overflow-hidden')).toBe(false)
    expect(trigger.classList.contains('overflow-visible')).toBe(true)

    const triggerFlowBorder = trigger.querySelector<HTMLElement>(
      '[data-auto-group-flow-border]'
    )
    expect(triggerFlowBorder).not.toBeNull()
    expect(triggerFlowBorder?.getAttribute('aria-hidden')).toBe('true')
    expect(triggerFlowBorder?.classList.contains('pointer-events-none')).toBe(
      true
    )
    expect(
      triggerFlowBorder?.classList.contains('auto-group-flow-border')
    ).toBe(true)

    const triggerRatio = trigger.querySelector<HTMLElement>(
      '[data-auto-group-effect="ratio"]'
    )
    expect(triggerRatio).not.toBeNull()
    expect(triggerRatio?.textContent).toBe('Auto Ratio')
    expect(triggerRatio?.textContent?.includes('自动')).toBe(false)
    expect(trigger.textContent?.includes('自动')).toBe(false)
    expect(triggerRatio?.classList.contains('overflow-visible')).toBe(true)
    expect(
      triggerRatio?.querySelector('[data-auto-group-flow-border]')
    ).not.toBeNull()

    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    const autoOption = getCommandItem('Global automatic routing')
    expect(autoOption.dataset.autoGroupEffect).toBe('option')
    expect(autoOption.getAttribute('aria-selected')).toBe('true')
    expect(autoOption.classList.contains('overflow-visible')).toBe(true)
    expect(
      autoOption.querySelector('[data-auto-group-flow-border]')
    ).not.toBeNull()
    const optionRatio = autoOption.querySelector<HTMLElement>(
      '[data-auto-group-effect="ratio"]'
    )
    expect(optionRatio).not.toBeNull()
    expect(optionRatio?.textContent).toBe('Auto Ratio')
    expect(
      optionRatio?.querySelector('[data-auto-group-flow-border]')
    ).not.toBeNull()

    const defaultOption = getCommandItem('User group')
    expect(defaultOption.hasAttribute('data-auto-group-effect')).toBe(false)
    expect(
      defaultOption.querySelector('[data-auto-group-flow-border]')
    ).toBeNull()
    expect(defaultOption.textContent?.includes('1x Ratio')).toBe(true)
    expect(
      defaultOption.querySelector('[data-auto-group-effect="ratio"]')
    ).toBeNull()

    // `container` only holds the trigger; keep it referenced so it is not
    // tree-shaken out of the render scope.
    expect(container).toBeDefined()
  })

  it('keeps search and selection behavior while leaving normal groups unstyled', async () => {
    setReducedMotion(false)
    const user = userEvent.setup()
    render(<Harness initialValue='auto' />)

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const searchInput = screen.getByPlaceholderText(
      'Search...'
    ) as HTMLInputElement
    await user.type(searchInput, 'vip')

    const visibleOptions = [
      ...document.body.querySelectorAll<HTMLElement>(
        '[data-slot="command-item"]'
      ),
    ]
    expect(
      visibleOptions.some((option) =>
        option.textContent?.includes('Global automatic routing')
      )
    ).toBe(false)
    const vipOption = getCommandItem('Priority group')
    await user.click(vipOption)

    expect(screen.getByTestId('selected-group').textContent).toBe('vip')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.hasAttribute('data-auto-group-effect')).toBe(false)
    expect(trigger.querySelector('[data-auto-group-flow-border]')).toBeNull()
  })

  it('preserves the static Auto treatment but omits moving layers for reduced motion', async () => {
    setReducedMotion(true)
    const user = userEvent.setup()
    render(<Harness initialValue='auto' />)

    const trigger = screen.getByRole('combobox')
    expect(trigger.dataset.autoGroupEffect).toBe('trigger')
    expect(trigger.querySelector('[data-auto-group-flow-border]')).toBeNull()
    expect(
      trigger.querySelector('[data-auto-group-effect="ratio"]')
    ).not.toBeNull()

    await user.click(trigger)
    const autoOption = getCommandItem('Global automatic routing')
    expect(autoOption.dataset.autoGroupEffect).toBe('option')
    expect(autoOption.querySelector('[data-auto-group-flow-border]')).toBeNull()
    expect(
      autoOption.querySelector('[data-auto-group-effect="ratio"]')
    ).not.toBeNull()
  })
})
