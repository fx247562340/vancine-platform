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
import { ArrowRight01Icon, Key01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  FAST_CODING_MODELS_CTA_EVENT,
  FAST_CODING_MODELS_RESOURCE_EVENT,
  getFastCodingModelsCtaTarget,
} from '../lib/fast-coding-models'

export interface FinalCtaProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Closing conversion block: the auth-aware "Start with Vancine" CTA
 * (utm_content=final) plus a live-pricing link (utm_content=pricing).
 * Both carry only the fixed owned-media UTMs.
 */
export function FinalCta(props: FinalCtaProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getFastCodingModelsCtaTarget(
    props.isAuthenticated,
    'final',
    props.search
  )
  const pricingTarget = getFastCodingModelsCtaTarget(
    props.isAuthenticated,
    'pricing',
    props.search
  )

  return (
    <section
      aria-labelledby='fast-coding-models-final-cta-title'
      className='px-4 py-20 md:px-6 md:py-28'
    >
      <div className='bg-card border-border mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-3xl border p-8 text-center md:p-12'>
        <h2
          id='fast-coding-models-final-cta-title'
          className='text-3xl font-bold tracking-tight md:text-4xl'
        >
          {t('Start with one endpoint')}
        </h2>
        <p className='text-muted-foreground max-w-xl text-sm md:text-base'>
          {t(
            'Create an API key, point your coding agent at https://vancine.com/v1, and switch between the four models by changing only the model field.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(FAST_CODING_MODELS_CTA_EVENT, {
                location: 'fast_coding_models_final',
              })
            }
          >
            <HugeiconsIcon
              icon={Key01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('Start with Vancine')}
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-11 px-6'
            render={<Link to='/pricing' search={pricingTarget.search} />}
            onClick={() =>
              trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'fast_coding_models_final',
              })
            }
          >
            {t('View live pricing')}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              data-icon='inline-end'
              aria-hidden='true'
            />
          </Button>
        </div>
      </div>
    </section>
  )
}
