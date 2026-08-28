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
import { ArrowRight01Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  getGlm53ApiCtaLabelKey,
  getGlm53ApiCtaTarget,
  GLM53_API_CTA_EVENT,
  GLM53_API_RESOURCE_EVENT,
} from '../lib/glm-5-3-api'

export interface HeroProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Above-the-fold introduction for the /glm-api page: one H1 naming
 * both models, the shared-endpoint message, the explicit scope of the
 * 20% comparison, and the auth-aware primary CTA plus a secondary
 * pricing link.
 */
export function Hero(props: HeroProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getGlm53ApiCtaTarget(props.isAuthenticated, props.search)
  const ctaLabelKey = getGlm53ApiCtaLabelKey(props.isAuthenticated)

  return (
    <section
      aria-labelledby='glm-5-3-api-hero-title'
      className='relative overflow-hidden px-4 pt-24 pb-16 text-center md:px-6 md:pt-32 md:pb-24'
    >
      <div
        aria-hidden='true'
        className='from-primary/20 via-background pointer-events-none absolute -top-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl'
      />
      <div className='relative mx-auto flex max-w-3xl flex-col items-center gap-6'>
        <h1
          id='glm-5-3-api-hero-title'
          className='text-4xl font-bold tracking-tight md:text-5xl'
        >
          {t('GLM-5.3 and GLM-5.3 Flash API')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-base md:text-lg'>
          {t(
            'GLM-5.3 and GLM-5.3 Flash share one OpenAI-compatible endpoint at https://vancine.com/v1. Switch between them by changing only the model id.'
          )}
        </p>
        <p className='text-foreground/80 max-w-2xl text-sm font-medium md:text-base'>
          {t(
            'Vancine is 20% lower than OpenRouter on these two standard paid model listings.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(GLM53_API_CTA_EVENT, { location: 'glm53_hero' })
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
              trackEvent(GLM53_API_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'hero',
              })
            }
          >
            {t('View pricing')}
            <HugeiconsIcon
              icon={BookOpen01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
          </Button>
        </div>
      </div>
    </section>
  )
}
