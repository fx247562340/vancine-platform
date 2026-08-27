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

For commercial licensing, please contact support@quantumnous.com.
*/
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatGlm53Usd,
  GLM53_API_COMPARISON_ROWS,
  GLM53_API_PRICING_DISCLAIMER_KEYS,
} from '../lib/glm-5-3-api'

const DIMENSIONS = [
  {
    key: 'Input',
    vancineField: 'vancineInputUsd',
    openrouterField: 'openrouterInputUsd',
  },
  {
    key: 'Output',
    vancineField: 'vancineOutputUsd',
    openrouterField: 'openrouterOutputUsd',
  },
  {
    key: 'Cache read',
    vancineField: 'vancineCacheReadUsd',
    openrouterField: 'openrouterCacheReadUsd',
  },
] as const

/**
 * Exact price comparison for the two GLM models across input, output,
 * and cache read — one self-contained row per model × dimension.
 *
 * Attribution is carried by the table structure itself: the Vancine
 * amount sits under the "Vancine" column header and the OpenRouter
 * amount under "OpenRouter". Nothing may render as an unlabeled
 * "$x / $y" pair, and no legend outside the table is required for a
 * screen reader to tell the two prices apart. The mobile cards apply
 * the same rule per dimension block.
 */
export function Comparison(): ReactElement {
  const { t } = useTranslation()

  const renderSourceLink = (
    row: (typeof GLM53_API_COMPARISON_ROWS)[number]
  ) => (
    <a
      data-testid='glm53-source-link'
      className='inline-flex items-center gap-1 underline underline-offset-2'
      href={row.openrouterSourceUrl}
      target='_blank'
      rel='noopener noreferrer'
    >
      {t('View')}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className='size-3.5'
        aria-hidden='true'
      />
    </a>
  )

  return (
    <section
      aria-labelledby='glm-5-3-api-pricing-title'
      className='bg-muted/30 border-border/40 w-full border-y px-4 py-12 md:px-6 md:py-16'
    >
      <div className='mx-auto w-full max-w-5xl'>
        <h2
          id='glm-5-3-api-pricing-title'
          className='mb-3 text-center text-2xl font-bold tracking-tight md:text-3xl'
        >
          {t('Exact pricing: Vancine vs. OpenRouter')}
        </h2>
        <p className='text-muted-foreground mx-auto mb-8 max-w-2xl text-center text-sm md:text-base'>
          {t(
            'USD per 1M tokens, verified against the linked OpenRouter standard paid listings. Vancine live pricing is authoritative.'
          )}
        </p>

        <div className='border-border/60 bg-card/30 overflow-hidden rounded-2xl border'>
          {/* Mobile-first per-model cards; a semantic <table> for >= md. */}
          <div className='md:hidden'>
            <ul className='divide-border/60 divide-y'>
              {GLM53_API_COMPARISON_ROWS.map((row) => (
                <li
                  key={row.modelId}
                  data-testid='glm53-comparison-card'
                  className='p-4 text-sm'
                >
                  <p className='font-mono font-semibold'>{row.modelId}</p>
                  <div className='mt-2 space-y-3'>
                    {DIMENSIONS.map((dim) => (
                      <dl
                        key={dim.key}
                        className='border-border/60 rounded-lg border p-3'
                      >
                        <dt className='font-medium'>{t(dim.key)}</dt>
                        <div className='mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1'>
                          <dt className='text-muted-foreground'>
                            {t('Vancine')}
                          </dt>
                          <dd className='text-right font-medium tabular-nums'>
                            {formatGlm53Usd(row[dim.vancineField])}
                          </dd>
                          <dt className='text-muted-foreground'>
                            {t('OpenRouter')}
                          </dt>
                          <dd className='text-muted-foreground text-right tabular-nums'>
                            {formatGlm53Usd(row[dim.openrouterField])}
                          </dd>
                          <dt className='text-muted-foreground'>
                            {t('Saving')}
                          </dt>
                          <dd className='text-primary text-right font-semibold'>
                            20%
                          </dd>
                        </div>
                      </dl>
                    ))}
                    <p className='flex items-center justify-between gap-3'>
                      <span className='text-muted-foreground'>
                        {t('Source')}
                      </span>
                      {renderSourceLink(row)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <table
            data-testid='glm53-comparison-table'
            className='hidden w-full text-sm md:table'
          >
            <caption className='sr-only'>
              {t('Exact pricing: Vancine vs. OpenRouter')}
            </caption>
            <thead className='bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase'>
              <tr>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Model')}
                </th>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Dimension')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Vancine')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('OpenRouter')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Saving')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Source')}
                </th>
              </tr>
            </thead>
            <tbody>
              {GLM53_API_COMPARISON_ROWS.flatMap((row) =>
                DIMENSIONS.map((dim) => (
                  <tr
                    key={`${row.modelId}-${dim.key}`}
                    className='border-border/60 border-t text-sm'
                  >
                    <th
                      scope='row'
                      className='px-4 py-3 text-left font-mono font-medium'
                    >
                      {row.modelId}
                    </th>
                    <td className='px-4 py-3 text-left'>{t(dim.key)}</td>
                    <td className='px-4 py-3 text-right font-medium tabular-nums'>
                      {formatGlm53Usd(row[dim.vancineField])}
                    </td>
                    <td className='text-muted-foreground px-4 py-3 text-right tabular-nums'>
                      {formatGlm53Usd(row[dim.openrouterField])}
                    </td>
                    <td className='text-primary px-4 py-3 text-right font-semibold'>
                      20%
                    </td>
                    <td className='px-4 py-3 text-right'>
                      {renderSourceLink(row)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <dl className='text-muted-foreground mt-6 space-y-2 text-xs md:text-sm'>
          <div>
            <dd>
              {t(
                'Vancine is 20% lower than OpenRouter on these two standard paid model listings.'
              )}
            </dd>
          </div>
          {GLM53_API_PRICING_DISCLAIMER_KEYS.map((key) => (
            <div key={key}>
              <dd>{t(key)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
