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
import { API_KEY_STATUSES } from '@/features/keys/constants'

import type { VideoApiKeyOption } from '../lib/keys'

type ApiKeySelectorProps = {
  keys: VideoApiKeyOption[]
  selectedId: number | null
  onChange: (id: number) => void
  disabled?: boolean
}

export function ApiKeySelector({
  keys,
  selectedId,
  onChange,
  disabled,
}: ApiKeySelectorProps) {
  const { t } = useTranslation()
  const selected = keys.find((key) => key.id === selectedId)

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor='video-playground-api-key'>
          {t('API Key')}
        </FieldLabel>
        <Select
          value={selectedId == null ? '' : String(selectedId)}
          onValueChange={(value) => {
            if (value) onChange(Number(value))
          }}
          disabled={disabled || keys.length === 0}
        >
          <SelectTrigger
            id='video-playground-api-key'
            aria-label={t('API Key')}
            className='max-w-full min-w-0'
          >
            <SelectValue
              placeholder={t('Select an API key')}
              className='truncate'
            >
              {selected
                ? `${selected.name} · ${selected.maskedKey}`
                : t('Select an API key')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {keys.map((key) => {
                const status = API_KEY_STATUSES[key.status]
                return (
                  <SelectItem key={key.id} value={String(key.id)}>
                    {key.name} · {key.maskedKey} ·{' '}
                    {t(status?.label ?? 'Enabled')}
                  </SelectItem>
                )
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}
