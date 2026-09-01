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

import { useFastCodingModelsPricing } from '../hooks/use-fast-coding-models-pricing'
import {
  FAST_CODING_MODELS_API_BASE_URL,
  FAST_CODING_MODELS_API_KEY_PLACEHOLDER,
} from '../lib/fast-coding-models'

/**
 * "One endpoint, dynamic fast models": the shared Base URL, the
 * environment variable API-key placeholder (never a real credential),
 * and the live list of fast-tagged model ids. Copy stresses that
 * switching models only changes the request's model field.
 */
export function EndpointOverview(): ReactElement {
  const { t } = useTranslation()
  const pricing = useFastCodingModelsPricing()

  return (
    <section
      aria-labelledby='fast-coding-models-endpoint-title'
      className='mx-auto w-full max-w-4xl px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2
          id='fast-coding-models-endpoint-title'
          className='text-3xl font-bold'
        >
          {t('One endpoint, dynamic fast models')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Every model tagged "fast" in the public catalog shares one OpenAI-compatible endpoint at https://vancine.com/v1. Switch models by changing only the model field of your request.'
          )}
        </p>
      </div>

      <div className='bg-card border-border mt-6 grid gap-4 rounded-xl border p-5 sm:grid-cols-2'>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs font-semibold tracking-widest uppercase'>
            {t('Base URL')}
          </span>
          <code className='bg-muted/60 rounded-md px-2 py-1.5 font-mono text-sm'>
            {FAST_CODING_MODELS_API_BASE_URL}
          </code>
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs font-semibold tracking-widest uppercase'>
            {t('API Key')}
          </span>
          <code className='bg-muted/60 rounded-md px-2 py-1.5 font-mono text-sm'>
            {FAST_CODING_MODELS_API_KEY_PLACEHOLDER}
          </code>
          <span className='text-muted-foreground text-xs'>
            {t(
              'Replace the placeholder with your own key. Never paste a real API key into this page.'
            )}
          </span>
        </div>
        <div className='flex flex-col gap-1 sm:col-span-2'>
          <span className='text-muted-foreground text-xs font-semibold tracking-widest uppercase'>
            {t('Model IDs')}
          </span>
          {pricing.models.length > 0 ? (
            <ul
              className='flex flex-wrap gap-2'
              data-testid='fast-coding-models-endpoint-id-list'
            >
              {pricing.models.map((model) => (
                <li key={model.model_name}>
                  <code className='bg-muted/60 rounded-md px-2 py-1 font-mono text-sm'>
                    {model.model_name}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p
              data-testid='fast-coding-models-endpoint-id-empty'
              className='text-muted-foreground text-sm'
            >
              {t('No fast models are listed in the public catalog right now.')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
