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

import { KIMI_K31_MODEL_PROFILES, KIMI_K31_MODELS } from '../lib/landing'

/**
 * Concise K3.1 model profiles: what each model fits. These cards are
 * informational (not a second model selector), carry no outbound links,
 * and emit no analytics events.
 */
export function ModelProfiles(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id='models'
      aria-labelledby='kimi-k3-models-title'
      className='bg-muted/30 scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <h2 id='kimi-k3-models-title' className='text-3xl font-bold'>
            {t('Choose the model that fits your task')}
          </h2>
          <p className='text-muted-foreground max-w-3xl'>
            {t(
              'Both models run on one OpenAI-compatible API with a 1M-token context window.'
            )}
          </p>
        </div>

        <div
          className='grid gap-4 md:grid-cols-2'
          aria-label={t('Model profiles')}
        >
          {KIMI_K31_MODELS.map((model) => {
            const profile = KIMI_K31_MODEL_PROFILES[model.id]
            return (
              <article
                key={model.id}
                data-testid={`kimi-k3-model-profile-${model.id}`}
                className='border-border bg-card flex flex-col gap-4 rounded-xl border p-5'
              >
                <div className='flex flex-col gap-1'>
                  <h3 className='text-lg font-semibold'>{t(model.labelKey)}</h3>
                  <p className='text-muted-foreground font-mono text-xs'>
                    {model.id}
                  </p>
                </div>
                <p className='text-sm font-medium'>
                  {t(profile.positioningKey)}
                </p>
                <ul className='text-muted-foreground list-disc space-y-1.5 pl-5 text-sm'>
                  {profile.useCaseKeys.map((useCaseKey) => (
                    <li key={useCaseKey}>{t(useCaseKey)}</li>
                  ))}
                </ul>
                {profile.officialSpeedNote ? (
                  <p className='text-muted-foreground text-xs'>
                    {t('About 2–3× the speed of Kimi K3.1 Pro.')}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
