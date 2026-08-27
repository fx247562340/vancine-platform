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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * "Why a smaller catalog" section. Explains Vancine's curated approach
 * without disparaging OpenRouter, so the page stays an honest comparison
 * rather than a competitive attack.
 */
export function WhySmallerCatalog(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='openrouter-alternative-why-smaller-title'
      className='mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16'
    >
      <h2
        id='openrouter-alternative-why-smaller-title'
        className='mb-4 text-2xl font-bold tracking-tight md:text-3xl'
      >
        {t('Why a smaller catalog')}
      </h2>
      <p className='text-muted-foreground text-base leading-relaxed md:text-lg'>
        {t('Why a smaller catalog body')}
      </p>
    </section>
  )
}
