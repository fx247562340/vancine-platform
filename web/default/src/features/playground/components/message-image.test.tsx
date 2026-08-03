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
// Vitest + jsdom. Dedicated tests for MessageImage: the preview dialog must
// be near-fullscreen (large generated images were squeezed by max-w-3xl),
// and the load-failure fallback must still work.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageImage } from './message-image'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('MessageImage preview dialog sizing', () => {
  it('opens a near-fullscreen preview dialog', () => {
    render(<MessageImage src='https://cdn.example/big.png' />)
    fireEvent.click(screen.getByRole('img'))

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-[90vw]')
    expect(dialog.className).toContain('max-h-[90vh]')

    const enlarged = within(dialog).getByRole('img')
    expect(enlarged.className).toContain('max-h-[85vh]')
    expect(enlarged.className).toContain('max-w-full')
    expect(enlarged.className).toContain('object-contain')
  })
})

describe('MessageImage fallback', () => {
  it('shows the failure fallback when the image cannot load', () => {
    render(<MessageImage src='https://broken.example/x.png' />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).toBeNull()
    expect(
      screen.getByText(
        /Image failed to load.*https:\/\/broken\.example\/x\.png/
      )
    ).toBeInTheDocument()
  })
})
