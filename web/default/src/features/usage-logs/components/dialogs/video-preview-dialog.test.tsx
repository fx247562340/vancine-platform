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
// Vitest + jsdom. Video preview dialog for task logs, aligned with the
// classic ContentModal: in-page <video controls> player with error fallback.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoPreviewDialog } from './video-preview-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const url = '/v1/videos/task-1/content'
const originalUrl = 'https://upstream.example/v.mp4'

describe('VideoPreviewDialog', () => {
  it('renders a controllable video player with the proxy src when open', () => {
    render(
      <VideoPreviewDialog
        onOpenChange={() => {}}
        open
        originalUrl={originalUrl}
        url={url}
      />
    )
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('src', url)
    expect(video!.controls).toBe(true)
  })

  it('keeps the dialog wide on desktop (sm: override, no sm:max-w-sm lock)', () => {
    render(
      <VideoPreviewDialog
        onOpenChange={() => {}}
        open
        originalUrl={originalUrl}
        url={url}
      />
    )
    const dialog = screen.getByRole('dialog')
    const classes = dialog.className.split(/\s+/)
    expect(classes).toContain('sm:max-w-[80vw]')
    expect(classes).not.toContain('sm:max-w-sm')
  })

  it('shows the fallback text and the original link when the video fails', () => {
    render(
      <VideoPreviewDialog
        onOpenChange={() => {}}
        open
        originalUrl={originalUrl}
        url={url}
      />
    )
    fireEvent.error(document.querySelector('video')!)

    expect(screen.getByText('Video failed to load')).toBeInTheDocument()
    const originalLink = document.querySelector(
      `a[href="${originalUrl}"]`
    ) as HTMLAnchorElement
    expect(originalLink).not.toBeNull()
    expect(originalLink.target).toBe('_blank')
  })

  it('renders nothing while closed', () => {
    render(
      <VideoPreviewDialog
        open={false}
        onOpenChange={() => {}}
        originalUrl={originalUrl}
        url={url}
      />
    )
    expect(document.querySelector('video')).toBeNull()
  })
})
