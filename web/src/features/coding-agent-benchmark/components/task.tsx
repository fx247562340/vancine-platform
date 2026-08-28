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

import { BENCHMARK_TASK_POINT_KEYS } from '../lib/coding-agent-benchmark'

export function Task(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='coding-agent-benchmark-task-title'
      className='mx-auto w-full max-w-3xl px-4 py-16 md:px-6'
    >
      <h2
        id='coding-agent-benchmark-task-title'
        className='text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('What the task tested')}
      </h2>
      <ul className='text-muted-foreground mt-6 list-disc space-y-3 pl-5 text-sm leading-relaxed md:text-base'>
        {BENCHMARK_TASK_POINT_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </section>
  )
}
