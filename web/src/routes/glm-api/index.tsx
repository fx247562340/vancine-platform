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

import { Glm53ApiPage } from '@/features/glm-5-3-api'

// SEO-4 evergreen canonical: the single GLM acquisition page. The path
// carries no version number so future GLM generations (5.4, 5.5, ...)
// update this same page in place. It renders the current GLM-5.3 /
// GLM-5.3 Flash content; the module name features/glm-5-3-api is
// internal code, not a public URL.
export const Route = createFileRoute('/glm-api/')({
  component: Glm53ApiPage,
})
