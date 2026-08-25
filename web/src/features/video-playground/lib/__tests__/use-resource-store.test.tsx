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
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VideoImageResource, VideoResource } from '../resource-validation'
import { useResourceStore } from '../use-resource-store'

const revokeSpy = vi.fn()
const createSpy = vi.fn(() => 'blob:preview')

beforeEach(() => {
  revokeSpy.mockClear()
  createSpy.mockClear()
  // jsdom does not implement URL.createObjectURL / revokeObjectURL.
  // Provide minimal stubs that record usage so we can assert the
  // store's lifecycle behavior.
  ;(URL as unknown as { createObjectURL: typeof createSpy }).createObjectURL =
    createSpy
  ;(URL as unknown as { revokeObjectURL: typeof revokeSpy }).revokeObjectURL =
    revokeSpy
})

afterEach(() => {
  vi.restoreAllMocks()
})

const image: VideoImageResource = {
  id: 'img-1',
  kind: 'image',
  source: { kind: 'url', url: 'https://cdn.example.com/a.png' },
  name: 'a.png',
  mimeType: 'image/png',
  byteSize: 1000,
}

describe('useResourceStore', () => {
  it('adds and removes resources without exposing blob URLs across renders', () => {
    const { result } = renderHook(() => useResourceStore())
    act(() => result.current.addImage(image))
    expect(result.current.images).toEqual([image])

    act(() => result.current.removeImage('img-1'))
    expect(result.current.images).toEqual([])
  })

  it('revokes preview URL when a resource is removed', () => {
    const { result } = renderHook(() => useResourceStore())
    act(() => {
      result.current.addImage(image)
      result.current.registerPreviewUrl('img-1', 'blob:preview-1')
    })
    act(() => result.current.removeImage('img-1'))
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview-1')
  })

  it('revokes a previous preview URL when a new one is registered for the same id', () => {
    const { result } = renderHook(() => useResourceStore())
    act(() => {
      result.current.addImage(image)
      result.current.registerPreviewUrl('img-1', 'blob:preview-1')
      result.current.registerPreviewUrl('img-1', 'blob:preview-2')
    })
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview-1')
  })

  it('revokes all preview URLs on reset', () => {
    const { result } = renderHook(() => useResourceStore())
    act(() => {
      result.current.addImage(image)
      result.current.addAudio({
        id: 'aud-1',
        kind: 'audio',
        source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
        name: 'a.wav',
        mimeType: 'audio/wav',
        byteSize: 1000,
        durationSeconds: 5,
      })
      result.current.registerPreviewUrl('img-1', 'blob:p1')
      result.current.registerPreviewUrl('aud-1', 'blob:p2')
    })
    act(() => result.current.reset())
    expect(revokeSpy).toHaveBeenCalledWith('blob:p1')
    expect(revokeSpy).toHaveBeenCalledWith('blob:p2')
  })

  it('revokes all preview URLs on unmount', async () => {
    const { result, unmount } = renderHook(() => useResourceStore())
    act(() => {
      result.current.addImage(image)
      result.current.registerPreviewUrl('img-1', 'blob:p-on-unmount')
    })
    unmount()
    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith('blob:p-on-unmount')
    })
  })

  it('refuses to add a wrong-kind resource', () => {
    const { result } = renderHook(() => useResourceStore())
    const wrong: VideoResource = {
      id: 'wrong',
      kind: 'audio',
      source: { kind: 'url', url: 'https://cdn.example.com/x.wav' },
      name: 'x.wav',
      mimeType: 'audio/wav',
      byteSize: 1000,
      durationSeconds: 5,
    }
    act(() => result.current.addImage(wrong as never))
    expect(result.current.images).toEqual([])
  })
})
