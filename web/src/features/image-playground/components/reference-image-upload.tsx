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
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import {
  canPreviewReferenceMime,
  createReferenceImage,
  fileToDataUrl,
  referenceFileAccept,
  validateReferenceFile,
} from '../lib/reference-images'
import type { ImageModelProfile, ReferenceImage } from '../types'

type ReferenceImageUploadProps = {
  profile: ImageModelProfile
  images: ReferenceImage[]
  disabled?: boolean
  onChange: (images: ReferenceImage[]) => void
  /**
   * Hide the inline thumbnail strip. The Canvas Composer Reference
   * Tray renders the strip itself; the popover body only needs the
   * add affordance. Validation, count limits, and the file input
   * lifecycle stay unchanged.
   */
  hideThumbnails?: boolean
}

export function ReferenceImageUpload(props: ReferenceImageUploadProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')

  if (props.profile.maxReferenceImages <= 0) {
    return null
  }

  const remaining = props.profile.maxReferenceImages - props.images.length

  async function addFiles(fileList: FileList | File[]) {
    const files = [...fileList]
    let next = [...props.images]
    let nextError = ''
    for (const file of files) {
      const currentTotalBytes = next.reduce(
        (sum, image) => sum + (image.size ?? 0),
        0
      )
      const validationError = validateReferenceFile(
        file,
        props.profile,
        next.length,
        currentTotalBytes
      )
      if (validationError) {
        nextError = t(validationError)
        break
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        next = [...next, createReferenceImage(file, dataUrl)]
      } catch {
        nextError = t('Failed to read image')
        break
      }
    }
    setError(nextError)
    props.onChange(next)
  }

  return (
    <div className='space-y-2'>
      <Label htmlFor='image-reference-upload'>
        {t('Reference images')}
        <span className='text-muted-foreground font-normal'>
          {` ${props.images.length}/${props.profile.maxReferenceImages}`}
        </span>
      </Label>
      <div
        className={cn(
          'border-input bg-muted/20 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
          isDragging && 'border-primary bg-muted/40',
          props.disabled && 'opacity-50'
        )}
        onDragOver={(event) => {
          event.preventDefault()
          if (!props.disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (!props.disabled) {
            void addFiles(event.dataTransfer.files)
          }
        }}
      >
        <input
          id='image-reference-upload'
          ref={inputRef}
          type='file'
          accept={referenceFileAccept(props.profile)}
          multiple
          className='sr-only'
          disabled={props.disabled || remaining <= 0}
          onChange={(event) => {
            if (event.target.files) {
              void addFiles(event.target.files)
              event.target.value = ''
            }
          }}
        />
        <HugeiconsIcon
          icon={Add01Icon}
          aria-hidden
          className='text-muted-foreground mb-2'
        />
        <p className='text-muted-foreground text-sm'>
          {t('Drop images here or choose files')}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='mt-2'
          disabled={props.disabled || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          {t('Choose files')}
        </Button>
      </div>
      {props.images.length > 0 && !props.hideThumbnails ? (
        <ul className='flex flex-wrap gap-2'>
          {props.images.map((image) => (
            <li key={image.id} className='relative size-20'>
              {canPreviewReferenceMime(image.mimeType) ? (
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className='size-20 rounded-md object-cover'
                />
              ) : (
                <div
                  className='bg-muted text-muted-foreground flex size-20 items-center justify-center rounded-md p-1 text-center text-[10px] leading-tight break-all'
                  title={image.name}
                >
                  {image.name}
                </div>
              )}
              <Button
                type='button'
                size='icon'
                variant='secondary'
                className='absolute -top-2 -right-2 size-6'
                aria-label={t('Remove reference image')}
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
      ) : null}
      {error ? (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      ) : null}
    </div>
  )
}
