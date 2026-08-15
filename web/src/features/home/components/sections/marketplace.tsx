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

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  endpointChips,
  selectMarketplace,
  type HomepagePricingState,
} from '../../lib/homepage-pricing'

function MarketplaceRow({
  model,
}: {
  model: { model_name: string; supported_endpoint_types?: string[] }
}) {
  const { chips, overflow } = endpointChips(model.supported_endpoint_types)

  return (
    <Link
      to='/pricing'
      className='border-border/40 bg-background hover:border-border block rounded-xl border p-4 transition-colors'
      onClick={() =>
        trackEvent('explore_models_clicked', { location: 'marketplace' })
      }
    >
      <div className='text-sm font-semibold break-all'>{model.model_name}</div>
      {chips.length > 0 ? (
        <div className='mt-2 flex flex-wrap gap-1.5'>
          {chips.map((chip) => (
            <span
              key={chip}
              className='border-border/40 bg-muted/20 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium'
            >
              {chip}
            </span>
          ))}
          {overflow > 0 ? (
            <span className='text-muted-foreground/70 text-[11px] font-medium'>
              +{overflow}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  )
}

function SkeletonRow() {
  return (
    <div
      aria-hidden
      className='border-border/40 bg-muted/10 h-[72px] animate-pulse rounded-xl border p-4'
    />
  )
}

export function Marketplace({ pricing }: { pricing: HomepagePricingState }) {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Live model marketplace')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-sm leading-relaxed'>
            {t(
              'Browse the full public catalog with live endpoint types and pricing metadata. What you see is served from the same public pricing API developers can query.'
            )}
          </p>
        </AnimateInView>

        {pricing.status === 'loading' && (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key -- skeleton placeholders have no stable id
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {(pricing.status === 'empty' || pricing.status === 'error') &&
          pricing.models.length === 0 && (
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

        {pricing.status === 'ready' && (
          <>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {selectMarketplace(pricing.models).map((model) => (
                <MarketplaceRow key={model.model_name} model={model} />
              ))}
            </div>

            {Array.isArray(pricing.vendors) && pricing.vendors.length > 0 ? (
              <div className='mt-8'>
                <div className='text-muted-foreground/50 mb-3 text-xs font-bold tracking-[0.15em] uppercase'>
                  {t('Connected providers')}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {pricing.vendors.map((name) => (
                    <span
                      key={name}
                      className='border-border/40 bg-muted/15 text-foreground/70 rounded-full border px-3 py-1 text-xs font-medium'
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className='mt-8 flex justify-center'>
              <Button
                variant='outline'
                className='border-border/50 hover:border-border hover:bg-muted/50 rounded-lg'
                render={<Link to='/pricing' />}
                onClick={() =>
                  trackEvent('explore_models_clicked', {
                    location: 'marketplace',
                  })
                }
              >
                {t('Explore live models')}
                <ArrowRight className='ml-1 size-4' />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
