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
import {
  CheckmarkCircle02Icon,
  Layers01Icon,
  PackageOpenIcon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Four-card evidence block that supports the page's positioning:
 *  - 20% lower on four flagship paid listings
 *  - No top-up platform fee
 *  - OpenAI-compatible
 *  - Curated and continuously refreshed catalog
 *
 * The card copy mirrors the approved positioning exactly; do not add
 * "all models" or "every model" claims here.
 */
export function Evidence(): ReactElement {
  const { t } = useTranslation()

  const cards: ReadonlyArray<{
    icon: typeof CheckmarkCircle02Icon
    titleKey: string
    bodyKey: string
  }> = [
    {
      icon: Tag01Icon,
      titleKey: '20% lower on four flagship paid listings',
      bodyKey:
        'On four flagship paid listings — qwen3.8-max, kimi-k3, glm-5.3, and MiniMax-M3 — Vancine is 20% lower than the OpenRouter standard paid model listing as of the verified date.',
    },
    {
      icon: PackageOpenIcon,
      titleKey: 'No top-up platform fee',
      bodyKey:
        'Vancine does not add a platform fee to top-ups. The amount you pay is the amount you can spend on the Vancine catalog.',
    },
    {
      icon: Layers01Icon,
      titleKey: 'OpenAI-compatible',
      bodyKey:
        'A single OpenAI-compatible chat completions endpoint at https://vancine.com/v1. Your existing OpenAI SDK, agent, and curl workflows work after you swap the base URL and the API key.',
    },
    {
      icon: CheckmarkCircle02Icon,
      titleKey: 'Curated and continuously refreshed catalog',
      bodyKey:
        'The catalog keeps only the latest flagship models from each supported Chinese provider. Superseded versions are retired as new releases ship, so the directory stays small and the prices stay current.',
    },
  ]

  return (
    <section
      aria-labelledby='openrouter-alternative-evidence-title'
      className='mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-16'
    >
      <h2
        id='openrouter-alternative-evidence-title'
        className='mb-8 text-center text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('What you get')}
      </h2>
      <ul className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {cards.map((card) => (
          <li
            key={card.titleKey}
            className='border-border/60 bg-card/40 flex flex-col gap-3 rounded-2xl border p-6'
          >
            <HugeiconsIcon
              icon={card.icon}
              className='text-primary size-7'
              aria-hidden='true'
            />
            <h3 className='text-base font-semibold md:text-lg'>
              {t(card.titleKey)}
            </h3>
            <p className='text-muted-foreground text-sm leading-relaxed md:text-base'>
              {t(card.bodyKey)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
