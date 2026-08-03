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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsFeedback } from '../components/prev-next'
import { initTestI18n, setDocsBundle, EN_DOCS } from './test-utils'

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('DocsFeedback', () => {
  it('asks for feedback initially and persists a positive answer', async () => {
    const user = userEvent.setup()
    render(<DocsFeedback slug='quickstart' />)

    expect(screen.getByText('Was this page helpful?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes' }))

    expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument()
    expect(window.localStorage.getItem('docs-feedback:quickstart')).toBe('yes')
  })

  it('persists a negative answer', async () => {
    const user = userEvent.setup()
    render(<DocsFeedback slug='chat' />)
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(window.localStorage.getItem('docs-feedback:chat')).toBe('no')
  })

  it('shows the thanks state when feedback was already recorded', () => {
    window.localStorage.setItem('docs-feedback:migrate', 'yes')
    render(<DocsFeedback slug='migrate' />)
    expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument()
    expect(screen.queryByText('Was this page helpful?')).toBeNull()
  })

  it('blocked localStorage does not crash and still acknowledges', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    render(<DocsFeedback slug='video' />)

    await user.click(screen.getByRole('button', { name: 'Yes' }))
    // Graceful: acknowledges without throwing even though persistence failed.
    expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument()
  })
})
