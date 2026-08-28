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
  BENCHMARK_PI_CLI_EXAMPLE,
  BENCHMARK_PI_CONFIG_EXAMPLE,
} from '../lib/coding-agent-benchmark'
import { CopyableCode } from './copyable-code'

export function Reproduce(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='coding-agent-benchmark-reproduce-title'
      className='mx-auto w-full max-w-3xl px-4 py-16 md:px-6'
    >
      <h2
        id='coding-agent-benchmark-reproduce-title'
        className='text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('How to reproduce with Pi')}
      </h2>
      <p className='text-muted-foreground mt-4 text-sm leading-relaxed md:text-base'>
        {t(
          'Point Pi at the Vancine OpenAI-compatible endpoint. Keep the API key in VANCINE_API_KEY — never paste a real key into this page.'
        )}
      </p>
      <div className='mt-6'>
        <CopyableCode
          code={BENCHMARK_PI_CONFIG_EXAMPLE}
          label={t('How to reproduce with Pi')}
        />
      </div>
      <p className='text-muted-foreground mt-4 text-sm leading-relaxed md:text-base'>
        {t('Then run:')}
      </p>
      <div className='mt-3'>
        <CopyableCode code={BENCHMARK_PI_CLI_EXAMPLE} label={t('Then run:')} />
      </div>
    </section>
  )
}
