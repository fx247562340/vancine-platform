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
import { Alert02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiveModelCatalog } from '@/features/live-model-catalog/hooks/use-live-model-catalog'
import type {
  LiveModelCatalog,
  LiveModelSummary,
} from '@/features/live-model-catalog/types'

import { DocsCodeBlock } from '../components/code-block'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import { getPricingUrl } from '../lib/base-url'
import { getModelEntryByModelId } from '../lib/model-registry'
import type { TocHeading } from '../types'

type CatalogStatus = LiveModelCatalog['status']

export default function ModelsPage(props: { baseUrl: string }): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const pricingUrl = getPricingUrl(props.baseUrl)

  // Single call to the live catalog hook. The catalog state is forwarded
  // to every child section, so we never refetch per-section.
  const { catalog, refetch } = useLiveModelCatalog()

  const textCount = catalog.textModels.length
  const imageCount = catalog.imageModels.length
  const videoCount = catalog.videoModels.length

  const headings = useMemo<TocHeading[]>(
    () => [
      { id: 'models-title', title: t('models.title'), level: 2 },
      {
        id: 'models-text',
        title: t('models.textModelsTitle', { count: textCount }),
        level: 3,
      },
      {
        id: 'models-image',
        title: t('models.imageModelsTitle', { count: imageCount }),
        level: 3,
      },
      {
        id: 'models-video',
        title: t('models.videoModelsTitle', { count: videoCount }),
        level: 3,
      },
      {
        id: 'models-image-detail',
        title: t('models.imageLinksTitle'),
        level: 3,
      },
      {
        id: 'models-video-detail',
        title: t('models.videoLinksTitle'),
        level: 3,
      },
    ],
    [t, textCount, imageCount, videoCount]
  )
  useRegisterHeadings(headings)

  // Retry uses a single refetch call only — it never stacks with
  // invalidateQueries so the network and the cache both see one event.
  const handleRetry = (): void => {
    void refetch()
  }

  return (
    <div data-testid='docs-models-page'>
      <DocsH2 id='models-title'>{t('models.title')}</DocsH2>
      <DocsP>{t('models.desc')}</DocsP>
      <DocsCodeBlock
        code={`curl ${pricingUrl}`}
        title={t('models.fetchPricing')}
        language='bash'
      />

      <DocsH3 id='models-text'>
        {t('models.textModelsTitle', { count: textCount })}
      </DocsH3>
      <TextCategorySection
        status={catalog.status}
        models={catalog.textModels}
        onRetry={handleRetry}
      />

      <DocsH3 id='models-image'>
        {t('models.imageModelsTitle', { count: imageCount })}
      </DocsH3>
      <MediaCategorySection
        kind='image'
        status={catalog.status}
        models={catalog.imageModels}
        onRetry={handleRetry}
      />

      <DocsH3 id='models-image-detail'>{t('models.imageLinksTitle')}</DocsH3>
      <MediaDetailLinks
        kind='image'
        status={catalog.status}
        models={catalog.imageModels}
      />

      <DocsH3 id='models-video'>
        {t('models.videoModelsTitle', { count: videoCount })}
      </DocsH3>
      <MediaCategorySection
        kind='video'
        status={catalog.status}
        models={catalog.videoModels}
        onRetry={handleRetry}
      />

      <DocsH3 id='models-video-detail'>{t('models.videoLinksTitle')}</DocsH3>
      <MediaDetailLinks
        kind='video'
        status={catalog.status}
        models={catalog.videoModels}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text category
// ---------------------------------------------------------------------------

function TextCategorySection(props: {
  status: CatalogStatus
  models: LiveModelSummary[]
  onRetry: () => void
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })

  if (props.status === 'loading') {
    return <TextSkeleton />
  }
  if (props.status === 'error') {
    return (
      <CategoryErrorCallout
        onRetry={props.onRetry}
        testId='docs-models-text-error'
      />
    )
  }
  if (props.models.length === 0) {
    return (
      <CategoryEmpty
        emptyKey='models.emptyTextBody'
        testId='docs-models-text-empty'
      />
    )
  }
  return (
    <div
      data-testid='docs-models-text-list'
      className='mb-6 flex flex-wrap gap-2'
    >
      {props.models.map((model) => (
        <Badge
          key={model.model_name}
          variant='secondary'
          className='bg-muted/40 text-foreground hover:bg-muted font-mono transition-colors'
        >
          {model.model_name}
        </Badge>
      ))}
      <span className='sr-only'>
        {t('models.textModelsTitle', { count: props.models.length })}
      </span>
    </div>
  )
}

function TextSkeleton(): ReactElement {
  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='docs-models-text-loading'
      className='mb-6 flex flex-col gap-3'
    >
      <div className='flex flex-wrap gap-2'>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((slot) => (
          <Skeleton
            key={`docs-models-text-skeleton-${slot}`}
            className='h-5 w-24'
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image / video category
// ---------------------------------------------------------------------------

interface MediaCategorySectionProps {
  kind: 'image' | 'video'
  status: CatalogStatus
  models: LiveModelSummary[]
  onRetry: () => void
}

function MediaCategorySection(props: MediaCategorySectionProps): ReactElement {
  if (props.status === 'loading') {
    return <MediaSkeleton kind={props.kind} />
  }
  if (props.status === 'error') {
    return (
      <CategoryErrorCallout
        onRetry={props.onRetry}
        testId={`docs-models-${props.kind}-error`}
      />
    )
  }
  if (props.models.length === 0) {
    return (
      <CategoryEmpty
        emptyKey={
          props.kind === 'image'
            ? 'models.emptyImageBody'
            : 'models.emptyVideoBody'
        }
        testId={`docs-models-${props.kind}-empty`}
      />
    )
  }
  return (
    <div
      data-testid={`docs-models-${props.kind}-list`}
      className='text-muted-foreground mb-6 flex flex-col gap-1 text-sm'
    >
      <p className='font-mono text-xs break-all'>
        {props.kind === 'image'
          ? 'POST /v1/images/generations'
          : 'POST /v1/video/generations (async)'}
      </p>
      <p>{props.models.map((m) => m.model_name).join(' · ')}</p>
    </div>
  )
}

function MediaSkeleton(props: { kind: 'image' | 'video' }): ReactElement {
  return (
    <div
      role='status'
      aria-live='polite'
      data-testid={`docs-models-${props.kind}-loading`}
      className='mb-6 flex flex-col gap-2'
    >
      <Skeleton className='h-4 w-32' />
      <Skeleton className='h-3 w-64' />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared callouts
// ---------------------------------------------------------------------------

function CategoryErrorCallout(props: {
  onRetry: () => void
  testId: string
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  return (
    <Alert variant='destructive' data-testid={props.testId} className='mb-6'>
      <HugeiconsIcon icon={Alert02Icon} aria-hidden='true' />
      <AlertTitle>{t('models.loadErrorTitle')}</AlertTitle>
      <AlertDescription>{t('models.loadErrorBody')}</AlertDescription>
      <div className='mt-3'>
        <Button
          size='sm'
          variant='outline'
          onClick={props.onRetry}
          data-testid='docs-models-retry'
        >
          <HugeiconsIcon icon={Refresh01Icon} aria-hidden='true' />
          {t('models.retry')}
        </Button>
      </div>
    </Alert>
  )
}

function CategoryEmpty(props: {
  emptyKey:
    | 'models.emptyTextBody'
    | 'models.emptyImageBody'
    | 'models.emptyVideoBody'
  testId: string
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  return (
    <p
      data-testid={props.testId}
      className='text-muted-foreground mb-6 text-sm'
      role='status'
    >
      {t(props.emptyKey)}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Media detail-page links
//
// Each currently online image/video model is also a /docs/models/<slug>
// detail page. The /docs/models overview exposes a short list of those
// links alongside the live-catalog section so a reader who lands here
// first can drill into a specific model without bouncing through the
// /docs/image or /docs/video pages.
// ---------------------------------------------------------------------------

function MediaDetailLinks(props: {
  kind: 'image' | 'video'
  status: CatalogStatus
  models: LiveModelSummary[]
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  if (props.status === 'loading') {
    return (
      <div
        data-testid={`docs-models-${props.kind}-detail-loading`}
        className='mb-6 flex flex-col gap-2'
      >
        <Skeleton className='h-9 w-2/3' />
        <Skeleton className='h-9 w-1/2' />
      </div>
    )
  }
  // Only show the detail links for models that have a verified contract
  // in the registry. Online models without a contract (rare) intentionally
  // do not get a link, so a reader never lands on an empty detail shell.
  const links = props.models
    .map((model) => ({
      entry: getModelEntryByModelId(model.model_name),
    }))
    .filter(
      (
        item
      ): item is {
        entry: NonNullable<ReturnType<typeof getModelEntryByModelId>>
      } => item.entry !== null
    )
  if (links.length === 0) {
    return (
      <p
        data-testid={`docs-models-${props.kind}-detail-empty`}
        className='text-muted-foreground mb-6 text-sm'
        role='status'
      >
        {props.kind === 'image'
          ? t('models.emptyImageBody')
          : t('models.emptyVideoBody')}
      </p>
    )
  }
  return (
    <div
      data-testid={`docs-models-${props.kind}-detail-list`}
      className='mb-6 flex flex-col gap-2'
    >
      {links.map(({ entry }) => (
        <Link
          key={entry.slug}
          to='/docs/models/$model'
          params={{ model: entry.slug }}
          data-testid={`docs-models-${props.kind}-detail-${entry.slug}`}
          className='border-border bg-card hover:border-primary/40 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors'
        >
          <span className='flex items-center gap-2'>
            <code className='text-primary font-mono text-[13px]'>
              {entry.modelId}
            </code>
            <Badge variant='outline'>{t('modelDetail.status.live')}</Badge>
          </span>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('models.detailLink')} →
          </span>
        </Link>
      ))}
    </div>
  )
}
