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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseTiersFromExpr,
  splitBillingExprAndRequestRules,
  tryParseRequestRuleExpr,
} from '@/features/pricing/lib/billing-expr'

import { TieredPricingEditor } from '../tiered-pricing-editor'

vi.mock('nanoid', () => {
  let counter = 0
  return { nanoid: () => `test_id_${++counter}` }
})

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
})

afterEach(() => {
  queryClient.clear()
})

function renderEditor(
  billingExpr: string,
  requestRuleExpr = '',
  onBillingExprChange?: (next: string) => void,
  onRequestRuleExprChange?: (next: string) => void
) {
  const billingCb = onBillingExprChange ?? (() => {})
  const ruleCb = onRequestRuleExprChange ?? (() => {})
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TieredPricingEditor
          billingExpr={billingExpr}
          requestRuleExpr={requestRuleExpr}
          onBillingExprChange={billingCb}
          onRequestRuleExprChange={ruleCb}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/** Set a controlled input value through the native setter (React-safe). */
function setNativeValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set
  valueSetter?.call(input, value)
  fireEvent.input(input)
}

/** Wait for the visual editor tier cards to appear after initial async init */
async function waitForVisualTiers() {
  await waitFor(() => {
    expect(screen.getAllByPlaceholderText('Tier name').length).toBeGreaterThan(
      0
    )
  })
}

// ---------------------------------------------------------------------------
// 1. Tier DOM identity across deletion
// ---------------------------------------------------------------------------

describe('tier DOM identity across deletion', () => {
  const billingExpr =
    'len <= 200000 ? tier("tier_a", p * 1 + c * 2) : tier("tier_b", p * 3 + c * 6)'

  it('surviving tier label input stays in the DOM with its edited value', async () => {
    const user = userEvent.setup()
    renderEditor(billingExpr)
    await waitForVisualTiers()

    const inputs = screen.getAllByPlaceholderText('Tier name')
    expect(inputs).toHaveLength(2)

    const secondInputNode = inputs[1]

    await user.click(inputs[1])
    await user.clear(inputs[1])
    await user.type(inputs[1], 'edited_b')
    expect(inputs[1]).toHaveValue('edited_b')

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove tier' })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Tier name')).toHaveLength(1)
    })
    const remaining = screen.getAllByPlaceholderText('Tier name')

    expect(remaining[0]).toBe(secondInputNode)
    expect(remaining[0]).toHaveValue('edited_b')
  })

  it('billing expression retains only the surviving tier after deletion', async () => {
    const user = userEvent.setup()
    const billingChanges: string[] = []
    renderEditor(billingExpr, '', (next) => billingChanges.push(next))
    await waitForVisualTiers()

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove tier' })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(billingChanges.length).toBeGreaterThan(0)
    })
    const lastExpr = billingChanges.at(-1) as string
    expect(lastExpr).toContain('tier_b')
    expect(lastExpr).not.toContain('tier_a')
  })
})

// ---------------------------------------------------------------------------
// 2. Tier condition DOM identity across deletion
// ---------------------------------------------------------------------------

describe('tier condition DOM identity across deletion', () => {
  const billingExpr =
    'len < 100000 && c < 500 ? tier("short", p * 1 + c * 2) : tier("long", p * 3 + c * 6)'

  it('surviving condition value input stays in the DOM with its edited value', async () => {
    const user = userEvent.setup()
    renderEditor(billingExpr)
    await waitForVisualTiers()

    const valueInputs = screen.getAllByPlaceholderText('tokens')
    expect(valueInputs.length).toBeGreaterThanOrEqual(2)

    const secondInputNode = valueInputs[1]

    await user.click(valueInputs[1])
    await user.clear(valueInputs[1])
    await user.type(valueInputs[1], '42000')
    expect(valueInputs[1]).toHaveValue(42000)

    const removeButtons = screen.getAllByRole('button', { name: 'remove' })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('tokens').length
      ).toBeGreaterThanOrEqual(1)
    })
    const survivingInputs = screen.getAllByPlaceholderText('tokens')

    expect(survivingInputs[0]).toBe(secondInputNode)
    expect(survivingInputs[0]).toHaveValue(42000)
  })
})

// ---------------------------------------------------------------------------
// 3. Request rule group DOM identity across deletion
// ---------------------------------------------------------------------------

describe('request rule group DOM identity across deletion', () => {
  const billingExpr = 'tier("base", p * 3 + c * 15)'
  const ruleExpr =
    '(param("model") == "gpt-4" ? 2 : 1) * (param("model") == "gpt-4" ? 2 : 1)'

  it('surviving group multiplier input stays in the DOM with its edited value', async () => {
    const user = userEvent.setup()
    renderEditor(billingExpr, ruleExpr)
    await waitForVisualTiers()

    const multiplierInputs = screen.getAllByPlaceholderText('1.0')
    expect(multiplierInputs.length).toBeGreaterThanOrEqual(2)

    const secondInputNode = multiplierInputs[1]

    await user.click(multiplierInputs[1])
    await user.clear(multiplierInputs[1])
    await user.type(multiplierInputs[1], '3.5')
    expect(multiplierInputs[1]).toHaveValue(3.5)

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove rule group',
    })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('1.0').length
      ).toBeGreaterThanOrEqual(1)
    })
    const remaining = screen.getAllByPlaceholderText('1.0')

    expect(remaining[0]).toBe(secondInputNode)
    expect(remaining[0]).toHaveValue(3.5)
  })

  it('request rule expression retains only the surviving group after deletion', async () => {
    const user = userEvent.setup()
    const ruleChanges: string[] = []
    renderEditor(billingExpr, ruleExpr, undefined, (next) =>
      ruleChanges.push(next)
    )
    await waitForVisualTiers()

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove rule group',
    })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(ruleChanges.length).toBeGreaterThan(0)
    })
    const lastExpr = ruleChanges.at(-1) as string
    expect(lastExpr).toContain('param("model")')
    expect(lastExpr).not.toContain(') * (')
  })
})

// ---------------------------------------------------------------------------
// 4. Request rule condition DOM identity + expression parsing across deletion
// ---------------------------------------------------------------------------

describe('request rule condition DOM identity and expression parsing', () => {
  const billingExpr = 'tier("base", p * 3 + c * 15)'
  const ruleExpr =
    '(param("tier") == "premium" && param("fast") == true ? 2 : 1)'

  it('surviving condition value stays in DOM and expression parses correctly', async () => {
    const user = userEvent.setup()
    const ruleChanges: string[] = []
    renderEditor(billingExpr, ruleExpr, undefined, (next) =>
      ruleChanges.push(next)
    )
    await waitForVisualTiers()

    const valueInputs = screen.getAllByPlaceholderText('Value')
    expect(valueInputs.length).toBeGreaterThanOrEqual(2)

    const secondInputNode = valueInputs[1]

    await user.click(valueInputs[1])
    await user.clear(valueInputs[1])
    await user.type(valueInputs[1], 'edited')
    expect(valueInputs[1]).toHaveValue('edited')

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove condition',
    })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('Value').length
      ).toBeGreaterThanOrEqual(1)
    })
    const survivingInputs = screen.getAllByPlaceholderText('Value')

    // DOM identity preserved
    expect(survivingInputs[0]).toBe(secondInputNode)
    expect(survivingInputs[0]).toHaveValue('edited')

    // Expression parses correctly — only the surviving condition remains
    await waitFor(() => {
      expect(ruleChanges.length).toBeGreaterThan(0)
    })
    const lastExpr = ruleChanges.at(-1) as string
    const parsed = tryParseRequestRuleExpr(lastExpr)
    expect(parsed).not.toBeNull()
    if (parsed) {
      expect(parsed.length).toBe(1)
      expect(parsed[0].conditions.length).toBe(1)
      expect(parsed[0].conditions[0].value).toBe('edited')
      expect(parsed[0].multiplier).toBe('2')
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Duplicate-content items maintain distinct DOM identity
// ---------------------------------------------------------------------------

describe('duplicate-content identity and serialization', () => {
  const billingExpr =
    'len <= 200000 ? tier("same", p * 1 + c * 2) : tier("same", p * 1 + c * 2)'
  const ruleExpr =
    '(param("fast") == true ? 1.5 : 1) * (param("fast") == true ? 1.5 : 1)'

  it('deleting the first duplicate tier preserves the second and produces a valid expression', async () => {
    const user = userEvent.setup()
    const billingChanges: string[] = []
    renderEditor(billingExpr, ruleExpr, (b) => billingChanges.push(b))
    await waitForVisualTiers()

    const tierInputs = screen.getAllByPlaceholderText('Tier name')
    expect(tierInputs).toHaveLength(2)
    expect(tierInputs[0]).toHaveValue('same')
    expect(tierInputs[1]).toHaveValue('same')

    const secondTierNode = tierInputs[1]

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove tier' })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Tier name')).toHaveLength(1)
    })
    const remaining = screen.getAllByPlaceholderText('Tier name')
    expect(remaining[0]).toBe(secondTierNode)
    expect(remaining[0]).toHaveValue('same')

    await waitFor(() => {
      expect(billingChanges.length).toBeGreaterThan(0)
    })
    const lastExpr = billingChanges.at(-1) as string
    expect(lastExpr).not.toContain('uiId')
    expect(lastExpr).not.toContain('editorId')
    expect(lastExpr).not.toContain('conditionId')
    expect(lastExpr).not.toContain('sourceOffset')

    // Expression parses back to a single tier with real parser
    const parsed = parseTiersFromExpr(lastExpr)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].label).toBe('same')
  })

  it('request rule expression is free of editor metadata', async () => {
    const user = userEvent.setup()
    const ruleChanges: string[] = []
    renderEditor(billingExpr, ruleExpr, undefined, (r) => ruleChanges.push(r))
    await waitForVisualTiers()

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove rule group',
    })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(ruleChanges.length).toBeGreaterThan(0)
    })
    expect(ruleChanges.length).toBeGreaterThan(0)
    for (const expr of ruleChanges) {
      expect(expr).not.toContain('uiId')
      expect(expr).not.toContain('editorId')
      expect(expr).not.toContain('conditionId')
      expect(expr).not.toContain('sourceOffset')
    }
  })
})

// ---------------------------------------------------------------------------
// A. Rerender stability for tier conditions (real RED → GREEN)
// ---------------------------------------------------------------------------

describe('tier condition rerender stability', () => {
  const billingExpr =
    'len < 100000 && c < 500 ? tier("short", p * 1 + c * 2) : tier("long", p * 3 + c * 6)'

  it('condition DOM node and value survive parent rerender with new callback refs', async () => {
    const { rerender } = renderEditor(billingExpr)
    await waitForVisualTiers()

    const valueInputs = screen.getAllByPlaceholderText('tokens')
    expect(valueInputs.length).toBeGreaterThanOrEqual(2)

    const secondInputNode = valueInputs[1]
    const valueBefore = (secondInputNode as HTMLInputElement).value

    rerender(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TieredPricingEditor
            billingExpr={billingExpr}
            requestRuleExpr=''
            onBillingExprChange={() => {}}
            onRequestRuleExprChange={() => {}}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    const afterInputs = screen.getAllByPlaceholderText('tokens')
    expect(afterInputs.length).toBeGreaterThanOrEqual(2)
    expect(afterInputs[1]).toBe(secondInputNode)
    expect((afterInputs[1] as HTMLInputElement).value).toBe(valueBefore)
  })
})

// ---------------------------------------------------------------------------
// B. Add-tier condition stability (real RED → GREEN)
// ---------------------------------------------------------------------------

describe('add-tier condition stability', () => {
  it('new condition from Add Tier survives parent rerender', async () => {
    const user = userEvent.setup()
    const billingExpr = 'tier("base", p * 2 + c * 4)'
    const { rerender } = renderEditor(billingExpr)
    await waitForVisualTiers()

    const addTierButton = screen.getByRole('button', { name: 'Add tier' })
    await user.click(addTierButton)

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('tokens').length
      ).toBeGreaterThanOrEqual(1)
    })
    const condInputs = screen.getAllByPlaceholderText('tokens')
    const condNode = condInputs[0]
    const condValue = (condNode as HTMLInputElement).value

    rerender(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TieredPricingEditor
            billingExpr={billingExpr}
            requestRuleExpr=''
            onBillingExprChange={() => {}}
            onRequestRuleExprChange={() => {}}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    const afterInputs = screen.getAllByPlaceholderText('tokens')
    expect(afterInputs.length).toBeGreaterThanOrEqual(1)
    expect(afterInputs[0]).toBe(condNode)
    expect((afterInputs[0] as HTMLInputElement).value).toBe(condValue)
  })
})

// ---------------------------------------------------------------------------
// C. Visual/raw mode roundtrip with controlled harness + real user interaction
// ---------------------------------------------------------------------------

/**
 * Controlled harness: keeps billingExpr/requestRuleExpr in React state so the
 * editor receives updated props after each callback, exactly like a real parent.
 */
function ControlledHarness({
  initialBillingExpr,
  initialRequestRuleExpr,
  billingChanges,
  ruleChanges,
}: {
  initialBillingExpr: string
  initialRequestRuleExpr: string
  billingChanges: string[]
  ruleChanges: string[]
}) {
  const [billingExpr, setBillingExpr] = useState(initialBillingExpr)
  const [requestRuleExpr, setRequestRuleExpr] = useState(initialRequestRuleExpr)

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TieredPricingEditor
          billingExpr={billingExpr}
          requestRuleExpr={requestRuleExpr}
          onBillingExprChange={(next) => {
            billingChanges.push(next)
            setBillingExpr(next)
          }}
          onRequestRuleExprChange={(next) => {
            ruleChanges.push(next)
            setRequestRuleExpr(next)
          }}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('visual/raw mode roundtrip', () => {
  const billingExpr =
    'len <= 200000 ? tier("std", p * 3 + c * 15) : tier("long", p * 6 + c * 22)'
  const ruleExpr = '(param("fast") == true ? 1.5 : 1)'

  it('roundtrips visual → raw → visual preserving edited business values', async () => {
    const user = userEvent.setup()
    const billingChanges: string[] = []
    const ruleChanges: string[] = []
    render(
      <ControlledHarness
        initialBillingExpr={billingExpr}
        initialRequestRuleExpr={ruleExpr}
        billingChanges={billingChanges}
        ruleChanges={ruleChanges}
      />
    )
    await waitForVisualTiers()

    // --- B. Real edit first: tier label + request condition value ---
    const tierInputs = screen.getAllByPlaceholderText('Tier name')
    expect(tierInputs.length).toBeGreaterThanOrEqual(1)
    setNativeValue(tierInputs[0] as HTMLInputElement, 'edited_std')
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Tier name')[0]).toHaveValue(
        'edited_std'
      )
    })

    // Edit the request condition value to make the rule callback emit
    const valueInputs = screen.getAllByPlaceholderText('Value')
    expect(valueInputs.length).toBeGreaterThanOrEqual(1)
    setNativeValue(valueInputs[0] as HTMLInputElement, 'edited_true')

    // Both callbacks must have emitted non-empty values
    await waitFor(() => {
      expect(billingChanges.length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(ruleChanges.length).toBeGreaterThan(0)
    })
    expect(billingChanges.at(-1)).toContain('edited_std')

    // --- C. Real mode switch to Expression editor ---
    const modeCombobox = screen.getAllByRole('combobox')[0]
    await user.click(modeCombobox)
    const rawOption = await screen.findByRole('option', {
      name: 'Expression editor',
    })
    await user.click(rawOption)

    // Visual tier inputs disappear, raw textarea appears
    await waitFor(() => {
      expect(screen.queryAllByPlaceholderText('Tier name')).toHaveLength(0)
    })
    const textareas = document.querySelectorAll('textarea')
    expect(textareas.length).toBeGreaterThan(0)
    const combined = textareas[0].value
    expect(combined).toContain('tier(')
    expect(combined).toContain('edited_std')

    // Split the combined expression and parse both parts with real parsers
    const { billingExpr: rawBilling, requestRuleExpr: rawRules } =
      splitBillingExprAndRequestRules(combined)
    const parsedTiers = parseTiersFromExpr(rawBilling)
    expect(parsedTiers.length).toBeGreaterThanOrEqual(1)
    const parsedGroups = tryParseRequestRuleExpr(rawRules)
    expect(parsedGroups).not.toBeNull()
    if (parsedGroups) {
      expect(parsedGroups.length).toBeGreaterThanOrEqual(1)
    }

    // --- D. Real mode switch back to Visual editor ---
    const rawCombobox = screen.getAllByRole('combobox')[0]
    await user.click(rawCombobox)
    const visualOption = await screen.findByRole('option', {
      name: 'Visual editor',
    })
    await user.click(visualOption)

    // Tier UI and request-rule UI reappear with edited values intact
    await waitForVisualTiers()
    const restoredTierInputs = screen.getAllByPlaceholderText('Tier name')
    expect(restoredTierInputs.length).toBeGreaterThanOrEqual(1)
    expect(restoredTierInputs[0]).toHaveValue('edited_std')
    const restoredValueInputs = screen.getAllByPlaceholderText('Value')
    expect(restoredValueInputs.length).toBeGreaterThanOrEqual(1)
    expect(restoredValueInputs[0]).toHaveValue('edited_true')

    // Controlled state expressions still parse with real parsers
    const lastBilling = billingChanges.at(-1) as string
    const lastRule = ruleChanges.at(-1) as string
    expect(parseTiersFromExpr(lastBilling).length).toBeGreaterThanOrEqual(1)
    expect(tryParseRequestRuleExpr(lastRule)).not.toBeNull()

    // --- E. No metadata leakage (assert non-empty first, then per item) ---
    expect(billingChanges.length).toBeGreaterThan(0)
    for (const expr of billingChanges) {
      expect(expr).not.toContain('uiId')
      expect(expr).not.toContain('editorId')
      expect(expr).not.toContain('conditionId')
      expect(expr).not.toContain('sourceOffset')
    }
    expect(ruleChanges.length).toBeGreaterThan(0)
    for (const expr of ruleChanges) {
      expect(expr).not.toContain('uiId')
      expect(expr).not.toContain('editorId')
      expect(expr).not.toContain('conditionId')
      expect(expr).not.toContain('sourceOffset')
    }
  })
})

// ---------------------------------------------------------------------------
// D. Delete expression parsing with real parser
// ---------------------------------------------------------------------------

describe('delete expression parsing', () => {
  const billingExpr =
    'len < 100000 && c < 500 ? tier("short", p * 1 + c * 2) : tier("long", p * 3 + c * 6)'

  it('billing expression after condition deletion parses to correct tier', async () => {
    const user = userEvent.setup()
    const billingChanges: string[] = []
    renderEditor(billingExpr, '', (next) => billingChanges.push(next))
    await waitForVisualTiers()

    const removeButtons = screen.getAllByRole('button', { name: 'remove' })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(billingChanges.length).toBeGreaterThan(0)
    })
    const lastExpr = billingChanges.at(-1) as string

    const parsed = parseTiersFromExpr(lastExpr)
    expect(parsed.length).toBeGreaterThanOrEqual(1)
    expect(parsed[0].label).toBe('short')
  })
})
