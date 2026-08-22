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
import axios from 'axios'

import type { ImageFormValues } from './form-schema'

/**
 * P13-B R18 closed discriminated union for the error source.
 *
 * Every ImagePlaygroundError carries EXACTLY ONE source:
 *   - kind:'system'   -> errorKey is a stable i18n key, translated via t()
 *                        at render time so a language switch re-labels it.
 *   - kind:'upstream' -> rawMessage is a verbatim server/upstream message,
 *                        rendered untouched and never t()-translated.
 *
 * The union is closed and each variant carries its mandatory field, so the
 * old failure mode - two optional fields that could both be missing or both
 * be present - cannot be expressed. Plain Errors and unknown exceptions are
 * never converted into upstream text; producers fail closed on the system
 * variant instead.
 */
export type ImagePlaygroundErrorSource =
  | { kind: 'system'; errorKey: string }
  | { kind: 'upstream'; rawMessage: string }

export class ImagePlaygroundError extends Error {
  readonly source: ImagePlaygroundErrorSource

  constructor(source: ImagePlaygroundErrorSource) {
    super(source.kind === 'system' ? source.errorKey : source.rawMessage)
    this.name = 'ImagePlaygroundError'
    this.source = source
  }

  /** Stable i18n key for system errors; undefined for upstream errors. */
  get errorKey(): string | undefined {
    return this.source.kind === 'system' ? this.source.errorKey : undefined
  }

  /** Verbatim upstream message for upstream errors; undefined otherwise. */
  get rawUpstreamMessage(): string | undefined {
    return this.source.kind === 'upstream' ? this.source.rawMessage : undefined
  }
}

export type ImageErrorContext = {
  sizeMode?: 'preset' | 'custom' | 'auto'
}

const advancedFields = new Set<keyof ImageFormValues>([
  'negativePrompt',
  'seed',
  'watermark',
  'promptExtend',
  'promptExtendMode',
  'thinkingMode',
])

/**
 * Extracts an explicit server/upstream error message from an HTTP response
 * body envelope ({ error: { message } } or { message }). Returns undefined
 * when the body carries no usable message - callers must then fail closed
 * on a system errorKey, never fall back to generic axios text.
 */
export function extractServerErrorFromBody(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }
  const envelope = data as {
    error?: { message?: unknown }
    message?: unknown
  }
  if (typeof envelope.error?.message === 'string') {
    const message = envelope.error.message.trim()
    if (message !== '') return message
  }
  if (typeof envelope.message === 'string') {
    const message = envelope.message.trim()
    if (message !== '') return message
  }
  return undefined
}

export function extractUpstreamErrorMessage(
  error: unknown
): string | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined
  }
  return extractServerErrorFromBody(error.response?.data)
}

export function mapImageServerErrorToField(
  message: string,
  context: ImageErrorContext = {}
): { name: keyof ImageFormValues; message: string } | null {
  const lower = message.toLowerCase()
  if (lower.includes('prompt is required')) {
    return { name: 'prompt', message }
  }
  if (lower.includes('negative_prompt')) {
    return { name: 'negativePrompt', message }
  }
  if (lower.includes('n must')) {
    return { name: 'n', message }
  }
  if (
    lower.includes('size') ||
    lower.includes('pixel') ||
    lower.includes('aspect ratio') ||
    /\b4k\b/.test(lower)
  ) {
    if (context.sizeMode === 'custom') {
      return { name: 'customWidth', message }
    }
    return { name: 'size', message }
  }
  if (lower.includes('prompt_extend_mode')) {
    return { name: 'promptExtendMode', message }
  }
  if (lower.includes('enable_thinking')) {
    return { name: 'thinkingMode', message }
  }
  if (/(^|[^a-z])seed([^a-z]|$)/.test(lower.replaceAll('seedream', ''))) {
    return { name: 'seed', message }
  }
  return null
}

export function isAdvancedImageField(name: keyof ImageFormValues): boolean {
  return advancedFields.has(name)
}
