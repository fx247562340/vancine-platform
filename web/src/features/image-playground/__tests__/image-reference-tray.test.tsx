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
 * ImageReferenceTray component regression tests:
 * - Previewable MIME types render an <img> thumbnail.
 * - Non-previewable MIME types (e.g. TIFF) fall back to the file-name
 *   block; no broken <img> element is rendered.
 * - The remove button's accessible name embeds the file name so
 *   screen readers can distinguish multiple resources.
 * - Removing one image keeps the others.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Form } from '@/components/ui/form'
import { routerLinkMock } from '@/test/router-link-mock'

import { ImageReferenceTray } from '../components/image-reference-tray'
import type { ImageModelProfile, ReferenceImage } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const translations: Record<string, string> = {
  'Reference images': 'Reference images',
  'Add reference image': 'Add reference image',
  'Attach up to {{max}} reference images.':
    'Attach up to {{max}} reference images.',
  'Add image ({{remaining}} left)': 'Add image ({{remaining}} left)',
  'Remove reference image: {{name}}': 'Remove reference image: {{name}}',
  'Choose files': 'Choose files',
  'Drop images here or choose files': 'Drop images here or choose files',
}

async function createI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: translations } },
  })
  return instance
}

const profile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsAutoSize: false,
  supportsCustomSize: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 4,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsPromptExtendMode: false,
  supportsThinkingMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  minPixels: 512 * 512,
  maxPixels: 2048 * 2048,
}

function makeImage(
  id: string,
  name: string,
  mimeType: string,
  dataUrl = 'data:image/png;base64,AAAA'
): ReferenceImage {
  return {
    id,
    name,
    mimeType,
    dataUrl,
    size: 100,
  }
}

function TrayControlled(props: {
  initial: ReferenceImage[]
  onChange?: (next: ReferenceImage[]) => void
}) {
  const [images, setImages] = useState<ReferenceImage[]>(props.initial)
  const form = useForm({ defaultValues: {} })
  return (
    <Form {...form}>
      <ImageReferenceTray
        profile={profile}
        images={images}
        onChange={(next) => {
          setImages(next)
          props.onChange?.(next)
        }}
      />
    </Form>
  )
}

describe('ImageReferenceTray — preview, fallback, and remove', () => {
  // Save the original window state and restore it after every test so
  // the modifications to innerWidth / matchMedia never leak into
  // sibling test files.
  const originalInnerWidth = Object.getOwnPropertyDescriptor(
    window,
    'innerWidth'
  )
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList => {
        const m = /max-width:\s*(\d+)px/.exec(query)
        return {
          matches: m ? 1024 <= Number(m[1]) : false,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false
          },
        }
      },
    })
  })
  afterEach(() => {
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    } else {
      delete (window as unknown as { innerWidth?: number }).innerWidth
    }
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  })

  it('falls back to the file-name block for non-previewable MIME types and keeps the <img> for previewable ones', async () => {
    const i18n = await createI18n()
    const pngImage = makeImage(
      'png-1',
      'sunset.png',
      'image/png',
      'data:image/png;base64,AAAA'
    )
    const tiffImage = makeImage(
      'tiff-1',
      'archive.tiff',
      'image/tiff',
      'data:image/tiff;base64,BBBB'
    )
    render(
      <I18nextProvider i18n={i18n}>
        <TrayControlled initial={[pngImage, tiffImage]} />
      </I18nextProvider>
    )
    const list = screen.getByRole('list', { name: 'Reference images' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    const pngItem = items[0]
    expect(within(pngItem).getByRole('img')).toBeTruthy()
    expect(within(pngItem).queryByText('sunset.png')).toBeNull()
    const tiffItem = items[1]
    expect(within(tiffItem).queryByRole('img')).toBeNull()
    expect(within(tiffItem).getByText('archive.tiff')).toBeTruthy()
  })

  it('embeds the file name in the remove button so multiple resources stay distinguishable', async () => {
    const i18n = await createI18n()
    const a = makeImage('a', 'cover.png', 'image/png')
    const b = makeImage('b', 'page.tiff', 'image/tiff')
    render(
      <I18nextProvider i18n={i18n}>
        <TrayControlled initial={[a, b]} />
      </I18nextProvider>
    )
    expect(
      screen.getByRole('button', {
        name: 'Remove reference image: cover.png',
      })
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Remove reference image: page.tiff',
      })
    ).toBeTruthy()
  })

  it('removes the targeted image and leaves the rest', async () => {
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const a = makeImage('a', 'cover.png', 'image/png')
    const b = makeImage('b', 'page.tiff', 'image/tiff')
    let lastChange: ReferenceImage[] = []
    render(
      <I18nextProvider i18n={i18n}>
        <TrayControlled
          initial={[a, b]}
          onChange={(next) => {
            lastChange = next
          }}
        />
      </I18nextProvider>
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Remove reference image: cover.png',
      })
    )
    expect(lastChange).toHaveLength(1)
    expect(lastChange[0]?.id).toBe('b')
  })
})
