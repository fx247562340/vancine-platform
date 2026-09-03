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
 * Deterministic locale fallback chains, mirroring the backend's
 * LocalizedString.ContentFor. Keys are canonical BCP-47 tags produced by
 * `toLanguageTag`. Never select content by object iteration order.
 */
const FALLBACK_CHAINS: Record<string, string[]> = {
  'zh-TW': ['zh-TW', 'zh-CN', 'en'],
  'zh-CN': ['zh-CN', 'en'],
  en: ['en', 'zh-CN'],
}

function localizedFallbackChain(langTag: string): string[] {
  return FALLBACK_CHAINS[langTag] ?? [langTag, 'en', 'zh-CN']
}

/**
 * If `raw` is a localized JSON map ({ "locale": "content", ... }), select the
 * content for `langTag` using the deterministic fallback chain. An empty
 * object, an object without a usable locale, or an object whose values are
 * not all strings resolves to the empty string (the page shows its empty
 * state, never raw JSON). Any non-object shape (Markdown, HTML, URL,
 * invalid JSON, arrays) is returned trimmed but unchanged.
 */
export function selectLocalizedContent(raw: string, langTag: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) {
    return trimmed
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return trimmed
  }

  // From here on `parsed` is a plain object. A localized map must only ever
  // surface a selected locale body: an empty object, or an object whose
  // values are not all strings, resolves to the empty string so the page
  // shows its empty state instead of raw JSON.
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) {
    return ''
  }
  if (!entries.every(([, value]) => typeof value === 'string')) {
    return ''
  }

  const map = parsed as Record<string, string>
  for (const key of localizedFallbackChain(langTag)) {
    const content = map[key]
    if (content) {
      return content
    }
  }
  return ''
}
