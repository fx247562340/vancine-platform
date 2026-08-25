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
import { Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type ConnectionKeyOption = {
  id: number
  name: string
  maskedKey: string
}

type ConnectionSettingsProps = {
  keys: ReadonlyArray<ConnectionKeyOption>
  selectedId: number | null
  onChange: (id: number) => void
  isLoading: boolean
  disabled: boolean
}

export function ConnectionSettings(props: ConnectionSettingsProps) {
  const { t } = useTranslation()
  const apiKeyId = useId()
  const selected = props.keys.find((key) => key.id === props.selectedId)
  const items = [
    { value: null, label: t('Select an API key') },
    ...props.keys.map((key) => ({
      value: String(key.id),
      label: `${key.name} · ${key.maskedKey}`,
    })),
  ]

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.isLoading}
            aria-label={t('Connection settings')}
          >
            <HugeiconsIcon
              icon={Settings01Icon}
              aria-hidden
              data-icon='inline-start'
            />
            <span className='hidden sm:inline'>{t('Connection')}</span>
          </Button>
        }
      />
      <PopoverContent align='end' className='w-80 max-w-[calc(100vw-2rem)] p-3'>
        <div className='flex flex-col gap-1 px-1'>
          <p className='text-sm font-semibold'>{t('Connection')}</p>
          <p className='text-muted-foreground text-xs leading-4'>
            {t('Select the API key used for this session.')}
          </p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={apiKeyId}>{t('API Key')}</FieldLabel>
            <Select
              items={items}
              value={props.selectedId == null ? null : String(props.selectedId)}
              onValueChange={(value) => value && props.onChange(Number(value))}
              disabled={props.disabled || props.keys.length === 0}
            >
              <SelectTrigger
                id={apiKeyId}
                className='w-full min-w-0'
                aria-label={t('API Key')}
              >
                <SelectValue className='truncate'>
                  {selected
                    ? `${selected.name} · ${selected.maskedKey}`
                    : t('Select an API key')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.keys.map((key) => (
                    <SelectItem key={key.id} value={String(key.id)}>
                      {key.name} · {key.maskedKey}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <p className='text-muted-foreground text-xs leading-4'>
          {t(
            'The secret is loaded on demand and stays in memory only; the API key selector is for switching between keys you have already created.'
          )}
        </p>
      </PopoverContent>
    </Popover>
  )
}
