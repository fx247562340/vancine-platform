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
import { ArrowRight01Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  getKimiK3CtaTarget,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_RESOURCE_EVENT,
} from '../lib/landing'

export interface HeroProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Above-the-fold introduction: what Kimi K3 on Vancine is for, plus the
 * auth-aware primary CTA and the docs secondary CTA.
 */
export function Hero(props: HeroProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getKimiK3CtaTarget(props.isAuthenticated, props.search)

  return (
    <section
      aria-labelledby='kimi-k3-hero-title'
      className='relative overflow-hidden px-4 pt-24 pb-16 text-center md:px-6 md:pt-32 md:pb-24'
    >
      <div
        aria-hidden='true'
        className='from-primary/20 via-background pointer-events-none absolute -top-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl'
      />
      <div className='relative mx-auto flex max-w-3xl flex-col items-center gap-6'>
        <p className='text-primary text-sm font-semibold tracking-wide uppercase'>
          {t('China frontier AI, one developer path')}
        </p>
        <h1
          id='kimi-k3-hero-title'
          className='text-4xl font-bold tracking-tight md:text-5xl'
        >
          {t('Kimi K3 API for Coding Agents')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-base md:text-lg'>
          {t(
            'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
            onClick={() =>
              trackEvent(KIMI_K3_CTA_EVENT, { location: 'kimi_k3_hero' })
            }
          >
            {props.isAuthenticated ? t('Go to Playground') : t('Start free')}
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
            render={<Link to='/docs/$slug' params={{ slug: 'chat' }} />}
            onClick={() =>
              trackEvent(KIMI_K3_RESOURCE_EVENT, {
                resource: 'docs',
                location: 'header',
              })
            }
          >
            <HugeiconsIcon
              icon={BookOpen01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('View quickstart')}
          </Button>
        </div>
      </div>
    </section>
  )
}
