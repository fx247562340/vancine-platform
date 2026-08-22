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
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import type { ImageFormValues } from '../lib/form-schema'
import type { ImageModelProfile, ReferenceImage } from '../types'

type AdvancedSettingsProps = {
  profile: ImageModelProfile
  references: ReferenceImage[]
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AdvancedSettings(props: AdvancedSettingsProps) {
  const { t } = useTranslation()
  const form = useFormContext<ImageFormValues>()
  const hasAdvanced =
    props.profile.supportsNegativePrompt ||
    props.profile.supportsSeed ||
    props.profile.supportsWatermark ||
    props.profile.supportsPromptExtend ||
    props.profile.supportsPromptExtendMode ||
    props.profile.supportsThinkingMode

  const refCount = props.references.length
  const agentAllowed = !props.profile.agentRequiresNoRefs || refCount === 0
  const promptExtendOn = form.watch('promptExtend')

  // When the user attaches a reference image and the profile forbids
  // agent mode with refs, force-flip back to direct so a previously valid
  // selection cannot leak into the next request.
  useEffect(() => {
    if (!props.profile.supportsPromptExtendMode) return
    if (!agentAllowed && form.getValues('promptExtendMode') === 'agent') {
      form.setValue('promptExtendMode', 'direct', { shouldDirty: true })
    }
  }, [agentAllowed, form, props.profile.supportsPromptExtendMode])

  // When prompt_extend is turned off, disable enable_thinking so the
  // client never sends an inconsistent pair upstream. The backend would
  // reject it anyway; doing it client-side keeps the form clean.
  useEffect(() => {
    if (!props.profile.thinkingRequiresExtend) return
    if (!promptExtendOn && form.getValues('thinkingMode')) {
      form.setValue('thinkingMode', false, { shouldDirty: true })
    }
  }, [form, promptExtendOn, props.profile.thinkingRequiresExtend])

  if (!hasAdvanced) {
    return null
  }

  return (
    <details
      className='rounded-xl border px-4 py-3'
      open={props.open}
      onToggle={(event) => {
        props.onOpenChange?.(event.currentTarget.open)
      }}
    >
      <summary className='cursor-pointer text-sm font-medium'>
        {t('Advanced settings')}
      </summary>
      <div className='mt-4 grid gap-4 md:grid-cols-2'>
        {props.profile.supportsNegativePrompt ? (
          <FormField
            control={form.control}
            name='negativePrompt'
            render={({ field }) => (
              <FormItem className='md:col-span-2'>
                <FormLabel>{t('Negative prompt')}</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={props.disabled}
                    maxLength={
                      props.profile.maxNegativePromptChars || undefined
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {props.profile.supportsSeed ? (
          <FormField
            control={form.control}
            name='seed'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Seed')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={props.profile.seedRange?.min}
                    max={props.profile.seedRange?.max}
                    disabled={props.disabled}
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
                      field.onChange(Number.isFinite(parsed) ? parsed : null)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {props.profile.supportsWatermark ? (
          <FormField
            control={form.control}
            name='watermark'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2'>
                <FormLabel>{t('Watermark')}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    disabled={props.disabled}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        ) : null}
        {props.profile.supportsPromptExtend ? (
          <FormField
            control={form.control}
            name='promptExtend'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2'>
                <FormLabel>{t('Prompt extend')}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    disabled={props.disabled}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        ) : null}
        {props.profile.supportsPromptExtendMode ? (
          <FormField
            control={form.control}
            name='promptExtendMode'
            render={({ field }) => (
              <FormItem className='flex flex-col gap-1 rounded-lg border px-3 py-2'>
                <FormLabel>{t('Prompt extend mode')}</FormLabel>
                <FormControl>
                  <select
                    className='border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm'
                    disabled={props.disabled || !agentAllowed}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === 'agent' ? 'agent' : 'direct'
                      )
                    }
                  >
                    <option value='direct'>{t('Direct')}</option>
                    <option value='agent' disabled={!agentAllowed}>
                      {t('Agent')}
                    </option>
                  </select>
                </FormControl>
                {!agentAllowed ? (
                  <FormDescription>
                    {t(
                      'Agent mode is unavailable while reference images are attached.'
                    )}
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {props.profile.supportsThinkingMode ? (
          <FormField
            control={form.control}
            name='thinkingMode'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Enable thinking')}</FormLabel>
                  {props.profile.thinkingRequiresExtend && !promptExtendOn ? (
                    <FormDescription>
                      {t('Enable thinking requires prompt extend')}
                    </FormDescription>
                  ) : null}
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    disabled={
                      props.disabled ||
                      (props.profile.thinkingRequiresExtend && !promptExtendOn)
                    }
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        ) : null}
      </div>
    </details>
  )
}
