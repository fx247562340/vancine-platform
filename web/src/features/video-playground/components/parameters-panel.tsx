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
import { useId, useMemo } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  resolveVideoCapabilities,
  type ResourceComposition,
  type VideoCapability,
  type VideoRatio,
  type VideoResolution,
} from '../lib/capabilities'
import type { VideoFormValues } from '../lib/form-schema'
import type { CreationMode } from '../lib/mode'

type VideoParametersPanelProps = {
  model: VideoCapability
  mode: CreationMode
  composition: ResourceComposition
  disabled?: boolean
  /**
   * The form instance. Reading parameter values via `useWatch` and
   * writing them via `form.setValue` makes React Hook Form the
   * single source of truth — the same object the submit handler
   * reads on submit. There is no parallel `useState` mirror.
   */
  form: UseFormReturn<VideoFormValues>
  invalidReasonKey: string | undefined
}

/**
 * Bind every input to the React Hook Form instance. The submit
 * handler reads exactly the same `form.getValues()` this panel
 * writes to, so the request body and the visible UI never drift.
 *
 * Resolution / duration clamping on model or resource change lives
 * in ComposerForm (the panel may be unmounted while the popover is
 * closed).
 */
export function VideoParametersPanel(props: VideoParametersPanelProps) {
  const { t } = useTranslation()
  const ratioId = useId()
  const resolutionId = useId()
  const durationId = useId()
  const seedId = useId()
  const audioId = useId()
  const watermarkId = useId()
  const returnFrameId = useId()

  const ratio = useWatch({ control: props.form.control, name: 'ratio' })
  const resolution = useWatch({
    control: props.form.control,
    name: 'resolution',
  })
  const durationMode = useWatch({
    control: props.form.control,
    name: 'durationMode',
  })
  const durationSeconds = useWatch({
    control: props.form.control,
    name: 'durationSeconds',
  })
  const generateAudio = useWatch({
    control: props.form.control,
    name: 'generateAudio',
  })
  const watermark = useWatch({
    control: props.form.control,
    name: 'watermark',
  })
  const returnLastFrame = useWatch({
    control: props.form.control,
    name: 'returnLastFrame',
  })
  const seed = useWatch({ control: props.form.control, name: 'seed' })

  const resolved = useMemo(
    () => resolveVideoCapabilities(props.model, props.mode, props.composition),
    [props.composition, props.mode, props.model]
  )

  const resolutionOptions = resolved.resolutions
  const durationOptions = durationSecondsOptions(resolved.duration)
  const ratioItems = props.model.ratios.map((item) => ({
    value: item,
    label: item,
  }))
  const resolutionItems = resolutionOptions.map((item) => ({
    value: item,
    label: item,
  }))
  const durationItems = durationOptions.map((value) => ({
    value: String(value),
    label: `${value} ${t('seconds')}`,
  }))

  return (
    <FieldGroup
      className='grid gap-4'
      role='group'
      aria-label={t('Parameters')}
    >
      {props.invalidReasonKey ? (
        <p role='alert' className='text-destructive text-xs leading-5'>
          {t(props.invalidReasonKey)}
        </p>
      ) : null}

      <Field>
        <FieldLabel htmlFor={ratioId}>{t('Aspect ratio')}</FieldLabel>
        <Select
          items={ratioItems}
          value={ratio}
          onValueChange={(value) =>
            props.form.setValue('ratio', value as VideoRatio, {
              shouldValidate: true,
            })
          }
          disabled={props.disabled}
        >
          <SelectTrigger
            id={ratioId}
            aria-label={t('Aspect ratio')}
            className='w-full min-w-0'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ratioItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={resolutionId}>{t('Resolution')}</FieldLabel>
        <Select
          items={resolutionItems}
          value={resolution}
          onValueChange={(value) =>
            props.form.setValue('resolution', value as VideoResolution, {
              shouldValidate: true,
            })
          }
          disabled={props.disabled || resolutionItems.length === 0}
        >
          <SelectTrigger
            id={resolutionId}
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

      <Field>
        <div className='flex items-center justify-between gap-2'>
          <FieldLabel htmlFor={durationId}>{t('Duration')}</FieldLabel>
          <Button
            id={`${durationId}-mode`}
            type='button'
            size='sm'
            variant='ghost'
            disabled={props.disabled}
            onClick={() =>
              props.form.setValue(
                'durationMode',
                durationMode === 'intelligent' ? 'fixed' : 'intelligent',
                { shouldValidate: true }
              )
            }
            aria-pressed={durationMode === 'intelligent'}
          >
            {durationMode === 'intelligent'
              ? t('Intelligent duration')
              : t('Fixed duration')}
          </Button>
        </div>
        <Select
          items={durationItems}
          value={String(durationSeconds)}
          onValueChange={(value) =>
            props.form.setValue('durationSeconds', Number(value), {
              shouldValidate: true,
            })
          }
          disabled={props.disabled || durationMode === 'intelligent'}
        >
          <SelectTrigger
            id={durationId}
            aria-label={t('Duration')}
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

      <Field>
        <div className='flex items-center justify-between gap-2'>
          <FieldLabel htmlFor={audioId}>{t('Generate audio')}</FieldLabel>
          <Switch
            id={audioId}
            checked={generateAudio}
            disabled={props.disabled}
            onCheckedChange={(checked) =>
              props.form.setValue('generateAudio', checked, {
                shouldValidate: true,
              })
            }
          />
        </div>
      </Field>

      <Field>
        <div className='flex items-center justify-between gap-2'>
          <FieldLabel htmlFor={watermarkId}>{t('Watermark')}</FieldLabel>
          <Switch
            id={watermarkId}
            checked={watermark}
            disabled={props.disabled}
            onCheckedChange={(checked) =>
              props.form.setValue('watermark', checked, {
                shouldValidate: true,
              })
            }
          />
        </div>
      </Field>

      <Field>
        <div className='flex items-center justify-between gap-2'>
          <FieldLabel htmlFor={returnFrameId}>
            {t('Return last frame')}
          </FieldLabel>
          <Switch
            id={returnFrameId}
            checked={returnLastFrame}
            disabled={props.disabled}
            onCheckedChange={(checked) =>
              props.form.setValue('returnLastFrame', checked, {
                shouldValidate: true,
              })
            }
          />
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor={seedId}>{t('Random seed (optional)')}</FieldLabel>
        <Input
          id={seedId}
          inputMode='numeric'
          value={seed}
          placeholder={t('Leave empty for random')}
          disabled={props.disabled}
          onChange={(event) =>
            props.form.setValue('seed', event.target.value, {
              shouldValidate: true,
            })
          }
        />
      </Field>
    </FieldGroup>
  )
}

function durationSecondsOptions(range: {
  minSeconds: number
  maxSeconds: number
}): number[] {
  const result: number[] = []
  for (let value = range.minSeconds; value <= range.maxSeconds; value += 1) {
    result.push(value)
  }
  return result
}
