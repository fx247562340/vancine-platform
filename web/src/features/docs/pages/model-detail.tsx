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
import { Link } from '@tanstack/react-router'
import { useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useLiveModelCatalog } from '@/features/live-model-catalog/hooks/use-live-model-catalog'
import { usePageMetadata } from '@/hooks/use-page-metadata'

import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems } from '../lib/code-tabs'
import {
  buildImageExampleBody,
  buildVideoExampleBody,
  renderApiSamples,
  renderSentences,
  type CodeTab,
} from '../lib/example-generation'
import {
  buildVideoParamRows,
  getImageContract,
  getModelEntry,
  getVideoContract,
  type ImageParamRow,
  type ModelSlugEntry,
} from '../lib/model-registry'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

const VANCINE_ORIGIN = 'https://vancine.com'

/**
 * The single generic /docs/models/<slug> detail page. Every
 * model-specific fact comes from the registry and the shared example
 * generator; the page adds no per-model branching.
 */
export default function ModelDetailPage(props: {
  slug: string
  baseUrl: string
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const entry = getModelEntry(props.slug)
  if (!entry) {
    // The layout's registry lookup is the real gate; this guard only
    // makes the invariant explicit for future callers.
    throw new Error(`Unknown model slug: ${props.slug}`)
  }

  const { catalog } = useLiveModelCatalog()
  const onlineIds =
    catalog.status === 'ready'
      ? (entry.modality === 'image'
          ? catalog.imageModels
          : catalog.videoModels
        ).map((model) => model.model_name)
      : null

  const canonical = `${VANCINE_ORIGIN}/docs/models/${entry.slug}`
  const title = t('modelDetail.meta.title', { modelId: entry.modelId })
  const description = t('modelDetail.meta.description', {
    summary: t(entry.summaryKey),
  })
  usePageMetadata(
    useMemo(
      () => ({
        title,
        description,
        ogTitle: title,
        ogDescription: description,
        ogUrl: canonical,
        canonical,
        twitterTitle: title,
        twitterDescription: description,
      }),
      [title, description, canonical]
    ),
    { publicMarketingPage: true }
  )

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'model-detail-title', title: entry.modelId, level: 2 },
        { id: 'model-modes', title: t('modelDetail.sections.modes'), level: 3 },
        {
          id: 'model-endpoint',
          title: t('modelDetail.sections.endpoint'),
          level: 3,
        },
        {
          id: 'model-params',
          title: t('modelDetail.sections.params'),
          level: 3,
        },
        {
          id: 'model-examples',
          title: t('modelDetail.sections.examples'),
          level: 3,
        },
        {
          id: 'model-verify',
          title: t('modelDetail.sections.verify'),
          level: 3,
        },
        {
          id: 'model-pricing',
          title: t('modelDetail.sections.pricing'),
          level: 3,
        },
      ],
      [entry.modelId, t]
    )
  )

  return (
    <div data-testid='docs-model-detail' data-model-slug={entry.slug}>
      <DocsH2 id='model-detail-title'>{entry.modelId}</DocsH2>
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        <Badge variant='secondary' className='font-mono'>
          {entry.modelId}
        </Badge>
        <Badge variant='outline'>
          {t(`modelDetail.kind.${entry.modality}`)}
        </Badge>
        <OnlineStatusBadge onlineIds={onlineIds} modelId={entry.modelId} />
      </div>
      <DocsP data-testid='docs-model-summary'>{t(entry.summaryKey)}</DocsP>
      <DocsP>{t(entry.descriptionKey)}</DocsP>

      <DocsH3 id='model-modes'>{t('modelDetail.sections.modes')}</DocsH3>
      <div data-testid='docs-model-modes' className='mb-4 flex flex-wrap gap-2'>
        {entry.modes.map((mode) => (
          <Badge key={mode} variant='secondary' className='font-mono'>
            {t(`modelDetail.mode.${toModeKey(mode)}`)}
          </Badge>
        ))}
      </div>

      <DocsH3 id='model-endpoint'>{t('modelDetail.sections.endpoint')}</DocsH3>
      {entry.modality === 'image' ? (
        <>
          <DocsEndpoint method='POST' path='/v1/images/generations' />
          <DocsP>{t('modelDetail.imageDesc')}</DocsP>
        </>
      ) : (
        <>
          <DocsEndpoint
            method='POST'
            path='/v1/video/generations'
            desc={t('modelDetail.videoSubmit')}
          />
          <DocsEndpoint
            method='GET'
            path='/v1/video/generations/{id}'
            desc={t('modelDetail.videoPoll')}
          />
          <DocsP>{t('modelDetail.videoDesc')}</DocsP>
        </>
      )}

      <DocsH3 id='model-params'>{t('modelDetail.sections.params')}</DocsH3>
      <ParameterSection entry={entry} />

      <DocsH3 id='model-examples'>{t('modelDetail.sections.examples')}</DocsH3>
      <ExampleSection entry={entry} baseUrl={props.baseUrl} />

      <DocsH3 id='model-verify'>{t('modelDetail.sections.verify')}</DocsH3>
      <p className='text-muted-foreground mb-2 text-sm'>
        {t('modelDetail.verifiedOn', { date: entry.verifiedOn })}
      </p>
      <ul
        data-testid='docs-model-sources'
        className='text-muted-foreground mb-4 list-disc space-y-1 pl-5 text-sm'
      >
        {entry.sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary font-medium underline underline-offset-4'
            >
              {t(source.labelKey)}
            </a>
          </li>
        ))}
      </ul>

      <DocsH3 id='model-pricing'>{t('modelDetail.sections.pricing')}</DocsH3>
      <DocsP>{t('modelDetail.pricingDesc')}</DocsP>
      <p className='font-mono text-[13px] break-all'>
        <Link
          to='/pricing'
          className='text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors'
        >
          {VANCINE_ORIGIN}/pricing
        </Link>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge — theme tokens only (Badge variants), no hardcoded palette.
// ---------------------------------------------------------------------------

function OnlineStatusBadge(props: {
  onlineIds: ReadonlyArray<string> | null
  modelId: string
}): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  if (props.onlineIds === null) {
    return (
      <Badge variant='outline' data-testid='docs-model-status-unconfirmed'>
        {t('modelDetail.status.unconfirmed')}
      </Badge>
    )
  }
  if (props.onlineIds.includes(props.modelId)) {
    return (
      <Badge variant='default' data-testid='docs-model-status-live'>
        {t('modelDetail.status.live')}
      </Badge>
    )
  }
  return (
    <Badge variant='destructive' data-testid='docs-model-status-offline'>
      {t('modelDetail.status.offline')}
    </Badge>
  )
}

/** Map the wire mode id (`text-to-image`) to its i18n key leaf. */
function toModeKey(mode: string): string {
  return mode.replaceAll(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

// ---------------------------------------------------------------------------
// Parameter section
// ---------------------------------------------------------------------------

function ParameterSection(props: { entry: ModelSlugEntry }): ReactElement {
  if (props.entry.modality === 'image') {
    return <ImageParameterSection modelId={props.entry.modelId} />
  }
  return <VideoParameterSection modelId={props.entry.modelId} />
}

function toParamRows(
  rows: ReadonlyArray<ImageParamRow>,
  t: (key: string, interp?: Record<string, unknown>) => string
): ParamRow[] {
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    required: row.required,
    description: renderSentences(row.description, t),
  }))
}

function ImageParameterSection(props: { modelId: string }): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const contract = getImageContract(props.modelId)
  if (!contract) {
    return <DocsP>{t('modelDetail.contractMissing')}</DocsP>
  }
  return (
    <div data-testid='docs-model-image-params'>
      <DocsParamTable params={toParamRows(contract.params, t)} />
      {contract.notes.length > 0 && (
        <div
          data-testid='docs-model-image-notes'
          className='mb-4 flex flex-col gap-2'
        >
          {contract.notes.map((note) => (
            <DocsCallout key={note.key} type='warning'>
              {t(note.key, note.interp)}
            </DocsCallout>
          ))}
        </div>
      )}
    </div>
  )
}

function VideoParameterSection(props: { modelId: string }): ReactElement {
  const { t } = useTranslation('docs', { useSuspense: false })
  const video = getVideoContract(props.modelId)
  if (!video) {
    return <DocsP>{t('modelDetail.contractMissing')}</DocsP>
  }
  const rows = buildVideoParamRows(video.capability)
  return (
    <div data-testid='docs-model-video-params'>
      <DocsParamTable params={toParamRows(rows, t)} />
      {video.notes.length > 0 && (
        <div
          data-testid='docs-model-video-notes'
          className='mb-4 flex flex-col gap-2'
        >
          {video.notes.map((note) => (
            <DocsCallout key={note.key} type='warning'>
              {t(note.key, note.interp)}
            </DocsCallout>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Example section — bodies from the shared generator, snippets from the
// shared renderer. No per-model branching.
// ---------------------------------------------------------------------------

function ExampleSection(props: {
  entry: ModelSlugEntry
  baseUrl: string
}): ReactElement {
  if (props.entry.modality === 'image') {
    const body = buildImageExampleBody(props.entry.modelId)
    return (
      <DocsCodeTabs
        items={buildCodeTabItems(
          renderApiSamples(props.baseUrl, '/images/generations', body, 'sync'),
          CODE_TAB_ORDER,
          CODE_LANGUAGES
        )}
      />
    )
  }
  const body = buildVideoExampleBody(props.entry.modelId)
  const safeBody: Record<string, unknown> = body ?? {
    model: props.entry.modelId,
    prompt: '',
  }
  return (
    <DocsCodeTabs
      items={buildCodeTabItems(
        renderApiSamples(
          props.baseUrl,
          '/video/generations',
          safeBody,
          body ? 'async' : 'sync'
        ),
        CODE_TAB_ORDER,
        CODE_LANGUAGES
      )}
    />
  )
}
