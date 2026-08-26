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
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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

import { canPreviewReferenceMime } from '../lib/reference-images'
import type { ImageModelProfile, ReferenceImage } from '../types'
import { ReferenceImageUpload } from './reference-image-upload'

type ImageReferenceTrayProps = {
  profile: ImageModelProfile
  images: ReferenceImage[]
  disabled?: boolean
  onChange: (images: ReferenceImage[]) => void
}

/**
 * The compact Reference Tray column shown alongside the prompt on
 * desktop and below the prompt on mobile. The "+" affordance opens
 * the existing `ReferenceImageUpload` (validation, count limits and
 * drag/drop lifecycle intact) inside a Popover (desktop) or Sheet
 * (mobile); the tray itself renders the thumbnail strip and remove
 * affordance. The component is presentation-only — it receives the
 * shared image list and forwards every change back to the page.
 */
export function ImageReferenceTray(props: ImageReferenceTrayProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  if (props.profile.maxReferenceImages <= 0) {
    return null
  }

  const remaining = props.profile.maxReferenceImages - props.images.length
  const hasImages = props.images.length > 0
  const addLabel = hasImages
    ? t('Add image ({{remaining}} left)', { remaining })
    : t('Add reference image')

  const trigger = (
    <Button
      type='button'
      variant='outline'
      size='sm'
      disabled={props.disabled || remaining <= 0}
      className='w-full justify-start'
      aria-label={addLabel}
    >
      <HugeiconsIcon icon={Add01Icon} aria-hidden data-icon='inline-start' />
      <span className='truncate'>{addLabel}</span>
    </Button>
  )

  const popoverBody = (
    <ReferenceImageUpload
      profile={props.profile}
      images={props.images}
      disabled={props.disabled}
      onChange={props.onChange}
      hideThumbnails
    />
  )

  return (
    <div
      role='group'
      aria-label={t('Reference images')}
      className='flex flex-col gap-2'
    >
      {isMobile ? (
        <Sheet>
          <SheetTrigger render={trigger} />
          <SheetContent
            className='max-h-[85vh] overflow-y-auto rounded-t-xl'
            side='bottom'
          >
            <SheetHeader>
              <SheetTitle>{t('Reference images')}</SheetTitle>
            </SheetHeader>
            <div className='p-4'>{popoverBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover>
          <PopoverTrigger render={trigger} />
          <PopoverContent
            align='start'
            className='w-80 max-w-[calc(100vw-2rem)] p-3'
            collisionPadding={8}
          >
            {popoverBody}
          </PopoverContent>
        </Popover>
      )}

      {hasImages ? (
        <ul
          className='flex flex-wrap gap-1.5'
          aria-label={t('Reference images')}
        >
          {props.images.map((image) => (
            <li key={image.id} className='relative size-12'>
              {canPreviewReferenceMime(image.mimeType) ? (
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className='size-12 rounded-md object-cover'
                />
              ) : (
                <div
                  className='bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-md p-1 text-center text-[10px] leading-tight break-all'
                  title={image.name}
                >
                  {image.name}
                </div>
              )}
              <Button
                type='button'
                size='icon-xs'
                variant='secondary'
                className='absolute -top-1.5 -right-1.5'
                aria-label={t('Remove reference image: {{name}}', {
                  name: image.name,
                })}
                disabled={props.disabled}
                onClick={() =>
                  props.onChange(
                    props.images.filter((item) => item.id !== image.id)
                  )
                }
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  aria-hidden
                  data-icon='inline-start'
                />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('text-muted-foreground text-xs leading-4')}>
          {t('Attach up to {{max}} reference images.', {
            max: props.profile.maxReferenceImages,
          })}
        </p>
      )}
    </div>
  )
}
