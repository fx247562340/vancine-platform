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
/**
 * TwoFASetupDialog body-state contract.
 *
 * Upstream's security rework made this dialog purely presentational: the
 * `setup2FA` / `enable2FA` fetching, the secure-verification proof and the
 * failure messaging now live in `useTwoFASetup`
 * (@/features/security/hooks/use-two-fa-setup) and flow through the shared
 * `handleServerError` notifier. These tests therefore drive the dialog through
 * its props instead of mocking the API, and assert the states a user can
 * actually see: initializing, ready, load-failure, surfaced error, the backup
 * code step, and the close contract.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TwoFASetupData } from '@/features/security/api'
import { TwoFASetupDialog } from '@/features/security/components/dialogs/two-fa-setup-dialog'

const copyToClipboardMock = vi.hoisted(() => vi.fn())

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
        'Enable 2FA': 'Enable 2FA',
        'Enabling...': 'Enabling...',
        Cancel: 'Cancel',
        'Setting up 2FA...': 'Setting up 2FA...',
        'Failed to load setup data': 'Failed to load setup data',
        'Verification Code': 'Verification Code',
        'Enter 6-digit code': 'Enter 6-digit code',
        'Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)':
          'Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)',
        'Or enter this key manually:': 'Or enter this key manually:',
        'Copy secret key': 'Copy secret key',
        'Copy all backup codes': 'Copy all backup codes',
        'Copy All Codes': 'Copy All Codes',
        'Save these backup codes in a safe place. Each code can only be used once.':
          'Save these backup codes in a safe place. Each code can only be used once.',
      },
    },
  },
})

const setupData: TwoFASetupData = {
  secret: 'SECRETKEY',
  qr_code_data: 'otpauth://totp/Vancine:test@example.com?secret=SECRETKEY',
  backup_codes: ['CODE-ONE', 'CODE-TWO', 'CODE-THREE'],
  flow_token: 'flow-token',
  // Far in the future so the dialog never takes the expired-setup branch.
  expires_at: Math.floor(Date.now() / 1000) + 600,
}

type DialogProps = {
  setupData?: TwoFASetupData | null
  loading?: boolean
  initializing?: boolean
  error?: string
  onCancel?: () => void
  onEnable?: (code: string) => Promise<void>
}

function renderDialog(props: DialogProps = {}) {
  const onCancel = props.onCancel ?? vi.fn()
  const onEnable = props.onEnable ?? vi.fn(async () => {})
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <TwoFASetupDialog
        open
        setupData={props.setupData === undefined ? setupData : props.setupData}
        loading={props.loading ?? false}
        initializing={props.initializing ?? false}
        error={props.error}
        onCancel={onCancel}
        onEnable={onEnable}
      />
    </I18nextProvider>
  )
  return { onCancel, onEnable, ...utils }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TwoFASetupDialog main body states', () => {
  it('shows "Setting up 2FA..." and gates navigation while initializing', () => {
    renderDialog({ initializing: true, setupData: null })

    expect(screen.getByText('Setting up 2FA...')).toBeInTheDocument()
    // No failure state and no loaded content while the request is in flight.
    expect(screen.queryByText('Failed to load setup data')).toBeNull()
    expect(screen.queryByText('SECRETKEY')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    // Back only exists from step 1 onward, so the first step has no way back.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('shows QR/secret content and an enabled Next once setup data arrives', () => {
    renderDialog()

    expect(screen.getByText('SECRETKEY')).toBeInTheDocument()
    expect(screen.getByText(/Scan this QR code/)).toBeInTheDocument()
    // QRCodeSVG exposes its accessible contract as an img role; this proves
    // the QR code itself is present (dialog chrome never renders role=img).
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.queryByText('Setting up 2FA...')).toBeNull()
    expect(screen.queryByText('Failed to load setup data')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('reports a load failure instead of an empty QR step', () => {
    renderDialog({ setupData: null })

    expect(screen.getByText('Failed to load setup data')).toBeInTheDocument()
    expect(screen.queryByText('Setting up 2FA...')).toBeNull()
    expect(screen.queryByText('SECRETKEY')).toBeNull()
    // Navigation stays gated: there is nothing to step through.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('surfaces a supplied error message as an alert', () => {
    renderDialog({ error: 'Backend refused 2FA setup' })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Backend refused 2FA setup')
  })

  it('reveals every backup code on the second step', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    for (const code of setupData.backup_codes) {
      expect(screen.getByText(code)).toBeInTheDocument()
    }
    expect(
      screen.getByText(
        'Save these backup codes in a safe place. Each code can only be used once.'
      )
    ).toBeInTheDocument()
  })

  it('hands the close back to the owner through onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const { container } = renderDialog({ onCancel })

    // The dialog is controlled: closing it is the owner's decision, so the
    // component must report the intent rather than mutate its own visibility.
    const closeButton = container.querySelector(
      '[aria-label="Close"], [data-slot="dialog-close"]'
    )
    if (closeButton) {
      await user.click(closeButton)
    } else {
      await user.keyboard('{Escape}')
    }

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps Enable gated until a code is entered, then submits it', async () => {
    const user = userEvent.setup()
    const onEnable = vi.fn(async () => {})
    renderDialog({ onEnable })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const enable = screen.getByRole('button', { name: 'Enable 2FA' })
    expect(enable).toBeDisabled()

    await user.type(screen.getByLabelText('Verification Code'), '123456')
    expect(enable).not.toBeDisabled()

    await user.click(enable)
    expect(onEnable).toHaveBeenCalledWith('123456')
  })
})
