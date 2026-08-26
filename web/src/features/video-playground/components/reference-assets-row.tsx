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
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { VideoCapability } from '../lib/capabilities'
import type { VideoFormValues } from '../lib/form-schema'
import { readImageDimensions } from '../lib/image-dimensions'
import { readMediaDuration } from '../lib/media-duration'
import type { ResourceStore as UseResourceStore } from '../lib/use-resource-store'
import { ResourceAdder } from './resource-adder'
import { ResourceChipList } from './resource-chip-list'

type ReferenceAssetsRowProps = {
  capability: VideoCapability
  resourceStore: UseResourceStore
  form: UseFormReturn<VideoFormValues>
}

export function ReferenceAssetsRow(props: ReferenceAssetsRowProps) {
  const { t } = useTranslation()
  const { capability, resourceStore, form } = props
  return (
    <div
      role='group'
      aria-label={t('Reference assets')}
      className='border-border/60 bg-muted/20 flex flex-col gap-2.5 rounded-xl border border-dashed p-3'
    >
      <div className='flex flex-col gap-1.5'>
        <ResourceAdder
          capability={capability}
          kind='image'
          count={resourceStore.images.length}
          maxCount={capability.referenceImage.multimodalMax}
          onAdd={resourceStore.addImage}
          onLocalFile={async (file: File) => {
            if (file.size > capability.referenceImage.perItemMaxBytes) {
              return null
            }
            const mime = file.type
            if (!capability.referenceImage.supportedFormats.includes(mime)) {
              return null
            }
            const dimensions = await readImageDimensions(file).catch(() => {
              throw new Error('Could not read this image.')
            })
            const dataUrl = await readFileAsDataUrl(file)
            return {
              id: makeId('img'),
              kind: 'image' as const,
              source: { kind: 'base64' as const, dataUrl },
              name: file.name,
              mimeType: mime,
              byteSize: file.size,
              width: dimensions.width,
              height: dimensions.height,
            }
          }}
          acceptsLocalFile
          acceptsAssetId={false}
          buttonLabelKey='Add image'
          buttonAriaLabelKey='Add reference image'
          urlPlaceholderKey='https://cdn.example.com/reference.png'
          triggerClassName='w-full justify-start'
        />
        <ResourceAdder
          capability={capability}
          kind='video'
          count={resourceStore.videos.length}
          maxCount={capability.referenceVideo.maxCount}
          onAdd={resourceStore.addVideo}
          onLocalFile={async () => null}
          acceptsLocalFile={false}
          acceptsAssetId
          buttonLabelKey='Add video'
          buttonAriaLabelKey='Add reference video'
          urlPlaceholderKey='https://cdn.example.com/reference.mp4'
          triggerClassName='w-full justify-start'
        />
        <ResourceAdder
          capability={capability}
          kind='audio'
          count={resourceStore.audios.length}
          maxCount={capability.referenceAudio.maxCount}
          onAdd={resourceStore.addAudio}
          onLocalFile={async (file: File) => {
            if (file.size > capability.referenceAudio.perItemMaxBytes) {
              return null
            }
            const mime = file.type
            if (!capability.referenceAudio.supportedFormats.includes(mime)) {
              return null
            }
            const dataUrl = await readFileAsDataUrl(file)
            const duration = await readMediaDuration(dataUrl, mime)
            if (duration === undefined) {
              throw new Error('Could not read this audio.')
            }
            return {
              id: makeId('aud'),
              kind: 'audio' as const,
              source: { kind: 'base64' as const, dataUrl },
              name: file.name,
              mimeType: mime,
              byteSize: file.size,
              durationSeconds: duration,
            }
          }}
          acceptsLocalFile
          acceptsAssetId={false}
          buttonLabelKey='Add audio'
          buttonAriaLabelKey='Add reference audio'
          urlPlaceholderKey='https://cdn.example.com/reference.wav'
          triggerClassName='w-full justify-start'
        />
        {resourceStore.images.length > 0 ||
        resourceStore.videos.length > 0 ||
        resourceStore.audios.length > 0 ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='w-full justify-start'
            onClick={() => resourceStore.reset()}
            aria-label={t('Clear all references')}
          >
            {t('Clear all')}
          </Button>
        ) : null}
      </div>
      <ResourceChipList
        images={resourceStore.images}
        videos={resourceStore.videos}
        audios={resourceStore.audios}
        onRemove={(id, kind) => {
          if (kind === 'image') resourceStore.removeImage(id)
          else if (kind === 'video') resourceStore.removeVideo(id)
          else resourceStore.removeAudio(id)
        }}
        onInsertReference={(label) => {
          const current = form.getValues('prompt')
          const next =
            current.length === 0 ? `${label} ` : `${current} ${label} `
          form.setValue('prompt', next, { shouldValidate: true })
        }}
      />
    </div>
  )
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(
        reader.error instanceof Error
          ? reader.error
          : new Error('FileReader failed')
      )
    reader.readAsDataURL(file)
  })
}
