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
import { BookOpen01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyableCode } from '@/features/kimi-k3-api/components/copyable-code'
import type { LiveModelCatalog } from '@/features/live-model-catalog/types'
import { trackEvent } from '@/lib/analytics'

import {
  AI_MEDIA_API_EXAMPLES,
  AI_MEDIA_RESOURCE_EVENT,
  buildAiMediaApiExample,
} from '../lib/landing'

type ApiExampleId = 'image' | 'video'

/**
 * Default Tabs value. Image is preferred when it is available. When
 * image is unavailable, video is selected. When both are unavailable
 * the component falls through to the empty state, so `null` is a
 * legitimate default.
 */
function pickInitialTabId(catalog: LiveModelCatalog): ApiExampleId | null {
  if (catalog.status !== 'ready') return 'image'
  const hasImage = catalog.imageModels.length > 0
  const hasVideo = catalog.videoModels.length > 0
  if (hasImage) return 'image'
  if (hasVideo) return 'video'
  return null
}

export function ApiExamples(props: {
  catalog: LiveModelCatalog
  onRetry: () => void
}): ReactElement {
  const { t } = useTranslation()
  const [tabValue, setTabValue] = useState<ApiExampleId>(
    () => pickInitialTabId(props.catalog) ?? 'image'
  )

  // Tab value tracks the concrete hasImage/hasVideo bits of the catalog
  // (not the whole catalog object), so a refetch that returns a new array
  // reference but the same shape does not thrash the effect.
  const status = props.catalog.status
  const hasImage = status === 'ready' && props.catalog.imageModels.length > 0
  const hasVideo = status === 'ready' && props.catalog.videoModels.length > 0

  useEffect(() => {
    setTabValue((current) => {
      if (status !== 'ready') return current
      if (current === 'image' && !hasImage && hasVideo) return 'video'
      if (current === 'video' && !hasVideo && hasImage) return 'image'
      return current
    })
  }, [status, hasImage, hasVideo])

  const availableExamples = AI_MEDIA_API_EXAMPLES.filter((example) => {
    if (status !== 'ready') return false
    if (example.id === 'image') return hasImage
    if (example.id === 'video') return hasVideo
    return false
  })

  // The section renders a single shared `<section>` shell so loading,
  // error, empty, and ready share the same heading copy. Inner states
  // differ only in the body of the shell.
  return (
    <section
      id='api-examples'
      aria-labelledby='ai-media-examples-title'
      className='mx-auto w-full max-w-4xl scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2 id='ai-media-examples-title' className='text-3xl font-bold'>
          {t('Make your first request in minutes')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Call the documented media endpoints with any HTTP client. Availability and pricing follow the live Docs and Pricing.'
          )}
        </p>
      </div>

      <div className='mt-8'>
        {renderApiExamplesBody({
          status,
          tabValue,
          setTabValue,
          availableExamples,
          catalog: props.catalog,
          onRetry: props.onRetry,
        })}
      </div>
    </section>
  )
}

interface ApiExamplesBodyProps {
  status: LiveModelCatalog['status']
  tabValue: ApiExampleId
  setTabValue: (next: ApiExampleId) => void
  availableExamples: typeof AI_MEDIA_API_EXAMPLES
  catalog: LiveModelCatalog
  onRetry: () => void
}

function renderApiExamplesBody(props: ApiExamplesBodyProps): ReactElement {
  if (props.status === 'loading') return <ApiExamplesLoading />
  if (props.status === 'error') {
    return <ApiExamplesError onRetry={props.onRetry} />
  }
  if (props.status === 'empty' || props.availableExamples.length === 0) {
    return <ApiExamplesEmpty />
  }
  return <ApiExamplesReady {...props} />
}

function ApiExamplesLoading(): ReactElement {
  const { t } = useTranslation()
  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='api-examples-loading'
      className='flex flex-col gap-3'
    >
      <Skeleton className='h-8 w-48' />
      <Skeleton className='h-40 w-full' />
      <span className='sr-only'>{t('Live media catalog is loading…')}</span>
    </div>
  )
}

function ApiExamplesError(props: { onRetry: () => void }): ReactElement {
  const { t } = useTranslation()
  return (
    <Alert
      variant='destructive'
      data-testid='api-examples-error'
      className='flex flex-col gap-3'
    >
      <div className='flex flex-col gap-1'>
        <AlertTitle>
          {t(
            'Live media catalog is unavailable. Use Docs or Pricing to inspect the current model list.'
          )}
        </AlertTitle>
        <AlertDescription>
          {t(
            'Retry the live catalog or open the authoritative Docs and Pricing pages.'
          )}
        </AlertDescription>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={props.onRetry}
          data-testid='api-examples-retry'
        >
          <HugeiconsIcon
            icon={Refresh01Icon}
            aria-hidden='true'
            data-icon='inline-start'
          />
          {t('Retry')}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          render={<Link to='/docs/$slug' params={{ slug: 'image' }} />}
        >
          <HugeiconsIcon
            icon={BookOpen01Icon}
            aria-hidden='true'
            data-icon='inline-start'
          />
          {t('Open Docs')}
        </Button>
        <Button size='sm' variant='ghost' render={<Link to='/pricing' />}>
          {t('View live pricing and availability')}
        </Button>
      </div>
    </Alert>
  )
}

function ApiExamplesEmpty(): ReactElement {
  const { t } = useTranslation()
  return (
    <div className='flex flex-col gap-4'>
      <p
        data-testid='api-examples-empty'
        className='text-muted-foreground text-sm'
        role='status'
      >
        {t('Live media catalog is currently empty.')}
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          size='sm'
          variant='ghost'
          render={<Link to='/docs/$slug' params={{ slug: 'image' }} />}
        >
          <HugeiconsIcon
            icon={BookOpen01Icon}
            aria-hidden='true'
            data-icon='inline-start'
          />
          {t('Open Docs')}
        </Button>
        <Button size='sm' variant='ghost' render={<Link to='/pricing' />}>
          {t('View live pricing and availability')}
        </Button>
      </div>
    </div>
  )
}

function ApiExamplesReady(props: ApiExamplesBodyProps): ReactElement {
  const { t } = useTranslation()
  return (
    <Tabs
      value={props.tabValue}
      onValueChange={(v: string) => {
        if (v === 'image' || v === 'video') props.setTabValue(v)
      }}
    >
      <TabsList aria-label={t('API examples')}>
        {props.availableExamples.map((example) => (
          <TabsTrigger key={example.id} value={example.id}>
            {t(example.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
      {props.availableExamples.map((example) => {
        const modelName =
          example.id === 'image'
            ? (props.catalog.exampleImageModel?.model_name ?? '')
            : (props.catalog.exampleVideoModel?.model_name ?? '')
        const code = modelName ? buildAiMediaApiExample(example, modelName) : ''
        return (
          <TabsContent key={example.id} value={example.id} className='mt-4'>
            <div
              className='flex flex-col gap-3'
              data-testid={`api-examples-${example.id}`}
            >
              <CopyableCode code={code} label={t(example.labelKey)} />
              <div>
                <Button
                  variant='outline'
                  size='sm'
                  render={
                    <Link
                      to='/docs/$slug'
                      params={{ slug: example.docsSlug }}
                    />
                  }
                  onClick={() =>
                    trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                      resource: 'docs',
                      location: 'examples',
                    })
                  }
                >
                  <HugeiconsIcon
                    icon={BookOpen01Icon}
                    aria-hidden='true'
                    data-icon='inline-start'
                  />
                  {t('Read API documentation')}
                </Button>
              </div>
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
