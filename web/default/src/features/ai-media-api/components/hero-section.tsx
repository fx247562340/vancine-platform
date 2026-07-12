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
  AI_MEDIA_CODE_EXAMPLES,
  AI_MEDIA_CTA_EVENT,
  AI_MEDIA_CTA_LOCATIONS,
  getAiMediaCtaDestination,
} from '../lib/landing'

export interface HeroSectionProps {
  isAuthenticated: boolean
}

export function HeroSection(props: HeroSectionProps) {
  const { t } = useTranslation()
  const destination = getAiMediaCtaDestination(props.isAuthenticated)
  const imageExample = AI_MEDIA_CODE_EXAMPLES.find((e) => e.id === 'image')!

  return (
    <section
      id='hero'
      className='relative overflow-hidden px-4 pt-16 pb-20 md:px-6 md:pt-24'
    >
      <div
        className='from-primary/20 via-accent/10 pointer-events-none absolute -top-24 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent opacity-40 blur-3xl dark:opacity-30'
        aria-hidden='true'
      />
      <div className='mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-12'>
        <div className='lg:col-span-7'>
          <p className='text-primary mb-4 text-sm font-semibold tracking-wide uppercase'>
            {t('Built for AI product developers')}
          </p>
          <h1 className='text-foreground text-4xl font-bold tracking-tight text-balance md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]'>
            {t('Access Leading Chinese AI Media Models Through One API')}
          </h1>
          <p className='text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed'>
            {t(
              'Generate videos, images, speech, text, and 3D assets without integrating every provider separately. Use one API key, unified billing, and developer-friendly endpoints.'
            )}
          </p>
          <p className='border-primary/20 bg-primary/5 text-primary mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium'>
            {t('Get $1 in free credits. No credit card required.')}
          </p>

          <div className='mt-8 flex flex-wrap items-center gap-3'>
            <Button
              size='lg'
              className='h-11 px-5 font-medium'
              render={<Link to={destination} />}
              onClick={() =>
                trackEvent(AI_MEDIA_CTA_EVENT, {
                  location: AI_MEDIA_CTA_LOCATIONS[0],
                })
              }
            >
              {t('Start Free with $1 Credit')}
            </Button>
            <Button
              variant='outline'
              size='lg'
              className='h-11 px-5 font-medium'
              render={<a href='#api' />}
            >
              {t('Explore the API')}
            </Button>
          </div>
        </div>

        <div className='lg:col-span-5'>
          <div className='bg-card ring-border/50 overflow-hidden rounded-2xl border ring-1'>
            <div className='border-border/50 flex items-center justify-between border-b px-4 py-2.5'>
              <span className='text-muted-foreground text-xs font-medium'>
                POST /v1/images/generations
              </span>
              <span className='text-xs font-medium text-emerald-500'>
                200 OK
              </span>
            </div>
            <pre className='overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed'>
              <code className='text-foreground/90'>{imageExample.code}</code>
            </pre>
          </div>
          <p className='text-muted-foreground mt-3 text-center text-xs'>
            {t(
              'Use the OpenAI SDK for compatible text workflows or call the documented media endpoints with any HTTP client.'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
