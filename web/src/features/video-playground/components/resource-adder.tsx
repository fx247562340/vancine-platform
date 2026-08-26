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
  Image01Icon,
  MusicNote01Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import type { VideoCapability } from '../lib/capabilities'
import {
  isCanonicalAssetUrl,
  mediaMimeFromHttpsUrl,
  safeRemoteUrl,
} from '../lib/preflight'
import type { VideoResource } from '../lib/resource-validation'

type ResourceKind = 'image' | 'video' | 'audio'

type ResourceAdderProps = {
  capability: VideoCapability
  disabled?: boolean
  /** Current count of resources for this kind. */
  count: number
  maxCount: number
  /** Per-kind dispatcher provided by useResourceStore. */
  onAdd: (resource: VideoResource) => void
  onLocalFile: (file: File) => Promise<VideoResource | null>
  /** Default resource kind handled by this adder. */
  kind: ResourceKind
  buttonLabelKey: string
  buttonAriaLabelKey: string
  /** Whether local file pickers are supported for this kind. */
  acceptsLocalFile: boolean
  /** Whether asset:// ids are supported for this kind. */
  acceptsAssetId: boolean
  /** Hint text for the URL placeholder. */
  urlPlaceholderKey: string
  /** Optional className for the trigger button (e.g. layout sizing). */
  triggerClassName?: string
}

const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/gif',
  'image/heic',
  'image/heif',
]
const ACCEPTED_AUDIO_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3']

export function ResourceAdder(props: ResourceAdderProps) {
  const { t } = useTranslation()
  const {
    capability,
    disabled,
    count,
    maxCount,
    onAdd,
    onLocalFile,
    kind,
    buttonLabelKey,
    buttonAriaLabelKey,
    acceptsLocalFile,
    acceptsAssetId,
    urlPlaceholderKey,
  } = props

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [assetValue, setAssetValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const urlId = useId()
  const assetId = useId()
  const fileId = useId()
  const urlErrorId = useId()
  const assetErrorId = useId()
  const fileErrorId = useId()

  const isFull = count >= maxCount

  const iconByKind = {
    image: Image01Icon,
    video: Video01Icon,
    audio: MusicNote01Icon,
  } as const

  const Icon = iconByKind[kind]
  const referenceLabel = referenceLabelFor(kind, t)

  const handleUrlAdd = () => {
    setUrlError(null)
    setAssetError(null)
    const trimmed = urlValue.trim()
    if (!trimmed) {
      setUrlError('Please enter a URL.')
      return
    }
    const resource = buildUrlResource(kind, trimmed, capability)
    if (!resource) {
      setUrlError('This URL is not supported.')
      return
    }
    onAdd(resource)
    setUrlValue('')
    setOpen(false)
  }

  const handleAssetAdd = () => {
    setAssetError(null)
    setUrlError(null)
    const trimmed = assetValue.trim()
    if (!trimmed) {
      setAssetError('Please enter an asset id.')
      return
    }
    const resource = buildAssetResource(kind, trimmed)
    if (!resource) {
      setAssetError('This URL is not supported.')
      return
    }
    onAdd(resource)
    setAssetValue('')
    setOpen(false)
  }

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileError(null)
    try {
      const resource = await onLocalFile(file)
      if (!resource) {
        setFileError('This file is not supported by the current model.')
        return
      }
      onAdd(resource)
      setOpen(false)
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled || isFull}
            aria-label={t(buttonAriaLabelKey)}
            className={props.triggerClassName}
          >
            <HugeiconsIcon icon={Icon} aria-hidden data-icon='inline-start' />
            <span className='hidden sm:inline'>{t(buttonLabelKey)}</span>
          </Button>
        }
      />
      <PopoverContent
        align='start'
        className='w-80 max-w-[calc(100vw-2rem)] gap-3 p-3'
        collisionPadding={8}
      >
        <div className='flex flex-col gap-1 px-1'>
          <p className='text-sm font-semibold'>{referenceLabel}</p>
          <p className='text-muted-foreground text-xs leading-4'>
            {t('Add up to {{max}} for this model.', { max: maxCount })}
          </p>
        </div>
        <FieldGroup>
          <Field data-invalid={urlError ? true : undefined}>
            <FieldLabel htmlFor={urlId}>{t('Public URL')}</FieldLabel>
            <div className='flex gap-2'>
              <Input
                id={urlId}
                value={urlValue}
                placeholder={urlPlaceholderKey}
                aria-invalid={urlError ? true : undefined}
                aria-describedby={urlError ? urlErrorId : undefined}
                onChange={(event) => {
                  setUrlValue(event.target.value)
                  if (urlError) setUrlError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleUrlAdd()
                  }
                }}
              />
              <Button type='button' size='sm' onClick={handleUrlAdd}>
                {t('Add')}
              </Button>
            </div>
            {urlError ? (
              <FieldError id={urlErrorId} role='alert'>
                {t(urlError)}
              </FieldError>
            ) : null}
          </Field>
          {acceptsAssetId ? (
            <Field data-invalid={assetError ? true : undefined}>
              <FieldLabel htmlFor={assetId}>
                {t('Asset id (allowlist)')}
              </FieldLabel>
              <p className='text-muted-foreground text-xs leading-4'>
                {t('Only for enabled LAS asset-library allowlist.')}
              </p>
              <div className='flex gap-2'>
                <Input
                  id={assetId}
                  value={assetValue}
                  placeholder='asset://<id>'
                  aria-invalid={assetError ? true : undefined}
                  aria-describedby={assetError ? assetErrorId : undefined}
                  onChange={(event) => {
                    setAssetValue(event.target.value)
                    if (assetError) setAssetError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAssetAdd()
                    }
                  }}
                />
                <Button type='button' size='sm' onClick={handleAssetAdd}>
                  {t('Add')}
                </Button>
              </div>
              {assetError ? (
                <FieldError id={assetErrorId} role='alert'>
                  {t(assetError)}
                </FieldError>
              ) : null}
            </Field>
          ) : null}
          {acceptsLocalFile ? (
            <Field data-invalid={fileError ? true : undefined}>
              <FieldLabel htmlFor={fileId}>{t('Local file')}</FieldLabel>
              <Input
                id={fileId}
                ref={fileInputRef}
                type='file'
                accept={acceptListFor(kind)}
                aria-invalid={fileError ? true : undefined}
                aria-describedby={fileError ? fileErrorId : undefined}
                onChange={handleFilePick}
              />
              {fileError ? (
                <FieldError id={fileErrorId} role='alert'>
                  {t(fileError)}
                </FieldError>
              ) : null}
            </Field>
          ) : null}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}

function referenceLabelFor(
  kind: ResourceKind,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (kind === 'image') return t('Add reference image')
  if (kind === 'video') return t('Add reference video')
  return t('Add reference audio')
}

function acceptListFor(kind: ResourceKind): string {
  if (kind === 'image') return ACCEPTED_IMAGE_TYPES.join(',')
  if (kind === 'audio') return ACCEPTED_AUDIO_TYPES.join(',')
  return 'video/mp4,video/quicktime'
}

function buildUrlResource(
  kind: ResourceKind,
  url: string,
  capability: VideoCapability
): VideoResource | null {
  if (kind === 'video' && url.startsWith('asset://')) {
    return buildAssetResource(kind, url)
  }
  if (!safeRemoteUrl(url)) return null
  const mime = mediaMimeFromHttpsUrl(url, kind)
  if (!mime) return null
  if (kind === 'image') {
    if (!capability.referenceImage.supportedFormats.includes(mime)) return null
    return {
      id: makeId('img'),
      kind: 'image',
      source: { kind: 'url', url },
      name: nameFromUrl(url, 'image'),
      mimeType: mime,
    }
  }
  if (kind === 'video') {
    if (!capability.referenceVideo.supportedFormats.includes(mime)) return null
    return {
      id: makeId('vid'),
      kind: 'video',
      source: { kind: 'url', url },
      name: nameFromUrl(url, 'video'),
      mimeType: mime,
    }
  }
  if (!capability.referenceAudio.supportedFormats.includes(mime)) return null
  return {
    id: makeId('aud'),
    kind: 'audio',
    source: { kind: 'url', url },
    name: nameFromUrl(url, 'audio'),
    mimeType: mime,
  }
}

function buildAssetResource(
  kind: ResourceKind,
  raw: string
): VideoResource | null {
  if (kind !== 'video') return null
  const canonical = raw.startsWith('asset://')
    ? raw.trim()
    : `asset://${raw.trim()}`
  if (!isCanonicalAssetUrl(canonical)) return null
  return {
    id: makeId('vid'),
    kind: 'video',
    source: { kind: 'asset', assetId: canonical.slice('asset://'.length) },
    name: canonical,
    mimeType: 'video/mp4',
  }
}

function nameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    return last && last.length > 0 ? last : fallback
  } catch {
    return fallback
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
