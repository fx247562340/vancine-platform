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
import {
  resolveVideoModelCapability,
  type VideoModelCapability,
} from '@/features/video-playground/lib/model-capabilities'

/**
 * The single authoritative registry of every Vancine media model that
 * has a dedicated detail page at /docs/models/<slug>.
 *
 * Data discipline (i18n): this module stores STRUCTURE, never final UI
 * prose. Every human-readable sentence is a docs-locale i18n key
 * (rendered through useTranslation('docs')); the values this module
 * carries are technical facts — model ids, JSON field names, MIME
 * lists, numeric ranges, enum lists — which stay language-neutral by
 * design. Interpolations (`interp`) carry exactly those technical
 * values into the translated sentence.
 *
 * Contract discipline: video numeric contracts (durations, resolution
 * tiers, reference budgets, body limits) come from the production
 * capability table in web/src/features/video-playground/lib/
 * model-capabilities.ts; this registry never duplicates them. Image
 * contracts mirror setting/playground/image_profiles.go and are
 * pinned by unit tests so a Go-side change surfaces here.
 */

export type MediaModality = 'image' | 'video'

/** One clickable verification source rendered on the detail page. */
export interface ModelSource {
  /**
   * Docs-locale key for the source name. Brand / product / API terms
   * stay in the original language inside each translation; the page
   * renders `t(labelKey)` so a non-English locale never shows the
   * English constant or the raw key.
   */
  labelKey: string
  /** Absolute https URL of the source. */
  url: string
}

/** Interpolation values for one i18n sentence; technical values only. */
export type I18nInterp = Record<string, string | number>

/** One translated sentence reference: a docs-locale key plus interp. */
export interface I18nSentence {
  /** Dotted docs-locale key. */
  key: string
  interp?: I18nInterp
}

export type ModelMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'multi-reference'
  | 'first-last-frame'

export interface ModelSlugEntry {
  /** Lowercase URL slug; stable for the lifetime of the model. */
  slug: string
  /**
   * Exact model id as returned by GET /api/pricing and as sent on the
   * wire. Case-sensitive: `MiniMax-H3` is not the same as
   * `minimax-h3`.
   */
  modelId: string
  modality: MediaModality
  /** Last-verified date, ISO 8601 (YYYY-MM-DD). */
  verifiedOn: string
  /** i18n key of the one-line summary. */
  summaryKey: string
  /** i18n key of the longer page description. */
  descriptionKey: string
  /** Call modes with a verified contract on Vancine. */
  modes: ReadonlyArray<ModelMode>
  /**
   * Clickable verification sources. At least the vendor's official
   * documentation; image models also cite the Vancine production
   * contract file on GitHub.
   */
  sources: ReadonlyArray<ModelSource>
  /**
   * A retired model is no longer published upstream. The detail page
   * still renders (existing links stay live) but is dropped from the
   * sitemap and the search index.
   */
  retired?: boolean
}

// ---------------------------------------------------------------------------
// Image contracts (mirror setting/playground/image_profiles.go)
// ---------------------------------------------------------------------------

export interface ImageParamRow {
  /** JSON field name; kept verbatim (never translated). */
  name: string
  type:
    | 'string'
    | 'integer'
    | 'number'
    | 'boolean'
    | 'array'
    | 'object'
    | 'string-or-array'
  required: boolean
  default?: string | number | boolean
  /**
   * Translated sentence fragments. Multiple fragments render joined
   * with a space so a size row can combine tiers + custom-size rules.
   */
  description: ReadonlyArray<I18nSentence>
}

export interface ImageContract {
  sizes: ReadonlyArray<string>
  defaultSize: string
  nRange: { min: number; max: number; default: number }
  maxReferenceImages: number
  referenceMimeTypes: ReadonlyArray<string>
  seed: { min: number; max: number; default: number } | null
  watermark: { default: boolean }
  customSize: {
    minPixels: number
    maxPixels: number
    maxPixelsWithRefs?: number
    minRatio: string
    maxRatio: string
  } | null
  params: ReadonlyArray<ImageParamRow>
  /** Per-model callouts; each entry is an i18n sentence. */
  notes: ReadonlyArray<I18nSentence>
}

/** Vancine-side reference image rules shared by every image model. */
export const IMAGE_REFERENCE_MAX_BYTES = 10 * 1024 * 1024

const REFERENCE_MIME_DEFAULT = ['image/jpeg', 'image/png', 'image/webp']
const REFERENCE_MIME_QWEN3 = [
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/gif',
]

/** Reusable sentence fragments for shared image parameter rows. */
const P = {
  model: (modelId: string): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.model', interp: { modelId } },
  ],
  prompt: (): ReadonlyArray<I18nSentence> => [{ key: 'modelDetail.ip.prompt' }],
  n: (min: number, max: number, dflt: number): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.n', interp: { min, max, default: dflt } },
  ],
  sizeAuto: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.sizeAuto' },
  ],
  sizeTiers: (sizes: ReadonlyArray<string>): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.sizeTiers', interp: { tiers: sizes.join(' / ') } },
  ],
  sizeCustom: (
    minPixels: number,
    maxPixels: number,
    minRatio: string,
    maxRatio: string
  ): ReadonlyArray<I18nSentence> => [
    {
      key: 'modelDetail.ip.sizeCustom',
      interp: { minPixels, maxPixels, minRatio, maxRatio },
    },
  ],
  image: (
    max: number,
    mimes: ReadonlyArray<string>
  ): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.image', interp: { max, mimes: mimes.join(', ') } },
  ],
  seed: (): ReadonlyArray<I18nSentence> => [
    {
      key: 'modelDetail.ip.seed',
      interp: { min: 0, max: 2147483647, default: 0 },
    },
  ],
  noSeed: (): ReadonlyArray<I18nSentence> => [{ key: 'modelDetail.ip.noSeed' }],
  watermark: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.watermark', interp: { default: 'false' } },
  ],
  negativePrompt: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.negativePrompt' },
  ],
  promptExtend: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.promptExtend', interp: { default: 'true' } },
  ],
  promptExtendMode: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.promptExtendMode', interp: { default: 'direct' } },
  ],
  promptExtendModeAgent: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.promptExtendModeAgent' },
  ],
  enableThinking: (): ReadonlyArray<I18nSentence> => [
    { key: 'modelDetail.ip.enableThinking', interp: { default: 'true' } },
  ],
} as const

const VANCINE_GO_CONTRACT_SOURCE: ModelSource = {
  labelKey: 'modelDetail.sources.vancineImage',
  url: 'https://github.com/fx247562340/vancine-platform/blob/main/setting/playground/image_profiles.go',
}

/** Shared Qwen 3.x prompt-extend/thinking rows (agent restriction included). */
function qwen3ExtraRows(): ReadonlyArray<ImageParamRow> {
  return [
    {
      name: 'negative_prompt',
      type: 'string',
      required: false,
      description: P.negativePrompt(),
    },
    {
      name: 'prompt_extend',
      type: 'boolean',
      required: false,
      default: true,
      description: P.promptExtend(),
    },
    {
      name: 'prompt_extend_mode',
      type: 'string',
      required: false,
      default: 'direct',
      description: [...P.promptExtendMode(), ...P.promptExtendModeAgent()],
    },
    {
      name: 'enable_thinking',
      type: 'boolean',
      required: false,
      default: true,
      description: P.enableThinking(),
    },
  ]
}

/** Shared Qwen 3.x size list (single-sourced for both Qwen entries). */
const QWEN_IMAGE_3X_SIZES: ReadonlyArray<string> = [
  'Auto',
  '1024x1024',
  '1280x1280',
  '1536x1536',
  '2048x2048',
]

function qwen3SizeRows(
  sizes: ReadonlyArray<string>
): ReadonlyArray<I18nSentence> {
  return [
    ...P.sizeAuto(),
    ...P.sizeTiers(sizes),
    ...P.sizeCustom(512 * 512, 2048 * 2048, '1:8', '8:1'),
  ]
}

const QWEN_IMAGE_3_0_CONTRACT: ImageContract = {
  sizes: ['Auto', '1024x1024', '1280x1280', '1536x1536', '2048x2048'],
  defaultSize: 'Auto',
  nRange: { min: 1, max: 6, default: 1 },
  maxReferenceImages: 3,
  referenceMimeTypes: REFERENCE_MIME_QWEN3,
  seed: { min: 0, max: 2147483647, default: 0 },
  watermark: { default: false },
  customSize: {
    minPixels: 512 * 512,
    maxPixels: 2048 * 2048,
    minRatio: '1:8',
    maxRatio: '8:1',
  },
  params: [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: P.model('qwen-image-3.0'),
    },
    { name: 'prompt', type: 'string', required: true, description: P.prompt() },
    {
      name: 'n',
      type: 'integer',
      required: false,
      default: 1,
      description: P.n(1, 6, 1),
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      default: 'Auto',
      description: qwen3SizeRows(QWEN_IMAGE_3X_SIZES),
    },
    {
      name: 'image',
      type: 'string-or-array',
      required: false,
      description: P.image(3, REFERENCE_MIME_QWEN3),
    },
    {
      name: 'seed',
      type: 'integer',
      required: false,
      default: 0,
      description: P.seed(),
    },
    {
      name: 'watermark',
      type: 'boolean',
      required: false,
      default: false,
      description: P.watermark(),
    },
    ...qwen3ExtraRows(),
  ],
  notes: [
    { key: 'modelDetail.in.qwen30.thinking' },
    { key: 'modelDetail.in.qwen30.agentRefs' },
  ],
}

// Forward declaration constant used inside its own definition; keeps the
// size list single-sourced without reordering the literal.
const QWEN_IMAGE_3_0_PRO_CONTRACT: ImageContract = {
  ...QWEN_IMAGE_3_0_CONTRACT,
  params: [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: P.model('qwen-image-3.0-pro'),
    },
    { name: 'prompt', type: 'string', required: true, description: P.prompt() },
    {
      name: 'n',
      type: 'integer',
      required: false,
      default: 1,
      description: P.n(1, 6, 1),
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      default: 'Auto',
      description: qwen3SizeRows(QWEN_IMAGE_3X_SIZES),
    },
    {
      name: 'image',
      type: 'string-or-array',
      required: false,
      description: P.image(3, REFERENCE_MIME_QWEN3),
    },
    {
      name: 'seed',
      type: 'integer',
      required: false,
      default: 0,
      description: P.seed(),
    },
    {
      name: 'watermark',
      type: 'boolean',
      required: false,
      default: false,
      description: P.watermark(),
    },
    ...qwen3ExtraRows(),
  ],
  notes: [{ key: 'modelDetail.in.qwen30pro.sameContract' }],
}

const WAN_IMAGE_PRO_CONTRACT: ImageContract = {
  sizes: ['1K', '2K', '4K'],
  defaultSize: '2K',
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 9,
  referenceMimeTypes: REFERENCE_MIME_DEFAULT,
  seed: { min: 0, max: 2147483647, default: 0 },
  watermark: { default: false },
  customSize: {
    minPixels: 768 * 768,
    maxPixels: 4096 * 4096,
    maxPixelsWithRefs: 2048 * 2048,
    minRatio: '1:8',
    maxRatio: '8:1',
  },
  params: [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: P.model('wan2.7-image-pro'),
    },
    { name: 'prompt', type: 'string', required: true, description: P.prompt() },
    {
      name: 'n',
      type: 'integer',
      required: false,
      default: 1,
      description: P.n(1, 4, 1),
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      default: '2K',
      description: [
        ...P.sizeTiers(['1K', '2K', '4K']),
        ...P.sizeCustom(768 * 768, 4096 * 4096, '1:8', '8:1'),
        {
          key: 'modelDetail.ip.sizeCustomWithRefs',
          interp: { maxPixels: 2048 * 2048 },
        },
      ],
    },
    {
      name: 'image',
      type: 'string-or-array',
      required: false,
      description: P.image(9, REFERENCE_MIME_DEFAULT),
    },
    {
      name: 'seed',
      type: 'integer',
      required: false,
      default: 0,
      description: P.seed(),
    },
    {
      name: 'watermark',
      type: 'boolean',
      required: false,
      default: false,
      description: P.watermark(),
    },
  ],
  notes: [
    { key: 'modelDetail.in.wan27pro.refsCeiling' },
    { key: 'modelDetail.in.wan27.nonProAbsent' },
  ],
}

const SEEDREAM_5_PRO_CONTRACT: ImageContract = {
  sizes: ['1K', '1.5K', '2K'],
  defaultSize: '2K',
  nRange: { min: 1, max: 1, default: 1 },
  maxReferenceImages: 10,
  referenceMimeTypes: REFERENCE_MIME_DEFAULT,
  seed: null,
  watermark: { default: false },
  customSize: {
    minPixels: 921600,
    maxPixels: 4624220,
    minRatio: '1:16',
    maxRatio: '16:1',
  },
  params: [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: P.model('Doubao-Seedream-5.0-pro'),
    },
    { name: 'prompt', type: 'string', required: true, description: P.prompt() },
    {
      name: 'n',
      type: 'integer',
      required: false,
      default: 1,
      description: P.n(1, 1, 1),
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      default: '2K',
      description: [
        ...P.sizeTiers(['1K', '1.5K', '2K']),
        ...P.sizeCustom(921600, 4624220, '1:16', '16:1'),
      ],
    },
    {
      name: 'image',
      type: 'string-or-array',
      required: false,
      description: P.image(10, REFERENCE_MIME_DEFAULT),
    },
    {
      name: 'watermark',
      type: 'boolean',
      required: false,
      default: false,
      description: P.watermark(),
    },
    {
      name: 'response_format',
      type: 'string',
      required: false,
      default: 'url',
      description: [
        {
          key: 'modelDetail.ip.responseFormat',
          interp: { formats: 'url / b64_json', default: 'url' },
        },
      ],
    },
    {
      name: 'output_format',
      type: 'string',
      required: false,
      default: 'jpeg',
      description: [
        {
          key: 'modelDetail.ip.outputFormat',
          interp: { formats: 'png / jpeg', default: 'jpeg' },
        },
      ],
    },
  ],
  notes: [
    { key: 'modelDetail.in.seedreamPro.singleImage' },
    { key: 'modelDetail.in.seedreamPro.minPixels' },
  ],
}

const SEEDREAM_5_LITE_CONTRACT: ImageContract = {
  sizes: ['2K', '3K', '4K'],
  defaultSize: '2K',
  nRange: { min: 1, max: 1, default: 1 },
  maxReferenceImages: 14,
  referenceMimeTypes: REFERENCE_MIME_DEFAULT,
  seed: null,
  watermark: { default: false },
  customSize: {
    minPixels: 3686400,
    maxPixels: 16777216,
    minRatio: '1:16',
    maxRatio: '16:1',
  },
  params: [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: P.model('Doubao-Seedream-5.0-lite'),
    },
    { name: 'prompt', type: 'string', required: true, description: P.prompt() },
    {
      name: 'n',
      type: 'integer',
      required: false,
      default: 1,
      description: P.n(1, 1, 1),
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      default: '2K',
      description: [
        ...P.sizeTiers(['2K', '3K', '4K']),
        ...P.sizeCustom(3686400, 16777216, '1:16', '16:1'),
      ],
    },
    {
      name: 'image',
      type: 'string-or-array',
      required: false,
      description: P.image(14, REFERENCE_MIME_DEFAULT),
    },
    {
      name: 'watermark',
      type: 'boolean',
      required: false,
      default: false,
      description: P.watermark(),
    },
    {
      name: 'response_format',
      type: 'string',
      required: false,
      default: 'url',
      description: [
        {
          key: 'modelDetail.ip.responseFormat',
          interp: { formats: 'url / b64_json', default: 'url' },
        },
      ],
    },
    {
      name: 'output_format',
      type: 'string',
      required: false,
      default: 'jpeg',
      description: [
        {
          key: 'modelDetail.ip.outputFormat',
          interp: { formats: 'png / jpeg', default: 'jpeg' },
        },
      ],
    },
  ],
  notes: [
    { key: 'modelDetail.in.seedreamLite.pixelFloor' },
    { key: 'modelDetail.in.seedreamLite.tiers' },
  ],
}

const IMAGE_CONTRACTS: Record<string, ImageContract> = {
  'qwen-image-3.0': QWEN_IMAGE_3_0_CONTRACT,
  'qwen-image-3.0-pro': QWEN_IMAGE_3_0_PRO_CONTRACT,
  'wan2.7-image-pro': WAN_IMAGE_PRO_CONTRACT,
  'doubao-seedream-5.0-pro': SEEDREAM_5_PRO_CONTRACT,
  'doubao-seedream-5.0-lite': SEEDREAM_5_LITE_CONTRACT,
}

// ---------------------------------------------------------------------------
// Video wire parameter rows (one row builder per wire contract, never per
// model-id prefix — the wire comes from the capability table).
// ---------------------------------------------------------------------------

/**
 * The video wire contracts. Fields and their JSON slots come from the
 * production request serializer web/src/features/video-playground/lib/
 * video-request.ts and the provider task plugins; the row layout per
 * wire is declared once here and consumed by the detail template.
 */
export type VideoWireLayout = {
  /** Top-level duration field: name and JSON type. */
  duration: {
    name: 'duration' | 'seconds'
    type: 'integer' | 'string'
    sentence: I18nSentence
  }
  /** Resolution slot for this wire. */
  resolution: { topLevel: boolean; name: 'size' | 'metadata.resolution' }
  /** Reference-image slot for this wire. */
  references: {
    name: 'metadata.input.media' | 'metadata.content'
    sentence: I18nSentence
  }
}

const WAN3_LAYOUT: VideoWireLayout = {
  duration: {
    name: 'duration',
    type: 'integer',
    sentence: { key: 'modelDetail.vp.durationWan3' },
  },
  resolution: { topLevel: true, name: 'size' },
  references: {
    name: 'metadata.input.media',
    sentence: { key: 'modelDetail.vp.refsWan3' },
  },
}

const H3_LAYOUT: VideoWireLayout = {
  duration: {
    name: 'duration',
    type: 'integer',
    sentence: { key: 'modelDetail.vp.durationH3' },
  },
  resolution: { topLevel: false, name: 'metadata.resolution' },
  references: {
    name: 'metadata.content',
    sentence: { key: 'modelDetail.vp.refsContent' },
  },
}

const SEEDANCE_LAYOUT: VideoWireLayout = {
  duration: {
    name: 'seconds',
    type: 'string',
    sentence: { key: 'modelDetail.vp.seconds' },
  },
  resolution: { topLevel: false, name: 'metadata.resolution' },
  references: {
    name: 'metadata.content',
    sentence: { key: 'modelDetail.vp.refsContent' },
  },
}

function layoutForWire(
  wire: NonNullable<VideoModelCapability['wire']>
): VideoWireLayout {
  switch (wire) {
    case 'alibaba-wan3':
      return WAN3_LAYOUT
    case 'hailuo-h3':
      return H3_LAYOUT
    case 'doubao-seedance':
      return SEEDANCE_LAYOUT
  }
}

/**
 * Build the exact video parameter rows for one capability. The wire
 * (from the capability table) decides which JSON slots exist — no
 * model-id substring branching anywhere.
 */
export function buildVideoParamRows(
  capability: VideoModelCapability
): ReadonlyArray<ImageParamRow> {
  const layout = layoutForWire(capability.wire ?? 'alibaba-wan3')
  const durationInterp = {
    min: capability.durations[0],
    max: capability.durations.at(-1) ?? capability.durations[0],
  }
  const rows: ImageParamRow[] = [
    {
      name: 'model',
      type: 'string',
      required: true,
      description: [
        {
          key: 'modelDetail.vp.model',
          interp: { modelId: capability.modelId },
        },
      ],
    },
    {
      name: 'prompt',
      type: 'string',
      required: true,
      description: [{ key: 'modelDetail.vp.prompt' }],
    },
  ]
  rows.push({
    name: layout.duration.name,
    type: layout.duration.type,
    required: false,
    description: [{ ...layout.duration.sentence, interp: durationInterp }],
  })
  if (layout.resolution.topLevel) {
    rows.push({
      name: 'size',
      type: 'string',
      required: false,
      description: [
        {
          key: 'modelDetail.vp.sizeWan3',
          interp: { list: capability.resolutions.join(', ') },
        },
      ],
    })
  } else {
    rows.push({
      name: 'metadata.resolution',
      type: 'string',
      required: false,
      description: [
        {
          key: 'modelDetail.vp.resolution',
          interp: { list: capability.resolutions.join(', ') },
        },
      ],
    })
  }
  rows.push({
    name: layout.references.name,
    type: 'array',
    required: false,
    description: [
      {
        ...layout.references.sentence,
        interp: { max: capability.maxReferenceImages },
      },
    ],
  })
  return rows
}

/** Per-model video callouts; each entry is an i18n sentence. */
const VIDEO_NOTES: Record<string, ReadonlyArray<I18nSentence>> = {
  'wan3.0-video': [
    { key: 'modelDetail.vn.wan3.topLevelSlots' },
    { key: 'modelDetail.vn.wan3.noTopLevelImages' },
  ],
  'wan3.0-video-prime': [{ key: 'modelDetail.vn.wan3Prime.sameAsWan3' }],
  'minimax-h3': [
    { key: 'modelDetail.vn.h3.slots' },
    { key: 'modelDetail.vn.h3.fiveRefs' },
    { key: 'modelDetail.vn.h3.ratioOmitted' },
  ],
  'doubao-seedance-2.0': [
    { key: 'modelDetail.vn.seedance.secondsString' },
    { key: 'modelDetail.vn.seedance20.rejectedWithRefs' },
    { key: 'modelDetail.vn.seedance20.tiers' },
  ],
  'doubao-seedance-2.5': [
    { key: 'modelDetail.vn.seedance.secondsString' },
    { key: 'modelDetail.vn.seedance25.no4k' },
    { key: 'modelDetail.vn.seedance25.limits' },
  ],
}

// ---------------------------------------------------------------------------
// Slug registry (the only place slugs are declared)
// ---------------------------------------------------------------------------

const VENDOR_SOURCES = {
  aliyunWan3: {
    labelKey: 'modelDetail.sources.aliyunWanVideo',
    url: 'https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference',
  },
  aliyunWanImage: {
    labelKey: 'modelDetail.sources.aliyunWanImage',
    url: 'https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference',
  },
  minimaxH3: {
    labelKey: 'modelDetail.sources.minimaxVideoV2',
    url: 'https://platform.minimax.io/docs/api-reference/video-generation-v2-create',
  },
  volcengineSeedance: {
    labelKey: 'modelDetail.sources.volcengineSeedance',
    url: 'https://ark.volcengine.com/docs/82379/2301412',
  },
  byteplusSeedance: {
    labelKey: 'modelDetail.sources.byteplusVideo',
    url: 'https://docs.byteplus.com/en/docs/byteplus_las/video_gen_enhanced',
  },
  volcengineSeedream: {
    labelKey: 'modelDetail.sources.volcengineSeedream',
    url: 'https://ark.volcengine.com/docs/82379/1541523',
  },
  qwenImageDocs: {
    labelKey: 'modelDetail.sources.aliyunQwenImage',
    url: 'https://help.aliyun.com/zh/model-studio/qwen-image-generation-api-reference',
  },
} as const satisfies Record<string, ModelSource>

const SLUG_ENTRIES: ReadonlyArray<ModelSlugEntry> = [
  {
    slug: 'qwen-image-3.0',
    modelId: 'qwen-image-3.0',
    modality: 'image',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.qwenImage30',
    descriptionKey: 'modelDetail.description.qwenImage30',
    modes: ['text-to-image', 'image-to-image'],
    sources: [VANCINE_GO_CONTRACT_SOURCE, VENDOR_SOURCES.qwenImageDocs],
  },
  {
    slug: 'qwen-image-3.0-pro',
    modelId: 'qwen-image-3.0-pro',
    modality: 'image',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.qwenImage30Pro',
    descriptionKey: 'modelDetail.description.qwenImage30Pro',
    modes: ['text-to-image', 'image-to-image'],
    sources: [VANCINE_GO_CONTRACT_SOURCE, VENDOR_SOURCES.qwenImageDocs],
  },
  {
    slug: 'wan2.7-image-pro',
    modelId: 'wan2.7-image-pro',
    modality: 'image',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.wan27ImagePro',
    descriptionKey: 'modelDetail.description.wan27ImagePro',
    modes: ['text-to-image', 'image-to-image'],
    sources: [VANCINE_GO_CONTRACT_SOURCE, VENDOR_SOURCES.aliyunWanImage],
  },
  {
    slug: 'doubao-seedream-5.0-pro',
    modelId: 'Doubao-Seedream-5.0-pro',
    modality: 'image',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.seedream50Pro',
    descriptionKey: 'modelDetail.description.seedream50Pro',
    modes: ['text-to-image', 'image-to-image'],
    sources: [VANCINE_GO_CONTRACT_SOURCE, VENDOR_SOURCES.volcengineSeedream],
  },
  {
    slug: 'doubao-seedream-5.0-lite',
    modelId: 'Doubao-Seedream-5.0-lite',
    modality: 'image',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.seedream50Lite',
    descriptionKey: 'modelDetail.description.seedream50Lite',
    modes: ['text-to-image', 'image-to-image'],
    sources: [VANCINE_GO_CONTRACT_SOURCE, VENDOR_SOURCES.volcengineSeedream],
  },
  {
    slug: 'wan3.0-video',
    modelId: 'wan3.0-video',
    modality: 'video',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.wan30Video',
    descriptionKey: 'modelDetail.description.wan30Video',
    modes: ['text-to-video', 'image-to-video', 'multi-reference'],
    sources: [VENDOR_SOURCES.aliyunWan3],
  },
  {
    slug: 'wan3.0-video-prime',
    modelId: 'wan3.0-video-prime',
    modality: 'video',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.wan30VideoPrime',
    descriptionKey: 'modelDetail.description.wan30VideoPrime',
    modes: ['text-to-video', 'image-to-video', 'multi-reference'],
    sources: [VENDOR_SOURCES.aliyunWan3],
  },
  {
    slug: 'minimax-h3',
    modelId: 'MiniMax-H3',
    modality: 'video',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.minimaxH3',
    descriptionKey: 'modelDetail.description.minimaxH3',
    modes: ['text-to-video', 'image-to-video', 'multi-reference'],
    sources: [VENDOR_SOURCES.minimaxH3],
  },
  {
    slug: 'doubao-seedance-2.0',
    modelId: 'Doubao-Seedance-2.0',
    modality: 'video',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.seedance20',
    descriptionKey: 'modelDetail.description.seedance20',
    modes: ['text-to-video', 'image-to-video', 'multi-reference'],
    sources: [
      VENDOR_SOURCES.volcengineSeedance,
      VENDOR_SOURCES.byteplusSeedance,
    ],
  },
  {
    slug: 'doubao-seedance-2.5',
    modelId: 'Doubao-Seedance-2.5',
    modality: 'video',
    verifiedOn: '2026-09-10',
    summaryKey: 'modelDetail.summary.seedance25',
    descriptionKey: 'modelDetail.description.seedance25',
    modes: ['text-to-video', 'image-to-video', 'multi-reference'],
    sources: [
      VENDOR_SOURCES.volcengineSeedance,
      VENDOR_SOURCES.byteplusSeedance,
    ],
  },
]

const SLUG_BY_SLUG: ReadonlyMap<string, ModelSlugEntry> = new Map(
  SLUG_ENTRIES.map((entry) => [entry.slug, entry])
)
const ENTRY_BY_MODEL_ID: ReadonlyMap<string, ModelSlugEntry> = new Map(
  SLUG_ENTRIES.map((entry) => [entry.modelId, entry])
)

/** Every slug the registry publishes. */
export const ALL_MODEL_SLUGS: ReadonlyArray<string> = SLUG_ENTRIES.map(
  (entry) => entry.slug
)

/** Slugs that should be advertised in the sitemap and llms.txt. */
export const SITEMAP_MODEL_SLUGS: ReadonlyArray<string> = SLUG_ENTRIES.filter(
  (entry) => !entry.retired
).map((entry) => entry.slug)

/** Resolve a model slug to its registry entry (null when unknown). */
export function getModelEntry(slug: string): ModelSlugEntry | null {
  return SLUG_BY_SLUG.get(slug) ?? null
}

/** Reverse lookup: a pricing payload model_name → registry entry. */
export function getModelEntryByModelId(modelId: string): ModelSlugEntry | null {
  return ENTRY_BY_MODEL_ID.get(modelId) ?? null
}

/** Resolve the image contract for a model id (null for non-image). */
export function getImageContract(modelId: string): ImageContract | null {
  const entry = getModelEntryByModelId(modelId)
  if (!entry || entry.modality !== 'image') return null
  return IMAGE_CONTRACTS[entry.slug] ?? null
}

/**
 * Resolve the video contract for a model id: the numeric contract is
 * delegated to the production capability table; per-model notes come
 * from this registry. Parameter-table layout is derived from
 * `capability.wire` inside `buildVideoParamRows`.
 */
export function getVideoContract(modelId: string): {
  capability: VideoModelCapability
  notes: ReadonlyArray<I18nSentence>
} | null {
  const entry = getModelEntryByModelId(modelId)
  if (!entry || entry.modality !== 'video') return null
  const capability = resolveVideoModelCapability(entry.modelId)
  if (!capability.known || capability.wire === null) return null
  return {
    capability,
    notes: VIDEO_NOTES[entry.slug] ?? [],
  }
}
