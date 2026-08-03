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
// Vitest + jsdom + RTL. Verifies the admin OAuth section exposes a Google
// tab whose fields save as flat GoogleOAuthEnabled / GoogleClientId /
// GoogleClientSecret / GoogleRedirectUri option keys.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPageProvider } from '../components/settings-page-context'
import { OAuthSection } from './oauth-section'

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('../api', () => ({
  updateSystemOption: (...args: unknown[]) => updateMock(...args),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('../components/form-navigation-guard', () => ({
  FormNavigationGuard: () => null,
}))

const defaultValues = {
  GitHubOAuthEnabled: false,
  GitHubClientId: '',
  GitHubClientSecret: '',
  GoogleOAuthEnabled: false,
  GoogleClientId: '',
  GoogleClientSecret: '',
  GoogleRedirectUri: '',
  'discord.enabled': false,
  'discord.client_id': '',
  'discord.client_secret': '',
  'oidc.enabled': false,
  'oidc.client_id': '',
  'oidc.client_secret': '',
  'oidc.well_known': '',
  'oidc.authorization_endpoint': '',
  'oidc.token_endpoint': '',
  'oidc.user_info_endpoint': '',
  TelegramOAuthEnabled: false,
  TelegramBotToken: '',
  TelegramBotName: '',
  LinuxDOOAuthEnabled: false,
  LinuxDOClientId: '',
  LinuxDOClientSecret: '',
  LinuxDOMinimumTrustLevel: '0',
  WeChatAuthEnabled: false,
  WeChatServerAddress: '',
  WeChatServerToken: '',
  WeChatAccountQRCodeImageURL: '',
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const actionsContainer = document.createElement('div')
  document.body.appendChild(actionsContainer)
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SettingsPageProvider actionsContainer={actionsContainer}>
        <OAuthSection defaultValues={defaultValues} />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
  return { ...utils, actionsContainer }
}

function submittedOptions(): Array<{ key: string; value: unknown }> {
  return updateMock.mock.calls.map((c) => c[0])
}

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({ success: true })
  // Base UI's Switch synthesizes PointerEvents; jsdom lacks the constructor.
  vi.stubGlobal('PointerEvent', class PointerEvent extends MouseEvent {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OAuthSection — Google tab', () => {
  it('renders the Google tab trigger', () => {
    renderSection()
    expect(screen.getByText('Google')).toBeInTheDocument()
  })

  it('fills and saves the Google OAuth form', async () => {
    renderSection()

    fireEvent.click(screen.getByText('Google'))
    await waitFor(() => {
      expect(screen.getByText('Enable Google OAuth')).toBeInTheDocument()
    })

    // Enable switch
    fireEvent.click(screen.getByRole('switch'))

    fireEvent.change(
      screen.getByPlaceholderText('Your Google OAuth Client ID'),
      {
        target: { value: 'google-client-id.apps.googleusercontent.com' },
      }
    )
    fireEvent.change(
      screen.getByPlaceholderText('Your Google OAuth Client Secret'),
      { target: { value: 'GOCSPX-test-secret' } }
    )

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      const keys = submittedOptions().map((o) => o.key)
      expect(keys).toContain('GoogleOAuthEnabled')
      expect(keys).toContain('GoogleClientId')
      expect(keys).toContain('GoogleClientSecret')
    })

    const options = submittedOptions()
    expect(options).toContainEqual({
      key: 'GoogleOAuthEnabled',
      value: true,
    })
    expect(options).toContainEqual({
      key: 'GoogleClientId',
      value: 'google-client-id.apps.googleusercontent.com',
    })
    expect(options).toContainEqual({
      key: 'GoogleClientSecret',
      value: 'GOCSPX-test-secret',
    })
    // Empty redirect URI stays a change-free field only when untouched.
    expect(submittedOptions().map((o) => o.key)).not.toContain(
      'GoogleRedirectUri'
    )
  })

  it('saves a custom Google redirect URI when changed', async () => {
    renderSection()

    fireEvent.click(screen.getByText('Google'))
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('https://your-domain.com/oauth/google')
      ).toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByPlaceholderText('https://your-domain.com/oauth/google'),
      { target: { value: 'https://vancine.com/oauth/google' } }
    )

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(submittedOptions()).toContainEqual({
        key: 'GoogleRedirectUri',
        value: 'https://vancine.com/oauth/google',
      })
    })
  })
})
