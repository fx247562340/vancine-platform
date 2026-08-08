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

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import { AI_MEDIA_RESOURCE_EVENT } from '../lib/landing'

/**
 * Live sources note: no hardcoded prices, limits, or availability promises —
 * the live Docs model catalog and Pricing page are authoritative.
 */
export function LiveSources(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='ai-media-live-sources-title'
      className='bg-muted/30 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <h2 id='ai-media-live-sources-title' className='text-3xl font-bold'>
            {t('Models and pricing are live')}
          </h2>
          <p className='text-muted-foreground'>
            {t(
              'Model lineups, availability, and pricing can change. The live Docs model catalog and Pricing page are authoritative.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <Button
            render={<Link to='/pricing' />}
            onClick={() =>
              trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'pricing_note',
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
              trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'pricing_note',
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
