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
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { GLM53_API_MODEL_CARDS } from '../lib/glm-5-3-api'

/**
 * Model selection guidance: glm-5.3 for flagship capability, complex
 * coding, and long-context work; glm-5.3-flash for a lower token cost
 * on high-frequency calls with multimodal input. The flash copy makes
 * NO speed or latency claim, and a provider-error disclosure always
 * follows the two cards.
 */
export function ModelChoice(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='glm-5-3-api-models-title'
      className='mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-16'
    >
      <h2
        id='glm-5-3-api-models-title'
        className='mb-8 text-center text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('Choose your model')}
      </h2>
      <ul className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {GLM53_API_MODEL_CARDS.map((card) => (
          <li
            key={card.modelId}
            data-testid={`glm53-model-card-${card.modelId}`}
            className='border-border/60 bg-card/40 flex flex-col gap-3 rounded-2xl border p-6'
          >
            <p className='text-primary font-mono text-sm font-semibold'>
              {card.modelId}
            </p>
            <h3 className='text-base font-semibold md:text-lg'>
              {t(card.titleKey)}
            </h3>
            <p className='text-muted-foreground text-sm leading-relaxed md:text-base'>
              {t(card.bodyKey)}
            </p>
          </li>
        ))}
      </ul>
      <p className='text-muted-foreground mt-6 flex items-center justify-center gap-2 text-center text-xs md:text-sm'>
        <HugeiconsIcon
          icon={InformationCircleIcon}
          className='size-4 shrink-0'
          aria-hidden='true'
        />
        {t('Provider-specific errors may differ between models and providers.')}
      </p>
    </section>
  )
}
