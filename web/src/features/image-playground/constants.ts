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
export const IMAGE_PLAYGROUND_ENDPOINTS = {
  CAPABILITIES: '/pg/capabilities',
  GENERATIONS: '/pg/images/generations',
  USER_GROUPS: '/api/user/self/groups',
} as const

export const IMAGE_PLAYGROUND_STORAGE_KEY = 'image_playground_config'

export const DEFAULT_REFERENCE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const ACCEPTED_REFERENCE_MIME_TYPES = DEFAULT_REFERENCE_MIME_TYPES

export const MAX_SINGLE_REFERENCE_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_REFERENCE_BYTES = 30 * 1024 * 1024
