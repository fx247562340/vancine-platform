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
  buildVideoOverviewBody,
  renderApiSamples,
  resolveVideoExampleModelId,
} from '../lib/example-generation'
import { getModelEntryByModelId } from '../lib/model-registry'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

const CODE_TAB_ORDER = ['curl', 'python', 'node'] as const

const STATUS_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  queued: 'secondary',
  NOT_START: 'outline',
  SUBMITTED: 'secondary',
  QUEUED: 'secondary',
  IN_PROGRESS: 'secondary',
  SUCCESS: 'default',
  FAILURE: 'destructive',
}

/**
 * /docs/video — overview page for video generation.
 *
 * The model list is EXCLUSIVELY the live pricing catalog. The page
 * documents only the shared async task lifecycle and the common
 * model/prompt fields; every wire-specific field (duration vs
 * seconds, size vs metadata.resolution, reference slots) lives on
 * the per-model detail page. The example body is produced by the
 * production serializer (buildVideoGenerationRequest).
 */
export default function VideoPage(props: { baseUrl: string }): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl
  const { catalog, refetch } = useLiveModelCatalog()

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'video-title', title: t('video.title'), level: 2 },
        { id: 'video-models', title: t('video.modelsHeading'), level: 3 },
        { id: 'video-common', title: t('video.commonParamsTitle'), level: 3 },
        { id: 'video-status', title: t('video.statusTitle'), level: 3 },
        { id: 'video-examples', title: t('video.examplesTitle'), level: 3 },
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
        description: t('video.commonParams.model'),
      },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: t('video.commonParams.prompt'),
      },
    ],
    [t]
  )

  // The overview example is the minimum legal request (model + prompt)
  // shared by every video model. The per-model /docs/models/<slug>
  // page renders the model-specific contract (with the matching
  // duration / seconds / size / resolution / metadata.content fields)
  // through buildVideoExampleBody, so the overview can stay neutral
  // and never pin a wire field that doesn't apply to every model.
  const exampleBody = useMemo<Record<string, unknown>>(
    () =>
      buildVideoOverviewBody(
        resolveVideoExampleModelId(
          catalog.status === 'ready' ? catalog.videoModels : []
        )
      ),
    [catalog]
  )
  const codeTabItems = useMemo(
    () =>
      buildCodeTabItems(
        renderApiSamples(baseUrl, '/video/generations', exampleBody, 'async'),
        CODE_TAB_ORDER,
        CODE_LANGUAGES
      ),
    [baseUrl, exampleBody]
  )

  const pollStatusRows: ReadonlyArray<readonly [string, string]> = [
    ['NOT_START', t('video.status.notStart')],
    ['SUBMITTED', t('video.status.submitted')],
    ['QUEUED', t('video.status.queued')],
    ['IN_PROGRESS', t('video.status.inProgress')],
    ['SUCCESS', t('video.status.success')],
    ['FAILURE', t('video.status.failure')],
  ]

  return (
    <div data-testid='docs-video-page'>
      <DocsH2 id='video-title'>{t('video.title')}</DocsH2>
      <DocsEndpoint
        method='POST'
        path='/v1/video/generations'
        desc={t('video.endpointSubmit')}
      />
      <DocsEndpoint
        method='GET'
        path='/v1/video/generations/{id}'
        desc={t('video.endpointPoll')}
      />
      <DocsP>{t('video.intro')}</DocsP>

      <DocsH3 id='video-models'>{t('video.modelsHeading')}</DocsH3>
      <DocsP>{t('video.modelsIntro')}</DocsP>
      <DocsCallout type='warning'>{t('video.modelsDiffer')}</DocsCallout>
      <OnlineVideoModels
        status={catalog.status}
        models={catalog.videoModels}
        onRetry={() => void refetch()}
      />

      <DocsH3 id='video-common'>{t('video.commonParamsTitle')}</DocsH3>
      <DocsP>{t('video.commonParamsDesc')}</DocsP>
      <DocsParamTable params={commonParams} />
      <DocsCallout type='info'>{t('video.metadataCallout')}</DocsCallout>

      <DocsH3 id='video-status'>{t('video.statusTitle')}</DocsH3>
      <p className='mb-2 text-sm font-medium'>
        {t('video.status.submitHeading')}
      </p>
      <div
        data-testid='docs-video-status-submit'
        className='border-border mb-4 flex items-center gap-2 rounded-md border p-2 text-sm'
      >
        <Badge variant={STATUS_BADGE_VARIANT.queued}>queued</Badge>
        <span className='text-muted-foreground'>
          {t('video.status.submitQueued')}
        </span>
      </div>
      <p className='mb-2 text-sm font-medium'>
        {t('video.status.pollHeading')}
      </p>
      <div
        data-testid='docs-video-status-table'
        className='mb-4 flex flex-col gap-1'
      >
        {pollStatusRows.map(([status, meaning]) => (
          <div
            key={status}
            className='border-border flex items-center gap-2 rounded-md border p-2 text-sm'
            data-testid={`docs-video-status-${status}`}
          >
            <Badge variant={STATUS_BADGE_VARIANT[status] ?? 'secondary'}>
              {status}
            </Badge>
            <span className='text-muted-foreground'>{meaning}</span>
          </div>
        ))}
      </div>

      <DocsH3 id='video-examples'>{t('video.examplesTitle')}</DocsH3>
      <DocsP>{t('video.examplesIntro')}</DocsP>
      <DocsCodeTabs items={codeTabItems} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Online models list — live catalog states only.
// ---------------------------------------------------------------------------

function OnlineVideoModels(props: {
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
        data-testid='docs-video-models-loading'
        className='mb-4 flex flex-col gap-2'
      >
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-2/3' />
      </div>
    )
  }
  if (props.status === 'error') {
    return (
      <Alert
        variant='destructive'
        data-testid='docs-video-models-error'
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
            data-testid='docs-video-models-retry'
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
        data-testid='docs-video-models-empty'
        className='text-muted-foreground mb-4 text-sm'
        role='status'
      >
        {t('models.emptyVideoBody')}
      </p>
    )
  }
  return (
    <div
      data-testid='docs-video-models-list'
      className='mb-6 flex flex-col gap-2'
    >
      {props.models.map((model) => {
        const entry = getModelEntryByModelId(model.model_name)
        if (!entry) {
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
            data-testid={`docs-video-model-link-${entry.slug}`}
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
