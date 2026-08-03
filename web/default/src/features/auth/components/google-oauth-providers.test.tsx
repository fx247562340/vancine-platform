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
// Behavior tests: OAuthProviders renders the Google button only when
// status.google_oauth is true, and clicking it navigates the browser to the
// backend-driven /api/oauth/google/login endpoint. Existing GitHub path stays
// intact.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemStatus } from '../types'
import { OAuthProviders } from './oauth-providers'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

afterEach(() => cleanup())

function statusWith(overrides: Record<string, unknown>): SystemStatus {
  return { ...overrides } as SystemStatus
}

describe('OAuthProviders — Google button', () => {
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
  let locationStub: { href: string }

  beforeEach(() => {
    locationStub = { href: '' }
    // jsdom does not navigate; replace window.location with a stub so the
    // assignment performed by the Google handler is captured.
    Object.defineProperty(window, 'location', {
      value: locationStub,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation)
    }
    vi.restoreAllMocks()
  })

  it('renders Continue with Google when status.google_oauth is true', () => {
    render(<OAuthProviders status={statusWith({ google_oauth: true })} />)
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('does not render the Google button when google_oauth is false', () => {
    render(
      <OAuthProviders
        status={statusWith({ google_oauth: false, github_oauth: true })}
      />
    )
    expect(screen.queryByText('Continue with Google')).toBeNull()
  })

  it('does not render the Google button when status is empty', () => {
    render(<OAuthProviders status={statusWith({})} />)
    expect(screen.queryByText('Continue with Google')).toBeNull()
  })

  it('navigates to /api/oauth/google/login on click', async () => {
    render(<OAuthProviders status={statusWith({ google_oauth: true })} />)
    fireEvent.click(screen.getByText('Continue with Google'))
    await waitFor(() => {
      expect(locationStub.href).toContain('/api/oauth/google/login')
    })
    expect(locationStub.href).toContain('redirect=')
  })

  it('still renders the GitHub button (no regression)', () => {
    render(
      <OAuthProviders
        status={statusWith({
          github_oauth: true,
          github_client_id: 'cid',
          google_oauth: true,
        })}
      />
    )
    expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })
})
