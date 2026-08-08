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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import { AI_MEDIA_FAQ } from '../lib/landing'

/**
 * Frequently asked questions, rendered from the fixed FAQ contract in the
 * landing lib. Base UI's Accordion provides keyboard support natively.
 */
export function AiMediaFaq(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id='faq'
      aria-labelledby='ai-media-faq-title'
      className='mx-auto w-full max-w-3xl scroll-mt-24 px-4 py-16 md:px-6'
    >
      <h2 id='ai-media-faq-title' className='text-3xl font-bold'>
        {t('Frequently asked questions')}
      </h2>
      <Accordion className='mt-8'>
        {AI_MEDIA_FAQ.map((entry) => (
          <AccordionItem key={entry.questionKey} value={entry.questionKey}>
            <AccordionTrigger>{t(entry.questionKey)}</AccordionTrigger>
            <AccordionContent>{t(entry.answerKey)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
