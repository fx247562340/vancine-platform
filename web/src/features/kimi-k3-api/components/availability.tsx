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
import { ChartLineData01Icon, Layers01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  KIMI_K3_PORTFOLIO_EXAMPLES,
  KIMI_K3_RESOURCE_EVENT,
} from '../lib/landing'

/**
 * Portfolio / availability section. Deliberately makes no price, limit, or
 * availability promises — the live Pricing page and the Docs model catalog
 * are the only authoritative sources, and the page says so.
 */
export function Availability(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id='availability'
      aria-labelledby='kimi-k3-availability-title'
      className='bg-muted/30 scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <h2 id='kimi-k3-availability-title' className='text-3xl font-bold'>
            {t('One key, a focused China AI portfolio')}
          </h2>
          <p className='text-muted-foreground'>
            {t(
              'Switch models as your task changes. Features, availability, and pricing are model-specific.'
            )}
          </p>
        </div>

        <ul className='flex flex-wrap gap-2' aria-hidden='false'>
          {KIMI_K3_PORTFOLIO_EXAMPLES.map((model) => (
            <li key={model}>
              <Badge variant='outline' className='px-3 py-1 text-sm'>
                {model}
              </Badge>
            </li>
          ))}
        </ul>

        <p className='text-muted-foreground text-sm'>
          {t(
            'kimi-k3 is listed in the live Docs model catalog, and live Pricing shows current rates. Other model combinations are examples only; the live catalog is authoritative.'
          )}
        </p>

        <div className='flex flex-wrap items-center gap-3'>
          <Button
            render={<Link to='/pricing' />}
            onClick={() =>
              trackEvent(KIMI_K3_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'availability',
              })
            }
          >
            <HugeiconsIcon
              icon={ChartLineData01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('View live pricing and availability')}
          </Button>
          <Button
            variant='outline'
            render={<Link to='/docs/$slug' params={{ slug: 'models' }} />}
            onClick={() =>
              trackEvent(KIMI_K3_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'availability',
              })
            }
          >
            <HugeiconsIcon
              icon={Layers01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('Browse the Docs model catalog')}
          </Button>
        </div>
      </div>
    </section>
  )
}
