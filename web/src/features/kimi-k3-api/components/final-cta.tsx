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
import { trackEvent } from '@/lib/analytics'

import { getKimiK3CtaTarget, KIMI_K3_CTA_EVENT } from '../lib/landing'

export interface FinalCtaProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/** Closing call to action with the same auth-aware target as the hero. */
export function FinalCta(props: FinalCtaProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getKimiK3CtaTarget(props.isAuthenticated, props.search)

  return (
    <section
      aria-labelledby='kimi-k3-final-cta-title'
      className='from-primary/10 bg-background px-4 py-20 text-center md:px-6'
    >
      <div className='mx-auto flex max-w-2xl flex-col items-center gap-5'>
        <HugeiconsIcon
          icon={Rocket01Icon}
          className='text-primary size-10'
          aria-hidden='true'
        />
        <h2 id='kimi-k3-final-cta-title' className='text-3xl font-bold'>
          {t('Put Kimi K3 in your coding agent today')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Start with a documented OpenAI-compatible request, then choose the model that fits the work.'
          )}
        </p>
        <Button
          size='lg'
          className='h-11 px-6'
          render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
          onClick={() =>
            trackEvent(KIMI_K3_CTA_EVENT, { location: 'kimi_k3_final_cta' })
          }
        >
          {props.isAuthenticated
            ? t('Run K3 in Playground')
            : t('Get started with Vancine')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            data-icon='inline-end'
            aria-hidden='true'
          />
        </Button>
      </div>
    </section>
  )
}
