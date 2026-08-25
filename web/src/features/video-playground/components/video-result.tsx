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
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type VideoResultProps = {
  taskId: string
  videoUrl: string | null
}

export function VideoResult({ taskId, videoUrl }: VideoResultProps) {
  const { t } = useTranslation()
  const [mediaError, setMediaError] = useState(false)

  useEffect(() => {
    setMediaError(false)
  }, [videoUrl])

  if (!videoUrl) {
    return (
      <Alert>
        <AlertTitle>{t('No playable video result')}</AlertTitle>
        <AlertDescription>
          {t('Use the task logs to inspect this generation.')}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Generated video')}</CardTitle>
        <CardDescription>
          {t(
            'Download is best-effort across domains. Use Open video if the file does not save.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {mediaError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Video failed to load')}</AlertTitle>
            <AlertDescription>
              {t('Open video in a new tab to play this result.')}
            </AlertDescription>
          </Alert>
        ) : (
          <video
            src={videoUrl}
            controls
            preload='metadata'
            aria-label={t('Generated video')}
            className='bg-muted/20 max-h-[70vh] w-full rounded-md'
            onError={() => setMediaError(true)}
          />
        )}
      </CardContent>
      <CardFooter className='flex flex-wrap gap-3'>
        <a
          href={videoUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary text-sm underline'
        >
          {t('Open video')}
        </a>
        <a
          href={videoUrl}
          download={`${taskId}.mp4`}
          className='text-primary text-sm underline'
        >
          {t('Download')}
        </a>
      </CardFooter>
    </Card>
  )
}
