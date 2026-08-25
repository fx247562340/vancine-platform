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
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Form, FormField } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { submitVideoGenerationWithApiKey } from '../api'
import { useSubmitVideoRequest } from '../hooks/use-submit-video-request'
import {
  resolveVideoCapabilities,
  type ResourceComposition,
  type VideoCapability,
  type VideoResolution,
} from '../lib/capabilities'
import { CREATION_MODE_LABELS } from '../lib/composition-labels'
import { findModeEntry, supportedModesFor } from '../lib/contract'
import { VideoPlaygroundError } from '../lib/errors'
import type { VideoFormValues } from '../lib/form-schema'
import type { CreationMode } from '../lib/mode'
import { countActiveParameters } from '../lib/parameter-state'
import type { ResourceStore as UseResourceStore } from '../lib/use-resource-store'
import { BatchCountControl } from './batch-count-control'
import { ComposerSummary } from './composer-summary'
import { VideoParametersPopover } from './parameters-popover'
import { ReferenceAssetsRow } from './reference-assets-row'
import { TaskGallery } from './task-gallery'

type ComposerFormProps = {
  form: UseFormReturn<VideoFormValues>
  capability: VideoCapability
  mode: CreationMode
  composition: ResourceComposition
  resourceStore: UseResourceStore
  onPreflightError: (reasonKey: string) => void
  canSubmit: boolean
  keyId: number | null
  modelId: string
  language: string
  batchCount: number
  preflightError: string | null
  loadSecret: (id: number, signal?: AbortSignal) => Promise<string>
  clearSecret: () => void
}

/**
 * The form, resource adders, parameters popover, summary, and the
 * preflight + useSubmission pipeline all live here. The page
 * (index.tsx) only orchestrates connection / model loading.
 *
 * The full API key is held in a local closure inside the submit
 * callback of `useSubmitVideoRequest`; it never enters React
 * state, the DOM, storage, React Query, or any error message.
 */
export function ComposerForm(props: ComposerFormProps) {
  const { t } = useTranslation()
  const {
    form,
    capability,
    mode,
    composition,
    resourceStore,
    onPreflightError,
    canSubmit,
    keyId,
    modelId,
    language,
    batchCount,
    preflightError,
    loadSecret,
    clearSecret,
  } = props

  const durationMode = useWatch({ control: form.control, name: 'durationMode' })
  const durationSeconds = useWatch({
    control: form.control,
    name: 'durationSeconds',
  })
  const ratio = useWatch({ control: form.control, name: 'ratio' })
  const resolution = useWatch({ control: form.control, name: 'resolution' })
  const generateAudio = useWatch({
    control: form.control,
    name: 'generateAudio',
  })
  const seed = useWatch({ control: form.control, name: 'seed' })
  const watermark = useWatch({ control: form.control, name: 'watermark' })
  const returnLastFrame = useWatch({
    control: form.control,
    name: 'returnLastFrame',
  })

  const resolved = useMemo(
    () => resolveVideoCapabilities(capability, mode, composition),
    [capability, mode, composition]
  )

  useEffect(() => {
    if (
      !findModeEntry(mode).isModeSupportedFor(capability) &&
      mode !== 'textToVideo'
    ) {
      form.setValue('mode', 'textToVideo', { shouldValidate: true })
    }
  }, [capability, form, mode])

  useEffect(() => {
    const allowed = resolved.resolutions
    if (
      allowed.length > 0 &&
      !allowed.includes(resolution as (typeof allowed)[number])
    ) {
      const next = allowed[0] as VideoResolution | undefined
      if (next) {
        form.setValue('resolution', next, { shouldValidate: false })
      }
    }
    if (durationSeconds < resolved.duration.minSeconds) {
      form.setValue('durationSeconds', resolved.duration.minSeconds, {
        shouldValidate: false,
      })
    } else if (durationSeconds > resolved.duration.maxSeconds) {
      form.setValue('durationSeconds', resolved.duration.maxSeconds, {
        shouldValidate: false,
      })
    }
  }, [
    durationSeconds,
    form,
    resolution,
    resolved.duration.maxSeconds,
    resolved.duration.minSeconds,
    resolved.resolutions,
  ])

  const paramState = useMemo(
    () => ({
      durationMode,
      durationSeconds,
      ratio,
      resolution,
      generateAudio,
      seed,
      watermark,
      returnLastFrame,
    }),
    [
      durationMode,
      durationSeconds,
      generateAudio,
      ratio,
      resolution,
      returnLastFrame,
      seed,
      watermark,
    ]
  )

  const activeParamCount = useMemo(
    () => countActiveParameters(capability, paramState),
    [capability, paramState]
  )

  const modeItems = useMemo(
    () =>
      supportedModesFor(capability).map((item) => ({
        value: item,
        label: t(CREATION_MODE_LABELS[item]),
      })),
    [capability, t]
  )

  const submitter = useSubmitVideoRequest({
    capability,
    modelId,
    keyId,
    batchSize: batchCount,
    submit: async (body, signal) => {
      if (keyId == null) {
        throw new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'No API key',
        })
      }
      const rawKey = await loadSecret(keyId, signal)
      const response = await submitVideoGenerationWithApiKey(
        rawKey,
        body as never,
        language,
        signal
      )
      const id = response.task_id ?? response.id ?? null
      if (!id) {
        throw new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'Video generation failed',
        })
      }
      return { task_id: id, id }
    },
  })

  const handleCancelPending = () => {
    submitter.cancel()
    clearSecret()
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-3'
        onSubmit={form.handleSubmit(() => {
          if (!canSubmit) return
          const values = form.getValues()
          const result = submitter.start({
            prompt: values.prompt.trim(),
            mode: values.mode,
            images: resourceStore.images,
            videos: resourceStore.videos,
            audios: resourceStore.audios,
            durationMode: values.durationMode,
            durationSeconds: values.durationSeconds,
            ratio: values.ratio,
            resolution: values.resolution,
            generateAudio: values.generateAudio,
            seed: values.seed.trim() === '' ? null : Number(values.seed),
            watermark: values.watermark,
            returnLastFrame: values.returnLastFrame,
          })
          if (!result.ok) {
            onPreflightError(result.reasonKey)
          }
        })}
      >
        <FieldGroup>
          <FormField
            control={form.control}
            name='mode'
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor='video-playground-mode'>
                  {t('Creation mode')}
                </FieldLabel>
                <Select
                  items={modeItems}
                  value={field.value}
                  onValueChange={(value) =>
                    form.setValue('mode', value as CreationMode, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger
                    id='video-playground-mode'
                    aria-label={t('Creation mode')}
                    className='w-full min-w-0'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {modeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name='prompt'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor='video-playground-prompt'>
                  {t('Prompt')}
                </FieldLabel>
                <Textarea
                  id='video-playground-prompt'
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={
                    fieldState.error?.message
                      ? 'video-playground-prompt-error'
                      : undefined
                  }
                  className='min-h-32'
                  placeholder={t(
                    'Describe the video you want to generate. Mention @Image1 etc. to reference attached assets.'
                  )}
                  {...field}
                />
                {fieldState.error?.message ? (
                  <FieldError id='video-playground-prompt-error'>
                    {t(fieldState.error.message)}
                  </FieldError>
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>

        <ComposerSummary
          mode={mode}
          ratio={ratio}
          resolution={resolution}
          durationSeconds={durationSeconds}
          durationMode={durationMode}
          generateAudio={generateAudio}
          batchCount={batchCount}
          outputFormat={capability.outputFormat}
          outputFps={capability.outputFps}
        />

        <BatchCountControl
          value={batchCount}
          onChange={(value) => form.setValue('batchCount', value)}
        />

        {preflightError ? (
          <Alert variant='destructive' role='alert'>
            <AlertDescription>{t(preflightError)}</AlertDescription>
          </Alert>
        ) : null}

        <div className='flex flex-col items-stretch gap-3 px-0 pb-0 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-2'>
            <VideoParametersPopover
              model={capability}
              mode={mode}
              composition={composition}
              form={form}
              invalidReasonKey={
                resolved.illegal ? resolved.illegalReason : undefined
              }
              activeCount={activeParamCount}
            />
            <Link
              to='/usage-logs/$section'
              params={{ section: 'task' }}
              className='text-primary text-sm underline'
            >
              {t('View all task logs')}
            </Link>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            {submitter.isBusy ? (
              <Button
                type='button'
                variant='outline'
                className='sm:w-48'
                onClick={handleCancelPending}
              >
                {t('Cancel pending submissions')}
              </Button>
            ) : null}
            <Button
              type='submit'
              disabled={!canSubmit || submitter.isBusy}
              className='sm:w-48'
            >
              {t('Generate')}
            </Button>
          </div>
        </div>
      </form>

      <ReferenceAssetsRow
        capability={capability}
        resourceStore={resourceStore}
        form={form}
      />

      <TaskGallery tasks={submitter.tasks} />
    </Form>
  )
}
