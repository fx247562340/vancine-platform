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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CODING_AGENT_BENCHMARK_MODELS,
  formatAgentRunTime,
  formatBilledUsd,
  formatTokenCount,
} from '../lib/coding-agent-benchmark'

export function Results(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='coding-agent-benchmark-results-title'
      className='bg-muted/30 border-border/40 w-full border-y px-4 py-12 md:px-6 md:py-16'
    >
      <div className='mx-auto w-full max-w-5xl'>
        <h2
          id='coding-agent-benchmark-results-title'
          className='mb-3 text-center text-2xl font-bold tracking-tight md:text-3xl'
        >
          {t('Results')}
        </h2>
        <p className='text-muted-foreground mx-auto mb-8 max-w-2xl text-center text-sm md:text-base'>
          {t(
            'This page reports one run of one task. It is not a ranking of overall model quality.'
          )}
        </p>

        <div className='border-border/60 bg-card/30 overflow-hidden rounded-2xl border'>
          <div data-testid='benchmark-mobile-results' className='md:hidden'>
            <ul className='divide-border/60 divide-y'>
              {CODING_AGENT_BENCHMARK_MODELS.map((row) => (
                <li
                  key={row.model}
                  data-testid='benchmark-result-card'
                  className='p-4 text-sm'
                >
                  <p
                    data-testid='benchmark-result-model'
                    className='font-mono font-semibold'
                  >
                    {row.model}
                  </p>
                  <dl className='mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2'>
                    <dt className='text-muted-foreground'>{t('Result')}</dt>
                    <dd className='text-right font-medium'>{t('Pass')}</dd>
                    <dt className='text-muted-foreground'>
                      {t('Agent run time')}
                    </dt>
                    <dd className='text-right tabular-nums'>
                      {formatAgentRunTime(row.agentRunTimeMs)}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Model requests')}
                    </dt>
                    <dd className='text-right tabular-nums'>
                      {row.modelRequests}
                    </dd>
                    <dt className='text-muted-foreground'>{t('Tokens')}</dt>
                    <dd className='text-right tabular-nums'>
                      {formatTokenCount(row.tokens)}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Vancine billed')}
                    </dt>
                    <dd className='text-right font-medium tabular-nums'>
                      {formatBilledUsd(row.productionBilledUsd)}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <table className='hidden w-full text-sm md:table'>
            <caption className='sr-only'>{t('Results')}</caption>
            <thead className='bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase'>
              <tr>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Model')}
                </th>
                <th scope='col' className='px-4 py-3 text-left font-semibold'>
                  {t('Result')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Agent run time')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Model requests')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Tokens')}
                </th>
                <th scope='col' className='px-4 py-3 text-right font-semibold'>
                  {t('Vancine billed')}
                </th>
              </tr>
            </thead>
            <tbody>
              {CODING_AGENT_BENCHMARK_MODELS.map((row) => (
                <tr key={row.model} className='border-border/60 border-t'>
                  <th
                    scope='row'
                    className='px-4 py-3 text-left font-mono font-medium'
                  >
                    {row.model}
                  </th>
                  <td className='px-4 py-3 text-left'>{t('Pass')}</td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {formatAgentRunTime(row.agentRunTimeMs)}
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {row.modelRequests}
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {formatTokenCount(row.tokens)}
                  </td>
                  <td className='px-4 py-3 text-right font-medium tabular-nums'>
                    {formatBilledUsd(row.productionBilledUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
