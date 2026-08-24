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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState, type ReactElement } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { VideoPreviewDialog } from '../video-preview-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

afterEach(cleanup)

const RESULT_URL = 'https://upstream.example.com/v.mp4?sign=SECRET'

function renderDialog(
  overrides: {
    resultUrl?: string
    taskId?: string
    open?: boolean
  } = {}
): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <VideoPreviewDialog
        open={overrides.open ?? true}
        onOpenChange={() => undefined}
        resultUrl={overrides.resultUrl ?? RESULT_URL}
        taskId={overrides.taskId ?? 'task-123'}
      />
    </I18nextProvider>
  )
}

function getVideo(): HTMLVideoElement {
  const video = document.querySelector('video')
  if (!video) throw new Error('video element not rendered')
  return video
}

function ControlledDialog(props: {
  resultUrl: string
  taskId: string
}): ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <I18nextProvider i18n={i18n}>
      <button type='button' onClick={() => setOpen(true)}>
        Reopen
      </button>
      <VideoPreviewDialog
        open={open}
        onOpenChange={setOpen}
        resultUrl={props.resultUrl}
        taskId={props.taskId}
      />
    </I18nextProvider>
  )
}

describe('VideoPreviewDialog player and download contract', () => {
  it('renders a controlled, metadata-preloading video pointing at the resolved result URL', () => {
    renderDialog()

    const video = getVideo()
    expect(video.getAttribute('controls')).not.toBeNull()
    expect(video.getAttribute('preload')).toBe('metadata')
    expect(video.getAttribute('autoplay')).toBeNull()
    expect(video.getAttribute('src')).toBe(RESULT_URL)
    expect(video.getAttribute('src')).not.toContain('/v1/videos/')
  })

  it('offers a native best-effort download anchored at the result URL', () => {
    renderDialog()

    const download = screen.getByRole('link', { name: 'Download' })
    expect(download.getAttribute('href')).toBe(RESULT_URL)
    expect(download.getAttribute('download')).toBe('task-123.mp4')
    expect(download.getAttribute('href')?.startsWith('blob:')).toBe(false)
    expect(download.getAttribute('href')).not.toContain('/v1/videos/')
  })

  it('offers an open-in-new-tab entry anchored at the same result URL', () => {
    renderDialog()

    const openLink = screen.getByRole('link', { name: 'Open in new tab' })
    expect(openLink.getAttribute('href')).toBe(RESULT_URL)
    expect(openLink.getAttribute('target')).toBe('_blank')
    expect(openLink.getAttribute('rel')).toContain('noopener')
    expect(openLink.getAttribute('href')).not.toContain('/v1/videos/')
  })
})

describe('VideoPreviewDialog error handling', () => {
  it('shows a clear error and keeps both result-URL entries when the video fails to load', () => {
    renderDialog()

    fireEvent.error(getVideo())

    expect(screen.getByText('Video playback failed')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in new tab' }).getAttribute('href')
    ).toBe(RESULT_URL)
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('href')
    ).toBe(RESULT_URL)
  })

  it('clears the error state when the dialog is closed and reopened', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog resultUrl={RESULT_URL} taskId='task-123' />)

    fireEvent.error(getVideo())
    expect(screen.getByText('Video playback failed')).toBeTruthy()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(screen.queryByText('Video playback failed')).toBeNull()
    expect(getVideo().getAttribute('src')).toBe(RESULT_URL)
  })
})
