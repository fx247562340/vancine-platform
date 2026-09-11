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
import {
  VancineLivePrice,
  type LandingModelPrice,
} from '@/features/landing-pricing'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

import {
  formatKimiK3Usd,
  getKimiK3CtaLabelKey,
  getKimiK3CtaTarget,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_PRICE_PROVIDERS,
  KIMI_K3_PRICE_UNIT_KEY,
  KIMI_K3_PRICING_SECTION_ID,
  type KimiK3PriceProvider,
} from '../lib/landing'

export interface HeroProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
  vancinePrice: LandingModelPrice
}

/**
 * The two providers shown in the hero card, in display order, with the
 * reference listing de-emphasised against the current Vancine price.
 */
const HERO_PRICE_ROWS = [
  { provider: KIMI_K3_PRICE_PROVIDERS[0], reference: false },
  { provider: KIMI_K3_PRICE_PROVIDERS[1], reference: true },
] as const

function providerAmount(
  provider: KimiK3PriceProvider,
  field: 'input' | 'output',
  vancinePrice: LandingModelPrice
): ReactElement {
  if (provider.id === 'vancine') {
    return <VancineLivePrice price={vancinePrice} field={field} />
  }
  const amount = field === 'input' ? provider.inputUsd : provider.outputUsd
  return <>{formatKimiK3Usd(amount)}</>
}

function HeroPriceCard(props: {
  vancinePrice: LandingModelPrice
}): ReactElement {
  const { t } = useTranslation()

  return (
    <aside
      data-testid='kimi-k3-hero-price-card'
      aria-label={t('Kimi K3 API pricing')}
      className='border-border bg-card w-full rounded-xl border p-5 shadow-sm'
    >
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {t('Kimi K3 API pricing')}
      </p>
      <dl className='mt-4 flex flex-col gap-3 text-sm'>
        {HERO_PRICE_ROWS.map(({ provider, reference }) => (
          <div
            key={provider.nameKey}
            className={cn(
              'flex items-baseline justify-between gap-4',
              reference && 'text-muted-foreground'
            )}
          >
            <dt className={cn(!reference && 'font-medium')}>
              {t(provider.nameKey)}
            </dt>
            <dd className='text-right tabular-nums'>
              <span className='block'>
                {t('Input')}{' '}
                {providerAmount(provider, 'input', props.vancinePrice)}
              </span>
              <span className='block'>
                {t('Output')}{' '}
                {providerAmount(provider, 'output', props.vancinePrice)}
              </span>
            </dd>
          </div>
        ))}
        <div className='flex items-baseline justify-between gap-4'>
          <dt className='text-muted-foreground'>{t('Unit')}</dt>
          <dd className='text-right'>{t(KIMI_K3_PRICE_UNIT_KEY)}</dd>
        </div>
      </dl>
      <p className='text-primary mt-4 text-sm font-semibold'>
        {t('20% lower than OpenRouter on both input and output')}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('OpenAI-compatible API')} · {t('Pay as you go')}
      </p>
    </aside>
  )
}

/**
 * Above-the-fold introduction: search-intent H1, dated price summary,
 * the auth-aware primary CTA, and an in-page anchor to the comparison.
 */
export function Hero(props: HeroProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getKimiK3CtaTarget(props.isAuthenticated, props.search)
  const ctaLabelKey = getKimiK3CtaLabelKey(props.isAuthenticated)

  return (
    <section
      aria-labelledby='kimi-k3-hero-title'
      className='px-4 pt-24 pb-16 md:px-6 md:pt-32 md:pb-24'
    >
      <div className='mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-center'>
        <div className='flex flex-col items-start gap-6'>
          <h1
            id='kimi-k3-hero-title'
            className='text-4xl font-bold tracking-tight md:text-5xl'
          >
            {t('Kimi K3 API pricing and OpenRouter comparison')}
          </h1>
          <p className='text-foreground max-w-2xl text-base font-medium md:text-lg'>
            {t('20% lower than OpenRouter on both input and output')}
          </p>
          <p className='text-muted-foreground max-w-2xl text-base md:text-lg'>
            {t(
              'Vancine is an independent third-party API platform, not an official Moonshot AI or Kimi service. This page compares dated public prices, shows OpenAI-compatible examples, and publishes existing test evidence. Rates, availability, and behavior are not guaranteed to match the official service.'
            )}
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <Button
              size='lg'
              className='h-11 px-6'
              data-testid='kimi-k3-hero-primary-cta'
              render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
              onClick={() =>
                trackEvent(KIMI_K3_CTA_EVENT, { location: 'kimi_k3_hero' })
              }
            >
              {t(ctaLabelKey)}
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
              data-testid='kimi-k3-hero-secondary-cta'
              render={<a href={`#${KIMI_K3_PRICING_SECTION_ID}`} />}
            >
              {t('Compare prices')}
            </Button>
          </div>
        </div>
        <HeroPriceCard vancinePrice={props.vancinePrice} />
      </div>
    </section>
  )
}
