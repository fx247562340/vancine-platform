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
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS } from '../lib/landing'

/**
 * "Current flagship coverage" section. Lists the five flagship text
 * model families and the four media capabilities covered by the same
 * API key. The copy is intentionally restrained and avoids a hardcoded
 * model count so the catalog can refresh without the page drifting
 * out of sync.
 */
export function Coverage(): ReactElement {
  const { t } = useTranslation()

  // Split the catalog tokens into the text and media families; the
  // ordering is intentional and matches the canonical positioning copy.
  const textFamilies = OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS.filter(
    (token) => !['Image', 'Video', 'Audio', '3D'].includes(token)
  )
  const mediaCapabilities = OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS.filter(
    (token) => ['Image', 'Video', 'Audio', '3D'].includes(token)
  )

  return (
    <section
      aria-labelledby='openrouter-alternative-coverage-title'
      className='bg-muted/30 border-border/40 border-y px-4 py-12 md:px-6 md:py-16'
    >
      <div className='mx-auto max-w-3xl'>
        <h2
          id='openrouter-alternative-coverage-title'
          className='mb-4 text-2xl font-bold tracking-tight md:text-3xl'
        >
          {t('Current flagship coverage')}
        </h2>
        <p className='text-muted-foreground text-base leading-relaxed md:text-lg'>
          {t(
            'Vancine exposes the latest flagship text models from Qwen, Kimi, GLM, MiniMax, and DeepSeek through one OpenAI-compatible API. The same key and balance also reach Chinese providers for Image, Video, Audio, and 3D generation, so a single integration covers your text and media workloads.'
          )}
        </p>
        <dl className='mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {t('Model')}
            </dt>
            <dd className='mt-2 text-sm md:text-base'>
              {textFamilies.join(', ')}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {t('Image, Video, Audio, 3D')}
            </dt>
            <dd className='mt-2 text-sm md:text-base'>
              {mediaCapabilities.join(', ')}
            </dd>
          </div>
        </dl>
        <p className='text-muted-foreground mt-6 text-sm md:text-base'>
          {t('GLM spotlight')}{' '}
          <Link
            to='/glm-5-3-api'
            className='text-primary underline underline-offset-2'
          >
            {t('GLM-5.3 and GLM-5.3 Flash pricing')}
          </Link>
        </p>
      </div>
    </section>
  )
}
