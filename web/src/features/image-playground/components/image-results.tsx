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
  Delete01Icon,
  Download01Icon,
  Image01Icon,
  Loading03Icon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { GenerationGalleryShell } from '@/features/media-playground/components/generation-gallery-shell'

import type { ImagePageError, ImageRun } from '../hooks/use-image-generate'
import { downloadGeneratedImage } from '../lib/download'
import {
  hasRenderableParsedImage,
  hasTemporaryParsedImage,
  parsedImageSrc,
  visibleParsedImages,
} from '../lib/results'
import type { ParsedImage } from '../types'

type ImageResultsProps = {
  runs: ImageRun[]
  isGenerating: boolean
  pageError: ImagePageError
  onRetry: (runId: string) => void
  onClearHistory: () => void
  isRetrying: (runId: string) => boolean
}

function RunImages(props: { run: ImageRun }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<ParsedImage | null>(null)
  const previewSrc = preview ? parsedImageSrc(preview) : ''

  // visibleImages is pre-parsed once at run creation; visibleParsedImages
  // does not re-scan the Base64 strings.
  const visibleImages = visibleParsedImages(props.run.images)

  if (visibleImages.length === 0) return null

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {visibleImages.map((image, index) => {
          const src = parsedImageSrc(image)
          return (
            <figure
              key={image.resultId}
              className='bg-muted overflow-hidden rounded-xl border'
            >
              <button
                type='button'
                className='block w-full'
                onClick={() => setPreview(image)}
                aria-label={t('Preview image')}
              >
                <div className='aspect-square'>
                  <img
                    src={src}
                    alt={image.revisedPrompt || t('Generated image')}
                    loading='lazy'
                    className='size-full object-cover'
                  />
                </div>
              </button>
              <figcaption className='flex items-center justify-end gap-2 p-2'>
                {image.url ? (
                  <CopyButton
                    value={image.url}
                    tooltip={t('Copy image URL')}
                    aria-label={t('Copy image URL')}
                  />
                ) : null}
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={t('Download image')}
                  onClick={() => {
                    void downloadGeneratedImage(image, index)
                      .then((result) => {
                        if (result.ok) return
                        if (result.openedWindow) {
                          toast.error(
                            t('Download failed, opened in a new window')
                          )
                          return
                        }
                        toast.error(t('Failed to download image'))
                      })
                      .catch(() => {
                        toast.error(t('Failed to download image'))
                      })
                  }}
                >
                  <HugeiconsIcon
                    icon={Download01Icon}
                    aria-hidden
                    data-icon='inline-start'
                  />
                </Button>
              </figcaption>
            </figure>
          )
        })}
      </div>
      <Dialog
        open={previewSrc !== ''}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className='max-w-4xl sm:max-w-4xl' showCloseButton>
          <DialogTitle className='sr-only'>{t('Image preview')}</DialogTitle>
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={t('Generated image')}
              className='max-h-[80vh] w-full rounded-lg object-contain'
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RunCard(props: {
  run: ImageRun
  isRetrying: boolean
  isGenerating: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const run = props.run
  const createdAt = new Date(run.createdAt)
  const createdLabel = Number.isNaN(createdAt.getTime())
    ? run.createdAt
    : createdAt.toLocaleString()

  // A corrupt/missing request snapshot, a fresh lease owned by another
  // tab, or an outcome-unknown lease expiry must never be replayed
  // upstream. So no Retry affordance is offered for these cases.
  const retryHidden =
    run.retryBlocked === 'corrupt-snapshot' ||
    run.retryBlocked === 'running-elsewhere' ||
    run.retryBlocked === 'outcome-unknown' ||
    run.leasedByOtherSession === true
  // Reference dataUrls are intentionally not persisted; after a refresh the
  // original reference images cannot be resent, so Retry is disabled and
  // the user is told to re-upload and start a new generation instead.
  const retryDisabledByRefs = run.retryBlocked === 'missing-references'
  // P13-B R16: error rendering strictly distinguishes stable i18n keys
  // (translated at render time, so a language switch re-labels them)
  // from raw upstream text (shown verbatim, never t()'d). The legacy
  // `error` field is treated as raw text so old records never try to
  // translate upstream strings.
  const rawErrorText = run.rawErrorMessage ?? run.error
  const errorText = run.errorKey != null ? t(run.errorKey) : rawErrorText
  const hasError =
    run.errorKey != null || (rawErrorText != null && rawErrorText !== '')
  const showRetry = run.status === 'error' && hasError && !retryHidden

  return (
    <section
      aria-label={t('Generation record')}
      className='bg-card space-y-3 rounded-2xl border p-4 shadow-sm'
    >
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <span className='text-sm font-medium'>{run.model}</span>
        <span className='text-muted-foreground text-sm'>{run.provider}</span>
        <time className='text-muted-foreground text-sm'>{createdLabel}</time>
        {run.status === 'running' ? (
          <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
            <HugeiconsIcon
              icon={Loading03Icon}
              aria-hidden
              data-icon='inline-start'
              className='size-3 animate-spin'
            />
            {t('Running')}
          </span>
        ) : null}
        {run.status === 'error' ? (
          <span className='text-destructive text-xs'>{t('Failed')}</span>
        ) : null}
        {run.status === 'unknown' ? (
          <span className='text-muted-foreground text-xs'>
            {t('Outcome unknown')}
          </span>
        ) : null}
      </div>
      {run.prompt !== '' ? (
        <p className='text-sm break-words whitespace-pre-wrap'>{run.prompt}</p>
      ) : null}
      <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
        <span>
          {t('Size')}: {run.size}
        </span>
        <span>
          {t('Images')}: {run.n}
        </span>
        <span>
          {t('Reference images')}: {run.referenceCount}
        </span>
      </div>
      {(run.status === 'error' || run.status === 'unknown') && hasError ? (
        <p
          className={
            run.status === 'unknown'
              ? 'text-muted-foreground text-sm'
              : 'text-destructive text-sm'
          }
          role='alert'
        >
          {errorText}
        </p>
      ) : null}
      {run.temporaryResultUnavailable || hasTemporaryParsedImage(run.images) ? (
        <p className='text-muted-foreground text-xs'>
          {t('Temporary image results are not saved to browser history')}
        </p>
      ) : null}
      <RunImages run={run} />
      {showRetry ? (
        <div className='flex flex-col items-end gap-2'>
          {retryDisabledByRefs ? (
            <p className='text-muted-foreground text-right text-xs'>
              {t(
                'Original reference images are not saved in browser history. Please re-upload them and start a new generation.'
              )}
            </p>
          ) : null}
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={props.onRetry}
            disabled={props.isGenerating || retryDisabledByRefs}
            aria-label={t('Retry')}
          >
            {props.isRetrying ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                aria-hidden
                data-icon='inline-start'
                className='animate-spin'
              />
            ) : (
              <HugeiconsIcon
                icon={Refresh01Icon}
                aria-hidden
                data-icon='inline-start'
              />
            )}
            {t('Retry')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

export function ImageResults(props: ImageResultsProps) {
  const { t } = useTranslation()
  // A run is visible if it has renderable images OR it is an in-progress
  // (running) or failed (error) run that must stay on screen so the user
  // can see the failure message and the per-record Retry button. An
  // outcome-unknown run is also visible: the user must see the
  // "original request outcome unknown" notice and be able to clear it.
  const visibleRuns = props.runs.filter(
    (run) =>
      run.status === 'running' ||
      run.status === 'error' ||
      run.status === 'unknown' ||
      run.temporaryResultUnavailable ||
      hasRenderableParsedImage(run.images)
  )

  return (
    <div className='flex flex-col gap-4'>
      {props.isGenerating &&
      !props.runs.some((run) => run.status === 'running') ? (
        <div
          className='flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border'
          role='status'
          aria-live='polite'
        >
          <HugeiconsIcon
            icon={Loading03Icon}
            aria-hidden
            className='size-6 animate-spin'
          />
          <p>{t('Generating images...')}</p>
        </div>
      ) : null}

      {props.pageError.errorKey !== undefined ||
      props.pageError.rawUpstreamMessage !== undefined ? (
        <div className='space-y-3 rounded-2xl border p-6' role='alert'>
          {props.pageError.errorKey !== undefined ? (
            <p className='text-destructive'>{t(props.pageError.errorKey)}</p>
          ) : null}
          {props.pageError.rawUpstreamMessage !== undefined ? (
            <p className='text-destructive text-sm break-words whitespace-pre-wrap'>
              {props.pageError.rawUpstreamMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {visibleRuns.length === 0 && !props.isGenerating ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <HugeiconsIcon
                icon={Image01Icon}
                strokeWidth={2}
                aria-hidden
                data-icon='empty'
              />
            </EmptyMedia>
            <EmptyTitle>{t('No images yet')}</EmptyTitle>
            <EmptyDescription>
              {t('Generated images will appear here.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {visibleRuns.length > 0 ? (
        <GenerationGalleryShell
          title={t('Generation history')}
          meta={
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    // Clearing while a generation is in flight would drop the
                    // record the paid result lands in; block it at the UI too.
                    disabled={props.isGenerating}
                  />
                }
              >
                <HugeiconsIcon
                  icon={Delete01Icon}
                  aria-hidden
                  data-icon='inline-start'
                />
                {t('Clear generation history')}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('Clear generation history?')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      'This only clears the image history saved in this browser for the current account.'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={props.onClearHistory}>
                    {t('Clear')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        >
          <div className='flex flex-col gap-4'>
            {visibleRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                isRetrying={props.isRetrying(run.id)}
                isGenerating={props.isGenerating}
                onRetry={() => props.onRetry(run.id)}
              />
            ))}
          </div>
        </GenerationGalleryShell>
      ) : null}
    </div>
  )
}
