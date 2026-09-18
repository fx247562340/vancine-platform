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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getRedemption } from '@/features/redemption-codes/api'
import type { Redemption } from '@/features/redemption-codes/types'

import { RedemptionsMutateDrawer } from '../redemptions-mutate-drawer'
import { RedemptionsProvider } from '../redemptions-provider'

vi.mock('@/features/redemption-codes/api', () => ({
  getRedemption: vi.fn(),
  createRedemption: vi.fn(),
  updateRedemption: vi.fn(),
}))

// Load failures are reported through the unified server-error notifier, which
// replaced the drawer's former direct `toast.error(fallback)` calls. The spy
// therefore sits on that boundary and asserts the delegation contract: the raw
// failure payload plus the user-visible fallback message the component chose.
// `importActual` keeps the module's other exports (e.g. markServerErrorHandled)
// intact for everything else in the rendered tree.
const handleServerErrorMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/handle-server-error', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/handle-server-error')>()
  return {
    ...actual,
    handleServerError: (...args: unknown[]) => handleServerErrorMock(...args),
  }
})

const getRedemptionMock = vi.mocked(getRedemption)

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const REDEMPTION_A: Redemption = {
  id: 5,
  user_id: 1,
  name: 'gift pack',
  key: 'CODE-A',
  status: 1,
  quota: 100000,
  created_time: 0,
  redeemed_time: 0,
  expired_time: 0,
  used_user_id: 0,
}

const REDEMPTION_B: Redemption = {
  ...REDEMPTION_A,
  id: 6,
  name: 'vip pack',
  key: 'CODE-B',
}

// The fallback the drawer hands to the notifier; the test i18n instance has no
// resource bundle, so `t('Failed to load')` resolves to the source string.
const LOAD_FALLBACK = 'Failed to load'

function renderDrawer(currentRow: Redemption) {
  const onOpenChange = vi.fn()
  const view = render(
    <RedemptionsProvider>
      <I18nextProvider i18n={i18n}>
        <RedemptionsMutateDrawer
          open
          onOpenChange={onOpenChange}
          currentRow={currentRow}
        />
      </I18nextProvider>
    </RedemptionsProvider>
  )
  return { onOpenChange, view }
}

function nameInput() {
  return screen.getByPlaceholderText('Enter a name') as HTMLInputElement
}

beforeEach(() => {
  getRedemptionMock.mockReset()
  handleServerErrorMock.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('RedemptionsMutateDrawer load contract', () => {
  it('resets the form from fresh data on a successful load', async () => {
    const load = deferred<{ success: boolean; data?: Redemption }>()
    getRedemptionMock.mockReturnValue(load.promise)
    renderDrawer(REDEMPTION_A)

    load.resolve({ success: true, data: REDEMPTION_A })

    await waitFor(() => expect(nameInput()).toHaveValue('gift pack'))
    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })

  it('shows the backend message and keeps the form untouched on business failure with message', async () => {
    const load = deferred<{ success: boolean; message?: string }>()
    getRedemptionMock.mockReturnValue(load.promise)
    renderDrawer(REDEMPTION_A)

    const failure = { success: false, message: 'Code revoked' }
    load.resolve(failure)

    // The drawer must hand the gateway's own payload to the notifier (so the
    // backend message wins over the fallback) together with the fallback.
    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(nameInput()).toHaveValue('')
  })

  it('shows the localized fallback and keeps the form untouched on business failure without message', async () => {
    const load = deferred<{ success: boolean }>()
    getRedemptionMock.mockReturnValue(load.promise)
    renderDrawer(REDEMPTION_A)

    const failure = { success: false }
    load.resolve(failure)

    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(nameInput()).toHaveValue('')
  })

  it('shows the localized fallback when success is true but data is missing', async () => {
    const load = deferred<{ success: boolean; data?: Redemption }>()
    getRedemptionMock.mockReturnValue(load.promise)
    renderDrawer(REDEMPTION_A)

    const failure = { success: true }
    load.resolve(failure)

    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(nameInput()).toHaveValue('')
  })

  it('delegates a rejection to the unified notifier with the localized fallback and keeps the form untouched', async () => {
    const load = deferred<{ success: boolean; data?: Redemption }>()
    getRedemptionMock.mockReturnValue(load.promise)
    renderDrawer(REDEMPTION_A)

    const rejection = new Error('network down')
    load.reject(rejection)

    // The catch branch forwards the raw error together with the same localized
    // fallback the resolved-business-failure branch uses, so a transport
    // failure that carries no actionable message still shows localized copy.
    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(
        rejection,
        LOAD_FALLBACK
      )
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(nameInput()).toHaveValue('')
  })

  it('ignores a stale success after the row switches to another record', async () => {
    const loadA = deferred<{ success: boolean; data?: Redemption }>()
    const loadB = deferred<{ success: boolean; data?: Redemption }>()
    getRedemptionMock
      .mockReturnValueOnce(loadA.promise)
      .mockReturnValueOnce(loadB.promise)
    const { view } = renderDrawer(REDEMPTION_A)

    view.rerender(
      <RedemptionsProvider>
        <I18nextProvider i18n={i18n}>
          <RedemptionsMutateDrawer
            open
            onOpenChange={vi.fn()}
            currentRow={REDEMPTION_B}
          />
        </I18nextProvider>
      </RedemptionsProvider>
    )

    loadB.resolve({ success: true, data: REDEMPTION_B })
    await waitFor(() => expect(nameInput()).toHaveValue('vip pack'))

    // The first record's load resolves afterwards; flush the microtask so a
    // missing sequence guard would actually overwrite the form here.
    loadA.resolve({ success: true, data: REDEMPTION_A })
    await act(async () => {})
    expect(nameInput()).toHaveValue('vip pack')
    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })

  it('does not raise an error notification when a stale load rejects after the drawer unmounts', async () => {
    const load = deferred<{ success: boolean; data?: Redemption }>()
    getRedemptionMock.mockReturnValue(load.promise)
    const { view } = renderDrawer(REDEMPTION_A)

    // The request must be in flight before the drawer unmounts.
    await waitFor(() => expect(getRedemptionMock).toHaveBeenCalledTimes(1))
    view.unmount()
    // Settle the rejection in the test coroutine so the catch branch runs;
    // only the sequence guard may suppress the error notification.
    await act(async () => {
      load.reject(new Error('network down'))
    })

    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })
})
