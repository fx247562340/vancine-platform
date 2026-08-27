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

import { OPENROUTER_ALTERNATIVE_COMPARISON_ROWS } from '../lib/landing'

/**
 * Four-row Vancine vs. OpenRouter price comparison table. Each row
 * shows input / output USD per 1M tokens, the saving percentage, and a
 * link to the public OpenRouter model page that the comparison was
 * drawn from. The table must be readable down to a 390px viewport
 * without horizontal scroll.
 */
export function Comparison(): ReactElement {
  const { t } = useTranslation()

  const fmtUsd = (value: number): string => `$${value.toFixed(2)}`

  const savingPct = (
    row: (typeof OPENROUTER_ALTERNATIVE_COMPARISON_ROWS)[number]
  ): number =>
    Math.round(
      ((row.openrouterInputUsd - row.vancineInputUsd) /
        row.openrouterInputUsd) *
        100
    )

  return (
    <section
      aria-labelledby='openrouter-alternative-comparison-title'
      className='mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-16'
    >
      <h2
        id='openrouter-alternative-comparison-title'
        className='mb-3 text-center text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('Price comparison: Vancine vs. OpenRouter')}
      </h2>
      <p className='text-muted-foreground mx-auto mb-8 max-w-2xl text-center text-sm md:text-base'>
        {t(
          'USD per 1M tokens. Input / output. Vancine is 20% lower on these four flagship paid listings; free variants, promotional routes, and temporary provider discounts are excluded.'
        )}
      </p>

      <div className='border-border/60 overflow-hidden rounded-2xl border'>
        {/* Mobile-first card layout, with a real <table> for >= md. */}
        <div className='md:hidden'>
          <ul className='divide-border/60 divide-y'>
            {OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.map((row) => (
              <li
                key={row.modelId}
                data-testid='comparison-card-row'
                className='p-4 text-sm'
              >
                <p className='font-semibold'>{row.modelId}</p>
                <dl className='mt-2 grid grid-cols-2 gap-x-3 gap-y-1'>
                  <dt className='text-muted-foreground'>
                    {t('Vancine input / output')}
                  </dt>
                  <dd className='text-right font-medium'>
                    {fmtUsd(row.vancineInputUsd)} /{' '}
                    {fmtUsd(row.vancineOutputUsd)}
                  </dd>
                  <dt className='text-muted-foreground'>
                    {t('OpenRouter input / output')}
                  </dt>
                  <dd className='text-right font-medium'>
                    {fmtUsd(row.openrouterInputUsd)} /{' '}
                    {fmtUsd(row.openrouterOutputUsd)}
                  </dd>
                  <dt className='text-muted-foreground'>{t('Saving')}</dt>
                  <dd className='text-primary text-right font-semibold'>
                    {savingPct(row)}%
                  </dd>
                  <dt className='text-muted-foreground'>
                    {t('OpenRouter source')}
                  </dt>
                  <dd className='text-right'>
                    <a
                      data-testid='openrouter-source-link'
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
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </div>

        <table
          data-testid='comparison-table'
          className='hidden w-full text-sm md:table'
        >
          <caption className='sr-only'>
            {t('Price comparison: Vancine vs. OpenRouter')}
          </caption>
          <thead className='bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase'>
            <tr>
              <th scope='col' className='px-4 py-3 text-left font-semibold'>
                {t('Model')}
              </th>
              <th scope='col' className='px-4 py-3 text-right font-semibold'>
                {t('Vancine input / output')}
              </th>
              <th scope='col' className='px-4 py-3 text-right font-semibold'>
                {t('OpenRouter input / output')}
              </th>
              <th scope='col' className='px-4 py-3 text-right font-semibold'>
                {t('Saving')}
              </th>
              <th scope='col' className='px-4 py-3 text-right font-semibold'>
                {t('OpenRouter source')}
              </th>
            </tr>
          </thead>
          <tbody>
            {OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.map((row) => (
              <tr
                key={row.modelId}
                className='border-border/60 border-t text-sm'
              >
                <th scope='row' className='px-4 py-3 text-left font-semibold'>
                  {row.modelId}
                </th>
                <td className='px-4 py-3 text-right tabular-nums'>
                  {fmtUsd(row.vancineInputUsd)} / {fmtUsd(row.vancineOutputUsd)}
                </td>
                <td className='text-muted-foreground px-4 py-3 text-right tabular-nums'>
                  {fmtUsd(row.openrouterInputUsd)} /{' '}
                  {fmtUsd(row.openrouterOutputUsd)}
                </td>
                <td className='text-primary px-4 py-3 text-right font-semibold tabular-nums'>
                  {savingPct(row)}%
                </td>
                <td className='px-4 py-3 text-right'>
                  <a
                    data-testid='openrouter-source-link'
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className='text-muted-foreground mt-6 space-y-2 text-xs md:text-sm'>
        <div>
          <dt className='sr-only'>{t('Last verified')}</dt>
          <dd>{t('Last verified: August 27, 2026.')}</dd>
        </div>
        <div>
          <dd>
            {t(
              'OpenRouter comparison uses its standard paid model listing. Free variants, promotional routes, and temporary provider discounts are excluded.'
            )}
          </dd>
        </div>
        <div>
          <dd>
            {t(
              'Prices may change. Vancine live pricing is authoritative at /api/pricing.'
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
