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

For commercial licensing, please contact support@quantumnous.com.
*/

/**
 * The reference-image tray: its three local input paths and the single
 * validation gate they share, driven through the real page.
 *
 * A real user picks files, drops images on the tray or pastes image bytes from
 * the clipboard, and the tray either attaches them — with a thumbnail and a
 * "Remove <name>" button — or refuses them with one inline message. Every
 * rejection below is asserted inside the tray's own `role=alert`, because that
 * is where the studio shows it: never a browser dialog, never a toast alone.
 *
 * `applyAccept: false` is set once for the whole file on purpose. The operating
 * system's file-dialog filter is not the gate under test — the tray's own
 * validation is — and a browser that hands over a `.gif` anyway must still be
 * refused with the same message a drop or a paste produces.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import {
  createVideoPlaygroundI18n,
  dropReferenceImages,
  makeImageFile,
  pasteFromClipboard,
  pickReferenceImages,
  pickVideoModel,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  stubVideoApi,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationRequest: vi.fn(),
    submitVideoGenerationWithApiKey: vi.fn(),
    getVideoTask: vi.fn(),
  }
})

/** The tray's own group, so every assertion is scoped to the tray. */
function referenceTray(): HTMLElement {
  return screen.getByRole('group', { name: 'Reference images' })
}

/** One "Remove <filename>" button per attached image. */
function attachedImages(): HTMLElement[] {
  return within(referenceTray()).queryAllByRole('button', { name: /^Remove / })
}

async function expectAttachedImages(count: number): Promise<void> {
  await waitFor(() => {
    expect(attachedImages()).toHaveLength(count)
  })
}

/** The tray's single inline error slot (`FieldError` renders `role=alert`). */
function trayAlert(): HTMLElement | null {
  return within(referenceTray()).queryByRole('alert')
}

async function expectTrayMessage(message: string): Promise<void> {
  expect(await within(referenceTray()).findByRole('alert')).toHaveTextContent(
    message
  )
}

function filesNamed(prefix: string, count: number): File[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeImageFile(`${prefix}-${index + 1}.png`)
  )
}

/** The exactly three local input paths the tray offers. */
type InputPath = {
  name: string
  attach: (user: UserEvent, files: File[]) => Promise<void>
}

const INPUT_PATHS: ReadonlyArray<InputPath> = [
  {
    name: 'file picker',
    attach: async (user, files) => {
      await pickReferenceImages(user, files)
    },
  },
  {
    name: 'dropzone',
    attach: async (_user, files) => {
      dropReferenceImages(files)
    },
  },
  {
    name: 'clipboard paste',
    attach: async (_user, files) => {
      pasteFromClipboard(files)
    },
  },
]

/** Files that are not images at all. */
const NON_IMAGE_FILES: ReadonlyArray<[string, string]> = [
  ['application/pdf', 'brief.pdf'],
  ['text/plain', 'notes.txt'],
  ['video/mp4', 'clip.mp4'],
]

/** Image MIME types outside the JPEG/PNG/WebP allowlist. */
const DISALLOWED_IMAGE_MIME_TYPES: ReadonlyArray<[string, string]> = [
  ['image/gif', 'animation.gif'],
  ['image/bmp', 'bitmap.bmp'],
  ['image/tiff', 'scan.tiff'],
  ['image/heic', 'photo.heic'],
]

/**
 * The documented per-model reference-image budget. Written out here as the
 * product contract it is, never read back out of the capability table.
 */
const MODEL_IMAGE_CAPS: ReadonlyArray<[string, number]> = [
  ['wan3.0-video', 10],
  ['wan3.0-video-prime', 10],
  ['MiniMax-H3', 5],
  ['Doubao-Seedance-2.0', 9],
  ['Doubao-Seedance-2.5', 30],
]

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024

let i18n: I18n
let user: UserEvent
let restoreObjectUrls: (() => void) | undefined

/**
 * jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, and the
 * resource store owns both. The stub hands out one distinct URL per call so
 * creation and revocation can be matched up exactly.
 */
function stubObjectUrls() {
  const urlPrototype = URL as unknown as {
    createObjectURL?: (blob: Blob) => string
    revokeObjectURL?: (url: string) => void
  }
  const hadCreate = typeof urlPrototype.createObjectURL === 'function'
  const hadRevoke = typeof urlPrototype.revokeObjectURL === 'function'
  const previousCreate = urlPrototype.createObjectURL
  const previousRevoke = urlPrototype.revokeObjectURL
  let issued = 0
  const createObjectURL = vi.fn(() => {
    issued += 1
    return `blob:preview-${issued}`
  })
  const revokeObjectURL = vi.fn()
  urlPrototype.createObjectURL = createObjectURL
  urlPrototype.revokeObjectURL = revokeObjectURL
  restoreObjectUrls = () => {
    if (hadCreate) {
      urlPrototype.createObjectURL = previousCreate
    } else {
      delete urlPrototype.createObjectURL
    }
    if (hadRevoke) {
      urlPrototype.revokeObjectURL = previousRevoke
    } else {
      delete urlPrototype.revokeObjectURL
    }
  }
  return { createObjectURL, revokeObjectURL }
}

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  i18n = await createVideoPlaygroundI18n()
  user = userEvent.setup({ applyAccept: false })
})

afterEach(() => {
  restoreObjectUrls?.()
  restoreObjectUrls = undefined
})

describe('Video studio reference-image tray', () => {
  it('attaches an image chosen through the file picker and offers a "Remove <filename>" button', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickReferenceImages(user, [makeImageFile('kitten.png')])

    await expectAttachedImages(1)
    expect(
      within(referenceTray()).getByRole('button', { name: 'Remove kitten.png' })
    ).toBeEnabled()
    expect(trayAlert()).toBeNull()
  })

  it('opens the hidden file input when the user clicks Choose files', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    const input = screen.getByTestId('reference-image-file-input')
    const openDialog = vi.spyOn(input, 'click')

    await user.click(screen.getByRole('button', { name: 'Choose files' }))

    expect(openDialog).toHaveBeenCalledTimes(1)
  })

  it('attaches every image dropped on the dropzone', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    dropReferenceImages([
      makeImageFile('first.png'),
      makeImageFile('second.png'),
    ])

    await expectAttachedImages(2)
    expect(
      within(referenceTray()).getByRole('button', { name: 'Remove first.png' })
    ).toBeTruthy()
    expect(
      within(referenceTray()).getByRole('button', { name: 'Remove second.png' })
    ).toBeTruthy()
    expect(trayAlert()).toBeNull()
  })

  it('attaches image bytes pasted from the clipboard and prevents the default paste', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const pasted = pasteFromClipboard([makeImageFile('pasted.png')])

    expect(pasted.defaultPrevented()).toBe(true)
    await expectAttachedImages(1)
    expect(
      within(referenceTray()).getByRole('button', { name: 'Remove pasted.png' })
    ).toBeTruthy()
  })

  it('leaves an ordinary text paste in the focused prompt alone and keeps the textarea typing normally', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    const prompt = await screen.findByLabelText('Prompt')
    await user.click(prompt)

    const pasted = pasteFromClipboard([], 'hello')

    expect(pasted.defaultPrevented()).toBe(false)
    await user.type(prompt, 'hello')
    expect(prompt).toHaveValue('hello')
    expect(attachedImages()).toHaveLength(0)
  })

  it('accepts a JPEG, a PNG and a WebP reference image in one pick', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickReferenceImages(user, [
      makeImageFile('photo.jpg', 'image/jpeg'),
      makeImageFile('drawing.png', 'image/png'),
      makeImageFile('sticker.webp', 'image/webp'),
    ])

    await expectAttachedImages(3)
    expect(trayAlert()).toBeNull()
  })

  it.each(NON_IMAGE_FILES)(
    'rejects a non-image file of type %s with the "only image files" inline message',
    async (mimeType, name) => {
      renderVideoPlayground(i18n)
      await readyGenerateButton()

      dropReferenceImages([makeImageFile(name, mimeType)])

      await expectTrayMessage(
        'Only image files can be used as reference images.'
      )
      expect(attachedImages()).toHaveLength(0)
    }
  )

  it.each(DISALLOWED_IMAGE_MIME_TYPES)(
    'rejects an image of type %s with the "use a JPEG, PNG or WebP" inline message',
    async (mimeType, name) => {
      renderVideoPlayground(i18n)
      await readyGenerateButton()

      dropReferenceImages([makeImageFile(name, mimeType)])

      await expectTrayMessage('Use a JPEG, PNG or WebP image.')
      expect(attachedImages()).toHaveLength(0)
    }
  )

  it('rejects a reference image larger than 10 MB with the size message', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickReferenceImages(user, [
      makeImageFile('huge.png', 'image/png', MAX_REFERENCE_IMAGE_BYTES + 1),
    ])

    await expectTrayMessage('Each reference image must be 10 MB or smaller.')
    expect(attachedImages()).toHaveLength(0)
  })

  it('accepts a reference image of exactly 10 MB', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickReferenceImages(user, [
      makeImageFile('exact.png', 'image/png', MAX_REFERENCE_IMAGE_BYTES),
    ])

    await expectAttachedImages(1)
    expect(trayAlert()).toBeNull()
  })

  it.each(MODEL_IMAGE_CAPS)(
    '%s accepts exactly %i reference images and rejects the next one with the cap message',
    async (modelId, cap) => {
      renderVideoPlayground(i18n)
      await readyGenerateButton()
      await pickVideoModel(user, modelId)

      await pickReferenceImages(user, filesNamed(modelId, cap))

      await expectAttachedImages(cap)
      await pickReferenceImages(user, [makeImageFile('one-too-many.png')])
      await expectTrayMessage(
        `This model accepts at most ${cap} reference images.`
      )
      expect(attachedImages()).toHaveLength(cap)
    }
  )

  it('rejects the same over-cap image identically through the file picker, the dropzone and the clipboard', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await pickVideoModel(user, 'MiniMax-H3')
    await pickReferenceImages(user, filesNamed('cap', 5))
    await expectAttachedImages(5)

    const messages: string[] = []
    for (const path of INPUT_PATHS) {
      // One free slot and no rejection left over from the previous path.
      const lastAttached = attachedImages().at(-1)
      if (!lastAttached) {
        throw new Error('expected the tray to still hold five images')
      }
      await user.click(lastAttached)
      await expectAttachedImages(4)
      expect(trayAlert()).toBeNull()

      // The path still works while a slot is free.
      await path.attach(user, [makeImageFile(`slot-${path.name}.png`)])
      await expectAttachedImages(5)

      // The same path is refused once the tray is full again.
      await path.attach(user, [makeImageFile(`extra-${path.name}.png`)])
      await expectTrayMessage('This model accepts at most 5 reference images.')
      expect(attachedImages()).toHaveLength(5)
      messages.push((trayAlert()?.textContent ?? '').trim())
    }

    expect(new Set(messages).size).toBe(1)
    expect(messages[0]).toBe('This model accepts at most 5 reference images.')
  })

  it('restores attaching and clears the cap message when an image is removed', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await pickVideoModel(user, 'MiniMax-H3')
    await pickReferenceImages(user, filesNamed('cap', 5))
    await expectAttachedImages(5)
    await pickReferenceImages(user, [makeImageFile('one-too-many.png')])
    await expectTrayMessage('This model accepts at most 5 reference images.')

    await user.click(
      within(referenceTray()).getByRole('button', { name: 'Remove cap-5.png' })
    )

    expect(trayAlert()).toBeNull()
    await expectAttachedImages(4)
    await pickReferenceImages(user, [makeImageFile('fits-now.png')])
    await expectAttachedImages(5)
    expect(trayAlert()).toBeNull()
    expect(
      within(referenceTray()).getByRole('button', {
        name: 'Remove fits-now.png',
      })
    ).toBeTruthy()
  })

  it('clears the format message as soon as a valid image is attached', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    dropReferenceImages([makeImageFile('animation.gif', 'image/gif')])
    await expectTrayMessage('Use a JPEG, PNG or WebP image.')

    await pickReferenceImages(user, [makeImageFile('valid.png')])

    // Wait for the attachment to land before asserting the message is gone: the
    // intake gate reads the file asynchronously, so the clear happens in a later
    // commit than the change event that user.upload awaited.
    await expectAttachedImages(1)
    expect(trayAlert()).toBeNull()
  })

  it.each(INPUT_PATHS)(
    'refuses a reference image from the $name for a model with no capability entry',
    async (path) => {
      await stubVideoApi({ models: ['some-future-video-model'] })
      renderVideoPlayground(i18n)
      await readyGenerateButton()
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'some-future-video-model'
      )

      await path.attach(user, [makeImageFile('rejected.png')])

      await expectTrayMessage('This model does not accept reference images.')
      expect(attachedImages()).toHaveLength(0)
    }
  )

  it('renders no format, size or count hint before any rejection', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const tray = referenceTray()
    const copy = tray.textContent ?? ''

    expect(within(tray).queryByRole('alert')).toBeNull()
    for (const hint of [
      'JPEG',
      'PNG',
      'WebP',
      '10 MB',
      'at most',
      'does not accept',
      'Only image files',
    ]) {
      expect(copy, `unexpected hint copy: ${hint}`).not.toContain(hint)
    }
    expect(
      within(tray).getByText('Drop images here or choose files')
    ).toBeTruthy()
  })

  it('offers no URL input, so only the three local file paths can add a reference image', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const tray = referenceTray()

    // The retired generic composer's public-URL field must not come back.
    expect(
      screen.queryByPlaceholderText('https://cdn.example.com/reference.png')
    ).toBeNull()
    // The prompt is the only textbox on the whole page.
    expect(screen.getAllByRole('textbox')).toEqual([
      screen.getByLabelText('Prompt'),
    ])
    // Inside the tray the file input is the only input, and it is hidden from
    // the accessibility tree and from tab order: the picker is click-driven.
    const inputs = tray.querySelectorAll('input')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toHaveAttribute('type', 'file')
    expect(inputs[0]).toHaveAttribute('aria-hidden', 'true')
    expect((inputs[0] as HTMLInputElement).tabIndex).toBe(-1)
    expect(within(tray).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(tray).queryAllByRole('link')).toHaveLength(0)
  })

  it('shows a rejection inline in the tray and never calls window.alert', async () => {
    const browserAlert = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined)
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    dropReferenceImages([makeImageFile('animation.gif', 'image/gif')])

    await expectTrayMessage('Use a JPEG, PNG or WebP image.')
    expect(browserAlert).not.toHaveBeenCalled()
  })

  it('renders the thumbnail from a store-owned object URL and revokes it when the image is removed', async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickReferenceImages(user, [makeImageFile('thumb.png')])

    const thumbnail = await within(referenceTray()).findByRole('img', {
      name: 'thumb.png',
    })
    expect(thumbnail).toHaveAttribute('src', 'blob:preview-1')
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    await user.click(
      within(referenceTray()).getByRole('button', { name: 'Remove thumb.png' })
    )

    await expectAttachedImages(0)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('revokes every preview object URL when the page unmounts', async () => {
    const { revokeObjectURL } = stubObjectUrls()
    const { unmount } = renderVideoPlayground(i18n)
    await readyGenerateButton()
    await pickReferenceImages(user, [
      makeImageFile('keep.png'),
      makeImageFile('both.png'),
    ])
    await expectAttachedImages(2)

    unmount()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
  })
})
