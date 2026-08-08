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

import { AnimateInView } from '@/components/animate-in-view'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trackEvent } from '@/lib/analytics'
import {
  DEVELOPER_SOLUTIONS,
  DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY,
} from '@/lib/developer-solutions'

/**
 * Built-in homepage Developer solutions section. Renders every live entry of
 * the shared developer solutions registry — the same single source of truth
 * consumed by the public header and the Docs sidebar. Only present on the
 * built-in default homepage; admin-configured iframe/HTML/Markdown homepages
 * are untouched.
 */
export function DeveloperSolutions(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='developer-solutions-title'
      className='border-border/40 relative z-10 border-t px-6 py-24 md:py-32'
    >
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-12 text-center md:mb-16'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t(DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY)}
          </p>
          <h2
            id='developer-solutions-title'
            className='text-2xl font-bold tracking-tight md:text-3xl'
          >
            {t('Landing pages for coding agents and AI media workflows.')}
          </h2>
        </AnimateInView>
        <div className='grid gap-6 md:grid-cols-2'>
          {DEVELOPER_SOLUTIONS.map((solution) => (
            <Card key={solution.id}>
              <CardHeader>
                <CardTitle>{t(solution.titleKey)}</CardTitle>
                <CardDescription>{t(solution.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardContent className='flex-1' />
              <CardFooter>
                <Link
                  to={solution.route}
                  className='text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
                  onClick={() =>
                    trackEvent('developer_resource_clicked', {
                      resource: solution.resource,
                      location: 'homepage',
                    })
                  }
                >
                  {t('Learn more')}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className='size-3.5'
                    aria-hidden='true'
                  />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
