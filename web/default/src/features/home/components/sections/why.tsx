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

const WHY_ITEMS = [
  {
    title: 'Fast access to new Chinese models',
    body: 'New Chinese model releases can be added to one endpoint instead of a new vendor integration each time.',
  },
  {
    title: 'One compatible API',
    body: 'OpenAI-compatible requests, streaming, and tooling patterns you already use.',
  },
  {
    title: 'Unified balance and billing',
    body: 'One account, one balance, and one usage log across supported models.',
  },
  {
    title: 'Tested integration examples',
    body: 'Public starters and measured agent evidence for supported workflows.',
  },
]

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

        <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {WHY_ITEMS.map((item, i) => (
            <AnimateInView
              key={item.title}
              delay={i * 80}
              animation='scale-in'
              className='border-border/40 bg-muted/10 rounded-xl border p-6'
            >
              <div
                className='mb-4 flex size-9 items-center justify-center rounded-lg text-sm font-bold'
                style={{
                  background:
                    'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
                }}
                aria-hidden
              >
                {i + 1}
              </div>
              <h3 className='mb-2 text-base font-semibold'>{t(item.title)}</h3>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {t(item.body)}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
