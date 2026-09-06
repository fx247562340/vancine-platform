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
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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

import type { UseSubmissionResult } from '../hooks/use-submission'
import { useSubmitGenericVideoRequest } from '../hooks/use-submit-generic-video-request'
import type { GenericVideoCapability } from '../lib/capabilities'
import { GENERIC_CREATION_MODE_LABELS } from '../lib/composition-labels'
import {
  genericVideoFormSchema,
  type GenericVideoFormValues,
} from '../lib/form-schema'
import type { GenericCreationMode } from '../lib/mode'
import type { ResourceStore as UseResourceStore } from '../lib/use-resource-store'
import type { VideoSubmitPayload } from '../types'
import { BatchCountControl } from './batch-count-control'
import { GenericReferenceAssetsRow } from './generic-reference-assets-row'

type GenericComposerFormProps = {
  capability: GenericVideoCapability
  resourceStore: UseResourceStore
  canSubmit: boolean
  modelId: string
  /**
   * The page-owned submission pipeline, shared with the dedicated composer.
   * Holding it here instead would drop every queued task the moment the user
   * switches to a model on the dedicated profile and this composer unmounts.
   */
  submission: UseSubmissionResult<VideoSubmitPayload>
  clearSecret: () => void
  /** Model selector rendered into the composer toolbar (owned by the page). */
  modelSelector: ReactNode
  /** Connection settings rendered into the composer toolbar (owned by the page). */
  connection: ReactNode
}

/**
 * Canvas Composer for a video model without a dedicated capability profile.
 *
 * It offers exactly what the generic contract can substantiate: a prompt, the
 * text-to-video / image-to-video intent, one optional public HTTPS reference
 * image and the shared batch size. Every dedicated control is absent — no
 * aspect ratio, resolution, duration, generate-audio, seed, watermark or
 * return-last-frame — because Vancine holds no first-party evidence for those
 * on an unknown model and will not invent values for them. The upstream task
 * plugin applies its own defaults, and the page says so.
 *
 * The `@Image1` prompt-reference vocabulary is absent too. It belongs to the
 * dedicated Seedance wire format, where the prompt cites attached assets by
 * token; a generic model receives its image through the top-level `image`
 * field instead, so offering the token here would teach the user a syntax the
 * request never carries.
 *
 * The output format / FPS badge the dedicated composer shows is omitted too:
 * displaying a guessed number would be a fabricated capability.
 */
export function GenericComposerForm(props: GenericComposerFormProps) {
  const { t } = useTranslation()
  const {
    capability,
    resourceStore,
    canSubmit,
    modelId,
    submission,
    clearSecret,
  } = props
  const [preflightError, setPreflightError] = useState<string | null>(null)

  const form = useForm<GenericVideoFormValues>({
    resolver: zodResolver(genericVideoFormSchema),
    defaultValues: { prompt: '', mode: 'textToVideo', batchCount: 1 },
  })
  const batchCount = useWatch({ control: form.control, name: 'batchCount' })

  // A stale rejection must not survive the user fixing it: clear the alert as
  // soon as the form or the attached resources change.
  useEffect(() => {
    const subscription = form.watch(() => {
      setPreflightError((current) => (current ? null : current))
    })
    return () => subscription.unsubscribe()
  }, [form])

  useEffect(() => {
    setPreflightError((current) => (current ? null : current))
  }, [
    resourceStore.images.length,
    resourceStore.videos.length,
    resourceStore.audios.length,
  ])

  const modeItems = useMemo(
    () =>
      capability.generationModes.map((mode) => ({
        value: mode,
        label: t(GENERIC_CREATION_MODE_LABELS[mode]),
      })),
    [capability.generationModes, t]
  )

  const submitter = useSubmitGenericVideoRequest({
    capability,
    modelId,
    batchSize: batchCount,
    submission,
  })

  const handleCancelPending = () => {
    submitter.cancel()
    clearSecret()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          if (!canSubmit) return
          const result = submitter.start({
            prompt: values.prompt.trim(),
            mode: values.mode as GenericCreationMode,
            images: resourceStore.images,
            videos: resourceStore.videos,
            audios: resourceStore.audios,
          })
          if (!result.ok) {
            setPreflightError(result.reasonKey)
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
                    <label
                      htmlFor='video-playground-generic-mode'
                      className='sr-only'
                    >
                      {t('Creation mode')}
                    </label>
                    <Select
                      items={modeItems}
                      value={field.value}
                      onValueChange={(value) =>
                        form.setValue('mode', value as GenericCreationMode, {
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger
                        id='video-playground-generic-mode'
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
              {props.connection}
            </>
          }
          footer={
            <>
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
              <GenericReferenceAssetsRow
                capability={capability}
                resourceStore={resourceStore}
              />
            </div>
            <div className='order-1 flex min-w-0 flex-col gap-3 md:order-2'>
              <FormField
                control={form.control}
                name='prompt'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel
                      htmlFor='video-playground-generic-prompt'
                      className='sr-only'
                    >
                      {t('Prompt')}
                    </FieldLabel>
                    <Textarea
                      id='video-playground-generic-prompt'
                      aria-invalid={fieldState.invalid || undefined}
                      aria-describedby={
                        fieldState.error?.message
                          ? 'video-playground-generic-prompt-error'
                          : undefined
                      }
                      className='min-h-28 resize-y border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[15px]'
                      placeholder={t(
                        'Describe the video you want to generate.'
                      )}
                      {...field}
                    />
                    {fieldState.error?.message ? (
                      <FieldError id='video-playground-generic-prompt-error'>
                        {t(fieldState.error.message)}
                      </FieldError>
                    ) : null}
                  </Field>
                )}
              />
              <p className='text-muted-foreground flex items-start gap-1.5 text-xs leading-5'>
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  strokeWidth={2}
                  aria-hidden
                  data-icon='inline-start'
                  className='mt-0.5 shrink-0'
                />
                <span>
                  {t("This model uses the provider's default parameters.")}
                </span>
              </p>
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
