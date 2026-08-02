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
import type { ContentPart } from '../types'

export type MessageContent = string | ContentPart[]

// ![alt](url) or ![alt](url "title")
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/**
 * Extract markdown image URLs from a text string.
 */
export function extractMarkdownImages(text: string): string[] {
  const urls: string[] = []
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    if (match[1]) urls.push(match[1])
  }
  return urls
}

/**
 * Plain-text representation of message content: strings pass through,
 * content parts contribute their text blocks (image blocks are ignored).
 */
export function getContentText(content: MessageContent | undefined): string {
  if (content === undefined || content === null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('\n')
  }
  return ''
}

/**
 * All image URLs carried by message content: `image_url` content parts plus
 * markdown image syntax embedded in text. Duplicates are removed.
 */
export function getContentImages(
  content: MessageContent | undefined
): string[] {
  if (typeof content === 'string') {
    return extractMarkdownImages(content)
  }
  if (Array.isArray(content)) {
    const fromParts = content
      .filter((part) => part.type === 'image_url' && part.image_url?.url)
      .map((part) => part.image_url!.url)
    const fromText = content.flatMap((part) =>
      part.type === 'text' && part.text ? extractMarkdownImages(part.text) : []
    )
    return [...new Set([...fromParts, ...fromText])]
  }
  return []
}

/**
 * Remove markdown image syntax from text so images can be rendered by the
 * dedicated <MessageImage> component (with zoom + error fallback) instead
 * of being rendered a second time by the markdown renderer.
 */
export function stripImageMarkdown(text: string): string {
  return text.replace(MARKDOWN_IMAGE_RE, '').trim()
}
