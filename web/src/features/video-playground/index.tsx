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
import { Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
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

import { ApiKeySelect } from './components/api-key-select'
import { RecentTaskList } from './components/recent-task-list'
import {
  VideoComposer,
  type VideoComposerSubmitRequest,
} from './components/video-composer'
import { VideoPreview } from './components/video-preview'
import { useSubmissionSettings } from './hooks/use-submission-settings'
import { useVideoConnection } from './hooks/use-video-connection'
import { useVideoModels } from './hooks/use-video-models'
import { useVideoApiSecret } from './hooks/use-video-secret'
import { useVideoSubmission } from './hooks/use-video-submission'
import { useVisibleTasks } from './hooks/use-visible-tasks'
import type { VideoComposerValues } from './lib/composer-schema'
import { videoPlaygroundErrorText } from './lib/errors'
import { resolveVideoModelCapability } from './lib/model-capabilities'
import { clearAllTaskApiKeys } from './lib/task-key-registry'
import { useResourceStore } from './lib/use-resource-store'

/**
 * The video studio.
 *
 * The page owns everything that must outlive a control: the API key selection,
 * the model list, the reference-image bytes, the submission queue and which task
 * the preview is showing. The composer owns only the form. That split is what
 * lets a model or key switch reset the form while every accepted task keeps
 * polling with the key it was submitted with.
 */
export function VideoPlayground() {
  const { t, i18n } = useTranslation()
  const [model, setModel] = useState('')
  const [selectFirstModel, setSelectFirstModel] = useState(true)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(null)
  const [restore, setRestore] = useState<VideoComposerValues | null>(null)

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

  // One submission pipeline for the whole page, mounted exactly once, so a model
  // or key switch can never drop an in-flight POST, an accepted task id or a
  // terminal task.
  const submission = useVideoSubmission({
    keyId,
    language: i18n.language,
    loadSecret,
  })
  const resourceStore = useResourceStore()
  const modelsQuery = useVideoModels(keyId, loadSecret)

  // Leaving the page ends every in-flight task's relevance here: drop all
  // task-bound in-memory API keys on unmount. Terminal tasks already cleared
  // their own key; this covers anything still queued/running. Key switching
  // (clearSecret) deliberately does NOT clear these — tasks that already have a
  // task id keep polling with their own submit-time key.
  useEffect(() => () => clearAllTaskApiKeys(), [])

  // Server order is authoritative: on first load and after every key switch the
  // page takes the first video model the key returns, and never remembers a
  // previous choice. A refetch for the same key (a language switch) leaves the
  // user's selection alone.
  useEffect(() => {
    if (!selectFirstModel || !modelsQuery.isFetched) {
      return
    }
    setSelectFirstModel(false)
    setModel(modelsQuery.models[0]?.value ?? '')
  }, [selectFirstModel, modelsQuery.isFetched, modelsQuery.models])

  const capability = useMemo(() => resolveVideoModelCapability(model), [model])

  const visibleTasks = useVisibleTasks(submission.tasks)
  const visibleIds = visibleTasks.map((task) => task.id)
  const settingsStore = useSubmissionSettings(visibleIds)

  const selectedSubmission =
    submission.tasks.find((task) => task.id === selectedSubmissionId) ?? null
  const latestSubmission = submission.tasks.at(-1)
  const submitErrorText =
    latestSubmission?.status === 'failed' && latestSubmission.submitError
      ? videoPlaygroundErrorText(latestSubmission.submitError, t)
      : null

  const canSubmit =
    keysIsFetched &&
    !keysIsError &&
    keyId != null &&
    modelsQuery.isFetched &&
    !modelsQuery.isError &&
    modelsQuery.models.length > 0 &&
    Boolean(model)

  const handleModelChange = (nextModel: string) => {
    if (nextModel === model) {
      return
    }
    setModel(nextModel)
    resourceStore.reset()
  }

  const handleKeyIdChange = (nextKeyId: number) => {
    if (nextKeyId === keyId) {
      return
    }
    clearSecret()
    setKeyId(nextKeyId)
    setSelectFirstModel(true)
    resourceStore.reset()
  }

  const handleSubmit = (request: VideoComposerSubmitRequest) => {
    const submissionId = submission.start({
      body: request.body,
      modelId: request.settings.modelId,
      promptPreview: request.settings.prompt,
      batchSize: 1,
    })
    settingsStore.retain(submissionId, request.settings)
    // A freshly submitted task is always the one the user wants to watch.
    setSelectedSubmissionId(submissionId)
  }

  const handleRestoreSettings = () => {
    if (!selectedSubmission) {
      return
    }
    const settings = settingsStore.settings[selectedSubmission.id]
    if (!settings) {
      return
    }
    resourceStore.reset()
    for (const image of settings.images) {
      resourceStore.addImage(image)
    }
    setModel(settings.modelId)
    setRestore({
      prompt: settings.prompt,
      duration: settings.duration,
      resolution: settings.resolution,
    })
  }

  const noKeys = keysIsFetched && !keysIsError && keys.length === 0
  const noModels =
    !noKeys &&
    keyId != null &&
    modelsQuery.isFetched &&
    modelsQuery.models.length === 0

  return (
    <div
      data-testid='video-playground-page'
      className='flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto'
    >
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6'>
        <MediaPlaygroundHeader
          title={t('Video generation')}
          subtitle={t(
            'Generate videos from text or a reference image with the video models available to this API key.'
          )}
          active='video'
          status={
            <ApiKeySelect
              keys={keys}
              selectedId={keyId}
              onChange={handleKeyIdChange}
              isLoading={keysIsLoading}
            />
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

        <div className='grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:items-start'>
          <div className='flex min-w-0 flex-col gap-4'>
            {noKeys ? (
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

            {noModels ? (
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
                    {t('This API key has no video models.')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {!noKeys && !noModels ? (
              <VideoComposer
                capability={capability}
                models={modelsQuery.models}
                modelId={model}
                onModelChange={handleModelChange}
                modelsDisabled={modelsQuery.isLoading || keyId == null}
                keyId={keyId}
                resourceStore={resourceStore}
                canSubmit={canSubmit}
                isSubmitting={submission.isBusy}
                submitErrorText={submitErrorText}
                restore={restore}
                onSubmit={handleSubmit}
              />
            ) : null}
          </div>

          <div className='flex min-w-0 flex-col gap-5'>
            <VideoPreview
              submission={selectedSubmission}
              canRestore={
                selectedSubmission != null &&
                settingsStore.settings[selectedSubmission.id] !== undefined
              }
              onRestoreSettings={handleRestoreSettings}
            />
            <RecentTaskList
              tasks={visibleTasks}
              selectedId={selectedSubmissionId}
              onSelect={setSelectedSubmissionId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
