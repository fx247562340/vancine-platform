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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ModelGroupSelector } from '@/components/model-group-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { AdvancedSettings } from './components/advanced-settings'
import { ImageResults } from './components/image-results'
import { ReferenceImageUpload } from './components/reference-image-upload'
import { useImageCapabilities } from './hooks/use-image-capabilities'
import { useImageGenerate } from './hooks/use-image-generate'
import {
  ImagePlaygroundError,
  isAdvancedImageField,
  mapImageServerErrorToField,
} from './lib/errors'
import { buildImageFormSchema, type ImageFormValues } from './lib/form-schema'
import { paramsFromProfile, resetParamsForProfile } from './lib/params'
import type { ReferenceImage } from './types'

const CUSTOM_SIZE_VALUE = '__custom__'
const AUTO_SIZE_VALUE = '__auto__'

const emptyFormValues: ImageFormValues = {
  prompt: '',
  size: '',
  sizeMode: 'preset',
  customWidth: null,
  customHeight: null,
  n: 1,
  negativePrompt: '',
  seed: null,
  watermark: false,
  promptExtend: false,
  promptExtendMode: 'direct',
  thinkingMode: false,
}

export function ImagePlayground() {
  const { t } = useTranslation()
  const [group, setGroup] = useState('default')
  const [model, setModel] = useState('')
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const capabilities = useImageCapabilities(group)
  const generation = useImageGenerate()

  const selected = capabilities.models.find((item) => item.model === model)
  const profile = selected?.profile ?? null
  const schema = useMemo(() => buildImageFormSchema(profile), [profile])
  const form = useForm<ImageFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyFormValues,
  })

  const modelOptions = useMemo(
    () =>
      capabilities.models.map((item) => ({
        label: item.model,
        value: item.model,
      })),
    [capabilities.models]
  )

  useEffect(() => {
    if (capabilities.groups.length === 0) return
    const exists = capabilities.groups.some((item) => item.value === group)
    if (exists) return
    const fallback =
      capabilities.groups.find((item) => item.value === 'default')?.value ??
      capabilities.groups[0].value
    setGroup(fallback)
  }, [capabilities.groups, group])

  useEffect(() => {
    if (!capabilities.isFetched) return
    const exists = capabilities.models.some((item) => item.model === model)
    if (exists) return
    if (capabilities.models.length === 0) {
      setModel('')
      setReferences([])
      form.reset({ ...emptyFormValues, prompt: form.getValues('prompt') })
      return
    }
    const next = capabilities.models[0]
    setModel(next.model)
    const params = paramsFromProfile(next.profile)
    form.reset({
      prompt: form.getValues('prompt'),
      ...params,
    })
    setReferences([])
  }, [capabilities.isFetched, capabilities.models, form, model])

  function handleModelChange(nextModel: string) {
    setModel(nextModel)
    const next = capabilities.models.find((item) => item.model === nextModel)
    if (!next) return
    const current = form.getValues()
    const params = resetParamsForProfile(current, next.profile)
    form.reset({
      prompt: current.prompt,
      ...params,
    })
    if (next.profile.maxReferenceImages <= 0) {
      setReferences([])
      return
    }
    setReferences((currentRefs) =>
      currentRefs.slice(0, next.profile.maxReferenceImages)
    )
  }

  const canSubmit =
    capabilities.isFetched &&
    !capabilities.isError &&
    Boolean(profile) &&
    Boolean(model) &&
    capabilities.models.length > 0 &&
    !generation.isGenerating

  const sizeMode = form.watch('sizeMode')

  function resolveSizeSelectValue(presetValue: string): string {
    if (sizeMode === 'custom') return CUSTOM_SIZE_VALUE
    if (sizeMode === 'auto') return AUTO_SIZE_VALUE
    return presetValue
  }

  return (
    <div
      data-testid='image-playground-scroll'
      className='flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6'>
        <header className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold'>{t('Image generation')}</h1>
            <p className='text-muted-foreground text-sm'>
              {selected?.provider
                ? t('Provider: {{name}}', { name: selected.provider })
                : t('Select an image model to start generating.')}
            </p>
          </div>
          <ModelGroupSelector
            selectedModel={model}
            models={modelOptions}
            onModelChange={handleModelChange}
            selectedGroup={group}
            groups={capabilities.groups}
            onGroupChange={setGroup}
            disabled={generation.isGenerating || capabilities.isLoading}
          />
        </header>

        {capabilities.isError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('Failed to load image models')}
          </p>
        ) : null}
        {capabilities.isFetched && capabilities.models.length === 0 ? (
          <p className='text-muted-foreground text-sm' role='status'>
            {t('No image models available')}
          </p>
        ) : null}

        <Form {...form}>
          <form
            className='contents'
            onSubmit={form.handleSubmit(async (values) => {
              if (!profile) return
              try {
                await generation.generate({
                  model,
                  group,
                  provider: selected?.provider ?? '',
                  prompt: values.prompt.trim(),
                  params: values,
                  profile,
                  references,
                })
              } catch (error) {
                if (!(error instanceof ImagePlaygroundError)) return
                const mapped = mapImageServerErrorToField(error.message, {
                  sizeMode: values.sizeMode,
                })
                if (!mapped) return
                if (isAdvancedImageField(mapped.name)) {
                  setAdvancedOpen(true)
                }
                form.setError(mapped.name, {
                  type: 'server',
                  message: mapped.message,
                })
                if (mapped.name === 'customWidth') {
                  form.setError('customHeight', {
                    type: 'server',
                    message: mapped.message,
                  })
                }
                generation.clearError()
              }
            })}
          >
            <Card>
              <CardContent className='space-y-4'>
                {profile && profile.maxReferenceImages > 0 ? (
                  <ReferenceImageUpload
                    profile={profile}
                    images={references}
                    disabled={generation.isGenerating}
                    onChange={setReferences}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name='prompt'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Prompt')}</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={generation.isGenerating}
                          className='min-h-32'
                          placeholder={t(
                            'Describe the image you want to generate'
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
                  <FormField
                    control={form.control}
                    name='size'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Size')}</FormLabel>
                        <FormControl>
                          <select
                            className='border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm'
                            disabled={!profile || generation.isGenerating}
                            value={resolveSizeSelectValue(field.value)}
                            onChange={(event) => {
                              const value = event.target.value
                              if (value === CUSTOM_SIZE_VALUE) {
                                form.setValue('sizeMode', 'custom')
                                return
                              }
                              if (value === AUTO_SIZE_VALUE) {
                                form.setValue('sizeMode', 'auto')
                                form.setValue('size', 'Auto')
                                return
                              }
                              form.setValue('sizeMode', 'preset')
                              field.onChange(value)
                            }}
                          >
                            {profile?.supportsAutoSize ? (
                              <option value={AUTO_SIZE_VALUE}>
                                {t('Auto')}
                              </option>
                            ) : null}
                            {(profile?.sizes ?? []).map((size) => {
                              if (
                                profile?.supportsAutoSize &&
                                size.toLowerCase() === 'auto'
                              ) {
                                return null
                              }
                              return (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              )
                            })}
                            {profile?.supportsCustomSize ? (
                              <option value={CUSTOM_SIZE_VALUE}>
                                {t('Custom size')}
                              </option>
                            ) : null}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='n'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Number of images')}</FormLabel>
                        <FormControl>
                          <select
                            className='border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm'
                            disabled={!profile || generation.isGenerating}
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value))
                            }
                          >
                            {profile
                              ? Array.from(
                                  {
                                    length:
                                      profile.nRange.max -
                                      profile.nRange.min +
                                      1,
                                  },
                                  (_, index) => profile.nRange.min + index
                                ).map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))
                              : null}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className='flex items-end'>
                    <Button
                      type='submit'
                      className='w-full'
                      disabled={!canSubmit}
                    >
                      {t('Generate')}
                    </Button>
                  </div>
                </div>
                {profile?.supportsCustomSize && sizeMode === 'custom' ? (
                  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                    <FormField
                      control={form.control}
                      name='customWidth'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Width')}</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min={1}
                              disabled={generation.isGenerating}
                              value={field.value ?? ''}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              onChange={(event) => {
                                const value = event.target.value
                                if (value === '') {
                                  field.onChange(null)
                                  return
                                }
                                const parsed = Number(value)
                                field.onChange(
                                  Number.isFinite(parsed) ? parsed : null
                                )
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='customHeight'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Height')}</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min={1}
                              disabled={generation.isGenerating}
                              value={field.value ?? ''}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              onChange={(event) => {
                                const value = event.target.value
                                if (value === '') {
                                  field.onChange(null)
                                  return
                                }
                                const parsed = Number(value)
                                field.onChange(
                                  Number.isFinite(parsed) ? parsed : null
                                )
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : null}
                {profile ? (
                  <AdvancedSettings
                    profile={profile}
                    references={references}
                    disabled={generation.isGenerating}
                    open={advancedOpen}
                    onOpenChange={setAdvancedOpen}
                  />
                ) : null}
              </CardContent>
            </Card>
          </form>
        </Form>

        <ImageResults
          runs={generation.runs}
          isGenerating={generation.isGenerating}
          pageError={generation.pageError}
          isRetrying={generation.isRetrying}
          onRetry={(runId) => {
            // Retry replays the run's stored request snapshot, never the
            // current form. It must not depend on the form, the model
            // selector, or the group selector — the snapshot has everything.
            generation.retry(runId)
          }}
          onClearHistory={generation.clearHistory}
        />
      </div>
    </div>
  )
}
