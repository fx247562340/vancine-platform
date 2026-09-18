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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGroups, getPermissionCatalog, getUser } from '@/features/users/api'
import type { User } from '@/features/users/types'
import { EMPTY_PERMISSION_CATALOG } from '@/lib/admin-permissions'

import { UsersMutateDrawer } from '../users-mutate-drawer'
import { UsersProvider } from '../users-provider'

vi.mock('@/features/users/api', () => ({
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  getGroups: vi.fn(),
  getPermissionCatalog: vi.fn(),
}))

// Load failures are reported through the unified server-error notifier, which
// replaced the drawer's former direct `toast.error(fallback)` calls. The spy
// therefore sits on that boundary and asserts the delegation contract: the raw
// failure payload plus the user-visible fallback message the component chose.
// `importActual` keeps the module's other exports (e.g. markServerErrorHandled)
// intact for everything else in the rendered tree. `@/lib/server-error-message`
// stays unmocked because the drawer's groups/permission-catalog queries use the
// real `requireServerSuccess`.
const handleServerErrorMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/handle-server-error', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/handle-server-error')>()
  return {
    ...actual,
    handleServerError: (...args: unknown[]) => handleServerErrorMock(...args),
  }
})

const getUserMock = vi.mocked(getUser)
const getGroupsMock = vi.mocked(getGroups)
const getPermissionCatalogMock = vi.mocked(getPermissionCatalog)

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

const USER_A: User = {
  id: 3,
  username: 'alice',
  display_name: 'Alice A',
  quota: 50000,
  used_quota: 0,
  request_count: 0,
  group: 'default',
  status: 1,
  role: 1,
  remark: '',
}

const USER_B: User = {
  ...USER_A,
  id: 4,
  username: 'bob',
  display_name: 'Bob B',
}

// The fallback the drawer hands to the notifier; the test i18n instance has no
// resource bundle, so `t('Failed to load')` resolves to the source string.
const LOAD_FALLBACK = 'Failed to load'

// One QueryClient per test, reused across rerenders and cleared on cleanup.
let activeQueryClient: QueryClient | null = null

function renderDrawer(currentRow: User, open = true) {
  const onOpenChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  activeQueryClient = queryClient
  const view = render(
    <QueryClientProvider client={queryClient}>
      <UsersProvider>
        <I18nextProvider i18n={i18n}>
          <UsersMutateDrawer
            open={open}
            onOpenChange={onOpenChange}
            currentRow={currentRow}
          />
        </I18nextProvider>
      </UsersProvider>
    </QueryClientProvider>
  )
  const rerender = (nextRow: User, nextOpen = true) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <UsersProvider>
          <I18nextProvider i18n={i18n}>
            <UsersMutateDrawer
              open={nextOpen}
              onOpenChange={vi.fn()}
              currentRow={nextRow}
            />
          </I18nextProvider>
        </UsersProvider>
      </QueryClientProvider>
    )
  return { onOpenChange, view, rerender }
}

function usernameInput() {
  return screen.getByPlaceholderText('Enter username') as HTMLInputElement
}

beforeEach(() => {
  getUserMock.mockReset()
  getGroupsMock.mockReset()
  getGroupsMock.mockResolvedValue({ success: true, data: [] })
  getPermissionCatalogMock.mockReset()
  getPermissionCatalogMock.mockResolvedValue(EMPTY_PERMISSION_CATALOG)
  handleServerErrorMock.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  activeQueryClient?.clear()
  activeQueryClient = null
})

describe('UsersMutateDrawer load contract', () => {
  it('resets the form from fresh data on a successful load', async () => {
    const load = deferred<{ success: boolean; data?: User }>()
    getUserMock.mockReturnValue(load.promise)
    renderDrawer(USER_A)

    load.resolve({ success: true, data: USER_A })

    await waitFor(() => expect(usernameInput()).toHaveValue('alice'))
    expect(screen.getByPlaceholderText('Enter display name')).toHaveValue(
      'Alice A'
    )
    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })

  it('shows the backend message and keeps the form untouched on business failure with message', async () => {
    const load = deferred<{ success: boolean; message?: string }>()
    getUserMock.mockReturnValue(load.promise)
    renderDrawer(USER_A)

    const failure = { success: false, message: 'User not found' }
    load.resolve(failure)

    // The drawer must hand the gateway's own payload to the notifier (so the
    // backend message wins over the fallback) together with the fallback.
    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(usernameInput()).toHaveValue('')
  })

  it('shows the localized fallback and keeps the form untouched on business failure without message', async () => {
    const load = deferred<{ success: boolean }>()
    getUserMock.mockReturnValue(load.promise)
    renderDrawer(USER_A)

    const failure = { success: false }
    load.resolve(failure)

    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(usernameInput()).toHaveValue('')
  })

  it('shows the localized fallback when success is true but data is missing', async () => {
    const load = deferred<{ success: boolean; data?: User }>()
    getUserMock.mockReturnValue(load.promise)
    renderDrawer(USER_A)

    const failure = { success: true }
    load.resolve(failure)

    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(failure, LOAD_FALLBACK)
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(usernameInput()).toHaveValue('')
  })

  it('shows the localized fallback on reject and keeps the form untouched', async () => {
    const load = deferred<{ success: boolean; data?: User }>()
    getUserMock.mockReturnValue(load.promise)
    renderDrawer(USER_A)

    const rejection = new Error('network down')
    load.reject(rejection)

    await waitFor(() => {
      expect(handleServerErrorMock).toHaveBeenCalledWith(
        rejection,
        LOAD_FALLBACK
      )
    })
    expect(handleServerErrorMock).toHaveBeenCalledTimes(1)
    expect(usernameInput()).toHaveValue('')
  })

  it('ignores a stale success after the row switches to another record', async () => {
    const loadA = deferred<{ success: boolean; data?: User }>()
    const loadB = deferred<{ success: boolean; data?: User }>()
    getUserMock
      .mockReturnValueOnce(loadA.promise)
      .mockReturnValueOnce(loadB.promise)
    const { rerender } = renderDrawer(USER_A)

    rerender(USER_B)

    loadB.resolve({ success: true, data: USER_B })
    await waitFor(() => expect(usernameInput()).toHaveValue('bob'))

    // The first record's load resolves afterwards; flush the microtask so a
    // missing sequence guard would actually overwrite the form here.
    loadA.resolve({ success: true, data: USER_A })
    await act(async () => {})
    expect(usernameInput()).toHaveValue('bob')
    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })

  it('does not raise an error notification when a stale load rejects after the drawer closes', async () => {
    const load = deferred<{ success: boolean; data?: User }>()
    getUserMock.mockReturnValue(load.promise)
    const { rerender } = renderDrawer(USER_A)

    // The request must be in flight before the drawer closes.
    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1))
    rerender(USER_A, false)
    // Settle the rejection in the test coroutine so the catch branch runs;
    // only the sequence guard may suppress the error notification.
    await act(async () => {
      load.reject(new Error('network down'))
    })

    expect(handleServerErrorMock).not.toHaveBeenCalled()
  })
})
