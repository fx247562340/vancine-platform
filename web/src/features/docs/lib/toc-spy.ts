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
 * Pure scroll-spy selection used by the Docs TOC.
 *
 * Given the ordered heading list and a function that reports each heading's
 * current viewport-relative top, returns the id of the heading that should be
 * marked active: the last heading whose top has scrolled at or above the
 * fixed-header offset. Returns null when nothing has reached the offset yet.
 */
export function activeHeadingForScroll(
  headingIds: readonly string[],
  topOf: (id: string) => number,
  offset: number
): string | null {
  let active: string | null = null
  for (const id of headingIds) {
    if (topOf(id) <= offset) {
      active = id
    } else {
      break
    }
  }
  return active
}

/** Fixed-header offset (px) used to decide which heading is "current". */
export const TOC_SCROLL_OFFSET = 120

/**
 * Smooth-scroll a heading into view respecting the fixed header. The heading
 * elements carry `scroll-mt-20` so `scrollIntoView` already honors the offset;
 * this helper exists so the click behavior is centralized and testable.
 */
export function scrollHeadingIntoView(
  id: string,
  doc: Pick<Document, 'getElementById'> = document
): boolean {
  const el = doc.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
