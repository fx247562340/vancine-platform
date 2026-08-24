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
import { Download, ExternalLink, Video } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { buttonVariants } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

interface VideoPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resultUrl: string
  taskId: string
}

/**
 * In-app preview for a task's video result. Playback, open-in-new-tab and
 * download use the resolved upstream result URL directly. Download is a
 * native `a[href][download]` — whether the browser saves a file is
 * best-effort and depends on the browser and the upstream response.
 */
export function VideoPreviewDialog(
  props: VideoPreviewDialogProps
): ReactElement {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setHasError(false)
    }
    props.onOpenChange(nextOpen)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title={
        <>
          <IconBadge tone='chart-4' size='sm'>
            <Video />
          </IconBadge>
          {t('Video Preview')}
        </>
      }
      contentClassName='sm:max-w-3xl'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <div className='flex flex-wrap justify-end gap-2'>
          <a
            href={props.resultUrl}
            target='_blank'
            rel='noopener noreferrer'
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'gap-1 text-xs'
            )}
          >
            <ExternalLink className='h-3.5 w-3.5' />
            {t('Open in new tab')}
          </a>
          <a
            href={props.resultUrl}
            download={`${props.taskId}.mp4`}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'gap-1 text-xs'
            )}
          >
            <Download className='h-3.5 w-3.5' />
            {t('Download')}
          </a>
        </div>
      }
    >
      <div>
        {hasError && (
          <p role='alert' className='text-destructive text-sm'>
            {t('Video playback failed')}
          </p>
        )}
        <video
          src={props.resultUrl}
          controls
          preload='metadata'
          onError={() => setHasError(true)}
          className='bg-muted/20 max-h-[70vh] w-full rounded-md'
        />
      </div>
    </Dialog>
  )
}
