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

/**
 * Whether the composer's prompt understands `@Image1`-style reference tokens.
 *
 * `prompt-token` is the dedicated Seedance wire format: the prompt cites each
 * attached asset by token, so a chip's label is a button that inserts one.
 * `inert` is the generic contract: the reference image travels in the top-level
 * `image` field and no token syntax exists, so a chip shows no token and offers
 * no insert action at all — not a disabled button, and not a no-op one.
 *
 * The union is required rather than defaulted so every tray states which
 * contract its composer actually sends.
 */
export type ChipReferenceMode =
  | { kind: 'prompt-token'; onInsertReference: (label: string) => void }
  | { kind: 'inert' }

type ResourceChipListProps = {
  images: ReadonlyArray<VideoResource>
  videos: ReadonlyArray<VideoResource>
  audios: ReadonlyArray<VideoResource>
  onRemove: (id: string, kind: VideoResource['kind']) => void
  referenceMode: ChipReferenceMode
}

export function ResourceChipList({
  images,
  videos,
  audios,
  onRemove,
  referenceMode,
}: ResourceChipListProps) {
  const { t } = useTranslation()

  if (images.length === 0 && videos.length === 0 && audios.length === 0) {
    return null
  }

  // One closure per chip kind keeps the token and its insert action together, so
  // an inert tray cannot produce a label that looks actionable.
  const referenceFor = (token: string) =>
    referenceMode.kind === 'prompt-token'
      ? {
          label: token,
          onInsert: () => referenceMode.onInsertReference(token),
        }
      : undefined

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
            reference={referenceFor(t('@Image{{n}}', { n: imageIndex }))}
            name={resource.name}
            durationUnknown={false}
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'image')}
          />
        )
      })}
      {videos.map((resource) => {
        videoIndex += 1
        return (
          <ResourceChip
            key={resource.id}
            icon={Video01Icon}
            reference={referenceFor(t('@Video{{n}}', { n: videoIndex }))}
            name={resource.name}
            durationUnknown={
              resource.kind === 'video' &&
              resource.durationSeconds === undefined
            }
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'video')}
          />
        )
      })}
      {audios.map((resource) => {
        audioIndex += 1
        return (
          <ResourceChip
            key={resource.id}
            icon={MusicNote01Icon}
            reference={referenceFor(t('@Audio{{n}}', { n: audioIndex }))}
            name={resource.name}
            durationUnknown={
              resource.kind === 'audio' &&
              resource.durationSeconds === undefined
            }
            sizeUnknown={resource.byteSize === undefined}
            onRemove={() => onRemove(resource.id, 'audio')}
          />
        )
      })}
    </ul>
  )
}

type ResourceChipProps = {
  icon: typeof Image01Icon
  /**
   * The prompt reference token and its insert action, present only when the
   * composer's prompt supports reference tokens. Absent as a whole: there is no
   * way to render a token without an action behind it.
   */
  reference?: { label: string; onInsert: () => void }
  name: string
  durationUnknown: boolean
  sizeUnknown: boolean
  onRemove: () => void
}

function ResourceChip({
  icon,
  reference,
  name,
  durationUnknown,
  sizeUnknown,
  onRemove,
}: ResourceChipProps) {
  const { t } = useTranslation()
  return (
    <li
      className={cn(
        'border-border/60 bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs'
      )}
    >
      <HugeiconsIcon icon={icon} aria-hidden data-icon='chip' />
      {reference ? (
        <button
          type='button'
          className='hover:text-foreground text-foreground font-mono underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none'
          onClick={reference.onInsert}
          aria-label={t('Insert {{label}} into prompt', {
            label: reference.label,
          })}
        >
          {reference.label}
        </button>
      ) : null}
      <span
        className={cn(
          'text-muted-foreground max-w-[8rem] truncate',
          // With no token to identify it, the name is the chip's only text, so it
          // stays visible at every breakpoint instead of hiding on mobile.
          reference ? 'hidden sm:inline' : 'inline'
        )}
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
        aria-label={t('Remove {{name}}', { name: reference?.label ?? name })}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden data-icon='inline-end' />
      </Button>
    </li>
  )
}
