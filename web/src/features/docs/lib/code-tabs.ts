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
import type { BundledLanguage } from 'shiki/bundle/web'

export interface CodeTabSample {
  label: string
  code: string
}

export interface CodeTabItem {
  key: string
  label: string
  code: string
  language: BundledLanguage
}

/**
 * Build an ordered, typed list of code-tab items from a samples record.
 * Each item becomes both a tab and a tabpanel in the accessible Tabs primitive,
 * so every tab is guaranteed to have a corresponding panel with a stable value.
 */
export function buildCodeTabItems<K extends string>(
  samples: Record<K, CodeTabSample>,
  order: readonly K[],
  languages: Record<K, BundledLanguage>
): CodeTabItem[] {
  return order.map((key) => ({
    key,
    label: samples[key].label,
    code: samples[key].code,
    language: languages[key],
  }))
}

/** The default active tab value is the first item's key (or '' when empty). */
export function defaultCodeTabValue(items: readonly CodeTabItem[]): string {
  return items[0]?.key ?? ''
}
