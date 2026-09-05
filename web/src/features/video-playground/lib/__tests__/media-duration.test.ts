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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readMediaDuration } from '../media-duration'

describe('readMediaDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns undefined (never 0) when the media element cannot load', async () => {
    // jsdom never fires loadedmetadata/error on media elements, so the test
    // fires the error event itself the way a broken data URL does in a real
    // browser. The production contract: the probe resolves undefined, never 0.
    const listeners = new Map<string, () => void>()
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = document.createElementNS('', tag)
      element.addEventListener = ((type: string, listener: () => void) => {
        if (type === 'error') listeners.set(type, listener)
      }) as typeof element.addEventListener
      return element
    }) as unknown as typeof document.createElement)
    const pending = readMediaDuration('data:audio/wav;base64,AAAA', 'audio/wav')
    for (const listener of listeners.values()) listener()
    const result = await pending
    expect(result).toBeUndefined()
    expect(result).not.toBe(0)
  })
})
