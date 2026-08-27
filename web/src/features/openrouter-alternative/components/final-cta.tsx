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

For commercial licensing, please contact support@quantumnous.com.
*/
import { ArrowRight01Icon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  getOpenRouterAlternativeCtaLabelKey,
  getOpenRouterAlternativeCtaTarget,
  OPENROUTER_ALTERNATIVE_CTA_EVENT,
  OPENROUTER_ALTERNATIVE_RESOURCE_EVENT,
} from '../lib/landing'

export interface FinalCtaProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Closing call to action with the same auth-aware target as the hero.
 * Internal CTA destinations never carry UTM injection (the destination
 * resolver only retains allowlisted parameters), and the page never
 * includes UTM on internal links so attribution stays clean.
 */
export function FinalCta(props: FinalCtaProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getOpenRouterAlternativeCtaTarget(
    props.isAuthenticated,
    props.search
  )
  const ctaLabelKey = getOpenRouterAlternativeCtaLabelKey(props.isAuthenticated)

  return (
    <section
      aria-labelledby='openrouter-alternative-final-cta-title'
      className='from-primary/10 bg-background px-4 py-20 text-center md:px-6'
    >
      <div className='mx-auto flex max-w-2xl flex-col items-center gap-5'>
        <HugeiconsIcon
          icon={Rocket01Icon}
          className='text-primary size-10'
          aria-hidden='true'
        />
        <h2
          id='openrouter-alternative-final-cta-title'
          className='text-3xl font-bold'
        >
          {t('Try the Vancine catalog today')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Create an API key in under a minute, then point your existing OpenAI-compatible client at https://vancine.com/v1.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(OPENROUTER_ALTERNATIVE_CTA_EVENT, {
                location: 'openrouter_alt_final_cta',
              })
            }
          >
            {t(ctaLabelKey)}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              data-icon='inline-end'
              aria-hidden='true'
            />
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-11 px-6'
            render={<Link to='/pricing' />}
            onClick={() =>
              trackEvent(OPENROUTER_ALTERNATIVE_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'final_cta',
              })
            }
          >
            {t('View pricing')}
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-11 px-6'
            render={<Link to='/docs/$slug' params={{ slug: 'chat' }} />}
            onClick={() =>
              trackEvent(OPENROUTER_ALTERNATIVE_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'final_cta',
              })
            }
          >
            {t('Read API documentation')}
          </Button>
        </div>
      </div>
    </section>
  )
}
