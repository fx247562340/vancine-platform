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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getUserInfo } from '../../../api'
import { UserInfoDialog } from '../user-info-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('../../../api', () => ({
  getUserInfo: vi.fn(),
}))

const getUserInfoMock = vi.mocked(getUserInfo)

afterEach(() => {
  getUserInfoMock.mockReset()
  cleanup()
})

const ALICE = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  quota: 1000,
  used_quota: 200,
  request_count: 5,
  group: 'vip',
}

function renderDialog(userId: number | null): {
  rerender: (nextUserId: number | null) => void
} {
  const view = render(
    <I18nextProvider i18n={i18n}>
      <UserInfoDialog open userId={userId} onOpenChange={() => undefined} />
    </I18nextProvider>
  )
  return {
    rerender: (nextUserId: number | null) => {
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <UserInfoDialog
            open
            userId={nextUserId}
            onOpenChange={() => undefined}
          />
        </I18nextProvider>
      )
    },
  }
}

describe('UserInfoDialog body states', () => {
  it('shows the loading spinner instead of stale info while fetching', () => {
    getUserInfoMock.mockReturnValue(new Promise(() => undefined))
    renderDialog(1)

    expect(
      document.querySelectorAll('svg.lucide-loader-circle').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('No user information available')).toBeNull()
    expect(screen.queryByText('Username')).toBeNull()
  })

  it('renders the user details after a successful response', async () => {
    getUserInfoMock.mockResolvedValue({ success: true, data: ALICE })
    renderDialog(1)

    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('vip')).toBeTruthy()
    expect(screen.queryByText('No user information available')).toBeNull()
  })

  it('shows the fallback message when the response carries no user data', async () => {
    getUserInfoMock.mockResolvedValue({ success: true, data: undefined })
    renderDialog(1)

    await waitFor(() =>
      expect(screen.getByText('No user information available')).toBeTruthy()
    )
  })

  it('keeps the loading spinner instead of the previous user when the id changes', async () => {
    getUserInfoMock.mockResolvedValueOnce({ success: true, data: ALICE })
    getUserInfoMock.mockReturnValueOnce(new Promise(() => undefined))
    const { rerender } = renderDialog(1)

    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())

    rerender(2)
    expect(screen.queryByText('alice')).toBeNull()
    expect(screen.queryByText('No user information available')).toBeNull()
  })
})
