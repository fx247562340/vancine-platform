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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

// Three items, in fixed order. Frozen: production copy. The grid below
// uses lg:grid-cols-3 (one row on desktop) — adding a fourth item would
// visibly break that layout. New items go through this registry, not by
// appending here.
const WHY_ITEMS = [
  {
    title: 'Faster access to new Chinese models',
    body: 'New model releases can reach the unified endpoint without a fresh vendor integration each time.',
  },
  {
    title: 'One API, one bill',
    body: 'Compatible with the calling conventions you already use, with one balance, billing, and usage log.',
  },
  {
    title: 'Evidence-backed developer experience',
    body: 'Real call examples, inspectable agent run evidence, and developer documentation.',
  },
] as const

export function Why() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Why developers use Vancine')}
          </h2>
        </AnimateInView>

        <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {WHY_ITEMS.map((item, i) => (
            <AnimateInView key={item.title} delay={i * 80} animation='scale-in'>
              <article className='border-border/40 bg-muted/10 h-full rounded-xl border p-6'>
                <div
                  className='mb-4 flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-emerald-500/15 text-sm font-bold'
                  aria-hidden
                >
                  {i + 1}
                </div>
                <h3 className='mb-2 text-base font-semibold'>
                  {t(item.title)}
                </h3>
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {t(item.body)}
                </p>
              </article>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
