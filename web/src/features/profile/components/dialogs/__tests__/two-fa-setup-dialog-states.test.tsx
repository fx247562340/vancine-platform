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
import i18next from 'i18next'
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TwoFASetupDialog } from '../two-fa-setup-dialog'

const setup2FAMock = vi.hoisted(() => vi.fn())
const enable2FAMock = vi.hoisted(() => vi.fn())
const copyToClipboardMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  setup2FA: (...args: unknown[]) => setup2FAMock(...args),
  enable2FA: (...args: unknown[]) => enable2FAMock(...args),
}))

// Real hook contract is { copiedText, copyToClipboard } — CopyButton
// destructures exactly these two fields; the underlying clipboard is a
// browser API boundary unavailable in jsdom.
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
        'Failed to setup 2FA': 'Failed to setup 2FA',
        'Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)':
          'Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)',
        'Or enter this key manually:': 'Or enter this key manually:',
        'Copy secret key': 'Copy secret key',
      },
    },
  },
})

// Controlled wrapper: the parent owns `open`, so a failed setup that calls
// onOpenChange(false) really closes the dialog. Keeping `open` pinned to
// true would re-trigger the open effect and re-run setup2FA in a loop; the
// wrapper's owned state prevents that without sleeps or private state.
function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <I18nextProvider i18n={i18n}>
      <TwoFASetupDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
        onSuccess={() => {}}
      />
    </I18nextProvider>
  )
}

function renderHarness(onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...render(<Harness onOpenChange={onOpenChange} />),
  }
}

beforeEach(() => {
  setup2FAMock.mockReset()
  setup2FAMock.mockResolvedValue({
    success: true,
    message: '',
    data: {
      secret: 'SECRETKEY',
      qr_code_data: 'otpauth://totp/test',
      backup_codes: ['AAAA-0001'],
    },
  })
  enable2FAMock.mockReset()
  enable2FAMock.mockResolvedValue({ success: true })
  copyToClipboardMock.mockReset()
  copyToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
  // Unconditional restoration so a failing assertion never leaks a spy or
  // mock into the next test.
  vi.restoreAllMocks()
})

describe('TwoFASetupDialog main body states', () => {
  it('shows "Setting up 2FA..." while setup2FA is pending', async () => {
    setup2FAMock.mockReturnValue(new Promise(() => {}))
    renderHarness()

    await screen.findByText('Setting up 2FA...')

    // No failure state, no loaded content while the request is in flight.
    expect(screen.queryByText('Failed to load setup data')).toBeNull()
    expect(screen.queryByText('SECRETKEY')).toBeNull()
    // The Next step is held disabled while initializing.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('shows QR/secret content and an enabled Next once setup succeeds', async () => {
    renderHarness()

    await screen.findByText('SECRETKEY')
    expect(screen.getByText(/Scan this QR code/)).toBeInTheDocument()
    // QRCodeSVG exposes its accessible contract as an img role; this proves
    // the QR code itself is present (dialog chrome never renders role=img).
    expect(screen.getByRole('img')).toBeInTheDocument()
    // Initializing and failure states are gone.
    expect(screen.queryByText('Setting up 2FA...')).toBeNull()
    expect(screen.queryByText('Failed to load setup data')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('surfaces the backend failure message and closes on a failed setup', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    setup2FAMock.mockResolvedValue({
      success: false,
      message: 'Backend refused 2FA setup',
    })
    const { onOpenChange } = renderHarness()

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Backend refused 2FA setup')
    })
    // Each side of the failure contract fires exactly once.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(setup2FAMock).toHaveBeenCalledTimes(1)
    // The controlled close really removed the dialog from the accessible
    // tree: its title is gone once the parent stopped rendering it open.
    await waitFor(() => {
      expect(screen.queryByText('Setup Two-Factor Authentication')).toBeNull()
    })
  })

  it('falls back to the generic message and closes when setup2FA rejects', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    setup2FAMock.mockRejectedValue(new Error('network down'))
    const { onOpenChange } = renderHarness()

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to setup 2FA')
    })
    // The catch branch logs the real error via console.error (production
    // behavior, reported separately) and then fires each contract once.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(setup2FAMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Setup Two-Factor Authentication')).toBeNull()
    })
  })
})
