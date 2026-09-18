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
// The backup-codes step of the 2FA setup dialog.
//
// TwoFASetupDialog is purely presentational now: the setup request lives in
// useTwoFASetup (features/security/hooks/use-two-fa-setup.ts) and reaches the
// dialog as the `setupData` prop. So this test feeds the backend codes in
// through props and asserts what the dialog itself still owns — every code is
// rendered exactly once, in backend order, and the copy action offers exactly
// those codes (newline-joined, same order): no subset, no re-ordering, no
// duplicate, and nothing fetched behind the caller's back.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { TwoFASetupData } from '../../api'
import { TwoFASetupDialog } from '../dialogs/two-fa-setup-dialog'

const copyToClipboardMock = vi.hoisted(() => vi.fn())

// Real hook contract is { copiedText, copyToClipboard } — CopyButton
// destructures exactly these two fields. The clipboard transport is not the
// subject; the copied STRING is.
vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({
    copiedText: null,
    copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
  }),
}))

// Translations come from the global test i18next instance (src/test-setup.ts),
// whose empty resource map renders every t('English source') key as itself.

const backupCodes = ['AAAA-0001', 'BBBB-0002', 'CCCC-0003', 'DDDD-0004']

/** Exactly what POST /api/user/2fa/setup returns, via useTwoFASetup. */
function backendSetupData(): TwoFASetupData {
  return {
    secret: 'SECRETKEY',
    qr_code_data: 'otpauth://totp/test',
    backup_codes: [...backupCodes],
    flow_token: 'setup-flow',
    expires_at: 2_000_000_000,
  }
}

function renderDialog(
  overrides: Partial<Parameters<typeof TwoFASetupDialog>[0]> = {}
) {
  const onEnable = vi.fn(async () => undefined)
  const onCancel = vi.fn()
  render(
    <TwoFASetupDialog
      open
      setupData={backendSetupData()}
      loading={false}
      initializing={false}
      onCancel={onCancel}
      onEnable={onEnable}
      {...overrides}
    />
  )
  return { onEnable, onCancel }
}

beforeEach(() => {
  copyToClipboardMock.mockReset()
  copyToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
  // Unconditional restoration so a failing assertion never leaks the mock
  // into the next test.
  vi.restoreAllMocks()
})

describe('TwoFASetupDialog backup codes', () => {
  it('shows each backend backup code once and copies all four in order', async () => {
    const post = vi.spyOn(api, 'post')
    const user = userEvent.setup()
    renderDialog()

    // Step 0 renders from the prop and advances to Step 1 (backup codes)
    // without the dialog performing any setup request of its own.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(post).not.toHaveBeenCalled()

    // The four unique codes from the backend are each displayed exactly once
    for (const code of backupCodes) {
      expect(screen.getAllByText(code)).toHaveLength(1)
    }

    // Copy All copies the full four-code string, newline-joined, in order
    await user.click(
      screen.getByRole('button', { name: 'Copy all backup codes' })
    )
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
    expect(copyToClipboardMock).toHaveBeenCalledWith(backupCodes.join('\n'))
  })
})
