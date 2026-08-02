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
 * Responsive layout class contract for the Docs three-column layout.
 *
 * Mobile-first: content stacks vertically (`flex-col`) and switches to a
 * horizontal three-column row (`lg:flex-row`) at the `lg` breakpoint (1024px),
 * matching Classic, which shows sidebar + main + TOC from lg upward. These
 * constants are the single source of truth consumed by the layout component
 * and asserted by the responsive regression tests.
 */
export const DOCS_LAYOUT_CONTAINER_CLASS = 'flex flex-col gap-10 lg:flex-row'

/** Main content column: must never collapse to 0 width and must not overflow. */
export const DOCS_MAIN_CLASS = 'w-full min-w-0 max-w-[768px] flex-1'

/** TOC column: hidden below lg (1024px), shown alongside sidebar + main. */
export const DOCS_TOC_CLASS = 'hidden w-44 shrink-0 lg:block'
