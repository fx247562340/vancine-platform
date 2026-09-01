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
import { createFileRoute } from '@tanstack/react-router'

import { FastCodingModelsPage } from '@/features/fast-coding-models'

// Acquisition guide: the fast AI models selection guide. The
// canonical lives under /guides/ and lists every model whose live
// /api/pricing entry carries the exact "fast" tag, in stable
// case-insensitive model_name order. There is deliberately no
// top-level alias and no model subroute.
export const Route = createFileRoute('/guides/fast-coding-models')({
  component: FastCodingModelsPage,
})
