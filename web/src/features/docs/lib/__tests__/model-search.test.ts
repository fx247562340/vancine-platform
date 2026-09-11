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
import { describe, expect, it } from 'vitest'

import { buildSearchIndex, searchDocs } from '../search'

// The Docs search box is a single place that knows how to find a
// page. After the media-model docs revamp it must also find the ten
// model detail pages — both the URL slug and the exact model id are
// searchable, the search navigates to the model route, and the model
// result does not collide with a same-name agent or top-level
// Docs slug.

const t = (key: string) => key.split('.').pop() ?? key

describe('Docs search index includes media model detail pages', () => {
  const index = buildSearchIndex({}, t)

  it('contains a model entry for every registered model slug', () => {
    const slugs = index
      .filter((entry): entry is Extract<typeof entry, { kind: 'model' }> => {
        return (entry as { kind?: string }).kind === 'model'
      })
      .map((entry) => entry.slug)
    expect(slugs).toEqual([
      'qwen-image-3.0',
      'qwen-image-3.0-pro',
      'wan2.7-image-pro',
      'doubao-seedream-5.0-pro',
      'doubao-seedream-5.0-lite',
      'wan3.0-video',
      'wan3.0-video-prime',
      'minimax-h3',
      'doubao-seedance-2.0',
      'doubao-seedance-2.5',
    ])
  })

  it('finds the MiniMax-H3 model by its case-sensitive model id', () => {
    const results = searchDocs(index, 'MiniMax-H3')
    expect(results.length).toBeGreaterThan(0)
    const target = results.find((r) => 'model' in r && r.model === 'minimax-h3')
    expect(target).toBeDefined()
  })

  it('finds the Seedream 5.0 pro page by its lowercase slug', () => {
    const results = searchDocs(index, 'doubao-seedream-5.0-pro')
    const target = results.find(
      (r) => 'model' in r && r.model === 'doubao-seedream-5.0-pro'
    )
    expect(target).toBeDefined()
  })

  it('finds the Wan3 video page by its slug', () => {
    const results = searchDocs(index, 'wan3.0-video')
    const target = results.find(
      (r) => 'model' in r && r.model === 'wan3.0-video'
    )
    expect(target).toBeDefined()
  })

  it('does not return a model result for unknown text', () => {
    const results = searchDocs(index, 'totally-not-a-model-slug-zzz')
    const models = results.filter((r) => 'model' in r)
    expect(models).toHaveLength(0)
  })
})
