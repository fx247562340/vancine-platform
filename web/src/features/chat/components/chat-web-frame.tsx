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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

// Sandbox policy for CROSS-ORIGIN chat frames ONLY. ChatWebFrame itself
// verifies, via parsed protocol/origin comparison against the current page,
// that the URL belongs to a different origin. Same-origin access is safe to
// grant only after that check and is required for the chat application's
// login, storage and camera/microphone capabilities.
const CROSS_ORIGIN_CHAT_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation'

type ChatWebFrameProps = {
  /** Pre-resolved chat URL (tokens already substituted by the caller). */
  url: string
  presetName: string
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function isHttpUrl(parsed: URL): boolean {
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

export function ChatWebFrame(props: ChatWebFrameProps) {
  const { t } = useTranslation()
  const parsed = parseUrl(props.url)
  const parentProtocol =
    typeof window !== 'undefined' ? window.location.protocol : ''
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : ''

  // Fail closed: unparsable or non-http(s) URLs, and any case where the
  // parent page is not a normal http(s) origin — no window (SSR), an empty
  // or "null" origin (file:/data: and other opaque-origin pages) — never
  // render an iframe and never produce a clickable URL. Without a
  // verifiable parent origin the cross-origin relationship cannot be proven.
  if (
    !parsed ||
    !isHttpUrl(parsed) ||
    !currentOrigin ||
    currentOrigin === 'null' ||
    (parentProtocol !== 'http:' && parentProtocol !== 'https:')
  ) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6'>
        <Alert variant='destructive' className='max-w-xl'>
          <AlertTitle>{t('Unable to open chat')}</AlertTitle>
          <AlertDescription>
            {t(
              'Unable to generate chat link. Please contact your administrator.'
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Same-origin content must never run inside a scripts+same-origin sandbox
  // (sandbox escape). Offer an explicit external-open fallback instead.
  if (parsed.origin === currentOrigin) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 p-6'>
        <Alert variant='destructive' className='max-w-xl'>
          <AlertTitle>{t('Unable to open chat')}</AlertTitle>
          <AlertDescription>
            {t(
              'Unable to generate chat link. Please contact your administrator.'
            )}
          </AlertDescription>
        </Alert>
        <a
          href={parsed.href}
          target='_blank'
          rel='noopener noreferrer'
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('Open in new tab')}
        </a>
      </div>
    )
  }

  return (
    <iframe
      src={parsed.href}
      key={parsed.href}
      className='h-full w-full border-0'
      allow='camera; microphone'
      title={`${t('Chat')}: ${props.presetName}`}
      sandbox={CROSS_ORIGIN_CHAT_SANDBOX}
    />
  )
}
