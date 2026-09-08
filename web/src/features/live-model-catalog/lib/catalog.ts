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
import type { PricingData, PricingModel } from '@/features/pricing/types'

import type { LiveModelCatalog, LiveModelSummary } from '../types'

/**
 * Endpoint classification rules.
 *
 * The live catalog only trusts `supported_endpoint_types` as the single
 * source of truth — model-name substrings (image/video/wan/seedance) are
 * intentionally not used. This matches the upstream contract: the only
 * reliable signal the catalog has for a model's modality is its declared
 * endpoint capability.
 */
export const IMAGE_ENDPOINT = 'image-generation'
export const VIDEO_ENDPOINT = 'openai-video'

const TEXT_ENDPOINTS = new Set([
  'openai',
  'openai-response',
  'anthropic',
  'gemini',
])

/**
 * Tags that immediately exclude a model from the text category. The set is
 * normalized lowercased and trimmed before comparison, so `tags` of
 * `"Audio, tts"` match the `audio` and `tts` entries below. `media` covers
 * multimodal media labels that the upstream admin may set on text models
 * despite them not declaring an image or video endpoint.
 */
const NON_TEXT_TAGS = new Set(['audio', 'tts', '3d', 'media', 'image', 'video'])

/**
 * Convert a comma-separated tag blob into a normalized, lowercased,
 * whitespace-trimmed array. Empty entries are dropped.
 */
function normalizeTags(rawTags: string | undefined): string[] {
  if (typeof rawTags !== 'string' || rawTags.length === 0) return []
  return rawTags
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
}

/**
 * Treat a model as text-eligible when it has at least one of the text
 * endpoints AND none of the image/video endpoints AND none of the
 * exclusion tags.
 */
function isTextModel(model: PricingModel): boolean {
  const endpoints = Array.isArray(model.supported_endpoint_types)
    ? model.supported_endpoint_types
    : []
  if (endpoints.includes(IMAGE_ENDPOINT)) return false
  if (endpoints.includes(VIDEO_ENDPOINT)) return false
  const hasTextEndpoint = endpoints.some((endpoint) =>
    TEXT_ENDPOINTS.has(endpoint)
  )
  if (!hasTextEndpoint) return false
  const tags = normalizeTags(model.tags)
  for (const tag of tags) {
    if (NON_TEXT_TAGS.has(tag)) return false
  }
  return true
}

function isImageModel(model: PricingModel): boolean {
  const endpoints = Array.isArray(model.supported_endpoint_types)
    ? model.supported_endpoint_types
    : []
  return endpoints.includes(IMAGE_ENDPOINT)
}

function isVideoModel(model: PricingModel): boolean {
  const endpoints = Array.isArray(model.supported_endpoint_types)
    ? model.supported_endpoint_types
    : []
  return endpoints.includes(VIDEO_ENDPOINT)
}

function toSummary(model: PricingModel): LiveModelSummary {
  return {
    model_name: model.model_name,
    vendor_name: model.vendor_name ?? '',
    description: model.description ?? '',
    tags: normalizeTags(model.tags),
  }
}

/**
 * A model is only valid when its `model_name` is a non-empty string after
 * trimming whitespace. Models whose `model_name` is missing, the wrong
 * type, an empty string, or only whitespace are dropped from every
 * downstream category so we never produce blank badges or example tiles.
 */
function isValidModel(model: PricingModel): boolean {
  if (typeof model !== 'object' || model === null) return false
  if (typeof model.model_name !== 'string') return false
  return model.model_name.trim().length > 0
}

function dedupeByName(models: PricingModel[]): PricingModel[] {
  const seen = new Set<string>()
  const result: PricingModel[] = []
  for (const model of models) {
    if (seen.has(model.model_name)) continue
    seen.add(model.model_name)
    result.push(model)
  }
  return result
}

function summarize(input: PricingModel[]): LiveModelSummary[] {
  return input.map(toSummary)
}

/**
 * Pick the headline "example" model for a category. The selection rule is
 * the last element of the deduped, endpoint-filtered list (the spec's
 * "倒序取第一个"): we copy the input, reverse the copy, and return the
 * first entry of the reversed copy. The copy means the caller-owned
 * array is never mutated in place. The function does NOT assert a
 * created_time ordering — `/api/pricing` exposes no such field, and we
 * never call this "latest" / "newest".
 */
function pickExample(input: PricingModel[]): LiveModelSummary | null {
  if (input.length === 0) return null
  const reversed = [...input].reverse()
  return toSummary(reversed[0])
}

/**
 * Build the live catalog from a raw `/api/pricing` payload. The function
 * is pure: it never mutates `data.data`, never mutates `data.data[i]`, and
 * never reaches for fetch / network / time / locale. It is unit-tested
 * against a wide range of inputs to guarantee a stable contract.
 */
export function buildLiveModelCatalog(
  data: PricingData | undefined | null
): LiveModelCatalog {
  if (!data || data.success !== true) {
    return {
      status: 'error',
      textModels: [],
      imageModels: [],
      videoModels: [],
      exampleImageModel: null,
      exampleVideoModel: null,
      totalCount: 0,
    }
  }
  const raw = Array.isArray(data.data) ? data.data : []

  // Pre-filter for valid records BEFORE any categorization so an empty
  // upstream array (or one containing only junk) collapses to 'empty'.
  const valid: PricingModel[] = []
  for (const model of raw) {
    if (isValidModel(model)) valid.push(model)
  }

  const textRaw = dedupeByName(valid.filter(isTextModel))
  const imageRaw = dedupeByName(valid.filter(isImageModel))
  const videoRaw = dedupeByName(valid.filter(isVideoModel))

  const totalCount = textRaw.length + imageRaw.length + videoRaw.length
  if (totalCount === 0) {
    return {
      status: 'empty',
      textModels: [],
      imageModels: [],
      videoModels: [],
      exampleImageModel: null,
      exampleVideoModel: null,
      totalCount: 0,
    }
  }

  return {
    status: 'ready',
    textModels: summarize(textRaw),
    imageModels: summarize(imageRaw),
    videoModels: summarize(videoRaw),
    exampleImageModel: pickExample(imageRaw),
    exampleVideoModel: pickExample(videoRaw),
    totalCount,
  }
}
