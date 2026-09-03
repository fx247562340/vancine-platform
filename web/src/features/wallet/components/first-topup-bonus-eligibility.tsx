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
import { GiftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { FirstTopUpBonusDisplay } from '@/features/first-topup-bonus/lib/first-topup-bonus'
import { cn } from '@/lib/utils'

interface FirstTopUpBonusEligibilityProps {
  /**
   * Display payload for this user's first top-up bonus, already gated by the
   * caller on BOTH the eligibility flag from /api/user/topup/info AND a valid
   * promotion configuration. null renders nothing.
   */
  display: FirstTopUpBonusDisplay | null
  className?: string
}

/**
 * Wallet-side first top-up bonus disclosure. Never states a fixed top-up
 * ratio — the bonus is a one-time flat amount credited after the first
 * successful top-up, and the settlement transaction remains the only
 * authority on whether it is actually granted.
 */
export function FirstTopUpBonusEligibility(
  props: FirstTopUpBonusEligibilityProps
) {
  const { t } = useTranslation()

  if (!props.display) return null
  const display = props.display

  return (
    <Alert
      className={cn('border-border/60', props.className)}
      data-testid='first-topup-bonus-eligibility'
    >
      <HugeiconsIcon
        icon={GiftIcon}
        className='text-primary h-4 w-4'
        aria-hidden='true'
      />
      <AlertDescription className='text-sm'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='font-medium'>{t('First top-up bonus')}</span>
          <span className='text-primary font-semibold'>
            {t('{{credits}} Bonus Credits', { credits: display.credits })}
          </span>
        </div>
        <p className='text-muted-foreground mt-1 leading-relaxed'>
          {t(
            '{{credits}} Credits equals {{usd}} in API balance. One bonus per account.',
            {
              credits: display.credits,
              usd: display.usdText,
            }
          )}
        </p>
        <p className='text-muted-foreground/70 mt-1 text-xs'>
          {t(
            'Credited after your first successful top-up; the final result is determined at settlement.'
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}
