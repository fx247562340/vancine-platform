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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { AnimateInView } from '@/components/animate-in-view'
import type { HomepagePricingState } from '../../hooks/use-homepage-pricing'
import { endpointChips } from '../../lib/homepage-pricing'

function RowChips({ types }: { types: string[] | undefined }) {
  const { chips, overflow } = endpointChips(types)
  if (chips.length === 0) return null
  return (
    <div className='flex flex-wrap gap-1.5'>
      {chips.map((chip) => (
        <span
          key={chip}
          className='border-border/40 bg-muted/20 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium'
        >
          {chip}
        </span>
      ))}
      {overflow > 0 ? (
        <span className='border-border/40 bg-muted/10 text-muted-foreground/70 rounded-full border px-2 py-0.5 text-[11px] font-medium'>
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className='border-border/40 bg-muted/10 flex items-center justify-between gap-4 rounded-xl border px-5 py-4'>
      <div className='bg-border/50 h-4 w-48 max-w-[50%] animate-pulse rounded' />
      <div className='flex gap-2'>
        <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
        <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
      </div>
    </div>
  )
}

export function Marketplace({ pricing }: { pricing: HomepagePricingState }) {
  const { t } = useTranslation()
  const { status, marketplace, vendors } = pricing

  return (
    <section className='border-border/40 bg-muted/5 relative z-10 border-y px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-4xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Live model marketplace')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-base leading-relaxed'>
            {t(
              'Browse the full public catalog with live endpoint types and pricing metadata. What you see is served from the same public pricing API developers can query.'
            )}
          </p>
        </AnimateInView>

        {status === 'loading' ? (
          <div className='flex flex-col gap-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : marketplace.length > 0 ? (
          <div className='flex flex-col gap-3'>
            {marketplace.map((model) => (
              <Link
                key={model.model_name}
                to='/pricing'
                className='block'
                onClick={() =>
                  trackEvent('explore_models_clicked', {
                    location: 'marketplace',
                  })
                }
              >
                <div className='border-border/40 bg-background hover:border-border hover:bg-muted/20 flex flex-col justify-between gap-3 rounded-xl border px-5 py-4 transition-colors duration-200 sm:flex-row sm:items-center'>
                  <div className='text-base font-semibold break-all'>
                    {model.model_name}
                  </div>
                  <RowChips types={model.supported_endpoint_types} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className='py-8 text-center'>
            <Link
              to='/pricing'
              className='text-sm font-medium underline underline-offset-4'
              onClick={() =>
                trackEvent('explore_models_clicked', {
                  location: 'marketplace',
                })
              }
            >
              {t('Explore all available models')} →
            </Link>
          </div>
        )}

        {status === 'ready' && vendors.length > 0 ? (
          <div className='mt-10 text-center'>
            <div className='text-muted-foreground/70 mb-3 text-xs font-semibold tracking-[0.2em] uppercase'>
              {t('Connected providers')}
            </div>
            <div className='flex flex-wrap items-center justify-center gap-2'>
              {vendors.map((name) => (
                <span
                  key={name}
                  className='border-border/40 bg-muted/20 text-muted-foreground rounded-full border px-3 py-1 text-sm'
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className='mt-12 text-center'>
          <Link
            to='/pricing'
            onClick={() =>
              trackEvent('explore_models_clicked', { location: 'marketplace' })
            }
          >
            <Button variant='outline' className='rounded-lg'>
              {t('Explore live models')}
              <ArrowRight className='ml-1.5 size-4' />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
