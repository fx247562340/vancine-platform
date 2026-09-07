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

For commercial licensing, please contact support@quantumnous.com.
*/
import { useCallback, useEffect, useState } from 'react'

import type {
  DurationFieldValue,
  ResolutionFieldValue,
} from '../lib/composer-schema'
import type { VideoImageResource } from '../lib/resource-validation'

/**
 * Everything "use these settings again" puts back into the composer: the model,
 * the prompt, the attached reference images, the seconds and the resolution.
 * Restoring never re-submits — the user has to press generate again.
 */
export type VideoComposerSettings = {
  modelId: string
  prompt: string
  duration: DurationFieldValue
  resolution: ResolutionFieldValue
  images: ReadonlyArray<VideoImageResource>
}

export type SubmissionSettingsStore = {
  settings: Readonly<Record<string, VideoComposerSettings>>
  retain: (submissionId: string, value: VideoComposerSettings) => void
}

/**
 * Per-submission settings, held in memory for as long as the submission stays
 * visible on the page.
 *
 * A snapshot keeps its reference images alive, so it is dropped as soon as its
 * task leaves the recent-task window: an image the user can no longer select
 * must not keep its bytes resident for the rest of the session. Nothing here is
 * persisted, cached in React Query, or written to storage.
 */
export function useSubmissionSettings(
  retainedIds: ReadonlyArray<string>
): SubmissionSettingsStore {
  const [settings, setSettings] = useState<
    Record<string, VideoComposerSettings>
  >({})

  const retain = useCallback(
    (submissionId: string, value: VideoComposerSettings) => {
      if (submissionId === '') {
        return
      }
      setSettings((prev) => ({ ...prev, [submissionId]: value }))
    },
    []
  )

  // Join the ids so pruning re-runs only when the visible set actually changes,
  // not on every render of a freshly built array.
  const retainedKey = retainedIds.join('\u0000')
  useEffect(() => {
    const retained = new Set(retainedKey.split('\u0000').filter(Boolean))
    setSettings((prev) => {
      const ids = Object.keys(prev)
      if (ids.every((id) => retained.has(id))) {
        return prev
      }
      const next: Record<string, VideoComposerSettings> = {}
      for (const id of ids) {
        if (retained.has(id)) {
          next[id] = prev[id] as VideoComposerSettings
        }
      }
      return next
    })
  }, [retainedKey])

  return { settings, retain }
}
