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
import {
  ClapperboardIcon,
  PaintBoardIcon,
  Robot01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { AI_MEDIA_USE_CASES } from '../lib/landing'

const USE_CASE_ICONS: Record<string, IconSvgElement> = {
  'AI video platforms': ClapperboardIcon,
  'Creative automation tools': PaintBoardIcon,
  'AI SaaS products': SparklesIcon,
  'Developer tools and agents': Robot01Icon,
}

/** Use cases: concrete outcomes without adoption metrics. */
export function UseCases(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='ai-media-use-cases-title'
      className='mx-auto w-full max-w-5xl px-4 py-16 md:px-6'
    >
      <h2 id='ai-media-use-cases-title' className='text-3xl font-bold'>
        {t('Built for products that generate more than text')}
      </h2>
      <div className='mt-8 grid gap-4 sm:grid-cols-2'>
        {AI_MEDIA_USE_CASES.map((useCase) => (
          <Card key={useCase.titleKey}>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <HugeiconsIcon
                  icon={USE_CASE_ICONS[useCase.titleKey]}
                  className='text-primary size-4'
                  aria-hidden='true'
                />
                {t(useCase.titleKey)}
              </CardTitle>
              <CardDescription>{t(useCase.descriptionKey)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  )
}
