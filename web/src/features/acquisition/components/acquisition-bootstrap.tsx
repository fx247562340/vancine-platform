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

import { captureLandingView } from '@/lib/acquisition'

/**
 * Application bootstrap boundary for first-party acquisition capture.
 *
 * Fires the once-per-page-load landing_view capture from an effect so the
 * first render never waits on it. Renders nothing. StrictMode double effects
 * and remounts are deduplicated by the acquisition module's in-memory
 * promise, never by a second network request.
 */
export function AcquisitionBootstrap(): null {
  useEffect(() => {
    void captureLandingView()
  }, [])

  return null
}
