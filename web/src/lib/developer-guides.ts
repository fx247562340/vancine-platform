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
/**
 * Single source of truth for the public developer guides shown in the
 * API Solutions menu. The desktop header dropdown and the mobile menu
 * both consume this registry, so routes, titles, descriptions, and
 * analytics resource values are never maintained twice.
 *
 * Guides are deliberately NOT part of DEVELOPER_SOLUTIONS
 * (src/lib/developer-solutions.ts): they must not appear in the
 * homepage Developer solutions section or the Docs sidebar, and they
 * never change the order of the four API product entries.
 */

export type DeveloperGuideId = 'fast-coding-models'

export type DeveloperGuideRoute = '/guides/fast-coding-models'

export type DeveloperGuideResource = 'fast_coding_models_guide'

export interface DeveloperGuide {
  /** Stable identifier, unique within the registry. */
  id: DeveloperGuideId
  /** Type-safe internal route; always a fixed absolute in-site path. */
  route: DeveloperGuideRoute
  /** Global-namespace i18n key of the menu title. */
  titleKey: string
  /** Global-namespace i18n key of the menu description. */
  descriptionKey: string
  /** Fixed analytics resource value for developer_resource_clicked. */
  resource: DeveloperGuideResource
}

export const DEVELOPER_GUIDES: readonly DeveloperGuide[] = [
  {
    id: 'fast-coding-models',
    route: '/guides/fast-coding-models',
    titleKey: 'Fast Coding Models for AI Agents',
    descriptionKey:
      'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash.',
    resource: 'fast_coding_models_guide',
  },
]

/** Global-namespace i18n key for the guides subsection heading. */
export const DEVELOPER_GUIDES_SECTION_LABEL_KEY = 'Guides'
