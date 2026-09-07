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
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
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

import type { VideoComposerSettings } from '../hooks/use-submission-settings'
import {
  defaultComposerValues,
  PROVIDER_DEFAULT,
  videoComposerSchema,
  type DurationFieldValue,
  type VideoComposerValues,
} from '../lib/composer-schema'
import {
  availableResolutions,
  highestAvailableResolution,
  resolutionLabel,
  type VideoModelCapability,
} from '../lib/model-capabilities'
import type { ResourceStore } from '../lib/use-resource-store'
import {
  buildVideoGenerationRequest,
  VideoRequestError,
  type VideoGenerationRequestBody,
} from '../lib/video-request'
import type { VideoModelOption } from '../types'
import { VideoModelSelector } from './model-selector'
import { ReferenceImageTray } from './reference-image-tray'

export type VideoComposerSubmitRequest = {
  body: VideoGenerationRequestBody
  settings: VideoComposerSettings
}

type VideoComposerProps = {
  /** Always resolved: an unlisted model yields the safe fallback capability. */
  capability: VideoModelCapability
  models: ReadonlyArray<VideoModelOption>
  modelId: string
  onModelChange: (modelId: string) => void
  modelsDisabled: boolean
  /** Part of the reset identity: switching keys resets even onto the same model. */
  keyId: number | null
  resourceStore: ResourceStore
  canSubmit: boolean
  isSubmitting: boolean
  /** Translated failure of the most recent submit attempt, when it failed. */
  submitErrorText: string | null
  /** A new object identity applies these values instead of the defaults. */
  restore: VideoComposerValues | null
  onSubmit: (request: VideoComposerSubmitRequest) => void
}

/**
 * The studio's single composer: model, reference images, prompt, seconds,
 * resolution and one generate button.
 *
 * One render path serves every model. What differs between them lives in the
 * capability table, which drives the dropdown options, the form defaults, the
 * reference-image budget and the outbound body, so no branch here ever inspects
 * a model id.
 *
 * Seconds and resolution come only from dropdowns built out of that table, which
 * is why an empty prompt is the only user-triggerable validation on the page.
 */
export function VideoComposer(props: VideoComposerProps) {
  const { t } = useTranslation()
  const capability = props.capability
  const form = useForm<VideoComposerValues>({
    resolver: zodResolver(videoComposerSchema),
    defaultValues: defaultComposerValues(capability),
  })
  const [rejection, setRejection] = useState<{
    reasonKey: string
    interpolation?: Record<string, string | number>
  } | null>(null)

  const imageCount = props.resourceStore.images.length

  // Switching model or API key resets the whole composer — prompt, reference
  // images, seconds and resolution — back to the new model's defaults, with no
  // confirmation dialog. The page clears the tray on the same two actions.
  useEffect(() => {
    form.reset(defaultComposerValues(capability))
    setRejection(null)
  }, [capability, props.keyId, form])

  // "Use these settings again" lands in the same commit as the model switch it
  // may cause, and effects run in declaration order, so the restore wins.
  useEffect(() => {
    if (!props.restore) {
      return
    }
    form.reset(props.restore)
    setRejection(null)
  }, [props.restore, form])

  // Attaching a reference image can make the current resolution illegal —
  // Seedance 2.0 rejects 1080p together with reference images. Converge to the
  // highest resolution still legal instead of letting the illegal combination
  // reach the upstream.
  //
  // The current value is read from the form rather than from a watched render
  // value: this effect runs in the same commit as the reset and restore effects
  // above, and a stale closure would clobber a resolution the user just
  // restored from a finished task.
  useEffect(() => {
    if (!capability.known) {
      return
    }
    const allowed = availableResolutions(capability, imageCount)
    const current = form.getValues('resolution')
    if (current !== PROVIDER_DEFAULT && allowed.includes(current)) {
      return
    }
    form.setValue(
      'resolution',
      highestAvailableResolution(capability, imageCount) ?? PROVIDER_DEFAULT,
      { shouldValidate: false }
    )
  }, [capability, imageCount, form])

  // A rejection is never sticky: any edit clears it.
  useEffect(() => {
    const subscription = form.watch(() => setRejection(null))
    return () => subscription.unsubscribe()
  }, [form])
  useEffect(() => {
    setRejection(null)
  }, [imageCount])

  const durationItems = useMemo(() => {
    if (capability.durations.length === 0) {
      return [{ value: PROVIDER_DEFAULT, label: t('Default') }]
    }
    return capability.durations.map((seconds) => ({
      value: String(seconds),
      label: `${seconds} ${t('seconds')}`,
    }))
  }, [capability, t])

  const resolutionItems = useMemo(() => {
    const allowed = availableResolutions(capability, imageCount)
    if (allowed.length === 0) {
      return [{ value: PROVIDER_DEFAULT, label: t('Default') }]
    }
    return allowed.map((value) => ({
      value,
      label: resolutionLabel(capability, value),
    }))
  }, [capability, imageCount, t])

  const handleSubmit = form.handleSubmit((values) => {
    if (!props.canSubmit) {
      return
    }
    let body: VideoGenerationRequestBody
    try {
      body = buildVideoGenerationRequest({
        capability,
        prompt: values.prompt,
        duration: values.duration,
        resolution: values.resolution,
        images: props.resourceStore.images,
      })
    } catch (error) {
      if (error instanceof VideoRequestError) {
        setRejection({
          reasonKey: error.reasonKey,
          interpolation: error.interpolation,
        })
        return
      }
      setRejection({ reasonKey: 'Video generation failed' })
      return
    }
    setRejection(null)
    props.onSubmit({
      body,
      settings: {
        modelId: capability.modelId,
        prompt: values.prompt.trim(),
        duration: values.duration,
        resolution: values.resolution,
        images: props.resourceStore.images,
      },
    })
  })

  const errorText = rejection
    ? t(rejection.reasonKey, rejection.interpolation)
    : props.submitErrorText

  return (
    <CanvasComposerShell>
      <Form {...form}>
        <form
          onSubmit={handleSubmit}
          noValidate
          className='flex flex-col gap-4'
        >
          <VideoModelSelector
            models={props.models}
            selectedModel={props.modelId}
            onChange={props.onModelChange}
            disabled={props.modelsDisabled}
          />

          <ReferenceImageTray
            capability={capability}
            images={props.resourceStore.images}
            previewUrls={props.resourceStore.previewUrls}
            disabled={!props.canSubmit}
            onAdd={(images) => {
              for (const image of images) {
                props.resourceStore.addImage(image)
              }
            }}
            onRemove={props.resourceStore.removeImage}
            onAttachPreview={props.resourceStore.attachPreview}
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
                  className='min-h-40 resize-y text-[15px] leading-relaxed md:text-[15px]'
                  placeholder={t('Describe the video you want to generate.')}
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

          <div className='grid grid-cols-2 gap-3'>
            <FormField
              control={form.control}
              name='duration'
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor='video-playground-duration'>
                    {t('Seconds')}
                  </FieldLabel>
                  <Select
                    items={durationItems}
                    value={String(field.value)}
                    onValueChange={(value) => {
                      const seconds = toDurationValue(value)
                      // A Base UI Select can emit null while a popup settles.
                      // That is not a user choice, so it must not overwrite the
                      // seconds already picked from the capability table.
                      if (seconds === null) {
                        return
                      }
                      field.onChange(seconds)
                    }}
                    disabled={!props.canSubmit}
                  >
                    <SelectTrigger
                      id='video-playground-duration'
                      aria-label={t('Seconds')}
                      className='w-full min-w-0'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {durationItems.map((item) => (
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
              name='resolution'
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor='video-playground-resolution'>
                    {t('Resolution')}
                  </FieldLabel>
                  <Select
                    items={resolutionItems}
                    value={field.value}
                    onValueChange={(value) => {
                      // Same guard as seconds: a null emission while a popup
                      // settles is not a user choice.
                      if (typeof value !== 'string' || value === '') {
                        return
                      }
                      field.onChange(value)
                    }}
                    disabled={!props.canSubmit}
                  >
                    <SelectTrigger
                      id='video-playground-resolution'
                      aria-label={t('Resolution')}
                      className='w-full min-w-0'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {resolutionItems.map((item) => (
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
          </div>

          {errorText ? (
            <Alert variant='destructive'>
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type='submit'
            className='h-9 w-full'
            disabled={!props.canSubmit || props.isSubmitting}
            aria-busy={props.isSubmitting || undefined}
          >
            {props.isSubmitting ? t('Submitting...') : t('Generate video')}
          </Button>
        </form>
      </Form>
    </CanvasComposerShell>
  )
}

/**
 * Translate one dropdown choice into a form value. Anything that is not a real
 * choice — a null emission, an empty value, a non-integer — yields null so the
 * caller can ignore it instead of corrupting the seconds the user picked.
 */
function toDurationValue(value: unknown): DurationFieldValue | null {
  if (value === PROVIDER_DEFAULT) {
    return PROVIDER_DEFAULT
  }
  const seconds = Number(value)
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return null
  }
  return seconds
}
