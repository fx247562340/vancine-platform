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
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 清理 CSS 变量名，替换特殊字符
 * 用于将模型名称（如 gpt-3.5-turbo）转换为有效的 CSS 变量名（gpt-3-5-turbo）
 * @param name - 原始名称
 * @returns 清理后的 CSS 变量名
 */
export function sanitizeCssVariableName(name: string): string {
  // 将点号、空格、斜杠替换为连字符
  // 移除其他不允许在 CSS 变量名中的特殊字符
  return name.replaceAll(/[.\s/]/g, '-').replaceAll(/[^\w-]/g, '')
}

/**
 * A pagination slot with a stable semantic identity, independent of array
 * position: page identity comes from the page number; ellipsis identity comes
 * from its placement (start/end) relative to the visible window.
 */
export type PageNumberItem =
  | { kind: 'page'; page: number }
  | { kind: 'ellipsis'; placement: 'start' | 'end' }

/**
 * Generates page numbers for pagination with ellipsis
 * @param currentPage - Current page number (1-based)
 * @param totalPages - Total number of pages
 * @returns Array of page/ellipsis slots with stable semantic identities
 *
 * Examples:
 * - Small dataset (≤4 pages): [page 1, page 2, page 3, page 4]
 * - Near beginning: [page 1, page 2, ellipsis-end, page 10]
 * - In middle: [page 1, ellipsis-start, page 5, ellipsis-end, page 10]
 * - Near end: [page 1, ellipsis-start, page 9, page 10]
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number
): PageNumberItem[] {
  const maxVisiblePages = 4
  const rangeWithDots: PageNumberItem[] = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push({ kind: 'page', page: i })
    }
  } else {
    rangeWithDots.push({ kind: 'page', page: 1 })

    if (currentPage <= 2) {
      rangeWithDots.push({ kind: 'page', page: 2 })
      rangeWithDots.push({ kind: 'ellipsis', placement: 'end' })
      rangeWithDots.push({ kind: 'page', page: totalPages })
    } else if (currentPage >= totalPages - 1) {
      rangeWithDots.push({ kind: 'ellipsis', placement: 'start' })
      rangeWithDots.push({ kind: 'page', page: totalPages - 1 })
      rangeWithDots.push({ kind: 'page', page: totalPages })
    } else {
      rangeWithDots.push({ kind: 'ellipsis', placement: 'start' })
      rangeWithDots.push({ kind: 'page', page: currentPage })
      rangeWithDots.push({ kind: 'ellipsis', placement: 'end' })
      rangeWithDots.push({ kind: 'page', page: totalPages })
    }
  }

  return rangeWithDots
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Try to parse and pretty-print JSON, fallback to original text if invalid
 * @param text - Text that might be JSON
 * @returns Pretty-printed JSON or original text
 */
export function tryPrettyJson(text: string): string {
  const raw = (text ?? '').toString().trim()
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
