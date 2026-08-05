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

/** Minimal storage surface so the helpers are testable with mocks. */
export interface FeedbackStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_PREFIX = 'docs-feedback:'

function defaultStorage(): FeedbackStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    /* unavailable */
  }
  return null
}

export function getFeedbackStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`
}

export function readFeedback(
  slug: string,
  storage: FeedbackStorage | null = defaultStorage()
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(getFeedbackStorageKey(slug))
  } catch {
    return null
  }
}

export function saveFeedback(
  slug: string,
  value: string,
  storage: FeedbackStorage | null = defaultStorage()
): boolean {
  if (!storage) return false
  try {
    storage.setItem(getFeedbackStorageKey(slug), value)
    return true
  } catch {
    return false
  }
}
