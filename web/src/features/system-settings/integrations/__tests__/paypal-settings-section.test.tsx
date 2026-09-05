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
// Vitest + jsdom + RTL. Verifies the PayPal admin section submits the correct
// /api/option/ keys: booleans as 'true'/'false' strings, MinTopUp/Currency as
// strings, and secrets skipped when empty or masked (never overwriting existing
// secrets with blank/masked values).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PayPalSettingsSection,
  type PayPalSettingsValues,
} from '../paypal-settings-section'

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('../../api', () => ({
  updateSystemOption: (...args: unknown[]) => updateMock(...args),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const defaults: PayPalSettingsValues = {
  PayPalEnabled: false,
  PayPalTestMode: false,
  PayPalClientId: '',
  PayPalClientSecret: '',
  PayPalWebhookId: '',
  PayPalSandboxClientId: '',
  PayPalSandboxClientSecret: '',
  PayPalSandboxWebhookId: '',
  PayPalMinTopUp: 1,
  PayPalCurrency: 'USD',
}

function renderSection(values: PayPalSettingsValues = defaults) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PayPalSettingsSection defaultValues={values} />
    </QueryClientProvider>
  )
}

async function save() {
  fireEvent.click(screen.getByText('Save PayPal Settings'))
  await waitFor(() => expect(updateMock).toHaveBeenCalled())
}

function submittedOptions(): { key: string; value: string }[] {
  return updateMock.mock.calls.map((c) => c[0])
}

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({ success: true })
})

describe('PayPalSettingsSection submission', () => {
  it('submits the core option keys with booleans as strings', async () => {
    renderSection({
      ...defaults,
      PayPalEnabled: true,
      PayPalTestMode: true,
      PayPalMinTopUp: 5,
      PayPalCurrency: 'EUR',
    })

    await save()

    const options = submittedOptions()
    expect(options).toContainEqual({ key: 'PayPalEnabled', value: 'true' })
    expect(options).toContainEqual({ key: 'PayPalTestMode', value: 'true' })
    expect(options).toContainEqual({ key: 'PayPalMinTopUp', value: '5' })
    expect(options).toContainEqual({ key: 'PayPalCurrency', value: 'EUR' })
  })

  it('booleans false serialize to "false"', async () => {
    renderSection(defaults)
    await save()
    const options = submittedOptions()
    expect(options).toContainEqual({ key: 'PayPalEnabled', value: 'false' })
    expect(options).toContainEqual({ key: 'PayPalTestMode', value: 'false' })
  })

  it('does not submit empty secret fields', async () => {
    renderSection(defaults) // all secrets empty
    await save()
    const keys = submittedOptions().map((o) => o.key)
    for (const secret of [
      'PayPalClientId',
      'PayPalClientSecret',
      'PayPalWebhookId',
      'PayPalSandboxClientId',
      'PayPalSandboxClientSecret',
      'PayPalSandboxWebhookId',
    ]) {
      expect(keys).not.toContain(secret)
    }
  })

  it('does not submit masked secret fields (no overwrite with mask)', async () => {
    renderSection({
      ...defaults,
      PayPalClientSecret: '***masked***',
      PayPalClientId: 'real-id',
    })
    await save()
    const options = submittedOptions()
    const keys = options.map((o) => o.key)
    expect(keys).not.toContain('PayPalClientSecret')
    // A non-empty, non-masked secret IS submitted.
    expect(options).toContainEqual({
      key: 'PayPalClientId',
      value: 'real-id',
    })
  })

  it('reflects enabled=true from defaultValues as a checked switch', () => {
    renderSection({ ...defaults, PayPalEnabled: true, PayPalTestMode: true })
    const switches = screen.getAllByRole('switch')
    // First switch is "Enable PayPal", second is "Sandbox mode".
    expect(switches[0]).toBeChecked()
    expect(switches[1]).toBeChecked()
  })

  it('reflects enabled=false from defaultValues as an unchecked switch', () => {
    renderSection(defaults)
    const switches = screen.getAllByRole('switch')
    expect(switches[0]).not.toBeChecked()
  })
})
