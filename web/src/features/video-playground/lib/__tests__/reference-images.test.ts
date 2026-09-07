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
 * The single intake gate every reference-image path funnels through.
 *
 * These are unit tests on the gate itself; the page-level suite proves the file
 * picker, the dropzone and the clipboard all reach it.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_REFERENCE_IMAGE_BYTES,
  resolveVideoModelCapability,
} from '../model-capabilities'
import {
  dataTransferHasImage,
  filesFromDataTransfer,
  intakeReferenceImageFiles,
} from '../reference-images'

function fileOfSize(name: string, mimeType: string, byteSize: number): File {
  return new File([new Uint8Array(byteSize)], name, { type: mimeType })
}

function namedFiles(count: number, mimeType = 'image/png'): File[] {
  return Array.from({ length: count }, (_, index) =>
    fileOfSize(`image-${index}.png`, mimeType, 64)
  )
}

function dataTransferWith(
  files: File[],
  items: Array<{ kind: string; type: string; file: File | null }> = []
): DataTransfer {
  return {
    files,
    items: items.map((item) => ({
      kind: item.kind,
      type: item.type,
      getAsFile: () => item.file,
    })),
  } as unknown as DataTransfer
}

const H3 = resolveVideoModelCapability('MiniMax-H3')
const SEEDANCE_2_5 = resolveVideoModelCapability('Doubao-Seedance-2.5')
const UNVERIFIED = resolveVideoModelCapability('some-future-video-model')

describe('intakeReferenceImageFiles', () => {
  it('accepts JPEG, PNG and WebP and reads each into a base64 source', async () => {
    const intake = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('a.jpg', 'image/jpeg', 32),
      fileOfSize('b.png', 'image/png', 32),
      fileOfSize('c.webp', 'image/webp', 32),
    ])
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.images).toHaveLength(3)
    for (const image of intake.images) {
      expect(image.kind).toBe('image')
      expect(image.source.kind).toBe('base64')
      if (image.source.kind === 'base64') {
        expect(image.source.dataUrl.startsWith('data:image/')).toBe(true)
      }
    }
  })

  it('keeps the added order and the file name and size on each resource', async () => {
    const intake = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('first.png', 'image/png', 10),
      fileOfSize('second.png', 'image/png', 20),
    ])
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.images.map((image) => image.name)).toEqual([
      'first.png',
      'second.png',
    ])
    expect(intake.images.map((image) => image.byteSize)).toEqual([10, 20])
    expect(new Set(intake.images.map((image) => image.id)).size).toBe(2)
  })

  it('keeps the local bytes reachable so a revoked thumbnail can be recreated', async () => {
    const intake = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('a.png', 'image/png', 16),
    ])
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.images[0]?.blob).toBeInstanceOf(Blob)
  })

  it.each([
    ['image/gif'],
    ['image/bmp'],
    ['image/tiff'],
    ['image/heic'],
    ['image/svg+xml'],
  ])(
    'rejects a disallowed image MIME %s with the format reason',
    async (mime) => {
      const intake = await intakeReferenceImageFiles(H3, 0, [
        fileOfSize('a.img', mime, 32),
      ])
      expect(intake.ok).toBe(false)
      if (intake.ok) return
      expect(intake.rejection.reasonKey).toBe(
        'videoPlayground.reference.unsupportedFormat'
      )
    }
  )

  it.each([['application/pdf'], ['video/mp4'], ['audio/mpeg'], ['text/plain']])(
    'rejects a non-image file of type %s with the not-an-image reason',
    async (mime) => {
      const intake = await intakeReferenceImageFiles(H3, 0, [
        fileOfSize('a.bin', mime, 32),
      ])
      expect(intake.ok).toBe(false)
      if (intake.ok) return
      expect(intake.rejection.reasonKey).toBe(
        'videoPlayground.reference.notAnImage'
      )
    }
  )

  it('rejects a file one byte over the 10 MB budget and accepts one exactly at it', async () => {
    const over = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('big.png', 'image/png', MAX_REFERENCE_IMAGE_BYTES + 1),
    ])
    expect(over.ok).toBe(false)
    if (!over.ok) {
      expect(over.rejection.reasonKey).toBe(
        'videoPlayground.reference.imageTooLarge'
      )
    }

    const exact = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('exact.png', 'image/png', MAX_REFERENCE_IMAGE_BYTES),
    ])
    expect(exact.ok).toBe(true)
  })

  it('rejects the whole batch when one file in it is invalid', async () => {
    const intake = await intakeReferenceImageFiles(H3, 0, [
      fileOfSize('good.png', 'image/png', 32),
      fileOfSize('bad.gif', 'image/gif', 32),
    ])
    expect(intake.ok).toBe(false)
  })

  it('accepts exactly the MiniMax-H3 cap of five and rejects the sixth', async () => {
    const atCap = await intakeReferenceImageFiles(H3, 0, namedFiles(5))
    expect(atCap.ok).toBe(true)
    if (atCap.ok) {
      expect(atCap.images).toHaveLength(5)
    }

    const overCap = await intakeReferenceImageFiles(H3, 0, namedFiles(6))
    expect(overCap.ok).toBe(false)
    if (!overCap.ok) {
      expect(overCap.rejection.reasonKey).toBe(
        'videoPlayground.reference.tooManyImages'
      )
      expect(overCap.rejection.interpolation).toEqual({ max: 5 })
    }
  })

  it('counts already attached images toward the cap', async () => {
    const intake = await intakeReferenceImageFiles(H3, 4, namedFiles(2))
    expect(intake.ok).toBe(false)
    if (!intake.ok) {
      expect(intake.rejection.interpolation).toEqual({ max: 5 })
    }
  })

  it('accepts exactly the Seedance 2.5 cap of thirty and rejects the thirty-first', async () => {
    const atCap = await intakeReferenceImageFiles(
      SEEDANCE_2_5,
      0,
      namedFiles(30)
    )
    expect(atCap.ok).toBe(true)

    const overCap = await intakeReferenceImageFiles(
      SEEDANCE_2_5,
      0,
      namedFiles(31)
    )
    expect(overCap.ok).toBe(false)
    if (!overCap.ok) {
      expect(overCap.rejection.interpolation).toEqual({ max: 30 })
    }
  })

  it('rejects every image for a model with no capability entry', async () => {
    const intake = await intakeReferenceImageFiles(UNVERIFIED, 0, namedFiles(1))
    expect(intake.ok).toBe(false)
    if (!intake.ok) {
      expect(intake.rejection.reasonKey).toBe(
        'videoPlayground.reference.modelDoesNotAcceptImages'
      )
    }
  })

  it('reports the cap before inspecting file contents, so one message covers every path', async () => {
    const atCapWithBadFile = await intakeReferenceImageFiles(H3, 5, [
      fileOfSize('bad.gif', 'image/gif', 32),
    ])
    expect(atCapWithBadFile.ok).toBe(false)
    if (!atCapWithBadFile.ok) {
      expect(atCapWithBadFile.rejection.reasonKey).toBe(
        'videoPlayground.reference.tooManyImages'
      )
    }
  })

  it('accepts an empty selection as a no-op rather than an error', async () => {
    const intake = await intakeReferenceImageFiles(H3, 0, [])
    expect(intake).toEqual({ ok: true, images: [] })
  })
})

describe('filesFromDataTransfer', () => {
  it('reads the file list of a drop payload', () => {
    const files = namedFiles(2)
    expect(filesFromDataTransfer(dataTransferWith(files))).toEqual(files)
  })

  it('falls back to clipboard items when the file list is empty', () => {
    const pasted = fileOfSize('pasted.png', 'image/png', 16)
    const extracted = filesFromDataTransfer(
      dataTransferWith(
        [],
        [
          { kind: 'string', type: 'text/plain', file: null },
          { kind: 'file', type: 'image/png', file: pasted },
        ]
      )
    )
    expect(extracted).toEqual([pasted])
  })

  it('returns nothing for a null payload', () => {
    expect(filesFromDataTransfer(null)).toEqual([])
  })
})

describe('dataTransferHasImage', () => {
  it('reports true for a clipboard carrying an image file', () => {
    expect(
      dataTransferHasImage(
        dataTransferWith([fileOfSize('a.png', 'image/png', 8)])
      )
    ).toBe(true)
  })

  it('reports false for a text-only clipboard so an ordinary paste is never intercepted', () => {
    expect(
      dataTransferHasImage(
        dataTransferWith(
          [],
          [{ kind: 'string', type: 'text/plain', file: null }]
        )
      )
    ).toBe(false)
  })

  it('reports false for a drop of non-image files', () => {
    expect(
      dataTransferHasImage(
        dataTransferWith([fileOfSize('doc.pdf', 'application/pdf', 8)])
      )
    ).toBe(false)
  })

  it('reports false for a null payload', () => {
    expect(dataTransferHasImage(null)).toBe(false)
  })
})
