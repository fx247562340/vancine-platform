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
import { useEffect } from 'react'

import { captureLandingView, isInternalAdminPath } from '@/lib/acquisition'

/**
 * The pathname of the document that started this page load, captured at module
 * evaluation — before the router can resolve a redirect.
 *
 * Reading `window.location.pathname` inside the effect is too late for an
 * internal admin path that redirects immediately (anonymous -> /sign-in,
 * non-admin -> /403): the effect would see the post-redirect public path and
 * record a landing_view for what is really a bounce off an internal URL,
 * inflating the funnel's landing counts. The bundle is evaluated once per
 * document load, so this is exactly the "initial pathname" of that load.
 */
const initialPathname =
  typeof window === 'undefined' ? '' : window.location.pathname

/**
 * Application bootstrap boundary for first-party acquisition capture.
 *
 * Fires the once-per-page-load landing_view capture from an effect so the
 * first render never waits on it. Renders nothing. StrictMode double effects
 * and remounts are deduplicated by the acquisition module's in-memory
 * promise, never by a second network request.
 *
 * Internal admin-only paths are skipped entirely: they are not acquisition
 * landings, so no first-party touch may record them (see isInternalAdminPath).
 * The decision uses the initial pathname of this page load and never a query
 * string, so UTM parameters cannot pull an internal path back into capture.
 */
export function AcquisitionBootstrap(): null {
  useEffect(() => {
    if (isInternalAdminPath(initialPathname)) return
    void captureLandingView()
  }, [])

  return null
}
