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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import { formatFirstTopUpBonus, type FirstTopUpBonusDisplay } from '../lib'

/**
 * Read the first top-up bonus configuration from the shared /api/status cache
 * for the PUBLIC promotion surfaces (home, pricing, acquisition pages, sign-up).
 *
 * Renders nothing unless BOTH hold:
 *  - the server-derived `first_topup_bonus_active` flag is exactly true
 *    (quota > 0 and <= the server max quota), and
 *  - the quota and quota_per_unit values are finite positives.
 *
 * A positive quota with active=false (e.g. an out-of-range configuration)
 * therefore never renders. This reuses the existing React Query cache
 * (queryKey ['status']) — no per-page request — and derives the display with
 * useMemo from the current response; no extra state or effect.
 *
 * The WALLET must NOT use this hook: its amount comes from the authenticated
 * /api/user/topup/info response (see the wallet page), which calls the shared
 * pure formatter directly.
 */
export function useFirstTopUpBonus(): FirstTopUpBonusDisplay | null {
  const { status } = useStatus()
  const { i18n } = useTranslation()

  const active = status?.first_topup_bonus_active === true

  return useMemo(() => {
    if (!active) return null
    return formatFirstTopUpBonus(
      status?.first_topup_bonus_quota,
      status?.quota_per_unit,
      i18n.language
    )
  }, [
    active,
    status?.first_topup_bonus_quota,
    status?.quota_per_unit,
    i18n.language,
  ])
}
