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
  ChartLineData01Icon,
  CubeIcon,
  Image01Icon,
  Video01Icon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trackEvent } from '@/lib/analytics'

import { AI_MEDIA_CATEGORIES, AI_MEDIA_RESOURCE_EVENT } from '../lib/landing'

const CATEGORY_ICONS: Record<string, IconSvgElement> = {
  'Image generation': Image01Icon,
  'Video generation': Video01Icon,
  'Text to Speech': VolumeHighIcon,
  '3D generation': CubeIcon,
}

/** Media category cards; each links to its same-origin Docs page. */
export function MediaCategories(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='ai-media-categories-title'
      className='bg-muted/30 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-8'>
        <h2 id='ai-media-categories-title' className='text-3xl font-bold'>
          {t('One integration across the AI media stack')}
        </h2>
        <div className='grid gap-4 sm:grid-cols-2'>
          {AI_MEDIA_CATEGORIES.map((category) => (
            <Card key={category.titleKey}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <HugeiconsIcon
                    icon={CATEGORY_ICONS[category.titleKey]}
                    className='text-primary size-4'
                    aria-hidden='true'
                  />
                  {t(category.titleKey)}
                </CardTitle>
                <CardDescription>{t(category.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant='ghost'
                  size='sm'
                  render={
                    <Link
                      to='/docs/$slug'
                      params={{ slug: category.docsSlug }}
                    />
                  }
                  onClick={() =>
                    trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                      resource: 'docs',
                      location: 'categories',
                    })
                  }
                >
                  {t('Read API documentation')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div>
          <Button
            variant='outline'
            render={<Link to='/pricing' />}
            onClick={() =>
              trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                resource: 'pricing',
                location: 'categories',
              })
            }
          >
            <HugeiconsIcon
              icon={ChartLineData01Icon}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('View live pricing and availability')}
          </Button>
        </div>
      </div>
    </section>
  )
}
