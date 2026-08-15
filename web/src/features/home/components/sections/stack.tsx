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
import { SpotlightCard } from '@/features/home/components/spotlight-card'

const STACK_ITEMS = [
  {
    title: 'OpenCode',
    body: 'Live-verified with Kimi K3 in a controlled coding-agent run. View the evidence section below.',
    qualification: 'Live-verified',
  },
  {
    title: 'Cline',
    body: 'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    title: 'Roo Code',
    body: 'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    title: 'Claude Code',
    body: 'Compatible via OpenAI-compatible / documented gateway usage patterns. No Vancine-owned end-to-end coding-agent benchmark is claimed on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    title: 'OpenAI SDK',
    body: 'First-class: standard OpenAI SDK against https://vancine.com/v1.',
    qualification: 'Configuration-ready',
  },
  {
    title: 'Pi Coding Agent',
    body: "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.",
    qualification: 'Configuration-ready',
  },
] as const

export function Stack() {
  const { t } = useTranslation()
  return (
    <section className='relative z-10 px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 max-w-2xl'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Works with your stack')}
          </h2>
          <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
            {t(
              'Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.'
            )}
          </p>
        </AnimateInView>

        <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {STACK_ITEMS.map((item, i) => (
            <AnimateInView key={item.title} delay={i * 80} animation='scale-in'>
              <SpotlightCard className='h-full p-6'>
                <article>
                  <h3 className='mb-2 text-lg font-semibold'>
                    {t(item.title)}
                  </h3>
                  <p className='text-muted-foreground text-sm leading-relaxed'>
                    {t(item.body)}
                  </p>
                  <div className='mt-3'>
                    <span className='border-border/40 bg-muted/20 text-muted-foreground/80 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium'>
                      {t(item.qualification)}
                    </span>
                  </div>
                </article>
              </SpotlightCard>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
