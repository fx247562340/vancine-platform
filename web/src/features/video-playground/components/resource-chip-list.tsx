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
import {
  Cancel01Icon,
  Image01Icon,
  MusicNote01Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { VideoResource } from '../lib/resource-validation'

type ResourceChipListProps = {
  images: ReadonlyArray<VideoResource>
  videos: ReadonlyArray<VideoResource>
  audios: ReadonlyArray<VideoResource>
  onRemove: (id: string, kind: VideoResource['kind']) => void
  onInsertReference: (label: string) => void
}

export function ResourceChipList({
  images,
  videos,
  audios,
  onRemove,
  onInsertReference,
}: ResourceChipListProps) {
  const { t } = useTranslation()

  if (images.length === 0 && videos.length === 0 && audios.length === 0) {
    return null
  }

  let imageIndex = 0
  let videoIndex = 0
  let audioIndex = 0

  return (
    <ul
      className='flex flex-wrap items-center gap-2'
      aria-label={t('Reference assets')}
    >
      {images.map((resource) => {
        imageIndex += 1
        return (
          <ResourceChip
            key={resource.id}
            icon={Image01Icon}
            label={t('@Image{{n}}', { n: imageIndex })}
            name={resource.name}
            durationUnknown={false}
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'image')}
            onInsert={() =>
              onInsertReference(t('@Image{{n}}', { n: imageIndex }))
            }
          />
        )
      })}
      {videos.map((resource) => {
        videoIndex += 1
        return (
          <ResourceChip
            key={resource.id}
            icon={Video01Icon}
            label={t('@Video{{n}}', { n: videoIndex })}
            name={resource.name}
            durationUnknown={
              resource.kind === 'video' &&
              resource.durationSeconds === undefined
            }
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'video')}
            onInsert={() =>
              onInsertReference(t('@Video{{n}}', { n: videoIndex }))
            }
          />
        )
      })}
      {audios.map((resource) => {
        audioIndex += 1
        return (
          <ResourceChip
            key={resource.id}
            icon={MusicNote01Icon}
            label={t('@Audio{{n}}', { n: audioIndex })}
            name={resource.name}
            durationUnknown={
              resource.kind === 'audio' &&
              resource.durationSeconds === undefined
            }
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'audio')}
            onInsert={() =>
              onInsertReference(t('@Audio{{n}}', { n: audioIndex }))
            }
          />
        )
      })}
    </ul>
  )
}

type ResourceChipProps = {
  icon: typeof Image01Icon
  label: string
  name: string
  durationUnknown: boolean
  sizeUnknown: boolean
  onRemove: () => void
  onInsert: () => void
}

function ResourceChip({
  icon,
  label,
  name,
  durationUnknown,
  sizeUnknown,
  onRemove,
  onInsert,
}: ResourceChipProps) {
  const { t } = useTranslation()
  return (
    <li
      className={cn(
        'border-border/60 bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs'
      )}
    >
      <HugeiconsIcon icon={icon} aria-hidden data-icon='chip' />
      <button
        type='button'
        className='hover:text-foreground text-foreground font-mono underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none'
        onClick={onInsert}
        aria-label={t('Insert {{label}} into prompt', { label: label })}
      >
        {label}
      </button>
      <span
        className='text-muted-foreground hidden max-w-[8rem] truncate sm:inline'
        title={name}
      >
        {name}
      </span>
      {sizeUnknown ? (
        <span className='text-muted-foreground italic'>
          {t('Size unknown — upstream will verify.')}
        </span>
      ) : null}
      {durationUnknown ? (
        <span className='text-muted-foreground italic'>
          {t('Duration unknown — upstream will verify.')}
        </span>
      ) : null}
      <Button
        type='button'
        size='icon-sm'
        variant='ghost'
        onClick={onRemove}
        aria-label={t('Remove {{name}}', { name: label })}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden data-icon='inline-end' />
      </Button>
    </li>
  )
}
