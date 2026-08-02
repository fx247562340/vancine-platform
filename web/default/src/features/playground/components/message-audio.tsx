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
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface MessageAudioProps {
  src: string
  className?: string
}

/**
 * Inline TTS result player: native <audio> controls plus a download link.
 */
export function MessageAudio({ src, className }: MessageAudioProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <audio
        controls
        preload='metadata'
        src={src}
        className='w-full max-w-md'
      />
      <a
        className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline'
        download='tts-audio.mp3'
        href={src}
      >
        {t('Download audio')}
      </a>
    </div>
  )
}
