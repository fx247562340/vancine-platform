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
 * Single source of truth for the interface languages offered by the Default
 * frontend. Both the header LanguageSwitcher and the profile "Language
 * Preferences" card render from `INTERFACE_LANGUAGE_OPTIONS`, and every
 * language value that enters the app (detector, user preference, API header)
 * is funneled through `normalizeInterfaceLanguage`.
 */
export const INTERFACE_LANGUAGE_OPTIONS = [
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
] as const

export type InterfaceLanguageCode =
  (typeof INTERFACE_LANGUAGE_OPTIONS)[number]['code']

/** The supported interface language codes, in display order. */
export const SUPPORTED_INTERFACE_LANGUAGES = INTERFACE_LANGUAGE_OPTIONS.map(
  (lang) => lang.code
) as readonly InterfaceLanguageCode[]

/**
 * i18next `load` strategy used by the global instance.
 *
 * We normalize every incoming language to an exact supported code ourselves
 * (see `normalizeInterfaceLanguage`), so i18next must NOT further transform
 * it. `languageOnly` would strip the region and collapse `zh-TW` into `zh`,
 * which is exactly the bug we are fixing. `currentOnly` keeps the normalized
 * code verbatim, so `zh-TW` resolves to the `zh-TW` resource bundle.
 */
export const I18N_LOAD_STRATEGY = 'currentOnly' as const

interface Bcp47Parts {
  language: string
  script?: string
  region?: string
}

/**
 * Parse a BCP 47 language tag into its primary language, script, and region
 * subtags. Extension and private-use subtags (introduced by singletons such
 * as `u` or `x`) are ignored, so tags like `zh-TW-u-ca-chinese`,
 * `zh-HK-x-private`, and `zh-CN-u-nu-hanidec` still yield the correct
 * language/script/region. Underscores are tolerated as separators.
 */
function parseBcp47Tag(tag: string): Bcp47Parts {
  const subtags = tag.trim().replace(/_/g, '-').split('-')
  const language = (subtags[0] ?? '').toLowerCase()
  let script: string | undefined
  let region: string | undefined
  for (const raw of subtags.slice(1)) {
    const sub = raw.toLowerCase()
    // A singleton (single alphanum) starts an extension/private-use section;
    // script and region always precede it in a well-formed tag.
    if (sub.length === 1) break
    if (script === undefined && /^[a-z]{4}$/.test(sub)) {
      script = sub
    } else if (
      region === undefined &&
      (/^[a-z]{2}$/.test(sub) || /^[0-9]{3}$/.test(sub))
    ) {
      region = sub
    }
  }
  return { language, script, region }
}

/**
 * Map an arbitrary language tag to a supported interface code, or `undefined`
 * when the tag is not any supported language. This is the shared core used by
 * both the strict business normalizer and the detector normalizer.
 *
 * Chinese is disambiguated by script first, then region:
 *   script Hant -> 'zh-TW'; script Hans -> 'zh';
 *   region TW/HK/MO -> 'zh-TW'; otherwise (CN, bare, unknown) -> 'zh'.
 * The language subtag must be exactly `zh` — `zho`, `zhx`, etc. are rejected.
 *
 * Other languages match by their primary language subtag, so regional variants
 * resolve to the base language: en-US -> 'en', fr-FR -> 'fr', ja-JP -> 'ja'.
 */
function mapToSupportedCode(tag: string): InterfaceLanguageCode | undefined {
  const { language, script, region } = parseBcp47Tag(tag)

  if (language === 'zh') {
    if (script === 'hant') return 'zh-TW'
    if (script === 'hans') return 'zh'
    if (region === 'tw' || region === 'hk' || region === 'mo') return 'zh-TW'
    return 'zh'
  }

  const match = INTERFACE_LANGUAGE_OPTIONS.find(
    (lang) => lang.code.toLowerCase() === language
  )
  return match?.code
}

/**
 * Strict business normalization: collapse any language tag to a supported
 * interface code, falling back to 'en' for unknown/empty values. Used for the
 * active UI language, saved user preferences, and the API Accept-Language
 * header, where a definite supported code is always required.
 */
export function normalizeInterfaceLanguage(
  value?: string | null
): InterfaceLanguageCode {
  if (!value) return 'en'
  return mapToSupportedCode(value) ?? 'en'
}

/**
 * Detector normalization: map KNOWN variants to a supported code but leave
 * UNKNOWN tags unchanged. This is critical for i18next-browser-languagedetector:
 * `convertDetectedLanguage` is applied to every detected candidate, and an
 * unknown candidate (e.g. `de`) must survive so i18next's `supportedLngs`
 * filtering rejects it and evaluates the NEXT candidate (e.g. navigator
 * `zh-TW`). Collapsing unknowns to 'en' here would swallow later candidates
 * and wrongly resolve to English. Only when no candidate is supported does
 * i18next's `fallbackLng` yield 'en'.
 */
export function normalizeDetectedLanguage(value: string): string {
  if (!value) return value
  return mapToSupportedCode(value) ?? value
}

/**
 * Shared i18next-browser-languagedetector options. Both the production config
 * (config.ts) and the detector tests use this exact object, so the tests
 * exercise the real detection wiring rather than a hand-copied approximation.
 *
 * - `order` / `caches`: read the stored selection first, then the browser
 *   navigator; persist the resolution to localStorage.
 * - `convertDetectedLanguage`: map known variants to supported codes while
 *   leaving UNKNOWN candidates unchanged (see normalizeDetectedLanguage) so
 *   i18next can reject them via `supportedLngs` and try the next candidate.
 */
export const I18N_DETECTION_OPTIONS = {
  order: ['localStorage', 'navigator'] as string[],
  caches: ['localStorage'] as string[],
  convertDetectedLanguage: (lng: string): string =>
    normalizeDetectedLanguage(lng),
}

/**
 * Map an interface language code to the backend `Accept-Language` value.
 *
 * The backend understands `zh-CN` for Simplified Chinese and `zh-TW` for
 * Traditional Chinese; every other supported code is accepted verbatim.
 * Both the Axios request interceptor and `getCommonHeaders` (used for SSE)
 * call this single function so the two request paths cannot drift apart.
 */
export function getAcceptLanguage(code?: string | null): string {
  const normalized = normalizeInterfaceLanguage(code)
  return normalized === 'zh' ? 'zh-CN' : normalized
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
  return normalized === 'zh' ? 'zh-CN' : normalized
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
  // Required (not optional): i18next instances support `off`, and a cleanup
  // that cannot remove the real handler would leak listeners.
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
