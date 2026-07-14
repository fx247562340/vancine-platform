/*
Copyright (C) 2025 QuantumNous

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
 * Shared responsive-breakpoint constants used by landing-page headers.
 * Single source of truth — both themes and the responsive test import
 * these same values so the test asserts against real production
 * breakpoints instead of duplicating magic numbers.
 */
export const MOBILE_MAX = 767; // below this: hide Login, collapse nav
export const DESKTOP_NAV_MIN = 1024; // at or above this: show full nav
