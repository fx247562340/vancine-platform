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

import {
  formatKimiK3Usd,
  getKimiK31InputOutputDiscountPercent,
  getKimiK31Model,
  getKimiK3CtaLabelKey,
  getKimiK3CtaTarget,
  KIMI_K31_DISCOUNT_KEY,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_PRICE_UNIT_KEY,
  KIMI_K3_PRICING_SECTION_ID,
  type KimiK31ModelId,
} from '../lib/landing'
import { ModelChoice } from './model-choice'

export interface HeroProps {
  isAuthenticated: boolean
  search: string
  modelId: KimiK31ModelId
  onModelChange: (modelId: KimiK31ModelId) => void
  vancinePrice: LandingModelPrice
}

function HeroPriceCard(props: {
  modelId: KimiK31ModelId
  vancinePrice: LandingModelPrice
}): ReactElement {
  const { t } = useTranslation()
  const model = getKimiK31Model(props.modelId)
  const discount = getKimiK31InputOutputDiscountPercent(
    props.vancinePrice,
    props.modelId
  )
  const showCache =
    props.vancinePrice.status === 'ready' &&
    props.vancinePrice.amounts.cacheReadUsd !== null

  return (
    <aside
      data-testid='kimi-k3-hero-price-card'
      aria-label={t('Kimi K3.1 live pricing')}
      className='border-border bg-card w-full rounded-xl border p-5 shadow-sm'
    >
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {t('Kimi K3.1 live pricing')}
      </p>
      <p className='mt-2 font-mono text-sm'>{model.id}</p>
      <dl className='mt-4 flex flex-col gap-3 text-sm'>
        <div className='flex items-baseline justify-between gap-4'>
          <dt className='font-medium'>{t('Vancine')}</dt>
          <dd className='text-right tabular-nums'>
            <span className='block'>
              {t('Input')}{' '}
              <VancineLivePrice price={props.vancinePrice} field='input' />
            </span>
            <span className='block'>
              {t('Output')}{' '}
              <VancineLivePrice price={props.vancinePrice} field='output' />
            </span>
            {showCache ? (
              <span className='text-muted-foreground block'>
                {t('Cache read')}{' '}
                <VancineLivePrice price={props.vancinePrice} field='cache' />
              </span>
            ) : null}
          </dd>
        </div>
        <div className='text-muted-foreground flex items-baseline justify-between gap-4'>
          <dt>{t('Kimi official')}</dt>
          <dd className='text-right tabular-nums'>
            <span className='block'>
              {t('Input')} {formatKimiK3Usd(model.officialInputUsd)}
            </span>
            <span className='block'>
              {t('Output')} {formatKimiK3Usd(model.officialOutputUsd)}
            </span>
          </dd>
        </div>
        <div className='flex items-baseline justify-between gap-4'>
          <dt className='text-muted-foreground'>{t('Unit')}</dt>
          <dd className='text-right'>{t(KIMI_K3_PRICE_UNIT_KEY)}</dd>
        </div>
      </dl>
      {discount !== null ? (
        <p
          className='text-primary mt-4 text-sm font-semibold'
          data-testid='kimi-k31-discount'
        >
          {t(KIMI_K31_DISCOUNT_KEY, { percent: discount })}
        </p>
      ) : null}
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('OpenAI-compatible API')} · {t('Pay as you go')}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'The 1M-token context window is a published Kimi specification, not a Vancine measurement.'
        )}
      </p>
      {props.modelId === 'kimi-k3.1-pro-highspeed' ? (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'Official guide: about 2–3× the speed of Kimi K3.1 Pro. Not a Vancine measurement.'
          )}
        </p>
      ) : null}
    </aside>
  )
}

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
            {t('Kimi K3.1 Pro & Highspeed API for Coding Agents')}
          </h1>
          <p className='text-foreground max-w-2xl text-base font-medium md:text-lg'>
            {t(
              'Choose Kimi K3.1 Pro or Highspeed, then call it through one OpenAI-compatible API.'
            )}
          </p>
          <ModelChoice
            idPrefix='kimi-k31-hero'
            modelId={props.modelId}
            onModelChange={props.onModelChange}
          />
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
        <HeroPriceCard
          modelId={props.modelId}
          vancinePrice={props.vancinePrice}
        />
      </div>
    </section>
  )
}
