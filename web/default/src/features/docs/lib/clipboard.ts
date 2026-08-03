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

/** Minimal clipboard surface so the helper is testable with mocks. */
export interface ClipboardLike {
  writeText(text: string): Promise<void>
}

function defaultClipboard(): ClipboardLike | null {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard?.writeText === 'function'
    ) {
      return navigator.clipboard
    }
  } catch {
    /* unavailable */
  }
  return null
}

/**
 * Copy text using the production clipboard path. Returns true on success and
 * false when the clipboard API is unavailable or the write is rejected
 * (e.g. permissions blocked). Never throws.
 */
export async function copyToClipboard(
  text: string,
  clipboard: ClipboardLike | null = defaultClipboard()
): Promise<boolean> {
  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
