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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TwoFASetupDialog } from '../dialogs/two-fa-setup-dialog'

const setup2FAMock = vi.hoisted(() => vi.fn())
const copyToClipboardMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  setup2FA: (...args: unknown[]) => setup2FAMock(...args),
  enable2FA: vi.fn().mockResolvedValue({ success: true }),
}))

// Real hook contract is { copiedText, copyToClipboard } — CopyButton
// destructures exactly these two fields.
vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({
    copiedText: null,
    copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
  }),
}))

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Setup Two-Factor Authentication': 'Setup Two-Factor Authentication',
        Step: 'Step',
        'of 3:': 'of 3:',
        'Scan QR Code': 'Scan QR Code',
        'Save Backup Codes': 'Save Backup Codes',
        'Verify Setup': 'Verify Setup',
        Back: 'Back',
        Next: 'Next',
        'Setting up 2FA...': 'Setting up 2FA...',
        'Failed to load setup data': 'Failed to load setup data',
        'Save these backup codes in a safe place. Each code can only be used once.':
          'Save these backup codes in a safe place. Each code can only be used once.',
        'Copy All Codes': 'Copy All Codes',
      },
    },
  },
})

beforeEach(() => {
  setup2FAMock.mockReset()
  setup2FAMock.mockResolvedValue({
    success: true,
    message: '',
    data: {
      secret: 'SECRETKEY',
      qr_code_data: 'otpauth://totp/test',
      backup_codes: ['AAAA-0001', 'BBBB-0002', 'CCCC-0003', 'DDDD-0004'],
    },
  })
  copyToClipboardMock.mockReset()
  copyToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
  // Unconditional restoration so a failing assertion never leaks the mock
  // into the next test.
  vi.restoreAllMocks()
})

function renderDialog() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TwoFASetupDialog open onOpenChange={() => {}} onSuccess={() => {}} />
    </I18nextProvider>
  )
}

describe('TwoFASetupDialog backup codes', () => {
  it('shows each backend backup code once and copies all four in order', async () => {
    const user = userEvent.setup()
    renderDialog()

    // Step 0 loads setup data, then advance to Step 1 (backup codes)
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeTruthy()
    })
    await user.click(screen.getByText('Next'))

    // The four unique codes from the backend are each displayed exactly once
    await waitFor(() => {
      expect(screen.getByText('AAAA-0001')).toBeTruthy()
    })
    expect(screen.getByText('BBBB-0002')).toBeTruthy()
    expect(screen.getByText('CCCC-0003')).toBeTruthy()
    expect(screen.getByText('DDDD-0004')).toBeTruthy()

    // Copy All copies the full four-code string, newline-joined, in order
    await user.click(screen.getByText('Copy All Codes'))
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      'AAAA-0001\nBBBB-0002\nCCCC-0003\nDDDD-0004'
    )
  })
})
