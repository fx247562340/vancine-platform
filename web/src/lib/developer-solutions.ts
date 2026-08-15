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
 * Single source of truth for the public developer landing pages. The
 * homepage Developer solutions section, the public header API Solutions
 * menu, and the Docs sidebar all consume this registry — routes, titles,
 * descriptions, and analytics resource values are never maintained twice.
 *
 * Only resources that are actually live belong here.
 */

export type DeveloperSolutionId =
  | 'kimi-k3-api'
  | 'seedance-api'
  | 'ai-media-api'

export type DeveloperSolutionRoute =
  | '/kimi-k3-api'
  | '/seedance-api'
  | '/ai-media-api'

export type DeveloperSolutionResource =
  | 'kimi_k3_api'
  | 'seedance_api'
  | 'ai_media_api'

export interface DeveloperSolution {
  /** Stable identifier, unique within the registry. */
  id: DeveloperSolutionId
  /** Type-safe internal route; always a fixed absolute in-site path. */
  route: DeveloperSolutionRoute
  /** Global-namespace i18n key of the card/menu title. */
  titleKey: string
  /** Global-namespace i18n key of the card/menu description. */
  descriptionKey: string
  /** Fixed analytics resource value for developer_resource_clicked. */
  resource: DeveloperSolutionResource
}

export const DEVELOPER_SOLUTIONS: readonly DeveloperSolution[] = [
  {
    id: 'kimi-k3-api',
    route: '/kimi-k3-api',
    titleKey: 'Kimi K3 API',
    descriptionKey: 'Kimi K3 for coding agents and OpenAI-compatible clients.',
    resource: 'kimi_k3_api',
  },
  {
    id: 'seedance-api',
    route: '/seedance-api',
    titleKey: 'Seedance 2.5 API',
    descriptionKey:
      'Async Doubao-Seedance-2.5 video generation through one API.',
    resource: 'seedance_api',
  },
  {
    id: 'ai-media-api',
    route: '/ai-media-api',
    titleKey: 'AI Media API',
    descriptionKey: 'Image, video, speech, and 3D generation through one API.',
    resource: 'ai_media_api',
  },
]

/** Global-namespace i18n key for the header menu trigger. */
export const DEVELOPER_SOLUTIONS_MENU_LABEL_KEY = 'API Solutions'

/** Global-namespace i18n key for section headings (homepage and Docs). */
export const DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY = 'Developer solutions'
