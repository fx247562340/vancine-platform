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

import { getCodingAgentBenchmarkCtaTarget } from '../lib/coding-agent-benchmark'

export function FinalCta(): ReactElement {
  const { t } = useTranslation()
  const primary = getCodingAgentBenchmarkCtaTarget('primary')
  const pricing = getCodingAgentBenchmarkCtaTarget('pricing')
  const docs = getCodingAgentBenchmarkCtaTarget('docs')

  return (
    <section
      aria-labelledby='coding-agent-benchmark-final-cta-title'
      className='px-4 py-20 text-center md:px-6'
    >
      <div className='mx-auto flex w-full max-w-2xl flex-col items-center gap-5'>
        <h2
          id='coding-agent-benchmark-final-cta-title'
          className='text-3xl font-bold'
        >
          {t('Run your next coding task')}
        </h2>
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
          <Button
            variant='ghost'
            size='lg'
            className='h-11 px-6'
            render={<Link to={docs.to} search={docs.search} />}
          >
            {t('Read the API docs')}
          </Button>
        </div>
      </div>
    </section>
  )
}
