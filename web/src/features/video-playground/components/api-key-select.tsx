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
import { Key01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { VideoApiKeyOption } from '../lib/keys'

type ApiKeySelectProps = {
  keys: ReadonlyArray<VideoApiKeyOption>
  selectedId: number | null
  onChange: (id: number) => void
  isLoading: boolean
}

/**
 * The session's API key picker, shown in the page header.
 *
 * It is a selector, not a status flag: the trigger always names the key in use
 * with its server-masked value, and the menu lists every usable key so the user
 * can switch. Only the masked key is ever rendered — the secret is loaded on
 * demand per request and stays in memory.
 */
export function ApiKeySelect(props: ApiKeySelectProps) {
  const { t } = useTranslation()
  const selected = props.keys.find((key) => key.id === props.selectedId)

  let triggerLabel = t('Select an API key')
  if (selected) {
    triggerLabel = `${selected.name} · ${selected.maskedKey}`
  } else if (props.isLoading) {
    triggerLabel = t('Loading...')
  }

  return (
    <div className='min-w-0 max-md:w-full'>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type='button'
              variant='outline'
              disabled={props.isLoading || props.keys.length === 0}
              aria-label={t('API Key')}
              className='h-8 w-full min-w-0 justify-start font-normal md:w-auto md:max-w-64'
            >
              <HugeiconsIcon
                icon={Key01Icon}
                aria-hidden
                data-icon='inline-start'
              />
              <span className='truncate'>{triggerLabel}</span>
            </Button>
          }
        />
        <DropdownMenuContent
          align='end'
          className='w-72 max-w-[calc(100vw-2rem)]'
        >
          <DropdownMenuRadioGroup
            value={props.selectedId == null ? null : String(props.selectedId)}
            onValueChange={(value) => {
              if (typeof value === 'string' && value !== '') {
                props.onChange(Number(value))
              }
            }}
          >
            {props.keys.map((key) => (
              <DropdownMenuRadioItem
                key={key.id}
                value={String(key.id)}
                closeOnClick
              >
                <span className='min-w-0 flex-1 truncate'>{key.name}</span>
                <span className='text-muted-foreground shrink-0 text-xs'>
                  {key.maskedKey}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
