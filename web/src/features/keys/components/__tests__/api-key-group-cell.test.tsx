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
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, test } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { ApiKeyGroupCell } from '../api-key-group-cell'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Auto: 'Auto',
        'Cross-group': 'Cross-group',
        Ratio: 'Ratio',
        'Automatically selects the best available group with circuit breaker mechanism':
          'Automatically selects the best available group with circuit breaker mechanism',
      },
    },
  },
})

function CellHarness(props: {
  group: string
  ratio?: number | string
  crossGroupRetry?: boolean
  shouldReduceMotion?: boolean
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ApiKeyGroupCell
          group={props.group}
          ratio={props.ratio}
          crossGroupRetry={props.crossGroupRetry ?? false}
          shouldReduceMotion={props.shouldReduceMotion ?? false}
        />
      </TooltipProvider>
    </I18nextProvider>
  )
}

describe('API key group table cell', () => {
  // AutoGroupBadge is intentionally disabled upstream (commit e17c647f7) and
  // must stay disabled — that commit's goal was to remove the badge. The same
  // commit, however, also dropped the `props.crossGroupRetry` guard as a side
  // effect, making the Cross-group badge unconditional. Vancine restores that
  // gate: the Cross-group badge renders only when props.crossGroupRetry is
  // true. The tests below lock the gating contract; the upstream tests that
  // follow lock the compact visual contract (no frame, subtle flow border,
  // localized multiplier).
  //
  // Cross-group presence/absence is asserted via visible text (RTL
  // getByText/queryByText); the Auto frame checks keep their dedicated data
  // attributes because those are explicit layout contracts.

  it('keeps the auto group cell unclipped so badges and the flow border are not cropped', () => {
    const { container } = render(
      <CellHarness
        group='auto'
        ratio='Auto'
        crossGroupRetry
        shouldReduceMotion={false}
      />
    )

    const badgeCell = container.querySelector<HTMLElement>(
      '[data-api-key-group-cell="auto"]'
    )
    expect(badgeCell).not.toBeNull()
    expect(badgeCell?.classList.contains('overflow-visible')).toBe(true)
    expect(badgeCell?.classList.contains('overflow-hidden')).toBe(false)
  })

  it('hides the Cross-group badge when crossGroupRetry is false', () => {
    const { getByText, queryByText } = render(
      <CellHarness group='auto' ratio='Auto' crossGroupRetry={false} />
    )

    expect(queryByText('Cross-group')).not.toBeInTheDocument()
    // The Auto ratio badge is independent of the retry flag.
    expect(getByText('Auto')).toBeInTheDocument()
  })

  it('does not fabricate a Cross-group badge when ratio is missing and retry is off', () => {
    const { container, queryByText } = render(
      <CellHarness group='auto' crossGroupRetry={false} />
    )

    // No ratio badge, no Auto frame, and — critically — no Cross-group badge
    // invented to fill the empty cell.
    expect(container.querySelectorAll('[data-auto-group-frame]')).toHaveLength(
      0
    )
    expect(
      container.querySelectorAll('[data-auto-group-flow-border]')
    ).toHaveLength(0)
    expect(queryByText('Auto')).not.toBeInTheDocument()
    expect(queryByText('Cross-group')).not.toBeInTheDocument()
  })

  test('keeps the group and compact localized multiplier together with one subtle flowing edge', () => {
    const { container } = render(
      <CellHarness group='auto' ratio='自动' crossGroupRetry />
    )
    const group = screen.getByText('Cross-group')
    const multiplier = screen
      .getByText('Auto')
      .closest<HTMLElement>('[data-slot="badge"]')
    expect(group).toBeInTheDocument()
    expect(multiplier).toHaveClass('h-5', 'min-w-12', 'rounded-md')
    expect(multiplier).not.toHaveTextContent('Ratio')
    expect(container).not.toHaveTextContent('自动')
    expect(container.querySelector('[data-auto-group-frame]')).toBeNull()
    const flow = container.querySelector('[data-auto-group-flow-border]')
    expect(flow).toHaveClass('auto-group-flow-border-subtle')
    expect(flow).toHaveAttribute('aria-hidden', 'true')
    expect(group.closest('[data-api-key-group-cell]')).toContainElement(
      multiplier
    )
  })

  test('keeps the automatic tag visible but static when reduced motion is requested', () => {
    const { container } = render(
      <CellHarness group='auto' ratio='Auto' shouldReduceMotion />
    )
    expect(screen.getByText('Auto')).toBeInTheDocument()
    expect(container.querySelector('[data-auto-group-flow-border]')).toBeNull()
  })

  test('does not invent a multiplier while automatic ratio data is unavailable', () => {
    // crossGroupRetry is required for the Cross-group badge in this fork;
    // the invariant under test is that no multiplier is invented.
    render(<CellHarness group='auto' crossGroupRetry />)
    expect(screen.getByText('Cross-group')).toBeInTheDocument()
    expect(screen.queryByText('Auto')).not.toBeInTheDocument()
  })

  test.each([
    [0.8, 'bg-info/10', 'text-info', 'border-info/30'],
    [1, 'bg-muted', 'text-muted-foreground', 'border-muted-foreground/30'],
    [3, 'bg-warning/10', 'text-warning', 'border-warning/30'],
  ])(
    'preserves the original %s multiplier color in the compact layout',
    (ratio, background, color, border) => {
      const { container } = render(
        <CellHarness group='default' ratio={ratio} />
      )
      const multiplier = screen.getByText(`${ratio}x`).parentElement
      expect(multiplier).toHaveClass(
        background,
        color,
        border,
        'rounded-full',
        'tabular-nums',
        'h-5',
        'min-w-12'
      )
      expect(
        container.querySelector('[data-auto-group-flow-border]')
      ).toBeNull()
    }
  )

  test('labels the user group multiplier as inherited without inventing a numeric value', async () => {
    render(<CellHarness group='' />)
    expect(screen.getByText('User Group')).toBeInTheDocument()
    expect(screen.getByText('Inherited')).toBeInTheDocument()
    expect(screen.getByText('Inherited').parentElement).toHaveClass(
      'border-muted-foreground/30',
      'rounded-full'
    )
    expect(screen.queryByText('1x')).not.toBeInTheDocument()
    await userEvent.tab()
    expect(await screen.findByText('Follow user group')).toBeVisible()
  })

  test('keeps a long group name and exact multiplier available through keyboard focus', async () => {
    const groupName = 'production-with-a-very-long-custom-group-name'
    render(<CellHarness group={groupName} ratio={12.345678} />)
    expect(
      screen.getByText(groupName).closest('[data-slot="tooltip-trigger"]')
    ).toHaveClass('max-w-50')
    expect(screen.getByText('12.345678x')).toBeInTheDocument()
    await userEvent.tab()
    expect(
      await screen.findByText(groupName, {
        selector: '[data-slot="tooltip-content"]',
      })
    ).toBeVisible()
  })

  test('never turns a string-valued normal group ratio into an automatic multiplier', () => {
    render(<CellHarness group='vip' ratio='自动' />)
    expect(screen.getByText('vip')).toBeInTheDocument()
    expect(screen.queryByText('Auto')).not.toBeInTheDocument()
    expect(screen.queryByText('自动')).not.toBeInTheDocument()
  })
})
