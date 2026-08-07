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
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { AutoGroupOrderEditor } from '../auto-group-order-editor'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        '{{count}} / {{max}} groups selected':
          '{{count}} / {{max}} groups selected',
        'Add Auto group': 'Add Auto group',
        'Auto group order': 'Auto group order',
        'Drag {{group}} to reorder': 'Drag {{group}} to reorder',
        'Inherit global Auto order': 'Inherit global Auto order',
        'Maximum {{max}} groups selected': 'Maximum {{max}} groups selected',
        'Move {{group}} down': 'Move {{group}} down',
        'Move {{group}} up': 'Move {{group}} up',
        'No available groups in the global Auto order.':
          'No available groups in the global Auto order.',
        'No valid custom Auto groups remain. Add a group or restore global Auto.':
          'No valid custom Auto groups remain. Add a group or restore global Auto.',
        'No custom groups. Saving will inherit the complete global Auto order.':
          'No custom groups. Saving will inherit the complete global Auto order.',
        'Remove {{group}}': 'Remove {{group}}',
        'Restore global Auto': 'Restore global Auto',
        Ratio: 'Ratio',
        'Search...': 'Search...',
        'No group found.': 'No group found.',
        'Select a group': 'Select a group',
        'Using the complete global Auto order ({{count}} groups)':
          'Using the complete global Auto order ({{count}} groups)',
      },
    },
  },
})

const globalOptions = [
  { value: 'vip', label: 'VIP', desc: 'Priority access', ratio: 3 },
  { value: 'default', label: 'Default', desc: 'Standard access', ratio: 1 },
  { value: 'team', label: 'Team', desc: 'Shared access', ratio: 2 },
]

function Harness(props: { initialGroups?: string[] }) {
  const [groups, setGroups] = useState(
    props.initialGroups ?? ['default', 'vip']
  )
  const [mode, setMode] = useState<'inherit' | 'custom'>('custom')
  return (
    <I18nextProvider i18n={i18n}>
      <AutoGroupOrderEditor
        value={groups}
        mode={mode}
        options={[
          { value: 'auto', label: 'auto' },
          { value: 'default', label: 'default', ratio: 1 },
          { value: 'vip', label: 'vip', ratio: 2 },
          { value: 'team', label: 'team', ratio: 3 },
        ]}
        globalOptions={globalOptions}
        maxCount={2}
        onChange={(value) => {
          setGroups(value.groups)
          setMode(value.mode)
        }}
      />
      <output data-testid='order'>{groups.join(',')}</output>
      <output data-testid='mode'>{mode}</output>
    </I18nextProvider>
  )
}

function InheritanceHarness(props: { globalOptions?: typeof globalOptions }) {
  const [groups, setGroups] = useState<string[]>([])
  const [mode, setMode] = useState<'inherit' | 'custom'>('inherit')

  return (
    <I18nextProvider i18n={i18n}>
      <AutoGroupOrderEditor
        value={groups}
        mode={mode}
        options={[{ value: 'auto', label: 'auto' }, ...globalOptions]}
        globalOptions={props.globalOptions ?? globalOptions}
        maxCount={2}
        onChange={(value) => {
          setGroups(value.groups)
          setMode(value.mode)
        }}
      />
      <output data-testid='order'>{groups.join(',')}</output>
      <output data-testid='mode'>{mode}</output>
    </I18nextProvider>
  )
}

function CustomEmptyHarness() {
  const [groups, setGroups] = useState<string[]>([])
  const [mode, setMode] = useState<'inherit' | 'custom'>('custom')

  return (
    <I18nextProvider i18n={i18n}>
      <AutoGroupOrderEditor
        value={groups}
        mode={mode}
        options={[{ value: 'auto', label: 'auto' }, ...globalOptions]}
        globalOptions={globalOptions}
        maxCount={2}
        onChange={(value) => {
          setGroups(value.groups)
          setMode(value.mode)
        }}
      />
      <output data-testid='order'>{groups.join(',')}</output>
      <output data-testid='mode'>{mode}</output>
    </I18nextProvider>
  )
}

function findButton(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: label }) as HTMLButtonElement
}

async function openAddAndPick(
  user: ReturnType<typeof userEvent.setup>,
  label: string
) {
  const addButton = screen.getByRole('combobox')
  await user.click(addButton)
  const option = [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-slot="command-item"]'
    ),
  ].find((candidate) => candidate.textContent?.includes(label))
  expect(option).not.toBeUndefined()
  await user.click(option as HTMLElement)
}

describe('Auto group order editor', () => {
  it('enforces the limit and exposes accessible reorder controls', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)

    const addButton = screen.getByRole('combobox')
    expect(addButton).toBeDisabled()
    expect(container.textContent?.includes('2 / 2 groups selected')).toBe(true)
    expect(
      container.querySelector('[role="group"][aria-label="Auto group order"]')
    ).not.toBeNull()
    expect(findButton('Drag default to reorder').type).toBe('button')

    await user.click(findButton('Move default down'))
    expect(screen.getByTestId('order').textContent).toBe('vip,default')

    fireEvent.keyDown(findButton('Drag vip to reorder'), {
      key: 'ArrowDown',
    })
    expect(screen.getByTestId('order').textContent).toBe('default,vip')
  })

  it('adds and removes groups, then restores inheritance as an empty value', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)

    await user.click(findButton('Remove vip'))
    expect(screen.getByTestId('order').textContent).toBe('default')

    const addButton = screen.getByRole('combobox')
    expect(addButton).toBeEnabled()
    await openAddAndPick(user, 'team')
    expect(screen.getByTestId('order').textContent).toBe('default,team')
    expect(screen.getByRole('combobox')).toBeDisabled()

    const restoreButton = screen.getByRole('button', {
      name: 'Restore global Auto',
    })
    await user.click(restoreButton)

    expect(screen.getByTestId('order').textContent).toBe('')
    expect(screen.getByTestId('mode').textContent).toBe('inherit')
    expect(
      container.textContent?.includes(
        'Using the complete global Auto order (3 groups)'
      )
    ).toBe(true)

    const inheritedItems = container.querySelectorAll(
      '[data-slot="global-auto-order"] > li'
    )
    expect(
      [...inheritedItems].map(
        (item) =>
          item.querySelector('[data-slot="global-auto-order-name"]')
            ?.textContent
      )
    ).toEqual(['VIP', 'Default', 'Team'])
  })

  it('shows the complete inherited order with metadata beyond the custom limit', () => {
    const { container } = render(<InheritanceHarness />)

    expect(
      container.textContent?.includes(
        'Using the complete global Auto order (3 groups)'
      )
    ).toBe(true)
    expect(container.textContent?.includes('0 / 2 groups selected')).toBe(false)

    const order = container.querySelector(
      '[data-slot="global-auto-order"]'
    ) as HTMLOListElement
    expect(order).toBeTruthy()
    expect(order.classList.contains('overflow-y-auto')).toBe(true)
    expect(order.classList.contains('flex-wrap')).toBe(true)

    const items = [...order.querySelectorAll('li')]
    expect(items.length).toBe(3)
    expect(
      order.querySelectorAll('[data-slot="global-auto-order-connector"]').length
    ).toBe(2)
    expect(
      items.map((item) => ({
        index: item.querySelector('[data-slot="global-auto-order-index"]')
          ?.textContent,
        name: item.querySelector('[data-slot="global-auto-order-name"]')
          ?.textContent,
        title: item
          .querySelector('[data-slot="global-auto-order-chip"]')
          ?.getAttribute('title'),
        description: item.querySelector(
          '[data-slot="global-auto-order-description"]'
        )?.textContent,
        ratio: item.querySelector('[data-slot="badge"]')?.textContent,
      }))
    ).toEqual([
      {
        index: '1',
        name: 'VIP',
        title: 'Priority access',
        description: 'Priority access',
        ratio: '3x Ratio',
      },
      {
        index: '2',
        name: 'Default',
        title: 'Standard access',
        description: 'Standard access',
        ratio: '1x Ratio',
      },
      {
        index: '3',
        name: 'Team',
        title: 'Shared access',
        description: 'Shared access',
        ratio: '2x Ratio',
      },
    ])

    for (const item of items) {
      const chip = item.querySelector('[data-slot="global-auto-order-chip"]')
      expect(chip).not.toBeNull()
      const description = item.querySelector(
        '[data-slot="global-auto-order-description"]'
      )
      expect(description).not.toBeNull()
      expect(description?.classList.contains('sr-only')).toBe(true)
    }

    expect(
      items[0]?.querySelector('[data-slot="global-auto-order-connector"]')
    ).toBeNull()
    for (const item of items.slice(1)) {
      const connector = item.querySelector(
        '[data-slot="global-auto-order-connector"]'
      )
      expect(connector).not.toBeNull()
      expect(connector?.getAttribute('aria-hidden')).toBe('true')
    }

    expect(container.querySelector('[aria-label^="Drag "]')).toBeNull()
    expect(container.querySelector('[aria-label^="Move "]')).toBeNull()
    expect(container.querySelector('[aria-label^="Remove "]')).toBeNull()

    const restoreButton = screen.getByRole('button', {
      name: 'Restore global Auto',
    })
    expect(restoreButton).toBeDisabled()
  })

  it('shows an explicit empty state when the global Auto order has no groups', () => {
    const { container } = render(<InheritanceHarness globalOptions={[]} />)

    expect(
      container.textContent?.includes(
        'Using the complete global Auto order (0 groups)'
      )
    ).toBe(true)
    expect(
      container.textContent?.includes(
        'No available groups in the global Auto order.'
      )
    ).toBe(true)
    expect(
      container.querySelector('[data-slot="global-auto-order"]')
    ).toBeNull()
  })

  it('keeps an empty custom order distinct from global inheritance', async () => {
    const user = userEvent.setup()
    const { container } = render(<CustomEmptyHarness />)

    expect(screen.getByTestId('mode').textContent).toBe('custom')
    expect(
      container.textContent?.includes(
        'No valid custom Auto groups remain. Add a group or restore global Auto.'
      )
    ).toBe(true)
    expect(
      container.querySelector('[data-slot="global-auto-order"]')
    ).toBeNull()

    const restoreButton = screen.getByRole('button', {
      name: 'Restore global Auto',
    })
    expect(restoreButton).toBeEnabled()
    await user.click(restoreButton)

    expect(screen.getByTestId('mode').textContent).toBe('inherit')
    expect(
      container.querySelector('[data-slot="global-auto-order"]')
    ).not.toBeNull()
  })

  it('adding a group from inheritance explicitly creates a custom order', async () => {
    const user = userEvent.setup()
    const { container } = render(<InheritanceHarness />)

    await openAddAndPick(user, 'VIP')

    expect(screen.getByTestId('mode').textContent).toBe('custom')
    expect(screen.getByTestId('order').textContent).toBe('vip')
    expect(
      container.querySelector('[data-slot="global-auto-order"]')
    ).toBeNull()
  })

  it('removing the last custom group does not silently enable inheritance', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initialGroups={['default']} />)

    await user.click(findButton('Remove default'))
    expect(screen.getByTestId('order').textContent).toBe('')
    expect(screen.getByTestId('mode').textContent).toBe('custom')
    expect(
      container.textContent?.includes(
        'No valid custom Auto groups remain. Add a group or restore global Auto.'
      )
    ).toBe(true)
  })
})
