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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import {
  SEEDANCE_CTA_EVENT,
  SEEDANCE_CTA_LOCATIONS,
  getSeedanceCtaDestination,
} from '../lib/landing'

export interface HeroSectionProps {
  isAuthenticated: boolean
}

export function HeroSection(props: HeroSectionProps) {
  const { t } = useTranslation()
  const destination = getSeedanceCtaDestination(props.isAuthenticated)

  return (
    <section
      id='hero'
      className='relative overflow-hidden px-4 pt-16 pb-20 md:px-6 md:pt-24'
    >
      <div
        className='from-primary/20 via-accent/10 pointer-events-none absolute -top-24 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent opacity-40 blur-3xl dark:opacity-30'
        aria-hidden='true'
      />
      <div className='mx-auto max-w-6xl'>
        <div className='mx-auto max-w-3xl text-center'>
          <p className='text-primary mb-4 text-sm font-semibold tracking-wide uppercase'>
            {t('Seedance API for developers')}
          </p>
          <h1 className='text-foreground text-4xl font-bold tracking-tight text-balance md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]'>
            {t('Generate Seedance Videos with One API')}
          </h1>
          <p className='text-muted-foreground mx-auto mt-5 max-w-2xl text-lg leading-relaxed'>
            {t(
              'Submit supported text-to-video and image-to-video tasks, poll their status, and retrieve results with one Vancine API key.'
            )}
          </p>
          <p className='border-primary/20 bg-primary/5 text-primary mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium'>
            {t('$1 free credit. No credit card required.')}
          </p>

          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Button
              size='lg'
              className='h-11 px-5 font-medium'
              render={<Link to={destination} />}
              onClick={() =>
                trackEvent(SEEDANCE_CTA_EVENT, {
                  location: SEEDANCE_CTA_LOCATIONS[0],
                })
              }
            >
              {t('Start Free with $1 Credit')}
            </Button>
            <Button
              variant='outline'
              size='lg'
              className='h-11 px-5 font-medium'
              render={<a href='#workflow' />}
            >
              {t('View the Async Workflow')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
