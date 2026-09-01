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

import { AnimateInView } from '@/components/animate-in-view'
import { trackEvent } from '@/lib/analytics'

import {
  endpointChips,
  resolveVendorName,
  type HomepagePricingModel,
  type HomepagePricingState,
  type HomepagePricingStatus,
  type HomepagePricingVendor,
} from '../../lib/homepage-pricing'
import { SpotlightCard } from '../spotlight-card'

/**
 * Homepage "Fast models" module. The list of models is the same
 * `pricing.fast` already computed by the shared homepage-pricing state
 * (selected from the live /api/pricing payload by the exact "fast"
 * tag, deduplicated against the flagship section so a model with both
 * tags does not appear twice). This component MUST NOT issue a second
 * /api/pricing request — it consumes the single `pricing` prop.
 *
 * States:
 *   - status === 'loading': skeleton grid
 *   - status === 'error' OR pricing was never populated: the entire
 *     section is hidden (no error UI, no fallback models)
 *   - status === 'ready' && fast.length === 0: a small inline "Browse
 *     the catalog" link is rendered (no card grid, no fake models)
 *   - status === 'ready' && fast.length > 0: card grid + footer link
 *     to /guides/fast-coding-models
 */
export function FastModels({ pricing }: { pricing: HomepagePricingState }): React.ReactElement | null {
  const { t } = useTranslation()
  const { status, fast, rawVendors, count } = pricing

  // Hide the whole section when the catalog call failed — never
  // surface an error inline, and never invent fallback models.
  if (status === 'error' || (status === 'empty' && count === 0)) {
    return null
  }

  return (
    <section
      className='border-border/40 bg-background relative z-10 px-6 py-16 md:py-20'
      aria-labelledby='homepage-fast-models-title'
    >
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-8 text-center'>
          <h2
            id='homepage-fast-models-title'
            className='text-2xl font-bold tracking-tight md:text-3xl'
          >
            {t('Fast models')}
          </h2>
          <p className='text-muted-foreground mt-3 text-sm md:text-base'>
            {t(
              'Lower-latency options for coding agents, multimodal workflows, and high-throughput applications.'
            )}
          </p>
        </AnimateInView>

        {renderBody({ status, fast, rawVendors, t })}
      </div>
    </section>
  )
}

function renderBody({
  status,
  fast,
  rawVendors,
  t,
}: {
  status: HomepagePricingStatus
  fast: HomepagePricingModel[]
  rawVendors: HomepagePricingVendor[]
  t: (key: string) => string
}): React.ReactElement {
  if (status === 'loading') return <SkeletonGrid t={t} />
  if (fast.length === 0) {
    return (
      <div
        className='py-6 text-center'
        data-testid='homepage-fast-models-empty'
      >
        <Link
          to='/pricing'
          className='text-sm font-medium underline underline-offset-4'
          onClick={() =>
            trackEvent('explore_models_clicked', {
              location: 'homepage_fast_empty',
            })
          }
        >
          {t('Browse the catalog →')}
        </Link>
      </div>
    )
  }
  return (
    <>
      <FastGrid fast={fast} rawVendors={rawVendors} />
      <div className='mt-8 text-center'>
        <Link
          to='/guides/fast-coding-models'
          className='text-sm font-medium underline underline-offset-4'
          data-testid='homepage-fast-models-cta'
          onClick={() =>
            trackEvent('fast_guide_clicked', {
              location: 'homepage_fast',
            })
          }
        >
          {t('See the full fast models guide →')}
        </Link>
      </div>
    </>
  )
}

function FastGrid({
  fast,
  rawVendors,
}: {
  fast: HomepagePricingModel[]
  rawVendors: HomepagePricingVendor[]
}) {
  return (
    <div
      className='mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4'
      data-testid='homepage-fast-models-grid'
    >
      {fast.map((model) => (
        <FastCard key={model.model_name} model={model} rawVendors={rawVendors} />
      ))}
    </div>
  )
}

function FastCard({
  model,
  rawVendors,
}: {
  model: HomepagePricingModel
  rawVendors: HomepagePricingVendor[]
}) {
  const vendorName = resolveVendorName(model.vendor_id, rawVendors)
  return (
    <Link
      to='/pricing'
      className='focus-visible:ring-ring block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
      onClick={() =>
        trackEvent('fast_model_clicked', {
          location: 'homepage_fast',
          model: model.model_name,
        })
      }
    >
      <SpotlightCard interactive className='h-full p-5'>
        <div className='mb-1 text-base font-semibold break-all'>
          {model.model_name}
        </div>
        {vendorName ? (
          <div className='text-muted-foreground/70 mb-2 text-xs'>
            {vendorName}
          </div>
        ) : null}
        {model.description && model.description.trim() !== '' ? (
          <p className='text-muted-foreground line-clamp-2 text-sm leading-relaxed'>
            {model.description}
          </p>
        ) : null}
        <EndpointChips types={model.supported_endpoint_types} />
      </SpotlightCard>
    </Link>
  )
}

function EndpointChips({ types }: { types: string[] | undefined }) {
  const { chips, overflow } = endpointChips(types)
  if (chips.length === 0) return null
  return (
    <div className='mt-3 flex flex-wrap gap-1.5'>
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

function SkeletonGrid({ t }: { t: (key: string) => string }) {
  return (
    <div
      className='mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4'
      role='status'
      aria-label={t('Loading fast models')}
      data-testid='homepage-fast-models-loading'
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className='border-border/40 bg-muted/10 h-[140px] rounded-xl border p-5'
        >
          <div className='bg-border/50 mb-3 h-4 w-2/3 animate-pulse rounded' />
          <div className='bg-border/50 mb-4 h-3 w-1/2 animate-pulse rounded' />
          <div className='flex gap-2'>
            <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
            <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
          </div>
        </div>
      ))}
    </div>
  )
}
