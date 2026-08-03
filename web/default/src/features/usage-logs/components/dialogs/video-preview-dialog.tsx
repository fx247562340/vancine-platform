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
import { useEffect, useState } from 'react'
import { ExternalLink, Film, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface VideoPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Playable URL — the proxied /v1/videos/{task_id}/content endpoint. */
  url: string
  /** Upstream direct link, surfaced when in-page playback fails. */
  originalUrl?: string
}

/**
 * In-page video preview for task logs (aligned with the classic
 * ContentModal): a <video controls> player with loading and error states.
 * On error, the original link stays reachable via link + new-tab button.
 */
export function VideoPreviewDialog({
  open,
  onOpenChange,
  url,
  originalUrl,
}: VideoPreviewDialogProps) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Fresh playback state whenever the dialog reopens or the URL changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasError(false)
    setIsLoaded(false)
  }, [open, url])

  const fallbackUrl = originalUrl || url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-[80vw]: without the sm: prefix the base dialog caps at
          sm:max-w-sm (384px) on desktop viewports. */}
      <DialogContent className='max-h-[90vh] max-w-[90vw] sm:max-w-[80vw]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Film className='h-5 w-5' />
            {t('Video Preview')}
          </DialogTitle>
        </DialogHeader>

        {hasError ? (
          <div className='flex flex-col items-center gap-3 py-8 text-center'>
            <p className='text-muted-foreground text-sm'>
              {t('Video failed to load')}
            </p>
            <a
              className='text-primary text-xs break-all underline-offset-2 hover:underline'
              href={fallbackUrl}
              rel='noopener noreferrer'
              target='_blank'
            >
              {fallbackUrl}
            </a>
            <Button
              onClick={() => window.open(fallbackUrl, '_blank')}
              size='sm'
              variant='outline'
            >
              <ExternalLink className='h-3 w-3' />
              {t('Open in new tab')}
            </Button>
          </div>
        ) : (
          <div className='relative'>
            {!isLoaded && (
              <div className='absolute inset-0 flex items-center justify-center'>
                <Loader2
                  className='text-muted-foreground animate-spin'
                  size={24}
                />
                <span className='sr-only'>{t('Loading')}</span>
              </div>
            )}
            <video
              className='max-h-[70vh] w-full object-contain'
              controls
              preload='metadata'
              src={url}
              onError={() => setHasError(true)}
              onLoadedData={() => setIsLoaded(true)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
