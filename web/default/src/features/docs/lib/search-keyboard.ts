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

/**
 * Pure keyboard-navigation state machine for the Docs search combobox.
 * Extracted so the ArrowUp/ArrowDown/Home/End/Enter/Escape behavior is
 * unit-testable without a DOM.
 */

export type SearchKeyAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'moveNext' }
  | { type: 'movePrev' }
  | { type: 'moveFirst' }
  | { type: 'moveLast' }

export interface SearchKeyboardState {
  /** Whether the listbox is open. */
  open: boolean
  /** Index of the active option, or -1 when nothing is active. */
  activeIndex: number
  /** Number of results currently available. */
  resultCount: number
}

export function createSearchKeyboardState(
  resultCount: number
): SearchKeyboardState {
  return { open: false, activeIndex: -1, resultCount }
}

/**
 * Apply a keyboard action, returning the next state. `activeIndex` is clamped
 * to the valid range and wraps around for ArrowUp/ArrowDown.
 */
export function searchKeyboardReducer(
  state: SearchKeyboardState,
  action: SearchKeyAction
): SearchKeyboardState {
  const count = state.resultCount
  switch (action.type) {
    case 'open':
      return { ...state, open: true }
    case 'close':
      return { ...state, open: false, activeIndex: -1 }
    case 'moveNext': {
      if (count === 0) return { ...state, open: true, activeIndex: -1 }
      const next = state.activeIndex >= count - 1 ? 0 : state.activeIndex + 1
      return { open: true, activeIndex: next, resultCount: count }
    }
    case 'movePrev': {
      if (count === 0) return { ...state, open: true, activeIndex: -1 }
      const prev = state.activeIndex <= 0 ? count - 1 : state.activeIndex - 1
      return { open: true, activeIndex: prev, resultCount: count }
    }
    case 'moveFirst':
      return {
        open: true,
        activeIndex: count === 0 ? -1 : 0,
        resultCount: count,
      }
    case 'moveLast':
      return {
        open: true,
        activeIndex: count === 0 ? -1 : count - 1,
        resultCount: count,
      }
    default:
      return state
  }
}

/** Map a DOM keyboard event key to a search action (null = not handled). */
export function searchKeyToAction(
  key: string,
  open: boolean
): SearchKeyAction | null {
  switch (key) {
    case 'ArrowDown':
      return { type: 'moveNext' }
    case 'ArrowUp':
      return { type: 'movePrev' }
    case 'Home':
      return { type: 'moveFirst' }
    case 'End':
      return { type: 'moveLast' }
    case 'Escape':
      return open ? { type: 'close' } : null
    default:
      return null
  }
}

/** Stable DOM id for a search result option (used for aria-activedescendant). */
export function searchOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`
}
