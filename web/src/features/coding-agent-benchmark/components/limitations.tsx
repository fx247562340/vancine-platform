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
  BENCHMARK_JSON_PATH,
  BENCHMARK_LIMITATION_KEYS,
} from '../lib/coding-agent-benchmark'

export function Limitations(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='coding-agent-benchmark-limitations-title'
      className='bg-muted/20 w-full px-4 py-16 md:px-6'
    >
      <div className='mx-auto w-full max-w-3xl'>
        <h2
          id='coding-agent-benchmark-limitations-title'
          className='text-2xl font-bold tracking-tight md:text-3xl'
        >
          {t('Limitations')}
        </h2>
        <ul className='text-muted-foreground mt-6 list-disc space-y-3 pl-5 text-sm leading-relaxed md:text-base'>
          {BENCHMARK_LIMITATION_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p className='mt-8'>
          <a
            href={BENCHMARK_JSON_PATH}
            download='pi-coding-agent-2026-08-28.json'
            className='text-primary font-medium underline underline-offset-4'
          >
            {t('Download results JSON')}
          </a>
        </p>
      </div>
    </section>
  )
}
