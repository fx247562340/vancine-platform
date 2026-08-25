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
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  VideoAudioResource,
  VideoImageResource,
  VideoResource,
  VideoVideoResource,
} from './resource-validation'

/**
 * useResourceStore holds the canonical in-memory state of the
 * playground's reference assets. It is intentionally separate from
 * React Query and persistence: resources never reach localStorage,
 * sessionStorage, the React Query cache, or logs.
 *
 * Object URLs created from local files are tracked here and revoked
 * when the user removes a resource, when the active model makes a
 * resource invalid, when the form is reset, and when the page
 * unmounts.
 */
export function useResourceStore() {
  const [images, setImages] = useState<VideoResource[]>([])
  const [videos, setVideos] = useState<VideoResource[]>([])
  const [audios, setAudios] = useState<VideoResource[]>([])
  const urlRegistryRef = useRef<Map<string, string>>(new Map())

  const revoke = useCallback((id: string) => {
    const url = urlRegistryRef.current.get(id)
    if (url) {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // jsdom/happy-dom may not implement revokeObjectURL; ignore.
      }
      urlRegistryRef.current.delete(id)
    }
  }, [])

  const registerPreviewUrl = useCallback((id: string, url: string) => {
    const previous = urlRegistryRef.current.get(id)
    if (previous && previous !== url) {
      try {
        URL.revokeObjectURL(previous)
      } catch {
        // ignore
      }
    }
    urlRegistryRef.current.set(id, url)
  }, [])

  const removeImage = useCallback(
    (id: string) => {
      revoke(id)
      setImages((prev) => prev.filter((resource) => resource.id !== id))
    },
    [revoke]
  )
  const removeVideo = useCallback(
    (id: string) => {
      revoke(id)
      setVideos((prev) => prev.filter((resource) => resource.id !== id))
    },
    [revoke]
  )
  const removeAudio = useCallback(
    (id: string) => {
      revoke(id)
      setAudios((prev) => prev.filter((resource) => resource.id !== id))
    },
    [revoke]
  )

  const addImage = useCallback((resource: VideoResource) => {
    if (resource.kind !== 'image') return
    setImages((prev) => [...prev, resource])
  }, [])
  const addVideo = useCallback((resource: VideoResource) => {
    if (resource.kind !== 'video') return
    setVideos((prev) => [...prev, resource])
  }, [])
  const addAudio = useCallback((resource: VideoResource) => {
    if (resource.kind !== 'audio') return
    setAudios((prev) => [...prev, resource])
  }, [])

  const reset = useCallback(() => {
    for (const id of urlRegistryRef.current.keys()) {
      revoke(id)
    }
    setImages([])
    setVideos([])
    setAudios([])
  }, [revoke])

  // Revoke all object URLs on unmount.
  useEffect(() => {
    const registry = urlRegistryRef.current
    return () => {
      for (const url of registry.values()) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
      }
      registry.clear()
    }
  }, [])

  return {
    images: images as VideoImageResource[],
    videos: videos as VideoVideoResource[],
    audios: audios as VideoAudioResource[],
    addImage,
    addVideo,
    addAudio,
    removeImage,
    removeVideo,
    removeAudio,
    registerPreviewUrl,
    reset,
  }
}

export type ResourceStore = ReturnType<typeof useResourceStore>
