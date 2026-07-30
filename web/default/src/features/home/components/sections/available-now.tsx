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
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { AnimateInView } from '@/components/animate-in-view'
import { SpotlightCard } from '@/features/home/components/spotlight-card'
import type { HomepagePricingState } from '../../hooks/use-homepage-pricing'
import {
  endpointChips,
  featuredGridColumns,
  resolveVendorName,
  skeletonCountForWidth,
  type PricingModel,
  type PricingVendor,
} from '../../lib/homepage-pricing'

/**
 * Viewport width, tracked so the skeleton grid renders a breakpoint-correct
 * number of placeholders (1 / 2 / 4 for 390 / 768 / 1280). Avoids rendering
 * four visible skeletons on mobile.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  )
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

function Chips({ types }: { types: string[] | undefined }) {
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

function Card({
  model,
  vendors,
}: {
  model: PricingModel
  vendors: PricingVendor[]
}) {
  const vendorName = resolveVendorName(model.vendor_id, vendors)
  return (
    <Link
      to='/pricing'
      className='focus-visible:ring-ring block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
      onClick={() =>
        trackEvent('featured_model_clicked', {
          location: 'available_now',
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
        <Chips types={model.supported_endpoint_types} />
      </SpotlightCard>
    </Link>
  )
}

function SkeletonCard() {
  return (
    <div className='border-border/40 bg-muted/10 h-[140px] rounded-xl border p-5'>
      <div className='bg-border/50 mb-3 h-4 w-2/3 animate-pulse rounded' />
      <div className='bg-border/50 mb-4 h-3 w-1/2 animate-pulse rounded' />
      <div className='flex gap-2'>
        <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
        <div className='bg-border/50 h-5 w-16 animate-pulse rounded-full' />
      </div>
    </div>
  )
}

function FeaturedGrid({
  featured,
  rawVendors,
  isMobile,
}: {
  featured: PricingModel[]
  rawVendors: PricingVendor[]
  isMobile: boolean
}) {
  const { t } = useTranslation()
  const width =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : 1280
  const isTablet = width >= 768 && width < 1280
  const { columns, maxWidth } = featuredGridColumns(featured.length)

  const desktopGridCols =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-2'
        : columns === 3
          ? 'grid-cols-3'
          : 'grid-cols-4'

  // Tablet rules (design §3.3): 1 card -> 1 column centered;
  // 2/3/4 cards -> at most 2 columns centered. Mobile stays 1.
  const tabletGridCols =
    featured.length <= 1 ? 'md:grid-cols-1' : 'md:grid-cols-2'

  const responsiveGridCols = isMobile
    ? 'grid-cols-1'
    : isTablet
      ? tabletGridCols
      : desktopGridCols

  return (
    <>
      <p className='text-muted-foreground mx-auto mb-6 max-w-2xl text-center text-sm'>
        {t(
          'Featured models live on the public catalog. Open a model or browse the full marketplace.'
        )}
      </p>
      <div className='mx-auto' style={{ maxWidth }}>
        <div className={`grid gap-5 ${responsiveGridCols}`}>
          {featured.map((model) => (
            <Card
              key={model.model_name}
              model={model}
              vendors={rawVendors}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export function AvailableNow({
  pricing,
  isMobile,
}: {
  pricing: HomepagePricingState
  isMobile?: boolean
}) {
  const { t } = useTranslation()
  const { status, featured, count, rawVendors } = pricing
  const width = useViewportWidth()
  const skeletonCount = skeletonCountForWidth(width)
  const mobile = isMobile ?? width < 768

  return (
    <section className='border-border/40 bg-muted/5 relative z-10 border-y px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Available now')}
          </h2>
        </AnimateInView>

        {status === 'loading' ? (
          <div className='grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4'>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            {featured.length > 0 ? (
              <FeaturedGrid
                featured={featured}
                rawVendors={rawVendors}
                isMobile={mobile}
              />
            ) : (
              <div className='py-8 text-center'>
                <Link
                  to='/pricing'
                  className='text-sm font-medium underline underline-offset-4'
                  onClick={() =>
                    trackEvent('explore_models_clicked', {
                      location: 'available_now_fallback',
                    })
                  }
                >
                  {t('Explore all available models')} →
                </Link>
              </div>
            )}
            {/* Real model count: shown whenever the catalog parsed with >=1
                models, including the 0-featured fallback. Never on loading
                or error. */}
            {status === 'ready' && typeof count === 'number' && count >= 1 ? (
              <p className='text-muted-foreground/70 mt-6 text-center text-sm'>
                {t('{{count}} models available', { count })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}