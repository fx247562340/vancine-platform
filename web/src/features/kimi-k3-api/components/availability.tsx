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

import { trackEvent } from '@/lib/analytics'

import {
  formatKimiK3Usd,
  KIMI_K3_PRICE_DISCLAIMER_KEYS,
  KIMI_K3_PRICE_PROVIDERS,
  KIMI_K3_PRICE_UNIT_KEY,
  KIMI_K3_PRICING_SECTION_ID,
  KIMI_K3_RESOURCE_EVENT,
  KIMI_K3_VANCINE_PRICING_MODEL_ID,
  type KimiK3PriceProvider,
} from '../lib/landing'

function SourceLink(props: { provider: KimiK3PriceProvider }): ReactElement {
  const { t } = useTranslation()
  const provider = props.provider
  const label = t(provider.sourceLabelKey)
  const icon = (
    <HugeiconsIcon
      icon={ArrowUpRight01Icon}
      className='size-3.5'
      aria-hidden='true'
    />
  )
  const className =
    'inline-flex items-center gap-1 underline underline-offset-2'
  const onClick = (): void => {
    trackEvent(KIMI_K3_RESOURCE_EVENT, {
      resource: provider.resource,
      location: 'pricing',
    })
  }

  if (provider.sourceKind === 'internal') {
    return (
      <Link
        data-testid='kimi-k3-vancine-pricing-link'
        className={className}
        to='/pricing/$modelId'
        params={{ modelId: KIMI_K3_VANCINE_PRICING_MODEL_ID }}
        onClick={onClick}
      >
        {label}
        {icon}
      </Link>
    )
  }

  return (
    <a
      data-testid={`kimi-k3-${provider.id}-source-link`}
      className={className}
      href={provider.sourceHref}
      target='_blank'
      rel='noopener noreferrer'
      onClick={onClick}
    >
      {label}
      {icon}
    </a>
  )
}

/**
 * Kimi K3-only dated price comparison. Replaces the former China-portfolio
 * availability block while keeping this file name and export.
 */
export function Availability(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id={KIMI_K3_PRICING_SECTION_ID}
      aria-labelledby='kimi-k3-pricing-title'
      className='bg-muted/30 scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <h2 id='kimi-k3-pricing-title' className='text-3xl font-bold'>
            {t('Kimi K3 API price comparison')}
          </h2>
        </div>

        <div className='border-border bg-card/30 overflow-hidden rounded-xl border'>
          <div className='md:hidden'>
            <ul className='divide-border divide-y'>
              {KIMI_K3_PRICE_PROVIDERS.map((provider) => (
                <li
                  key={provider.id}
                  data-testid='kimi-k3-price-card'
                  className='p-4 text-sm'
                >
                  <p className='font-semibold'>{t(provider.nameKey)}</p>
                  <dl className='mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2'>
                    <dt className='text-muted-foreground'>
                      {t('Input price')}
                    </dt>
                    <dd className='text-right font-medium tabular-nums'>
                      {formatKimiK3Usd(provider.inputUsd)}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Output price')}
                    </dt>
                    <dd className='text-right font-medium tabular-nums'>
                      {formatKimiK3Usd(provider.outputUsd)}
                    </dd>
                    <dt className='text-muted-foreground'>{t('Unit')}</dt>
                    <dd className='text-right'>{t(KIMI_K3_PRICE_UNIT_KEY)}</dd>
                    <dt className='text-muted-foreground'>{t('Difference')}</dt>
                    <dd className='text-right font-medium'>
                      {t(provider.differenceKey)}
                    </dd>
                    <dt className='text-muted-foreground'>{t('Source')}</dt>
                    <dd className='text-right'>
                      <SourceLink provider={provider} />
                    </dd>
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
              {t('Kimi K3 API price comparison')}
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
              {KIMI_K3_PRICE_PROVIDERS.map((provider) => (
                <tr key={provider.id} className='border-border border-t'>
                  <th scope='row' className='px-4 py-3 text-left font-semibold'>
                    {t(provider.nameKey)}
                  </th>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {formatKimiK3Usd(provider.inputUsd)}
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {formatKimiK3Usd(provider.outputUsd)}
                  </td>
                  <td className='px-4 py-3'>{t(KIMI_K3_PRICE_UNIT_KEY)}</td>
                  <td className='px-4 py-3'>{t(provider.differenceKey)}</td>
                  <td className='px-4 py-3'>
                    <SourceLink provider={provider} />
                  </td>
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
