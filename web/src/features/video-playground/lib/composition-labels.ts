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

import type { CreationMode } from './mode'

/**
 * Human-readable i18n keys for each explicit creation mode.
 *
 * These resolve to the localized label shown in the mode selector
 * and the composer summary row. Using i18n keys (not the raw
 * `composition.*` keys that describe resource composition) means
 * the English page never shows the internal "composition.firstFrame"
 * token — that would be a leak of an internal naming scheme into
 * the UI.
 */
export const CREATION_MODE_LABELS: Record<CreationMode, string> = {
  textToVideo: 'mode.textToVideo',
  firstFrame: 'mode.firstFrame',
  firstAndLastFrame: 'mode.firstAndLastFrame',
  referenceGeneration: 'mode.referenceGeneration',
  videoEdit: 'mode.videoEdit',
  videoExtend: 'mode.videoExtend',
}
