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
// Vitest + jsdom + RTL. Verifies the quota section's first top-up bonus field:
// it renders next to the new user quota with the configured default, refuses a
// negative value, submits only the QuotaForFirstTopUp key when that is the only
// edited field, and can submit 0 to switch the promotion off.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QuotaSettingsSection } from '../quota-settings-section'

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
// The navigation guard blocks router navigation, which this isolated section
// render has no router for.
vi.mock('../../components/form-navigation-guard', () => ({
  FormNavigationGuard: () => null,
}))

function defaultValues(overrides: Record<string, unknown> = {}) {
  return {
    QuotaForNewUser: 0,
    QuotaForFirstTopUp: 0,
    PreConsumedQuota: 500,
    QuotaForInviter: 0,
    QuotaForInvitee: 0,
    TopUpLink: '',
    general_setting: { docs_link: '' },
    quota_setting: { enable_free_model_pre_consume: true },
    ...overrides,
  }
}

function renderSection(values = defaultValues()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <QuotaSettingsSection defaultValues={values} />
    </QueryClientProvider>
  )
}

function bonusInput() {
  return screen.getByRole('spinbutton', { name: /First Top-Up Bonus/i })
}

function submit() {
  const form = bonusInput().closest('form')
  if (!form) throw new Error('quota settings form was not rendered')
  fireEvent.submit(form)
}

function submittedOptions(): { key: string; value: unknown }[] {
  return updateMock.mock.calls.map(
    (call) => call[0] as { key: string; value: unknown }
  )
}

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({ success: true })
})

describe('QuotaSettingsSection first top-up bonus', () => {
  it('renders the field next to the new user quota with the configured default', () => {
    renderSection(defaultValues({ QuotaForFirstTopUp: 400000 }))

    const bonus = bonusInput()
    expect(bonus).toHaveValue(400000)
    // The promotion ships disabled, so a fresh install shows 0.
    expect(screen.getByText('New User Quota')).toBeTruthy()
    expect(
      screen.getByText('Set to 0 to disable the first top-up bonus.')
    ).toBeTruthy()
  })

  it('shows 0 by default', () => {
    renderSection()
    expect(bonusInput()).toHaveValue(0)
  })

  it('submits only the QuotaForFirstTopUp key when only that field changed', async () => {
    renderSection()

    fireEvent.change(bonusInput(), { target: { value: '400000' } })
    submit()

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(submittedOptions()).toEqual([
      { key: 'QuotaForFirstTopUp', value: 400000 },
    ])
  })

  it('can save 0 to disable the promotion', async () => {
    renderSection(defaultValues({ QuotaForFirstTopUp: 400000 }))

    fireEvent.change(bonusInput(), { target: { value: '0' } })
    submit()

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(submittedOptions()).toEqual([
      { key: 'QuotaForFirstTopUp', value: 0 },
    ])
  })

  it('refuses to submit a negative bonus quota', async () => {
    renderSection(defaultValues({ QuotaForFirstTopUp: 400000 }))

    fireEvent.change(bonusInput(), { target: { value: '-1' } })
    submit()

    await waitFor(() =>
      expect(
        screen.getByText('First Top-Up Bonus must be a non-negative integer')
      ).toBeTruthy()
    )
    expect(bonusInput().getAttribute('aria-invalid')).toBe('true')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses to submit a non-integer bonus quota', async () => {
    renderSection(defaultValues({ QuotaForFirstTopUp: 400000 }))

    fireEvent.change(bonusInput(), { target: { value: '1.5' } })
    submit()

    await waitFor(() =>
      expect(
        screen.getByText('First Top-Up Bonus must be an integer')
      ).toBeTruthy()
    )
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('exposes the integer step on the input', () => {
    renderSection()
    expect(bonusInput().getAttribute('step')).toBe('1')
    expect(bonusInput().getAttribute('type')).toBe('number')
    expect(bonusInput().getAttribute('min')).toBe('0')
    expect(bonusInput().getAttribute('max')).toBe('2147483647')
  })

  it('keeps the other quota fields on the pre-existing simple validation', async () => {
    // Only QuotaForFirstTopUp was upgraded to the stricter non-negative
    // integer contract. The other four quota fields keep the simple
    // z.coerce.number().min(0) contract that was already in place; a negative
    // value for one of them is still rejected (min(0)), but the error is the
    // default zod message rather than the new i18n keys.
    renderSection()
    const newUserQuota = screen.getByRole('spinbutton', {
      name: /New User Quota/i,
    })
    fireEvent.change(newUserQuota, { target: { value: '-1' } })
    submit()
    await waitFor(() => expect(updateMock).not.toHaveBeenCalled())
    // The new i18n keys are not used for the other fields.
    expect(
      screen.queryByText('New User Quota must be a non-negative integer')
    ).toBeNull()
  })
})
