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
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  VancineLivePrice,
  type LandingModelPrice,
} from '@/features/landing-pricing'
import { trackEvent } from '@/lib/analytics'

import {
  formatKimiK3Usd,
  getKimiK31InputOutputDiscountPercent,
  getKimiK31Model,
  KIMI_K31_DISCOUNT_KEY,
  KIMI_K31_DISCOUNT_UNCONFIRMED_KEY,
  KIMI_K31_OFFICIAL_PRICING_URL,
  KIMI_K3_PRICE_DISCLAIMER_KEYS,
  KIMI_K3_PRICE_UNIT_KEY,
  KIMI_K3_PRICING_SECTION_ID,
  KIMI_K3_RESOURCE_EVENT,
  type KimiK31ModelId,
} from '../lib/landing'
import { ModelChoice } from './model-choice'

function SourceLink(props: {
  modelId: KimiK31ModelId
  kind: 'vancine' | 'official'
}): ReactElement {
  const { t } = useTranslation()
  const icon = (
    <HugeiconsIcon
      icon={ArrowUpRight01Icon}
      className='size-3.5'
      aria-hidden='true'
    />
  )
  const className =
    'inline-flex items-center gap-1 underline underline-offset-2'

  if (props.kind === 'vancine') {
    return (
      <Link
        data-testid='kimi-k3-vancine-pricing-link'
        className={className}
        to='/pricing/$modelId'
        params={{ modelId: props.modelId }}
        onClick={() =>
          trackEvent(KIMI_K3_RESOURCE_EVENT, {
            resource: 'pricing',
            location: 'pricing',
          })
        }
      >
        {t('Vancine live Pricing')}
        {icon}
      </Link>
    )
  }

  return (
    <a
      data-testid='kimi-k3-kimi_official-source-link'
      className={className}
      href={KIMI_K31_OFFICIAL_PRICING_URL}
      target='_blank'
      rel='noopener noreferrer'
      onClick={() =>
        trackEvent(KIMI_K3_RESOURCE_EVENT, {
          resource: 'kimi_official_pricing',
          location: 'pricing',
        })
      }
    >
      {t('Kimi official pricing')}
      {icon}
    </a>
  )
}

export function Availability(props: {
  modelId: KimiK31ModelId
  onModelChange: (modelId: KimiK31ModelId) => void
  vancinePrice: LandingModelPrice
}): ReactElement {
  const { t } = useTranslation()
  const model = getKimiK31Model(props.modelId)
  const discount = getKimiK31InputOutputDiscountPercent(
    props.vancinePrice,
    props.modelId
  )
  const officialDifference =
    discount === null
      ? t(KIMI_K31_DISCOUNT_UNCONFIRMED_KEY)
      : t(KIMI_K31_DISCOUNT_KEY, { percent: discount })
  const rows = [
    {
      id: 'vancine',
      name: t('Vancine'),
      input: <VancineLivePrice price={props.vancinePrice} field='input' />,
      output: <VancineLivePrice price={props.vancinePrice} field='output' />,
      difference: t('Current Vancine price'),
      source: <SourceLink modelId={props.modelId} kind='vancine' />,
    },
    {
      id: 'kimi_official',
      name: t('Kimi official'),
      input: formatKimiK3Usd(model.officialInputUsd),
      output: formatKimiK3Usd(model.officialOutputUsd),
      difference: officialDifference,
      source: <SourceLink modelId={props.modelId} kind='official' />,
    },
  ] as const

  return (
    <section
      id={KIMI_K3_PRICING_SECTION_ID}
      aria-labelledby='kimi-k3-pricing-title'
      className='bg-muted/30 scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-6'>
        <div className='flex flex-col gap-4'>
          <h2 id='kimi-k3-pricing-title' className='text-3xl font-bold'>
            {t('Kimi K3.1 price comparison')}
          </h2>
          <ModelChoice
            idPrefix='kimi-k31-pricing'
            modelId={props.modelId}
            onModelChange={props.onModelChange}
          />
        </div>

        <div className='border-border bg-card/30 overflow-hidden rounded-xl border'>
          <div className='md:hidden'>
            <ul className='divide-border divide-y'>
              {rows.map((row) => (
                <li
                  key={row.id}
                  data-testid='kimi-k3-price-card'
                  className='p-4 text-sm'
                >
                  <p className='font-semibold'>{row.name}</p>
                  <dl className='mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2'>
                    <dt className='text-muted-foreground'>
                      {t('Input price')}
                    </dt>
                    <dd className='text-right font-medium tabular-nums'>
                      {row.input}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Output price')}
                    </dt>
                    <dd className='text-right font-medium tabular-nums'>
                      {row.output}
                    </dd>
                    <dt className='text-muted-foreground'>{t('Unit')}</dt>
                    <dd className='text-right'>{t(KIMI_K3_PRICE_UNIT_KEY)}</dd>
                    <dt className='text-muted-foreground'>{t('Difference')}</dt>
                    <dd className='text-right font-medium'>{row.difference}</dd>
                    <dt className='text-muted-foreground'>{t('Source')}</dt>
                    <dd className='text-right'>{row.source}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <table
            data-testid='kimi-k3-price-table'
            className='hidden w-full text-sm md:table'
          >
            <caption className='sr-only'>
              {t('Kimi K3.1 price comparison')}
            </caption>
            <thead className='bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase'>
              <tr>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Provider')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Input price')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Output price')}
                </th>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Unit')}
                </th>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Difference')}
                </th>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Source')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className='border-border border-t'>
                  <th scope='row' className='px-4 py-3 text-left font-semibold'>
                    {row.name}
                  </th>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {row.input}
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {row.output}
                  </td>
                  <td className='px-4 py-3'>{t(KIMI_K3_PRICE_UNIT_KEY)}</td>
                  <td className='px-4 py-3'>{row.difference}</td>
                  <td className='px-4 py-3'>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className='text-muted-foreground list-disc space-y-2 pl-5 text-xs md:text-sm'>
          {KIMI_K3_PRICE_DISCLAIMER_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
