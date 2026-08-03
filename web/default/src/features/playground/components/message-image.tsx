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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MessageImageProps {
  src: string
  alt?: string
  className?: string
}

/**
 * Inline message image with click-to-enlarge (Dialog) and a textual
 * fallback when the image fails to load.
 */
export function MessageImage({ src, alt, className }: MessageImageProps) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const resolvedAlt = alt ?? t('Generated image')

  if (failed) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs break-all',
          className
        )}
        role='alert'
      >
        {t('Image failed to load')}: {src}
      </div>
    )
  }

  return (
    <>
      <img
        alt={resolvedAlt}
        className={cn(
          'max-h-64 cursor-zoom-in rounded-lg border object-cover',
          className
        )}
        loading='lazy'
        src={src}
        onClick={() => setOpen(true)}
        onError={() => setFailed(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        {/* sm:max-w-[90vw] is required: the base dialog caps at sm:max-w-sm
            (384px) on >= 640px viewports, which the unprefixed max-w cannot
            override. twMerge drops the base cap at each breakpoint. */}
        <DialogContent className='max-h-[90vh] max-w-[90vw] sm:max-w-[90vw]'>
          <DialogHeader>
            <DialogTitle>{t('Image preview')}</DialogTitle>
          </DialogHeader>
          <img
            alt={resolvedAlt}
            className='mx-auto max-h-[85vh] max-w-full object-contain'
            src={src}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
