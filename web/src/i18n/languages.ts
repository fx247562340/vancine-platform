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
export const INTERFACE_LANGUAGE_OPTIONS = [
  { code: 'zhCN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zhTW', label: '繁體中文' },
] as const

export type InterfaceLanguageCode =
  (typeof INTERFACE_LANGUAGE_OPTIONS)[number]['code']

export function normalizeInterfaceLanguage(value?: string | null): string {
  if (!value) return 'en'

  let normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (
    value === 'zh-TW' ||
    value === 'zh-HK' ||
    value === 'zh-MO' ||
    value === 'zhTW'
  ) {
    normalized = 'zhTW'
  }
  if (value === 'zh-CN' || value === 'zh-Hans' || value === 'zhCN') {
    normalized = 'zhCN'
  }

  return INTERFACE_LANGUAGE_OPTIONS.some((lang) => lang.code === normalized)
    ? normalized
    : 'en'
}

/**
 * Map a browser-detected locale onto the interface language codes this project
 * uses with i18next (`zhCN` / `zhTW`).
 *
 * Browsers report standard BCP-47 tags (`zh-CN`, `zh-TW`, `zh-Hant`, `zh`, ...),
 * but `supportedLngs`/resources use the non-standard camelCase codes, so without
 * this mapping a Chinese browser would never match and fall back to English.
 * Non-Chinese codes are returned unchanged so i18next's own `supportedLngs`
 * matching still applies (e.g. `fr-FR` -> `fr`, `ja` -> `ja`).
 */
export function convertDetectedLanguage(value: string): string {
  const lower = value.trim().replaceAll('_', '-').toLowerCase()
  if (!lower.startsWith('zh')) return value
  if (
    lower === 'zh-tw' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower.startsWith('zh-hant')
  ) {
    return 'zhTW'
  }
  return 'zhCN'
}

/**
 * Convert an interface language code (the values i18next uses, such as `zhCN` /
 * `zhTW`) into a valid BCP-47 locale tag that the `Intl.*` APIs accept.
 *
 * `new Intl.NumberFormat('zhCN')` throws `RangeError: Invalid language tag`, so
 * any locale derived from `i18n.language` / `i18n.resolvedLanguage` MUST be run
 * through this before it reaches an `Intl` constructor. Unknown values fall back
 * to `undefined`, which makes `Intl` use the runtime default locale.
 */
export function toIntlLocale(value?: string | null): string | undefined {
  if (!value) return undefined
  switch (value) {
    case 'zhCN':
      return 'zh-CN'
    case 'zhTW':
      return 'zh-TW'
    default:
      break
  }
  try {
    return Intl.getCanonicalLocales(value)[0]
  } catch {
    return undefined
  }
}

/**
 * Map an interface language code to the BCP 47 tag written to
 * `document.documentElement.lang`.
 *
 * Simplified Chinese uses the unambiguous `zh-CN` form; Traditional Chinese
 * uses the precise `zh-TW` tag; every other supported language uses its code
 * verbatim (en, fr, ru, ja, vi). Shared by the production config wiring and the
 * tests so the `<html lang>` behavior cannot drift.
 */
export function getDocumentLanguage(code?: string | null): string {
  const normalized = normalizeInterfaceLanguage(code)
  if (normalized === 'zhCN') return 'zh-CN'
  if (normalized === 'zhTW') return 'zh-TW'
  return normalized
}

/**
 * Write the BCP 47 tag for `lng` to `document.documentElement.lang`. A no-op
 * when `document` is unavailable (unit tests / SSR), so it is safe to call from
 * any environment. Idempotent: skips the DOM write when the value is unchanged,
 * so redundant triggers (e.g. the init languageChanged event plus the init
 * safety-net) do not produce duplicate writes.
 */
export function applyDocumentLanguage(lng: string): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    const next = getDocumentLanguage(lng)
    if (document.documentElement.lang !== next) {
      document.documentElement.lang = next
    }
  }
}

/** Minimal i18next event surface needed to wire the language sync. */
interface I18nLanguageEventEmitter {
  on(event: 'languageChanged', cb: (lng: string) => void): unknown
  off(event: 'languageChanged', cb: (lng: string) => void): unknown
}

// Maps a wired instance to its CURRENTLY active handler (its "generation").
// A cleanup only tears down the registration if the handler it captured is
// still the active one, so a stale cleanup can never disturb a newer wire.
const activeHandlers = new WeakMap<
  I18nLanguageEventEmitter,
  (lng: string) => void
>()

/**
 * Wire `<html lang>` synchronization to an i18next instance: refresh on every
 * `languageChanged` event. Shared by the production config and the tests as a
 * single source of truth.
 *
 * Generation-safe semantics:
 * 1. First wire: registers a handler and records it as the instance's active
 *    generation.
 * 2. Repeat wire while a handler is active: returns a no-op cleanup and does
 *    NOT register a second handler.
 * 3. The returned cleanup, on its first call, removes the handler ONLY if it is
 *    still the active generation, then clears the record.
 * 4. Calling the same cleanup again is a strict no-op.
 * 5. A stale cleanup (captured before a later re-wire) is a strict no-op: it
 *    cannot off the newer handler nor clear the newer registration.
 * 6. After a cleanup tears down the active handler, the instance may be wired
 *    again.
 */
export function wireDocumentLanguageSync(
  instance: I18nLanguageEventEmitter
): () => void {
  if (activeHandlers.has(instance)) {
    return () => {}
  }
  const handler = (lng: string): void => {
    applyDocumentLanguage(lng)
  }
  activeHandlers.set(instance, handler)
  instance.on('languageChanged', handler)
  return () => {
    // Generation guard: only the cleanup owning the active handler may tear it
    // down. A stale cleanup (after a re-wire) is a strict no-op.
    if (activeHandlers.get(instance) !== handler) {
      return
    }
    activeHandlers.delete(instance)
    instance.off('languageChanged', handler)
  }
}
