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
import { SlidersHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import type { ResourceComposition, VideoCapability } from '../lib/capabilities'
import type { VideoFormValues } from '../lib/form-schema'
import type { CreationMode } from '../lib/mode'
import { VideoParametersPanel } from './parameters-panel'

type VideoParametersPopoverProps = {
  model: VideoCapability
  mode: CreationMode
  composition: ResourceComposition
  /**
   * Single source of truth: the React Hook Form instance the submit
   * handler also reads. The panel writes through `form.setValue`.
   */
  form: UseFormReturn<VideoFormValues>
  invalidReasonKey: string | undefined
  disabled?: boolean
  /** Number of enabled parameters — used as the badge on the trigger. */
  activeCount: number
}

export function VideoParametersPopover(props: VideoParametersPopoverProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const trigger = (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      disabled={props.disabled}
      aria-label={t('Parameter settings')}
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-muted/70 relative font-medium'
      )}
    >
      <HugeiconsIcon
        icon={SlidersHorizontalIcon}
        aria-hidden
        data-icon='inline-start'
      />
      <span className='hidden sm:inline'>{t('Parameters')}</span>
      {props.activeCount > 0 ? (
        <span
          aria-label={t('{{count}} active parameters', {
            count: props.activeCount,
          })}
          className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold'
        >
          {props.activeCount}
        </span>
      ) : null}
    </Button>
  )

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger render={trigger} />
        <SheetContent
          className='max-h-[85vh] overflow-y-auto rounded-t-xl'
          side='bottom'
        >
          <SheetHeader>
            <SheetTitle>{t('Parameter settings')}</SheetTitle>
          </SheetHeader>
          <div className='p-4'>
            <VideoParametersPanel
              model={props.model}
              mode={props.mode}
              composition={props.composition}
              disabled={props.disabled}
              form={props.form}
              invalidReasonKey={props.invalidReasonKey}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align='end'
        className='w-96 max-w-[calc(100vw-2rem)] gap-3 p-3'
        collisionPadding={8}
      >
        <div className='flex flex-col gap-1 px-1'>
          <p className='text-sm font-semibold'>{t('Parameter settings')}</p>
          <p className='text-muted-foreground text-xs leading-4'>
            {t('Only enabled parameters are sent with the request.')}
          </p>
        </div>
        <VideoParametersPanel
          model={props.model}
          mode={props.mode}
          composition={props.composition}
          disabled={props.disabled}
          form={props.form}
          invalidReasonKey={props.invalidReasonKey}
        />
      </PopoverContent>
    </Popover>
  )
}
