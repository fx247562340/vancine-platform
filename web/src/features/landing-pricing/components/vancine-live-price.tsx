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
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatLandingCacheUsd,
  formatLandingTokenUsd,
} from '../lib/resolve-token-price'
import type { LandingModelPrice } from '../types'

export type VancineLivePriceField = 'input' | 'output' | 'cache'

export interface VancineLivePriceProps {
  price: LandingModelPrice
  field: VancineLivePriceField
}

function PricingLink(props: { label: string }): ReactElement {
  return (
    <Link to='/pricing' className='underline underline-offset-2'>
      {props.label}
    </Link>
  )
}

/**
 * Render one Vancine live token price, or a non-price state that never
 * falls back to a hardcoded amount.
 */
export function VancineLivePrice(props: VancineLivePriceProps): ReactElement {
  const { t } = useTranslation()
  const price = props.price

  if (price.status === 'loading') {
    return <span>{t('Loading')}</span>
  }
  if (price.status === 'unsupported') {
    return <PricingLink label={t('Dynamic Pricing')} />
  }
  if (price.status !== 'ready') {
    return <PricingLink label={t('View live pricing')} />
  }

  if (props.field === 'cache') {
    if (price.amounts.cacheReadUsd === null) {
      return <span>—</span>
    }
    return <span>{formatLandingCacheUsd(price.amounts.cacheReadUsd)}</span>
  }

  const amount =
    props.field === 'input' ? price.amounts.inputUsd : price.amounts.outputUsd
  return <span>{formatLandingTokenUsd(amount)}</span>
}

/**
 * Input / output pair used by comparison tables. Non-ready states render
 * a single fallback instead of two copies of the same message.
 */
export function VancineLivePricePair(props: {
  price: LandingModelPrice
}): ReactElement {
  const price = props.price
  if (price.status === 'ready') {
    return (
      <>
        <VancineLivePrice price={price} field='input' />
        {' / '}
        <VancineLivePrice price={price} field='output' />
      </>
    )
  }
  return <VancineLivePrice price={price} field='input' />
}
