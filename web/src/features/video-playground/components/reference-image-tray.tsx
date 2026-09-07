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
import { Cancel01Icon, Image01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { cn } from '@/lib/utils'

import {
  REFERENCE_IMAGE_MIME_TYPES,
  type VideoModelCapability,
} from '../lib/model-capabilities'
import {
  dataTransferHasImage,
  filesFromDataTransfer,
  intakeReferenceImageFiles,
  type ReferenceImageRejection,
} from '../lib/reference-images'
import type { VideoImageResource } from '../lib/resource-validation'

type ReferenceImageTrayProps = {
  capability: VideoModelCapability
  images: ReadonlyArray<VideoImageResource>
  /** Object URLs owned by the resource store, never the image bytes. */
  previewUrls: Readonly<Record<string, string>>
  /** True while no API key or no model list is ready. */
  disabled: boolean
  onAdd: (images: ReadonlyArray<VideoImageResource>) => void
  onRemove: (id: string) => void
  onAttachPreview: (id: string, blob: Blob) => void
}

/**
 * The reference-image tray.
 *
 * Three local input paths and nothing else: picking files, dropping images on
 * the tray, and pasting real image bytes from the clipboard. There is no URL
 * field, so an http(s) address, a typed `data:` string, a `blob:` string or a
 * `file:` path has no way in.
 *
 * All three paths funnel through `intakeReferenceImageFiles`, so the model cap,
 * the MIME allowlist and the per-image byte budget reject identically no matter
 * how the bytes arrived. Errors are shown inline inside the tray and disappear
 * as soon as the user fixes the cause — a successful add or a removal.
 *
 * Thumbnails render object URLs owned by the resource store. The base64 payload
 * that actually goes on the wire never reaches a DOM attribute, a log, an error
 * message or any storage.
 */
export function ReferenceImageTray(props: ReferenceImageTrayProps) {
  const { t } = useTranslation()
  // Locals rather than `props.x` because these values are hook dependencies.
  const {
    capability,
    images,
    previewUrls,
    disabled,
    onAdd,
    onRemove,
    onAttachPreview,
  } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const [rejection, setRejection] = useState<ReferenceImageRejection | null>(
    null
  )
  const [isDragging, setIsDragging] = useState(false)

  const addFiles = useCallback(
    async (files: ReadonlyArray<File>) => {
      const intake = await intakeReferenceImageFiles(
        capability,
        images.length,
        files
      )
      if (!intake.ok) {
        setRejection(intake.rejection)
        return
      }
      if (intake.images.length === 0) {
        return
      }
      setRejection(null)
      onAdd(intake.images)
    },
    [capability, images.length, onAdd]
  )

  // Clipboard images are accepted wherever the focus is, but only when the
  // clipboard actually holds image bytes: a text-only paste is left alone, so
  // typing into the prompt and pasting ordinary text keeps working.
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled || !dataTransferHasImage(event.clipboardData)) {
        return
      }
      event.preventDefault()
      void addFiles(filesFromDataTransfer(event.clipboardData))
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addFiles, disabled])

  // A model switch changes every rule the tray enforces, so a rejection left
  // over from the previous model must not survive it.
  useEffect(() => {
    setRejection(null)
  }, [capability])

  // Thumbnails come from the retained local bytes rather than being created at
  // intake time, so restoring a submitted task's reference images re-attaches
  // previews the tray had already revoked.
  useEffect(() => {
    for (const image of images) {
      if (!image.blob || previewUrls[image.id]) {
        continue
      }
      onAttachPreview(image.id, image.blob)
    }
  }, [images, previewUrls, onAttachPreview])

  const handleRemove = (id: string) => {
    setRejection(null)
    onRemove(id)
  }

  return (
    <div role='group' aria-labelledby={labelId} className='flex flex-col gap-2'>
      <span id={labelId} className='text-sm font-medium'>
        {t('Reference images')}
      </span>
      <div
        data-testid='reference-image-dropzone'
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) {
            setIsDragging(true)
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (disabled) {
            return
          }
          void addFiles(filesFromDataTransfer(event.dataTransfer))
        }}
        className={cn(
          'border-input bg-muted/20 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
          isDragging && 'border-primary bg-muted/40',
          disabled && 'opacity-50'
        )}
      >
        <input
          ref={inputRef}
          type='file'
          accept={REFERENCE_IMAGE_MIME_TYPES.join(',')}
          multiple
          tabIndex={-1}
          aria-hidden
          data-testid='reference-image-file-input'
          className='sr-only'
          disabled={disabled}
          onChange={(event) => {
            const files = event.target.files ? [...event.target.files] : []
            // Reset so picking the same file again still fires change.
            event.target.value = ''
            if (files.length > 0) {
              void addFiles(files)
            }
          }}
        />
        <HugeiconsIcon
          icon={Image01Icon}
          aria-hidden
          className='text-muted-foreground size-4'
        />
        <p className='text-muted-foreground text-xs'>
          {t('Drop images here or choose files')}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {t('Choose files')}
        </Button>
      </div>

      {images.length > 0 ? (
        <ul className='flex flex-wrap gap-2'>
          {images.map((image) => {
            const previewUrl = previewUrls[image.id]
            return (
              <li key={image.id} className='relative'>
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={image.name}
                    className='border-border/60 size-16 rounded-lg border object-cover'
                  />
                ) : (
                  <span
                    aria-label={image.name}
                    className='bg-muted border-border/60 text-muted-foreground flex size-16 items-center justify-center rounded-lg border'
                  >
                    <HugeiconsIcon icon={Image01Icon} aria-hidden />
                  </span>
                )}
                <Button
                  type='button'
                  size='icon-xs'
                  variant='secondary'
                  className='absolute -top-1.5 -right-1.5 rounded-full'
                  onClick={() => handleRemove(image.id)}
                  aria-label={t('Remove {{name}}', { name: image.name })}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    aria-hidden
                    data-icon='inline-end'
                  />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {rejection ? (
        <FieldError>
          {t(rejection.reasonKey, rejection.interpolation)}
        </FieldError>
      ) : null}
    </div>
  )
}
