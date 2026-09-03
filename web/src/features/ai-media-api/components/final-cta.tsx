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
import { ArrowRight01Icon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FirstTopUpBonusCallout } from '@/features/first-topup-bonus'
import { trackEvent } from '@/lib/analytics'

import {
  AI_MEDIA_CTA_EVENT,
  AI_MEDIA_RESOURCE_EVENT,
  getAiMediaCtaTarget,
} from '../lib/landing'

export interface AiMediaFinalCtaProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/** Closing call to action with the same auth-aware target as the hero. */
export function AiMediaFinalCta(props: AiMediaFinalCtaProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getAiMediaCtaTarget(props.isAuthenticated, props.search)

  return (
    <section
      aria-labelledby='ai-media-final-cta-title'
      className='from-primary/10 bg-background px-4 py-20 text-center md:px-6'
    >
      <div className='mx-auto flex max-w-2xl flex-col items-center gap-5'>
        <HugeiconsIcon
          icon={Rocket01Icon}
          className='text-primary size-10'
          aria-hidden='true'
        />
        <h2 id='ai-media-final-cta-title' className='text-3xl font-bold'>
          {t('Build your first AI media request today')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Create an account, generate an API key, and test supported models in the Playground.'
          )}
        </p>
        <FirstTopUpBonusCallout className='w-full max-w-xl' />
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(AI_MEDIA_CTA_EVENT, { location: 'ai_media_final' })
            }
          >
            {props.isAuthenticated
              ? t('Go to Playground')
              : t('Get started with Vancine')}
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
            render={<Link to='/docs' />}
            onClick={() =>
              trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'final',
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
