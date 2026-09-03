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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { useFirstTopUpBonus } from '../hooks/use-first-topup-bonus'

interface FirstTopUpBonusCalloutProps {
  /**
   * compact: the complete disclosure in a restrained block; full: identical
   * content (the compact variant already carries the whole condition, so
   * there is nothing left to add); signup: swaps the generic condition line
   * for the explicit "sign-up itself grants 0 Credits" wording.
   */
  variant?: 'compact' | 'full' | 'signup'
  className?: string
}

/**
 * Shared "first top-up bonus" promotional callout.
 *
 * Renders nothing unless the server flags the promotion as active AND the
 * quota / quota_per_unit values are valid — a disabled, missing, zero,
 * negative or out-of-range configuration all collapse to "not rendered".
 * Every variant states, on first sight: the dynamic Credits amount, the USD
 * API-balance equivalent, that the bonus lands after the first successful
 * top-up, and that it is limited to one per account.
 */
export function FirstTopUpBonusCallout(props: FirstTopUpBonusCalloutProps) {
  const { t } = useTranslation()
  const display = useFirstTopUpBonus()

  if (!display) return null

  const signupWording = props.variant === 'signup'

  return (
    <Alert
      className={cn('border-border/60 bg-card/40', props.className)}
      data-testid='first-topup-bonus-callout'
    >
      <HugeiconsIcon
        icon={GiftIcon}
        className='text-primary h-4 w-4'
        aria-hidden='true'
      />
      <AlertDescription>
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <Badge variant='secondary'>{t('First top-up bonus')}</Badge>
          </div>
          <p className='text-sm font-medium'>
            {t('{{credits}} Bonus Credits · {{usd}} API balance', {
              credits: display.credits,
              usd: display.usdText,
            })}
          </p>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {signupWording
              ? t(
                  'Sign-up itself grants 0 Credits. Complete your first successful top-up to receive {{credits}} Bonus Credits. One bonus per account.',
                  { credits: display.credits }
                )
              : t('After your first successful top-up · one bonus per account')}
          </p>
        </div>
      </AlertDescription>
    </Alert>
  )
}
