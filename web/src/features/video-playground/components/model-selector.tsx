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
import { useTranslation } from 'react-i18next'

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { VideoModelOption } from '../types'

type VideoModelSelectorProps = {
  models: VideoModelOption[]
  selectedModel: string
  onChange: (model: string) => void
  disabled?: boolean
}

export function VideoModelSelector(props: VideoModelSelectorProps) {
  const { t } = useTranslation()
  const items = [
    { value: null, label: t('Select a video model') },
    ...props.models.map((model) => ({
      value: model.value,
      label: model.label,
    })),
  ]

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor='video-playground-model'>
          {t('Video model')}
        </FieldLabel>
        <Select
          items={items}
          value={props.selectedModel === '' ? null : props.selectedModel}
          onValueChange={(value) => {
            if (value) props.onChange(value)
          }}
          disabled={props.disabled || props.models.length === 0}
        >
          <SelectTrigger
            id='video-playground-model'
            aria-label={t('Video model')}
            className='max-w-full min-w-0'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.models.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}
