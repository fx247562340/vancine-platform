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
 * Read a media file's natural duration.
 *
 * Returns:
 *  - a positive finite number on success,
 *  - `undefined` if the probe could not determine the duration
 *    (e.g. unsupported codec, malformed file, the element is in a
 *    server-side environment without `document`).
 *
 * The function NEVER returns 0 on failure. 0 would falsely satisfy
 * the per-item and total-duration preflight checks and let a
 * "valid" submit slip through; `undefined` keeps the value as
 * "unknown", which the UI displays honestly and the upstream
 * provider resolves.
 */
export type MediaDurationProbe = number | undefined

export function readMediaDuration(
  src: string,
  mimeType: string
): Promise<MediaDurationProbe> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined)
      return
    }
    const element = mimeType.startsWith('audio/')
      ? document.createElement('audio')
      : document.createElement('video')
    element.preload = 'metadata'
    const cleanup = () => {
      element.removeAttribute('src')
      // Loading the same source again would not re-emit events;
      // no Object URL is involved here so there is nothing to
      // revoke. The element itself is GC'd when the closure goes
      // out of scope.
    }
    const onLoaded = () => {
      const value = element.duration
      cleanup()
      if (!Number.isFinite(value) || value <= 0) {
        resolve(undefined)
        return
      }
      resolve(value)
    }
    const onError = () => {
      cleanup()
      resolve(undefined)
    }
    element.addEventListener('loadedmetadata', onLoaded, { once: true })
    element.addEventListener('error', onError, { once: true })
    element.src = src
  })
}
