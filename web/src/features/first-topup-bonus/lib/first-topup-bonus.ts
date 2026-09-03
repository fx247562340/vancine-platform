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
 * Shared "first top-up bonus" display formatting.
 *
 * The promotion is configured on the backend as a raw quota value
 * (`first_topup_bonus_quota`) combined with `quota_per_unit` (the number of
 * quota units that equal $1). The marketing pages and the wallet render the
 * same derived numbers, so the derivation lives here once instead of being
 * re-implemented per page.
 *
 * All values are computed from the current configuration at render time.
 * Nothing here is hard-coded: the planned production value (500000) and the
 * $1 equivalent are produced by the same code path that would produce any
 * other configured value. An invalid or disabled configuration returns null
 * so callers simply render nothing.
 */

import { toIntlLocale } from '@/i18n/languages'

export interface FirstTopUpBonusDisplay {
  /** The configured bonus quota in raw quota units. */
  quota: number
  /** The quota formatted with thousands separators, e.g. "500,000". */
  credits: string
  /** The API-balance equivalent in whole dollars, e.g. 1. */
  usd: number
  /** The API-balance equivalent formatted as a currency, e.g. "$1". */
  usdText: string
}

/**
 * Compute the display payload for the first top-up bonus from the raw
 * configuration, or return null when the promotion is disabled or invalid.
 *
 * Returns null when:
 *  - bonusQuota is missing, not a finite number, or <= 0;
 *  - quotaPerUnit is missing, not a finite number, or <= 0;
 *  - the resulting USD equivalent is not a positive finite number.
 *
 * @param bonusQuota raw `first_topup_bonus_quota` from the status/topup API.
 * @param quotaPerUnit raw `quota_per_unit` from the status API.
 * @param locale the active i18n locale used for number formatting.
 */
export function formatFirstTopUpBonus(
  bonusQuota: unknown,
  quotaPerUnit: unknown,
  locale?: string
): FirstTopUpBonusDisplay | null {
  const quota = Number(bonusQuota)
  if (!Number.isFinite(quota) || quota <= 0) return null

  const perUnit = Number(quotaPerUnit)
  if (!Number.isFinite(perUnit) || perUnit <= 0) return null

  const usd = quota / perUnit
  if (!Number.isFinite(usd) || usd <= 0) return null

  // The project's i18next config uses internal non-BCP-47 codes
  // (`zhCN`, `zhTW`) for supportedLngs, so `i18n.language` is NOT a
  // valid BCP-47 tag on its own. Passing the raw value to
  // `new Intl.NumberFormat` throws `RangeError: Invalid language tag`
  // (and tears down the whole home / wallet subtree on the bonus
  // path). The shared `toIntlLocale` helper converts the project
  // internal code to a valid BCP-47 tag (zhCN -> zh-CN, zhTW ->
  // zh-TW) and validates via `Intl.getCanonicalLocales`, so the
  // call below is guaranteed to never see a malformed tag.
  //
  // Per `toIntlLocale`'s contract:
  //   - empty / null / undefined input returns `undefined`, which
  //     lets `Intl` use the runtime default locale (no throw);
  //   - any non-empty value first goes through the project-wide
  //     language normalization (`normalizeInterfaceLanguage`), so
  //     a non-supported / malformed string falls back to the
  //     canonical 'en' rather than reaching the Intl constructor
  //     unchanged.
  // Therefore the only way for an `Intl.NumberFormat` call below to
  // throw a `RangeError` is a bug in `toIntlLocale` itself.
  const intlLocale = toIntlLocale(locale)

  const credits = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 0,
  }).format(quota)

  const usdText = new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(usd)

  return { quota, credits, usd, usdText }
}
