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
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FirstTopUpBonusCallout } from '@/features/first-topup-bonus'
import { trackEvent } from '@/lib/analytics'

import {
  getGlm53ApiCtaLabelKey,
  getGlm53ApiCtaTarget,
  GLM53_API_CTA_EVENT,
  GLM53_API_RESOURCE_EVENT,
} from '../lib/glm-5-3-api'

export interface FinalCtaProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Closing call to action with the same auth-aware target as the hero,
 * plus the internal cross-links required by the SEO-4 Phase 1 brief:
 * /pricing, /docs/chat, and /openrouter-alternative.
 */
export function FinalCta(props: FinalCtaProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getGlm53ApiCtaTarget(props.isAuthenticated, props.search)
  const ctaLabelKey = getGlm53ApiCtaLabelKey(props.isAuthenticated)

  return (
    <section
      aria-labelledby='glm-5-3-api-final-cta-title'
      className='from-primary/10 bg-background px-4 py-20 text-center md:px-6'
    >
      <div className='mx-auto flex max-w-2xl flex-col items-center gap-5'>
        <h2 id='glm-5-3-api-final-cta-title' className='text-3xl font-bold'>
          {t('GLM-5.3 and GLM-5.3 Flash API')}
        </h2>
        <FirstTopUpBonusCallout className='w-full max-w-xl' />
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(GLM53_API_CTA_EVENT, {
                location: 'glm53_final_cta',
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
        </div>
        <div className='text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm'>
          <Link
            to='/pricing'
            className='text-primary inline-flex items-center gap-1 underline underline-offset-2'
            onClick={() =>
              trackEvent(GLM53_API_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'final_cta',
              })
            }
          >
            {t('View pricing')}
          </Link>
          <Link
            to='/docs/$slug'
            params={{ slug: 'chat' }}
            className='text-primary inline-flex items-center gap-1 underline underline-offset-2'
            onClick={() =>
              trackEvent(GLM53_API_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'final_cta',
              })
            }
          >
            {t('Read API documentation')}
          </Link>
          <Link
            to='/openrouter-alternative'
            className='text-primary inline-flex items-center gap-1 underline underline-offset-2'
            onClick={() =>
              trackEvent(GLM53_API_RESOURCE_EVENT, {
                resource: 'openrouter_alternative',
                location: 'final_cta',
              })
            }
          >
            {t('OpenRouter Alternative for Chinese AI Models')}
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              className='size-3.5'
              aria-hidden='true'
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
