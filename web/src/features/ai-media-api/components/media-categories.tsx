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
  Image01Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  LiveModelCatalog,
  LiveModelSummary,
} from '@/features/live-model-catalog/types'
import { trackEvent } from '@/lib/analytics'

import { AI_MEDIA_RESOURCE_EVENT } from '../lib/landing'

const MAX_DISPLAYED_MODELS = 3

const IMAGE_ENDPOINT_LABEL = 'POST /v1/images/generations'
const VIDEO_ENDPOINT_LABEL = 'POST /v1/video/generations (async)'

/**
 * Compact, dual-capability live catalog. The header carries the section
 * title and the Pricing CTA side-by-side; the two equal-height cards
 * below expose the image and video capabilities, the dynamic model
 * count, the first three (reversed) model names, the example model, and
 * the stable endpoint label. No new colors, gradients, glassmorphism,
 * or self-drawn SVG. Every color comes from the existing theme tokens.
 */
export function MediaCategories(props: {
  catalog: LiveModelCatalog
}): ReactElement {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby='ai-media-categories-title'
      data-testid='ai-media-categories'
      className='bg-muted/30 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-8'>
        <header className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6'>
          <div className='flex flex-col gap-2'>
            <h2
              id='ai-media-categories-title'
              className='text-2xl font-bold md:text-3xl'
            >
              {t('One integration across image and video')}
            </h2>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              {t(
                'Browse currently available media models and start from the documented endpoint.'
              )}
            </p>
          </div>
          <div className='shrink-0'>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='/pricing' />}
              onClick={() =>
                trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                  resource: 'pricing',
                  location: 'categories',
                })
              }
              data-testid='ai-media-categories-pricing'
            >
              <HugeiconsIcon
                icon={ChartLineData01Icon}
                aria-hidden='true'
                data-icon='inline-start'
              />
              {t('View live pricing and availability')}
            </Button>
          </div>
        </header>

        <div
          className='grid gap-4 sm:grid-cols-2'
          data-testid='ai-media-categories-grid'
        >
          <MediaCategoryCard
            kind='image'
            icon={Image01Icon}
            catalog={props.catalog}
            endpointLabel={IMAGE_ENDPOINT_LABEL}
          />
          <MediaCategoryCard
            kind='video'
            icon={Video01Icon}
            catalog={props.catalog}
            endpointLabel={VIDEO_ENDPOINT_LABEL}
          />
        </div>
      </div>
    </section>
  )
}

interface MediaCategoryCardProps {
  kind: 'image' | 'video'
  icon: IconSvgElement
  catalog: LiveModelCatalog
  endpointLabel: string
}

function MediaCategoryCard(props: MediaCategoryCardProps): ReactElement {
  const { t } = useTranslation()
  return (
    <article
      aria-labelledby={`ai-media-category-${props.kind}-title`}
      data-testid={`ai-media-category-${props.kind}`}
      className='flex h-full flex-col'
    >
      <Card className='flex h-full flex-col'>
        <CardHeader>
          <div className='flex items-start gap-3'>
            <IconBadge tone='primary' size='md'>
              <HugeiconsIcon icon={props.icon} aria-hidden='true' />
            </IconBadge>
            <div className='flex flex-col gap-1'>
              <h3
                id={`ai-media-category-${props.kind}-title`}
                className='text-base leading-snug font-medium'
              >
                {t(
                  props.kind === 'image'
                    ? 'Image generation'
                    : 'Video generation'
                )}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t(
                  props.kind === 'image'
                    ? 'Generation and editing through documented endpoints.'
                    : 'Text-to-video and image-to-video async task workflows.'
                )}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className='flex flex-1 flex-col gap-3'>
          <CategoryModelList
            status={props.catalog.status}
            kind={props.kind}
            models={
              props.kind === 'image'
                ? props.catalog.imageModels
                : props.catalog.videoModels
            }
            example={
              props.kind === 'image'
                ? props.catalog.exampleImageModel
                : props.catalog.exampleVideoModel
            }
          />

          <p
            className='text-muted-foreground font-mono text-xs break-all'
            data-testid={`ai-media-category-${props.kind}-endpoint`}
          >
            {props.endpointLabel}
          </p>

          <div className='mt-auto pt-2'>
            <Button
              variant='ghost'
              size='sm'
              render={<Link to='/docs/$slug' params={{ slug: props.kind }} />}
              onClick={() =>
                trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                  resource: 'docs',
                  location: 'categories',
                })
              }
              data-testid={`ai-media-category-${props.kind}-docs`}
            >
              {t('Read API documentation')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </article>
  )
}

interface CategoryModelListProps {
  status: LiveModelCatalog['status']
  kind: 'image' | 'video'
  models: LiveModelSummary[]
  example: LiveModelSummary | null
}

function CategoryModelList(props: CategoryModelListProps): ReactElement {
  const { t } = useTranslation()
  if (props.status === 'loading') {
    return (
      <div
        role='status'
        aria-live='polite'
        data-testid={`ai-media-category-${props.kind}-loading`}
        className='flex flex-col gap-2'
      >
        <Skeleton className='h-3 w-32' />
        <Skeleton className='h-3 w-48' />
        <Skeleton className='h-3 w-40' />
        <span className='sr-only'>{t('Live media catalog is loading…')}</span>
      </div>
    )
  }
  if (props.status === 'error') {
    return (
      <div
        role='alert'
        data-testid={`ai-media-category-${props.kind}-error`}
        className='text-muted-foreground text-xs'
      >
        {t(
          'Live media catalog is unavailable. Use Docs or Pricing to inspect the current model list.'
        )}
      </div>
    )
  }
  if (props.status === 'empty' || props.models.length === 0) {
    return (
      <div
        role='status'
        data-testid={`ai-media-category-${props.kind}-empty`}
        className='text-muted-foreground text-xs'
      >
        {t('Live media catalog is currently empty.')}
      </div>
    )
  }
  // The catalog spec: "最多展示倒序后的前 3 个当前可用模型名". The example
  // model IS the first element of the reversed list, so it naturally
  // appears at the head of the displayed (reversed, capped) selection.
  const reversed = [...props.models].reverse()
  const displayed = reversed.slice(0, MAX_DISPLAYED_MODELS)
  const countLabelKey =
    props.kind === 'image'
      ? 'Currently available image models: {{count}}'
      : 'Currently available video models: {{count}}'
  return (
    <div
      data-testid={`ai-media-category-${props.kind}-list`}
      className='flex flex-col gap-1.5'
    >
      <p className='text-foreground text-xs font-medium'>
        {t(countLabelKey, { count: props.models.length })}
      </p>
      <ul className='flex flex-wrap items-center gap-1.5'>
        {displayed.map((model) => {
          const isExample = props.example?.model_name === model.model_name
          return (
            <li key={model.model_name} className='flex items-center gap-1'>
              <Badge
                variant='secondary'
                className='bg-muted text-foreground max-w-full font-mono text-[11px] break-all'
              >
                {model.model_name}
              </Badge>
              {isExample && (
                <span
                  className='text-muted-foreground text-[10px] font-medium tracking-wide uppercase'
                  data-testid={`ai-media-category-${props.kind}-example-badge`}
                >
                  {t('Example model')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
