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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  FAST_CODING_MODELS_CTA_EVENT,
  FAST_CODING_MODELS_RESOURCE,
  FAST_CODING_MODELS_RESOURCE_EVENT,
  getFastCodingModelsCtaTarget,
} from '../lib/fast-coding-models'

export const FAST_CODING_MODELS_COMPARISON_SECTION_ID = 'comparison'

export interface HeroProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Above-the-fold introduction: the guide eyebrow, one H1 naming the
 * scope, the four-model summary, and two CTAs — a same-page scroll to
 * the comparison section and the auth-aware "Start with Vancine"
 * conversion link carrying only the fixed owned-media UTMs.
 */
export function Hero(props: HeroProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getFastCodingModelsCtaTarget(
    props.isAuthenticated,
    'hero',
    props.search
  )

  return (
    <section
      aria-labelledby='fast-coding-models-hero-title'
      className='relative overflow-hidden px-4 pt-24 pb-16 text-center md:px-6 md:pt-32 md:pb-24'
    >
      <div
        aria-hidden='true'
        className='from-primary/20 via-background pointer-events-none absolute -top-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl'
      />
      <div className='relative mx-auto flex max-w-3xl flex-col items-center gap-6'>
        <p className='text-primary text-xs font-semibold tracking-widest uppercase'>
          {t('Model selection guide')}
        </p>
        <h1
          id='fast-coding-models-hero-title'
          data-testid='fast-coding-models-h1'
          className='text-4xl font-bold tracking-tight md:text-5xl'
        >
          {t('Four fast Chinese AI models for coding agents')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-base md:text-lg'>
          {t(
            'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            onClick={() => {
              trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
                resource: FAST_CODING_MODELS_RESOURCE,
                location: 'hero_compare',
              })
              document
                .querySelector(`#${FAST_CODING_MODELS_COMPARISON_SECTION_ID}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {t('Compare the four models')}
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
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(FAST_CODING_MODELS_CTA_EVENT, {
                location: 'fast_coding_models_hero',
              })
            }
          >
            {t('Start with Vancine')}
          </Button>
        </div>
      </div>
    </section>
  )
}
