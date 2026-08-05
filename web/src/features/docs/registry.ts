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
import { lazy, type LazyExoticComponent } from 'react'
import type { DocsPageComponent, DocsSlug } from './types.ts'

type LazyPage = LazyExoticComponent<DocsPageComponent>

/**
 * Page registry — all 14 Docs pages are lazy-loaded.
 * Each entry uses a dynamic import so pages don't inflate the main bundle.
 */
export const PAGE_REGISTRY: Record<DocsSlug, LazyPage> = {
  quickstart: lazy(() => import('./pages/quickstart')),
  migrate: lazy(() => import('./pages/migrate')),
  models: lazy(() => import('./pages/models')),
  chat: lazy(() => import('./pages/chat')),
  image: lazy(() => import('./pages/image')),
  video: lazy(() => import('./pages/video')),
  td: lazy(() => import('./pages/td')),
  audio: lazy(() => import('./pages/audio')),
  sdks: lazy(() => import('./pages/sdks')),
  agents: lazy(() => import('./pages/agents')),
  auth: lazy(() => import('./pages/auth')),
  capabilities: lazy(() => import('./pages/capabilities')),
  errors: lazy(() => import('./pages/errors')),
  faq: lazy(() => import('./pages/faq')),
}
