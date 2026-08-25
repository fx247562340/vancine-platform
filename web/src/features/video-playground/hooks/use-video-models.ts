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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getVideoModelsWithApiKey } from '../api'
import { VideoPlaygroundError } from '../lib/errors'

export function useVideoModels(
  keyId: number | null,
  loadSecret: (id: number, signal?: AbortSignal) => Promise<string>
) {
  const { i18n } = useTranslation()

  const query = useQuery({
    queryKey: ['video-playground-models', keyId, i18n.language],
    enabled: keyId != null,
    queryFn: async ({ signal }) => {
      const apiKey = await loadSecret(keyId as number, signal)
      return getVideoModelsWithApiKey(apiKey, i18n.language, signal)
    },
  })

  let loadError: VideoPlaygroundError | null = null
  if (query.isError) {
    loadError =
      query.error instanceof VideoPlaygroundError
        ? query.error
        : new VideoPlaygroundError({
            kind: 'system',
            errorKey: 'Failed to load video models',
          })
  }

  return {
    models: query.data ?? [],
    isLoading: query.isLoading,
    isFetched: query.isFetched && !query.isError,
    isError: Boolean(loadError),
    loadError,
  }
}
