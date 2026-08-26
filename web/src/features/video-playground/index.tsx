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

For commercial licensing, please contact support@quantumnous.com.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { MediaPlaygroundHeader } from '@/features/media-playground/components/media-playground-header'
import { cn } from '@/lib/utils'

import { ComposerForm } from './components/composer-form'
import { ConnectionSettings } from './components/connection-settings'
import { VideoModelSelector } from './components/model-selector'
import { useVideoConnection } from './hooks/use-video-connection'
import { useVideoModels } from './hooks/use-video-models'
import { useVideoApiSecret } from './hooks/use-video-secret'
import {
  getVideoModelCapability,
  type VideoCapability,
} from './lib/capabilities'
import { videoPlaygroundErrorText } from './lib/errors'
import { videoFormSchema, type VideoFormValues } from './lib/form-schema'
import { useResourceStore } from './lib/use-resource-store'

export function VideoPlayground() {
  const { t, i18n } = useTranslation()
  const [model, setModel] = useState('')
  const [preflightError, setPreflightError] = useState<string | null>(null)

  const connection = useVideoConnection()
  const {
    selectedId: keyId,
    setSelectedId: setKeyId,
    keys,
    loadError: keysLoadError,
    isLoading: keysIsLoading,
    isFetched: keysIsFetched,
    isError: keysIsError,
  } = connection
  const secret = useVideoApiSecret()
  const { load: loadSecret, clear: clearSecret } = secret
  const modelsQuery = useVideoModels(keyId, loadSecret)
  const resourceStore = useResourceStore()

  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema),
    defaultValues: {
      prompt: '',
      mode: 'textToVideo',
      durationMode: 'fixed',
      durationSeconds: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      watermark: false,
      returnLastFrame: false,
      seed: '',
      batchCount: 1,
    },
  })

  // Auto-select the first model when models load.
  useEffect(() => {
    if (!modelsQuery.isFetched) return
    const exists = modelsQuery.models.some((item) => item.value === model)
    if (exists) return
    setModel(modelsQuery.models[0]?.value ?? '')
  }, [modelsQuery.isFetched, modelsQuery.models, model])

  const capability = useMemo(
    () => (model ? getVideoModelCapability(model) : undefined),
    [model]
  ) as VideoCapability | undefined

  // Clear stale preflight errors when the user edits the form so
  // the alert is not sticky. We subscribe once and let the
  // subscription run for the lifetime of the page.
  useEffect(() => {
    const subscription = form.watch(() => {
      if (preflightError) setPreflightError(null)
    })
    return () => subscription.unsubscribe()
  }, [form, preflightError])

  useEffect(() => {
    setPreflightError(null)
  }, [
    resourceStore.images.length,
    resourceStore.videos.length,
    resourceStore.audios.length,
  ])

  const currentMode = useWatch({ control: form.control, name: 'mode' })
  const batchCount = useWatch({ control: form.control, name: 'batchCount' })
  const durationSeconds = useWatch({
    control: form.control,
    name: 'durationSeconds',
  })
  const resolution = useWatch({ control: form.control, name: 'resolution' })

  const composition = useMemo(
    () => ({
      images: resourceStore.images.length,
      videos: resourceStore.videos.length,
      audios: resourceStore.audios.length,
      durationSeconds,
      resolution,
    }),
    [
      durationSeconds,
      resolution,
      resourceStore.audios.length,
      resourceStore.images.length,
      resourceStore.videos.length,
    ]
  )

  const handlePreflightError = (reasonKey: string) => {
    setPreflightError(reasonKey)
  }

  const canSubmit =
    keysIsFetched &&
    !keysIsError &&
    keyId != null &&
    modelsQuery.isFetched &&
    !modelsQuery.isError &&
    Boolean(model) &&
    Boolean(capability) &&
    modelsQuery.models.length > 0

  const selectedKey = keys.find((key) => key.id === keyId)
  let keyStatusLabel = t('Select an API key')
  if (selectedKey) {
    keyStatusLabel = `${selectedKey.name} · ${selectedKey.maskedKey}`
  } else if (keysIsLoading) {
    keyStatusLabel = t('Loading...')
  }

  return (
    <div
      data-testid='video-playground-page'
      className='flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto'
    >
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6'>
        <MediaPlaygroundHeader
          title={t('Video generation')}
          subtitle={t(
            'Generate videos with Seedance 2.0 / 2.5 and reference assets.'
          )}
          active='video'
          status={
            <span className='border-border/60 bg-card text-muted-foreground inline-flex h-8 max-w-full items-center gap-2 rounded-lg border px-2.5 text-xs'>
              <span
                aria-hidden
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  selectedKey ? 'bg-success' : 'bg-neutral'
                )}
              />
              <span className='truncate'>{keyStatusLabel}</span>
            </span>
          }
        />

        {keysLoadError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {videoPlaygroundErrorText(keysLoadError, t)}
            </AlertDescription>
          </Alert>
        ) : null}
        {modelsQuery.loadError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {videoPlaygroundErrorText(modelsQuery.loadError, t)}
            </AlertDescription>
          </Alert>
        ) : null}

        {keysIsFetched && keys.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <HugeiconsIcon
                  icon={Video01Icon}
                  strokeWidth={2}
                  aria-hidden
                  data-icon='empty'
                />
              </EmptyMedia>
              <EmptyTitle>{t('No API keys available')}</EmptyTitle>
              <EmptyDescription>
                {t('Create an API key to generate video.')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link to='/keys' />}>
                {t('Create API Key')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

        {keyId != null &&
        modelsQuery.isFetched &&
        modelsQuery.models.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <HugeiconsIcon
                  icon={Video01Icon}
                  strokeWidth={2}
                  aria-hidden
                  data-icon='empty'
                />
              </EmptyMedia>
              <EmptyTitle>{t('No video models available')}</EmptyTitle>
              <EmptyDescription>
                {t('This API key has no Seedance 2.0 or 2.5 models.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {capability ? (
          <ComposerForm
            form={form}
            capability={capability}
            mode={currentMode}
            composition={composition}
            resourceStore={resourceStore}
            onPreflightError={handlePreflightError}
            canSubmit={canSubmit}
            keyId={keyId}
            modelId={model}
            language={i18n.language}
            batchCount={batchCount}
            preflightError={preflightError}
            loadSecret={loadSecret}
            clearSecret={clearSecret}
            modelSelector={
              <VideoModelSelector
                compact
                models={modelsQuery.models}
                selectedModel={model}
                onChange={setModel}
                disabled={modelsQuery.isLoading || keyId == null}
              />
            }
            connection={
              <ConnectionSettings
                keys={keys}
                selectedId={keyId}
                onChange={(id) => {
                  clearSecret()
                  setModel('')
                  setKeyId(id)
                  setPreflightError(null)
                }}
                isLoading={keysIsLoading}
                disabled={false}
              />
            }
          />
        ) : null}
      </div>
    </div>
  )
}
