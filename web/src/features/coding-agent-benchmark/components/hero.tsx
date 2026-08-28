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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  BENCHMARK_H1,
  BENCHMARK_SUMMARY,
  getCodingAgentBenchmarkCtaTarget,
} from '../lib/coding-agent-benchmark'

export function Hero(): ReactElement {
  const { t } = useTranslation()
  const primary = getCodingAgentBenchmarkCtaTarget('primary')
  const pricing = getCodingAgentBenchmarkCtaTarget('pricing')

  return (
    <section
      aria-labelledby='coding-agent-benchmark-hero-title'
      className='relative overflow-hidden px-4 pt-24 pb-16 text-center md:px-6 md:pt-32 md:pb-24'
    >
      <div
        aria-hidden='true'
        className='from-primary/20 via-background pointer-events-none absolute -top-24 left-1/2 h-96 w-[min(42rem,100%)] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl'
      />
      <div className='relative mx-auto flex w-full max-w-3xl flex-col items-center gap-6'>
        <p className='text-muted-foreground text-xs font-medium tracking-widest uppercase'>
          {t('August 28, 2026')} · Pi 0.84.3
        </p>
        <h1
          id='coding-agent-benchmark-hero-title'
          className='text-4xl font-bold tracking-tight md:text-5xl'
        >
          {t(BENCHMARK_H1)}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-base md:text-lg'>
          {t(BENCHMARK_SUMMARY)}
        </p>
        <p className='text-foreground/80 max-w-2xl text-sm md:text-base'>
          {t(
            'This page reports one run of one task. It is not a ranking of overall model quality.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-6'
            render={<Link to={primary.to} search={primary.search} />}
          >
            {t('Run your next coding task')}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              data-icon='inline-end'
              aria-hidden='true'
            />
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-11 px-6'
            render={<Link to={pricing.to} search={pricing.search} />}
          >
            {t('Compare model pricing')}
          </Button>
        </div>
      </div>
    </section>
  )
}
