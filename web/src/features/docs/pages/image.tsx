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

import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems } from '../lib/code-tabs'
import {
  buildImageOverviewBody,
  renderApiSamples,
  resolveImageExampleModelId,
} from '../lib/example-generation'
import { getModelEntryByModelId } from '../lib/model-registry'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

const CODE_TAB_ORDER = ['curl', 'python', 'node'] as const

/**
 * /docs/image — overview page for image generation.
 *
 * The model list is EXCLUSIVELY the live pricing catalog: `ready`
 * shows the models the platform currently advertises (with a detail
 * link when the registry has a verified contract), `empty` shows a
 * real empty state, and `error` shows an explicit retry callout. A
 * static registry list is never rendered as "currently online".
 */
export default function ImagePage(props: { baseUrl: string }): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl
  const { catalog, refetch } = useLiveModelCatalog()

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'image-title', title: t('image.title'), level: 2 },
        { id: 'image-models', title: t('image.modelsHeading'), level: 3 },
        { id: 'image-common', title: t('image.commonParamsTitle'), level: 3 },
        { id: 'image-examples', title: t('image.examplesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const commonParams = useMemo<ParamRow[]>(
    () => [
      {
        name: 'model',
        type: 'string',
        required: true,
        description: t('image.commonParams.model'),
      },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: t('image.commonParams.prompt'),
      },
      {
        name: 'n',
        type: 'integer',
        required: false,
        description: t('image.commonParams.n'),
      },
      {
        name: 'size',
        type: 'string',
        required: false,
        description: t('image.commonParams.size'),
      },
      {
        name: 'response_format',
        type: 'string',
        required: false,
        description: t('image.commonParams.responseFormat'),
      },
      {
        name: 'watermark',
        type: 'boolean',
        required: false,
        description: t('image.commonParams.watermark'),
      },
      {
        name: 'image',
        type: 'string/array',
        required: false,
        description: t('image.commonParams.image'),
      },
    ],
    [t]
  )

  // The overview example is the minimum legal request (model + prompt)
  // shared by every image model; the per-model /docs/models/<slug>
  // page renders the model-specific contract via buildImageExampleBody.
  const exampleBody = useMemo(
    () =>
      buildImageOverviewBody(
        resolveImageExampleModelId(
          catalog.status === 'ready' ? catalog.imageModels : []
        )
      ),
    [catalog]
  )
  const codeTabItems = useMemo(
    () =>
      buildCodeTabItems(
        renderApiSamples(baseUrl, '/images/generations', exampleBody, 'sync'),
        CODE_TAB_ORDER,
        CODE_LANGUAGES
      ),
    [baseUrl, exampleBody]
  )

  return (
    <div data-testid='docs-image-page'>
      <DocsH2 id='image-title'>{t('image.title')}</DocsH2>
      <DocsEndpoint method='POST' path='/v1/images/generations' />
      <DocsP>{t('image.intro')}</DocsP>

      <DocsH3 id='image-models'>{t('image.modelsHeading')}</DocsH3>
      <DocsP>{t('image.modelsIntro')}</DocsP>
      <OnlineImageModels
        status={catalog.status}
        models={catalog.imageModels}
        onRetry={() => void refetch()}
      />

      <DocsH3 id='image-common'>{t('image.commonParamsTitle')}</DocsH3>
      <DocsP>{t('image.commonParamsDesc')}</DocsP>
      <DocsParamTable params={commonParams} />
      <DocsCallout type='info'>{t('image.advancedParamsNote')}</DocsCallout>

      <DocsH3 id='image-examples'>{t('image.examplesTitle')}</DocsH3>
      <DocsP>{t('image.examplesIntro')}</DocsP>
      <DocsCodeTabs items={codeTabItems} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Online models list — live catalog states only.
// ---------------------------------------------------------------------------

function OnlineImageModels(props: {
  status: 'loading' | 'ready' | 'empty' | 'error'
  models: ReadonlyArray<{ model_name: string }>
  onRetry: () => void
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  if (props.status === 'loading') {
    return (
      <div
        role='status'
        aria-live='polite'
        data-testid='docs-image-models-loading'
        className='mb-4 flex flex-col gap-2'
      >
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-2/3' />
      </div>
    )
  }
  if (props.status === 'error') {
    return (
      <Alert
        variant='destructive'
        data-testid='docs-image-models-error'
        className='mb-4'
      >
        <HugeiconsIcon icon={Alert02Icon} aria-hidden='true' />
        <AlertTitle>{t('models.loadErrorTitle')}</AlertTitle>
        <AlertDescription>{t('models.loadErrorBody')}</AlertDescription>
        <div className='mt-3'>
          <Button
            size='sm'
            variant='outline'
            onClick={props.onRetry}
            data-testid='docs-image-models-retry'
          >
            <HugeiconsIcon icon={Refresh01Icon} aria-hidden='true' />
            {t('models.retry')}
          </Button>
        </div>
      </Alert>
    )
  }
  if (props.models.length === 0) {
    return (
      <p
        data-testid='docs-image-models-empty'
        className='text-muted-foreground mb-4 text-sm'
        role='status'
      >
        {t('models.emptyImageBody')}
      </p>
    )
  }
  return (
    <div
      data-testid='docs-image-models-list'
      className='mb-6 flex flex-col gap-2'
    >
      {props.models.map((model) => {
        const entry = getModelEntryByModelId(model.model_name)
        if (!entry) {
          // Online but no verified contract: show the id verbatim, no
          // fabricated detail link.
          return (
            <div
              key={model.model_name}
              className='flex items-center gap-2 text-sm'
            >
              <code className='text-primary font-mono text-[13px]'>
                {model.model_name}
              </code>
              <Badge variant='outline'>{t('modelDetail.status.live')}</Badge>
            </div>
          )
        }
        return (
          <Link
            key={entry.slug}
            to='/docs/models/$model'
            params={{ model: entry.slug }}
            data-testid={`docs-image-model-link-${entry.slug}`}
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
        )
      })}
    </div>
  )
}
