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
  Key01Icon,
  Wallet01Icon,
  WorkflowSquareIcon,
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

import { AI_MEDIA_BENEFITS } from '../lib/landing'

const BENEFIT_ICONS: Record<string, IconSvgElement> = {
  'One API key': Key01Icon,
  'Unified account and balance': Wallet01Icon,
  'Documented workflows': WorkflowSquareIcon,
}

/** One-integration benefits: all claims are verifiable platform facts. */
export function IntegrationBenefits(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='ai-media-benefits-title'
      className='mx-auto w-full max-w-5xl px-4 py-16 md:px-6'
    >
      <h2
        id='ai-media-benefits-title'
        className='text-center text-3xl font-bold'
      >
        {t('One integration, one account')}
      </h2>
      <div className='mt-8 grid gap-4 md:grid-cols-3'>
        {AI_MEDIA_BENEFITS.map((benefit) => (
          <Card key={benefit.titleKey}>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <HugeiconsIcon
                  icon={BENEFIT_ICONS[benefit.titleKey]}
                  className='text-primary size-4'
                  aria-hidden='true'
                />
                {t(benefit.titleKey)}
              </CardTitle>
              <CardDescription>{t(benefit.descriptionKey)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  )
}
