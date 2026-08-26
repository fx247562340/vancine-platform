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

type AdvancedSettingsFieldsProps = {
  profile: ImageModelProfile
  references: ReferenceImage[]
  disabled?: boolean
}

/**
 * The profile-driven advanced fields, rendered as a flat grid. The
 * Canvas Composer hosts this inside a Popover (desktop) or Sheet
 * (mobile). Always-mounted business invariants (agent-mode revert
 * when references attach, thinking-mode off when prompt_extend is
 * off) live on the page so they stay in force even while the panel
 * is closed. This component is a pure presentational grid.
 */
export function AdvancedSettingsFields(props: AdvancedSettingsFieldsProps) {
  const { t } = useTranslation()
  const form = useFormContext<ImageFormValues>()
  const refCount = props.references.length
  const agentAllowed = !props.profile.agentRequiresNoRefs || refCount === 0
  const promptExtendOn = form.watch('promptExtend')

  return (
    <div className='grid gap-4 md:grid-cols-2'>
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
                  maxLength={props.profile.maxNegativePromptChars || undefined}
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
  )
}
