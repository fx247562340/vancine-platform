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
export type IntRange = {
  min: number
  max: number
  default: number
}

export type AspectRatio = {
  width: number
  height: number
}

export type PromptExtendMode = 'direct' | 'agent'

export type ImageModelProfile = {
  sizes: string[]
  defaultSize: string
  supportsAutoSize: boolean
  supportsCustomSize: boolean
  nRange: IntRange
  maxReferenceImages: number
  supportsNegativePrompt: boolean
  maxNegativePromptChars: number
  supportsSeed: boolean
  seedRange?: IntRange | null
  supportsWatermark: boolean
  defaultWatermark?: boolean | null
  supportsPromptExtend: boolean
  defaultPromptExtend?: boolean | null
  supportsPromptExtendMode: boolean
  defaultPromptExtendMode?: PromptExtendMode | null
  supportsThinkingMode: boolean
  defaultThinkingMode?: boolean | null
  thinkingRequiresExtend: boolean
  agentRequiresNoRefs: boolean
  allowedReferenceMimeTypes?: string[]
  minPixels?: number
  maxPixels?: number
  maxPixelsWithRefs?: number
  minAspectRatio?: AspectRatio | null
  maxAspectRatio?: AspectRatio | null
}

export type ImageCapabilityModel = {
  model: string
  provider: string
  profile: ImageModelProfile
}

export type ImageCapabilityResponse = {
  modality: string
  group: string
  groups: string[]
  models: ImageCapabilityModel[]
}

export type ImageGenerationParams = {
  size: string
  sizeMode: 'preset' | 'custom' | 'auto'
  customWidth: number | null
  customHeight: number | null
  n: number
  negativePrompt: string
  seed: number | null
  watermark: boolean
  promptExtend: boolean
  promptExtendMode: PromptExtendMode
  thinkingMode: boolean
}

export type ReferenceImage = {
  id: string
  name: string
  mimeType: string
  dataUrl: string
  size?: number
}

export type ImageBase64Mime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'

/**
 * ParsedImage is the result of running inspectBase64Image once on a server
 * response. Rendering, src construction, and "has renderable image"
 * predicates read these pre-computed fields; no path re-scans the full
 * Base64 string at render time. Full bytes are decoded only on download.
 * The raw b64Json is kept in memory for the page lifetime and never persisted.
 */
export type ParsedImage = {
  resultId: string
  url?: string
  b64Json?: string
  mime: ImageBase64Mime
  revisedPrompt?: string
  renderable?: boolean
}

export type GeneratedImage = {
  resultId?: string
  url?: string
  b64Json?: string
  mime?: ImageBase64Mime
  renderable?: boolean
  revisedPrompt?: string
}

export type ImageGenerationRun = {
  id: string
  createdAt: string
  model: string
  group: string
  provider: string
  prompt: string
  size: string
  n: number
  referenceCount: number
  images: GeneratedImage[]
}

export type ImagePlaygroundConfig = {
  model: string
  group: string
  params: ImageGenerationParams
}

export type GroupOption = {
  label: string
  value: string
  ratio?: number
  desc?: string
}

export type ModelOption = {
  label: string
  value: string
}
