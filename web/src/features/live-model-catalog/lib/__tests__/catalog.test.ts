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
import { describe, expect, it } from 'vitest'

import type { PricingData, PricingModel } from '@/features/pricing/types'

import { buildLiveModelCatalog } from '../catalog'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 0,
    model_name: 'unknown-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

function pricing(overrides: Partial<PricingData>): PricingData {
  return {
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
    ...overrides,
  }
}

const TAGS_AUDIO = 'Audio, tts, premium'
const TAGS_VIDEO = 'video, multimodal'
const TAGS_3D = '3d, creative'
const TAGS_IMAGE = 'image, fast'
const TAGS_MEDIA = 'media, premium'

// ---------------------------------------------------------------------------
// Status / error
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — status / error', () => {
  it('null/undefined input becomes an error catalog', () => {
    for (const value of [null, undefined] as unknown as PricingData[]) {
      const catalog = buildLiveModelCatalog(value)
      expect(catalog.status).toBe('error')
      expect(catalog.textModels).toEqual([])
      expect(catalog.imageModels).toEqual([])
      expect(catalog.videoModels).toEqual([])
      expect(catalog.exampleImageModel).toBeNull()
      expect(catalog.exampleVideoModel).toBeNull()
      expect(catalog.totalCount).toBe(0)
    }
  })

  it('success=false becomes an error catalog', () => {
    const catalog = buildLiveModelCatalog(pricing({ success: false }))
    expect(catalog.status).toBe('error')
    expect(catalog.totalCount).toBe(0)
  })

  it('non-array data is treated as empty (defensive)', () => {
    const catalog = buildLiveModelCatalog(
      pricing({ data: 'oops' as unknown as PricingModel[] })
    )
    expect(catalog.status).toBe('empty')
    expect(catalog.totalCount).toBe(0)
  })

  it('array of all-invalid records is empty', () => {
    const invalid: PricingModel[] = [
      model({ model_name: '' }),
      // whitespace-only model_name is invalid too
      model({ model_name: '   ' }),
      model({ model_name: '\t\n' }),
      // non-string model_name is invalid
      { ...model({ model_name: '' }), model_name: 0 as unknown as string },
      // null model_name is invalid
      { ...model({ model_name: '' }), model_name: null as unknown as string },
    ]
    const catalog = buildLiveModelCatalog(pricing({ data: invalid }))
    expect(catalog.status).toBe('empty')
    expect(catalog.totalCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Image / video classification
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — image/video classification', () => {
  it('exact `image-generation` endpoint tags a model as image', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'qwen-image-2.0',
            supported_endpoint_types: ['image-generation'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('ready')
    expect(catalog.imageModels).toHaveLength(1)
    expect(catalog.imageModels[0].model_name).toBe('qwen-image-2.0')
    expect(catalog.exampleImageModel?.model_name).toBe('qwen-image-2.0')
  })

  it('exact `openai-video` endpoint tags a model as video', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'Doubao-Seedance-2.5',
            supported_endpoint_types: ['openai-video'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('ready')
    expect(catalog.videoModels).toHaveLength(1)
    expect(catalog.videoModels[0].model_name).toBe('Doubao-Seedance-2.5')
    expect(catalog.exampleVideoModel?.model_name).toBe('Doubao-Seedance-2.5')
  })

  it('related but different endpoints (`image-generation-v2`, `openai-video-v2`) are NOT classified', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'wan3.1-image',
            supported_endpoint_types: ['image-generation-v2'],
          }),
          model({
            model_name: 'wan3.1-video',
            supported_endpoint_types: ['openai-video-v2'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('empty')
    expect(catalog.imageModels).toEqual([])
    expect(catalog.videoModels).toEqual([])
  })

  it('supported_endpoint_types missing/garbage degrades to empty (no model_name substrings)', () => {
    // The catalog must classify strictly by the endpoint array; an
    // absent or non-array endpoint payload must never be misread as a
    // list that happens to contain `image-generation` or `openai-video`.
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          {
            ...model({ model_name: 'qwen-image-2.0' }),
            // Force-cast through unknown to model the "server returned
            // null here" defensive case without losing type safety for
            // the rest of the fixture.
            supported_endpoint_types: null as unknown as string[],
          },
          {
            ...model({ model_name: 'Doubao-Seedance-2.5' }),
            // A bare string is not an array, so the catalog must treat
            // it the same way as `undefined` and not promote the model
            // into the video category.
            supported_endpoint_types: 'openai-video' as unknown as string[],
          },
        ],
      })
    )
    expect(catalog.status).toBe('empty')
  })
})

// ---------------------------------------------------------------------------
// Text classification
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — text classification', () => {
  it('openai endpoint is text', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'MiniMax-M3',
            supported_endpoint_types: ['openai'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('ready')
    expect(catalog.textModels.map((m) => m.model_name)).toEqual(['MiniMax-M3'])
  })

  it('any of openai/openai-response/anthropic/gemini makes a model text-eligible', () => {
    const data: PricingModel[] = [
      model({ model_name: 'gpt-a', supported_endpoint_types: ['openai'] }),
      model({
        model_name: 'resp-b',
        supported_endpoint_types: ['openai-response'],
      }),
      model({
        model_name: 'claude-c',
        supported_endpoint_types: ['anthropic'],
      }),
      model({ model_name: 'gem-d', supported_endpoint_types: ['gemini'] }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.textModels).toHaveLength(4)
  })

  it('a text-endpointed model is REJECTED when it also carries `image-generation`', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'mixed-1',
            supported_endpoint_types: ['openai', 'image-generation'],
          }),
        ],
      })
    )
    expect(catalog.textModels).toEqual([])
    expect(catalog.imageModels).toHaveLength(1)
  })

  it('a text-endpointed model is REJECTED when it also carries `openai-video`', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'mixed-2',
            supported_endpoint_types: ['openai', 'openai-video'],
          }),
        ],
      })
    )
    expect(catalog.textModels).toEqual([])
    expect(catalog.videoModels).toHaveLength(1)
  })

  it('tag-based exclusion removes audio/tts/3d/image/video from the text list', () => {
    const data: PricingModel[] = [
      model({ model_name: 'pure-text', supported_endpoint_types: ['openai'] }),
      model({
        model_name: 'text-with-audio',
        tags: TAGS_AUDIO,
        supported_endpoint_types: ['openai'],
      }),
      model({
        model_name: 'text-with-video-tag',
        tags: TAGS_VIDEO,
        supported_endpoint_types: ['openai'],
      }),
      model({
        model_name: 'text-with-3d',
        tags: TAGS_3D,
        supported_endpoint_types: ['openai'],
      }),
      model({
        model_name: 'text-with-image',
        tags: TAGS_IMAGE,
        supported_endpoint_types: ['openai'],
      }),
      model({
        model_name: 'text-with-tts-only',
        tags: 'tts',
        supported_endpoint_types: ['openai'],
      }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.textModels.map((m) => m.model_name)).toEqual(['pure-text'])
  })

  it('a text-endpointed model tagged `media` is REJECTED from the text list', () => {
    // The `media` label covers multimodal media tags that an admin may
    // attach to text models despite them not declaring an image or video
    // endpoint. They must not appear in the public text list.
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'text-with-media',
            tags: TAGS_MEDIA,
            supported_endpoint_types: ['openai'],
          }),
        ],
      })
    )
    expect(catalog.textModels).toEqual([])
  })

  it('text classification does NOT inspect model_name substrings', () => {
    const data: PricingModel[] = [
      model({
        model_name: 'fake-image-by-name',
        supported_endpoint_types: ['openai'],
        tags: 'premium',
      }),
      model({
        model_name: 'fake-video-by-name',
        supported_endpoint_types: ['openai'],
        tags: 'general',
      }),
      model({
        model_name: 'fake-wan-by-name',
        supported_endpoint_types: ['openai'],
        tags: 'chat',
      }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.textModels.map((m) => m.model_name)).toEqual([
      'fake-image-by-name',
      'fake-video-by-name',
      'fake-wan-by-name',
    ])
  })

  it('tags are normalized: trim, lowercase, comma split', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'audio-upper',
            tags: ' AUDIO ,  TTS  ,Premium ',
            supported_endpoint_types: ['openai'],
          }),
          model({
            model_name: 'text-clean',
            tags: 'chat, general',
            supported_endpoint_types: ['openai'],
          }),
        ],
      })
    )
    expect(catalog.textModels).toHaveLength(1)
    expect(catalog.textModels[0].tags).toEqual(['chat', 'general'])
  })

  it('a model_name that is only whitespace is ignored', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: '   ',
            supported_endpoint_types: ['image-generation'],
          }),
          model({
            model_name: '\t\n',
            supported_endpoint_types: ['openai-video'],
          }),
          model({
            model_name: 'real-image',
            supported_endpoint_types: ['image-generation'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('ready')
    expect(catalog.imageModels.map((m) => m.model_name)).toEqual(['real-image'])
    expect(catalog.videoModels).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — deduplication', () => {
  it('duplicates by model_name collapse to the first occurrence', () => {
    const data: PricingModel[] = [
      model({
        model_name: 'dup',
        supported_endpoint_types: ['image-generation'],
        description: 'first',
      }),
      model({
        model_name: 'dup',
        supported_endpoint_types: ['image-generation'],
        description: 'second',
      }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.imageModels).toHaveLength(1)
    expect(catalog.imageModels[0].description).toBe('first')
  })

  it('a model listed in both image and video endpoints is in BOTH lists', () => {
    const data: PricingModel[] = [
      model({
        model_name: 'multi-modal',
        supported_endpoint_types: ['image-generation', 'openai-video'],
      }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.imageModels).toHaveLength(1)
    expect(catalog.videoModels).toHaveLength(1)
    expect(catalog.textModels).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Reverse-first example rule
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — example model selection', () => {
  it('example image model is the LAST element of the deduped, endpoint-filtered list', () => {
    // The spec: "倒序取第一个" — reverse a copy and take [0], which is
    // the same as the last element of the un-reversed input. The picker
    // never mutates the input array.
    const data: PricingModel[] = [
      model({
        model_name: 'first-image',
        supported_endpoint_types: ['image-generation'],
      }),
      model({
        model_name: 'second-image',
        supported_endpoint_types: ['image-generation'],
      }),
      model({
        model_name: 'third-image',
        supported_endpoint_types: ['image-generation'],
      }),
    ]
    const originalOrder = data.map((m) => m.model_name)
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.exampleImageModel?.model_name).toBe('third-image')
    // The input array is never reordered.
    expect(data.map((m) => m.model_name)).toEqual(originalOrder)
    // The full image list keeps the upstream order.
    expect(catalog.imageModels.map((m) => m.model_name)).toEqual(originalOrder)
  })

  it('example model is null when the category is empty', () => {
    const catalog = buildLiveModelCatalog(
      pricing({
        data: [
          model({
            model_name: 'pure-text',
            supported_endpoint_types: ['openai'],
          }),
        ],
      })
    )
    expect(catalog.status).toBe('ready')
    expect(catalog.exampleImageModel).toBeNull()
    expect(catalog.exampleVideoModel).toBeNull()
  })

  it('does not mutate the upstream payload in any way', () => {
    const data: PricingModel[] = [
      model({
        model_name: 'a',
        supported_endpoint_types: ['image-generation'],
        tags: 'image',
      }),
      model({
        model_name: 'b',
        supported_endpoint_types: ['openai-video'],
      }),
    ]
    const snapshot = structuredClone(data)
    buildLiveModelCatalog(pricing({ data }))
    expect(data).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// Future-proof: no allowlist required
// ---------------------------------------------------------------------------

describe('buildLiveModelCatalog — future-proof against new model names', () => {
  it('arbitrary new model names are classified by endpoint, not allowlist', () => {
    const data: PricingModel[] = [
      model({
        model_name: 'new-vendor-future-image-2027',
        supported_endpoint_types: ['image-generation'],
      }),
      model({
        model_name: 'next-fancy-text',
        supported_endpoint_types: ['openai-response'],
      }),
      model({
        model_name: 'unheard-video-2027',
        supported_endpoint_types: ['openai-video'],
      }),
    ]
    const catalog = buildLiveModelCatalog(pricing({ data }))
    expect(catalog.imageModels[0].model_name).toBe(
      'new-vendor-future-image-2027'
    )
    expect(catalog.textModels[0].model_name).toBe('next-fancy-text')
    expect(catalog.videoModels[0].model_name).toBe('unheard-video-2027')
    expect(catalog.exampleImageModel?.model_name).toBe(
      'new-vendor-future-image-2027'
    )
    expect(catalog.exampleVideoModel?.model_name).toBe('unheard-video-2027')
  })
})
