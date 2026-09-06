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
import {
  MusicNote01Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, type ReactNode } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
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
import { CanvasComposerShell } from '@/features/media-playground/components/canvas-composer-shell'
import { QuickParameterPill } from '@/features/media-playground/components/quick-parameter-pill'

import type { UseSubmissionResult } from '../hooks/use-submission'
import { useSubmitVideoRequest } from '../hooks/use-submit-video-request'
import {
  resolveVideoCapabilities,
  type ResourceComposition,
  type VideoCapability,
  type VideoResolution,
} from '../lib/capabilities'
import { CREATION_MODE_LABELS } from '../lib/composition-labels'
import { findModeEntry, supportedModesFor } from '../lib/contract'
import type { VideoFormValues } from '../lib/form-schema'
import type { CreationMode } from '../lib/mode'
import { countActiveParameters } from '../lib/parameter-state'
import type { ResourceStore as UseResourceStore } from '../lib/use-resource-store'
import type { VideoSubmitPayload } from '../types'
import { BatchCountControl } from './batch-count-control'
import { VideoParametersPopover } from './parameters-popover'
import { ReferenceAssetsRow } from './reference-assets-row'

type ComposerFormProps = {
  form: UseFormReturn<VideoFormValues>
  capability: VideoCapability
  mode: CreationMode
  composition: ResourceComposition
  resourceStore: UseResourceStore
  onPreflightError: (reasonKey: string) => void
  canSubmit: boolean
  modelId: string
  batchCount: number
  preflightError: string | null
  /**
   * The page-owned submission pipeline. Holding it here rather than in the page
   * would drop every queued task the moment the user switches to a model on the
   * generic profile and this composer unmounts.
   */
  submission: UseSubmissionResult<VideoSubmitPayload>
  clearSecret: () => void
  /** Model selector rendered into the composer toolbar (owned by the page). */
  modelSelector: ReactNode
  /** Connection settings rendered into the composer toolbar (owned by the page). */
  connection: ReactNode
}

/**
 * Canvas Composer for video: toolbar (model / mode / connection), a
 * prompt-first body with the reference tray, and a quick-control
 * footer. The form, resource adders, parameters popover and the
 * preflight + serialization pipeline all live here. The page
 * (index.tsx) owns the connection, the model loading, the shared
 * submission queue and the single TaskGallery, so the queue outlives a
 * switch to the generic composer.
 *
 * The full API key is held by the page-owned submission pipeline; it
 * never enters React state, the DOM, storage, React Query, or any
 * error message.
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
    modelId,
    batchCount,
    preflightError,
    submission,
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
    batchSize: batchCount,
    submission,
  })

  const handleCancelPending = () => {
    submitter.cancel()
    clearSecret()
  }

  const invalidReasonKey = resolved.illegal ? resolved.illegalReason : undefined

  const popoverProps = {
    model: capability,
    mode,
    composition,
    form,
    invalidReasonKey,
    activeCount: activeParamCount,
  }

  const quickPills = [
    {
      key: 'ratio',
      ariaLabel: t('Aspect ratio'),
      content: (
        <strong className='text-foreground font-semibold'>{ratio}</strong>
      ),
    },
    {
      key: 'resolution',
      ariaLabel: t('Resolution'),
      content: <span>{resolution}</span>,
    },
    {
      key: 'duration',
      ariaLabel: t('Duration'),
      content: (
        <span>
          {durationMode === 'intelligent'
            ? t('Intelligent')
            : `${durationSeconds}s`}
        </span>
      ),
    },
    {
      key: 'audio',
      ariaLabel: t('Generate audio'),
      content: (
        <>
          <HugeiconsIcon
            icon={MusicNote01Icon}
            aria-hidden
            data-icon='inline-start'
            className={generateAudio ? '' : 'opacity-50'}
          />
          <span>{generateAudio ? t('Audio on') : t('Silent')}</span>
        </>
      ),
    },
  ]

  return (
    <Form {...form}>
      <form
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
        <CanvasComposerShell
          toolbar={
            <>
              {props.modelSelector}
              <FormField
                control={form.control}
                name='mode'
                render={({ field }) => (
                  <div className='flex min-w-0 items-center'>
                    <label htmlFor='video-playground-mode' className='sr-only'>
                      {t('Creation mode')}
                    </label>
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
                        className='h-8 w-auto max-w-56 min-w-0 rounded-lg'
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
                  </div>
                )}
              />
              <span className='text-muted-foreground ms-auto hidden text-xs xl:inline'>
                {capability.outputFormat.toUpperCase()} · {capability.outputFps}{' '}
                fps
              </span>
              {props.connection}
            </>
          }
          footer={
            <>
              {quickPills.map((pill) => (
                <VideoParametersPopover
                  key={pill.key}
                  {...popoverProps}
                  trigger={
                    <QuickParameterPill ariaLabel={pill.ariaLabel}>
                      {pill.content}
                    </QuickParameterPill>
                  }
                />
              ))}
              <VideoParametersPopover
                {...popoverProps}
                trigger={
                  <QuickParameterPill
                    ariaLabel={t('Parameter settings')}
                    className='relative'
                  >
                    <HugeiconsIcon
                      icon={SlidersHorizontalIcon}
                      aria-hidden
                      data-icon='inline-start'
                    />
                    <span className='hidden sm:inline'>{t('Parameters')}</span>
                    {activeParamCount > 0 ? (
                      <span
                        aria-label={t('{{count}} active parameters', {
                          count: activeParamCount,
                        })}
                        className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold'
                      >
                        {activeParamCount}
                      </span>
                    ) : null}
                  </QuickParameterPill>
                }
              />
              <BatchCountControl
                value={batchCount}
                onChange={(value) => form.setValue('batchCount', value)}
              />
              <div className='ms-auto flex flex-wrap items-center gap-2'>
                <Link
                  to='/usage-logs/$section'
                  params={{ section: 'task' }}
                  className='text-primary hidden text-xs underline sm:inline'
                >
                  {t('View all task logs')}
                </Link>
                {submitter.isBusy ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleCancelPending}
                  >
                    {t('Cancel pending submissions')}
                  </Button>
                ) : null}
                <Button
                  type='submit'
                  disabled={!canSubmit || submitter.isBusy}
                  className='h-9 rounded-xl px-5'
                >
                  {t('Generate')}
                </Button>
              </div>
            </>
          }
        >
          <div className='grid grid-cols-1 gap-4 md:grid-cols-[120px_minmax(0,1fr)]'>
            <div className='order-2 md:order-1'>
              <ReferenceAssetsRow
                capability={capability}
                resourceStore={resourceStore}
                form={form}
              />
            </div>
            <div className='order-1 flex min-w-0 flex-col gap-3 md:order-2'>
              <FormField
                control={form.control}
                name='prompt'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel
                      htmlFor='video-playground-prompt'
                      className='sr-only'
                    >
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
                      className='min-h-28 resize-y border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[15px]'
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
              {preflightError ? (
                <Alert variant='destructive' role='alert'>
                  <AlertDescription>{t(preflightError)}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>
        </CanvasComposerShell>
      </form>
    </Form>
  )
}
