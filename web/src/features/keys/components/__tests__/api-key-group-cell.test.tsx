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
import { render } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

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
  // effect, making the Cross-group badge unconditional. This suite locks the
  // restored contract: the Cross-group badge is gated on props.crossGroupRetry
  // again, the ratio badge behavior is untouched, and AutoGroupBadge remains
  // absent (no effect='badge' frame).
  //
  // Cross-group presence/absence is asserted via visible text (RTL
  // getByText/queryByText); the Auto frame / reduced-motion checks keep their
  // dedicated data attributes because those are explicit layout/motion
  // contracts.

  it('renders the localized Auto ratio unclipped with the animated border when motion is allowed', () => {
    const { container, getByText } = render(
      <CellHarness
        group='auto'
        ratio='自动'
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

    // With AutoGroupBadge disabled, only the GroupRatioBadge ratio frame
    // remains (effect='ratio'), carrying one animated flow border. The
    // disabled AutoGroupBadge (effect='badge') must not come back.
    expect(container.querySelectorAll('[data-auto-group-frame]')).toHaveLength(
      1
    )
    expect(
      container.querySelectorAll('[data-auto-group-flow-border]')
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-auto-group-effect="badge"]')
    ).toBeNull()

    const ratio = container.querySelector<HTMLElement>(
      '[data-auto-group-effect="ratio"]'
    )
    expect(ratio).not.toBeNull()
    expect(ratio?.textContent).toBe('Auto Ratio')
    // The nonlocalized API string must never leak into the UI.
    expect(container.textContent?.includes('自动')).toBe(false)

    // crossGroupRetry=true surfaces the Cross-group badge as visible text.
    expect(getByText('Cross-group')).toBeInTheDocument()
  })

  it('keeps the static Auto ratio but omits the animated border for reduced motion', () => {
    const { container } = render(
      <CellHarness group='auto' ratio='Auto' shouldReduceMotion />
    )

    // The ratio frame still renders, but reduced motion suppresses the
    // moving flow border (accessibility contract).
    expect(container.querySelectorAll('[data-auto-group-frame]')).toHaveLength(
      1
    )
    expect(
      container.querySelectorAll('[data-auto-group-flow-border]')
    ).toHaveLength(0)
    expect(
      container.querySelector('[data-auto-group-effect="ratio"]')?.textContent
    ).toBe('Auto Ratio')
  })

  it('hides the Cross-group badge when crossGroupRetry is false', () => {
    const { container, queryByText } = render(
      <CellHarness group='auto' ratio='Auto' crossGroupRetry={false} />
    )

    expect(queryByText('Cross-group')).not.toBeInTheDocument()
    // The Auto ratio badge is independent of the retry flag.
    expect(
      container.querySelector('[data-auto-group-effect="ratio"]')?.textContent
    ).toBe('Auto Ratio')
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
    expect(
      container.querySelector('[data-auto-group-effect="ratio"]')
    ).toBeNull()
    expect(queryByText('Cross-group')).not.toBeInTheDocument()
  })

  it('still shows the Cross-group badge when ratio is missing but retry is on', () => {
    const { container, getByText } = render(
      <CellHarness group='auto' crossGroupRetry />
    )

    expect(
      container.querySelector('[data-auto-group-effect="ratio"]')
    ).toBeNull()
    expect(getByText('Cross-group')).toBeInTheDocument()
  })

  it('narrows normal group ratios to numbers and never applies Auto rings', () => {
    const { container, rerender } = render(
      <CellHarness group='vip' ratio='自动' shouldReduceMotion={false} />
    )

    expect(container.textContent?.includes('vip')).toBe(true)
    expect(container.textContent?.includes('自动')).toBe(false)
    expect(container.querySelector('[data-auto-group-frame]')).toBeNull()
    expect(container.querySelector('[data-auto-group-flow-border]')).toBeNull()

    rerender(<CellHarness group='vip' ratio={3} shouldReduceMotion={false} />)

    expect(container.textContent?.includes('3x')).toBe(true)
    expect(container.querySelector('[data-auto-group-frame]')).toBeNull()
  })
})
