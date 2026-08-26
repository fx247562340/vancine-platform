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
import { useTranslation } from 'react-i18next'

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
import { QuickParameterPill } from '@/features/media-playground/components/quick-parameter-pill'
import { useIsMobile } from '@/hooks/use-mobile'

import type { ImageModelProfile, ReferenceImage } from '../types'
import { AdvancedSettingsFields } from './advanced-settings'

type ImageAdvancedPopoverProps = {
  profile: ImageModelProfile
  references: ReferenceImage[]
  disabled?: boolean
  /** Server error mapped to an advanced field auto-opens the panel. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Profile-driven advanced fields hosted in a Popover (desktop) or
 * Sheet (mobile). The trigger sits in the composer footer; the field
 * grid stays inside the panel. Auto-open on server-side advanced
 * field errors is driven by `open` / `onOpenChange` from the page.
 */
export function ImageAdvancedPopover(props: ImageAdvancedPopoverProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const trigger = (
    <QuickParameterPill ariaLabel={t('Advanced settings')}>
      <HugeiconsIcon
        icon={SlidersHorizontalIcon}
        aria-hidden
        data-icon='inline-start'
      />
      <span>{t('Advanced settings')}</span>
    </QuickParameterPill>
  )

  if (isMobile) {
    return (
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetTrigger render={trigger} />
        <SheetContent
          className='max-h-[85vh] overflow-y-auto rounded-t-xl'
          side='bottom'
        >
          <SheetHeader>
            <SheetTitle>{t('Advanced settings')}</SheetTitle>
          </SheetHeader>
          <div className='p-4'>
            <AdvancedSettingsFields
              profile={props.profile}
              references={props.references}
              disabled={props.disabled}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align='end'
        className='w-96 max-w-[calc(100vw-2rem)] gap-3 p-3'
        collisionPadding={8}
      >
        <div className='flex flex-col gap-1 px-1'>
          <p className='text-sm font-semibold'>{t('Advanced settings')}</p>
          <p className='text-muted-foreground text-xs leading-4'>
            {t('Only parameters supported by the active profile are shown.')}
          </p>
        </div>
        <AdvancedSettingsFields
          profile={props.profile}
          references={props.references}
          disabled={props.disabled}
        />
      </PopoverContent>
    </Popover>
  )
}
