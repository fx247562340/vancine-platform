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
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DocsI18nContext } from './docs-i18n-context'
import {
  ensureDocsBundle,
  isDocsBundleReady,
  resolveDocsLocale,
  type DocsBundleLoader,
  type DocsLocale,
} from './loader'

interface DocsI18nProviderProps {
  children: ReactNode
  /** Injectable bundle loaders (tests only); production uses the default. */
  loaders?: Record<DocsLocale, DocsBundleLoader>
}

export function DocsI18nProvider(props: DocsI18nProviderProps) {
  const { i18n } = useTranslation()
  // `i18n.language` is the active selection set by changeLanguage; it reflects
  // the user's choice even before the target bundle is resolved, unlike
  // `resolvedLanguage` which lags until resources are present.
  const locale = resolveDocsLocale(
    i18n.language ?? i18n.resolvedLanguage ?? 'en'
  )

  // Synchronous, accurate readiness — avoids any stale "ready" frame after a
  // language switch and guarantees we never render t() against an empty bundle.
  const ready = isDocsBundleReady(locale)
  // The locale whose load terminally failed (set only in async callbacks).
  const [failedLocale, setFailedLocale] = useState<DocsLocale | null>(null)
  // Bumped after each completed load so bundle-derived data (search index)
  // rebuilds. Also the re-render trigger that flips `ready` to true.
  const [revision, setRevision] = useState(0)

  // Status is fully derived (no synchronous setState in the effect body):
  // current locale failed -> 'error'; bundle present -> 'ready'; else loading.
  let status: 'loading' | 'ready' | 'error' = 'loading'
  if (failedLocale === locale) {
    status = 'error'
  } else if (ready) {
    status = 'ready'
  }

  useEffect(() => {
    if (isDocsBundleReady(locale)) return
    let cancelled = false
    ensureDocsBundle(locale, props.loaders)
      .then(() => {
        if (cancelled) return
        setFailedLocale(null)
        setRevision((r) => r + 1)
      })
      .catch(() => {
        // Deterministic terminal error — no retry, no revision bump, no loop.
        if (!cancelled) setFailedLocale(locale)
      })
    return () => {
      cancelled = true
    }
    // `revision`/`failedLocale` are intentionally not dependencies: changing
    // them must not re-run the loader (which would loop on a failed bundle).
  }, [locale, props.loaders])

  return (
    <DocsI18nContext.Provider value={{ ready, status, locale, revision }}>
      {props.children}
    </DocsI18nContext.Provider>
  )
}
