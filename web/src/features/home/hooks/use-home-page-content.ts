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
import i18next from 'i18next'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { isHttpUrl } from '@/lib/content-format'

import { getHomePageContent } from '../api'
import type { HomePageContentResult } from '../types'

const STORAGE_KEY = 'home_page_content'

function readCachedContent(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // localStorage may be unavailable (private browsing, quota, sandbox).
    return ''
  }
}

/**
 * Hook to load and manage custom home page content.
 * Reads localStorage synchronously via a lazy initializer so cached content
 * is available on the very first render — no network round-trip required.
 * The useEffect then fetches the latest value from the API.
 */
export function useHomePageContent(): HomePageContentResult {
  // Lazy initializer: reads localStorage once, synchronously, before the first
  // render commit.  This ensures cached content is available immediately.
  const [content, setContent] = useState<string>(readCachedContent)

  useEffect(() => {
    let mounted = true

    const loadContent = async () => {
      try {
        const response = await getHomePageContent()
        const { success, data } = response

        if (!mounted) return

        if (success && data) {
          setContent(data)
          localStorage.setItem(STORAGE_KEY, data)
        } else {
          setContent('')
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch (error) {
        if (!mounted) return
        // eslint-disable-next-line no-console
        console.error('Failed to load home page content:', error)
        toast.error(i18next.t('Failed to load home page content'))
        // On network failure the cached content (if any) remains.
      }
    }

    loadContent()

    return () => {
      mounted = false
    }
  }, [])

  const isUrl = isHttpUrl(content)

  return { content, isUrl }
}
