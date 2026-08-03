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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { TelegramAuthPayload } from '../lib/telegram'

// ============================================================================
// Telegram Login Widget
// ============================================================================
//
// Thin, dependency-free wrapper around the official Telegram Login Widget
// (https://core.telegram.org/widgets/login). It injects the telegram.org
// script with the right data-* attributes and cleans up after itself.
//
// Preferred over `react-telegram-login@1.1.2`, which hard-depends on React 16,
// leaks a shared `window.TelegramLoginWidget` singleton (multiple widgets
// clobber each other's callback), and never removes its script on unmount.

const WIDGET_SCRIPT_SRC = 'https://telegram.org/js/telegram-widget.js?22'

// Module-level counter so every mounted widget registers a uniquely-named
// global callback — the fix for the singleton bug described above.
let widgetInstanceCounter = 0

export interface TelegramLoginWidgetProps {
  /** Telegram bot username (without the @). Required for the widget to render. */
  botName: string
  /**
   * Callback mode: invoked with the auth payload after the user authorizes.
   * Mutually exclusive with `authUrl`; takes precedence when both are omitted.
   */
  onAuth?: (payload: TelegramAuthPayload) => void
  /**
   * Redirect mode: Telegram navigates the browser to this URL with the auth
   * payload appended as query params. Used for account binding, matching the
   * Classic theme's `dataAuthUrl='/api/oauth/telegram/bind'`.
   */
  authUrl?: string
  buttonSize?: 'large' | 'medium' | 'small'
  cornerRadius?: number
  requestAccess?: string
  usePic?: boolean
  lang?: string
  className?: string
}

export function TelegramLoginWidget({
  botName,
  onAuth,
  authUrl,
  buttonSize = 'large',
  cornerRadius,
  requestAccess = 'write',
  usePic = true,
  lang = 'en',
  className,
}: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Track the latest callback without re-injecting the script on every render
  // (Telegram replaces the script tag with an iframe exactly once). The ref is
  // updated in an effect (not during render); the widget callback only fires on
  // user interaction, which happens after effects have run.
  const onAuthRef = useRef(onAuth)
  useEffect(() => {
    onAuthRef.current = onAuth
  }, [onAuth])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !botName) return

    const callbackName = `__vancineTelegramAuth_${widgetInstanceCounter++}`

    if (!authUrl) {
      ;(window as unknown as Record<string, unknown>)[callbackName] = (
        user: TelegramAuthPayload
      ) => {
        onAuthRef.current?.(user)
      }
    }

    const script = document.createElement('script')
    script.src = WIDGET_SCRIPT_SRC
    script.async = true
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', buttonSize)
    if (cornerRadius !== undefined) {
      script.setAttribute('data-radius', String(cornerRadius))
    }
    script.setAttribute('data-request-access', requestAccess)
    script.setAttribute('data-userpic', usePic ? 'true' : 'false')
    script.setAttribute('data-lang', lang)
    if (authUrl) {
      script.setAttribute('data-auth-url', authUrl)
    } else {
      script.setAttribute('data-onauth', `${callbackName}(user)`)
    }

    container.appendChild(script)

    return () => {
      // Telegram swaps the <script> for an iframe, so clear whatever now
      // lives in the container instead of assuming the script node is still
      // attached. Also drop the global callback to avoid leaks.
      container.replaceChildren()
      delete (window as unknown as Record<string, unknown>)[callbackName]
    }
  }, [botName, authUrl, buttonSize, cornerRadius, requestAccess, usePic, lang])

  return (
    <div ref={containerRef} className={cn('flex justify-center', className)} />
  )
}
