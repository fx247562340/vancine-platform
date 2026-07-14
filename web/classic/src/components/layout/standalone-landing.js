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
 * Routes that render their own header/footer inside PageLayout. On these
 * routes the global fixed HeaderBar and FooterBar must NOT render, and the
 * Content wrapper must use overflowY:'visible' so the page's own sticky
 * header is not clipped.
 */
export const STANDALONE_LANDING_PAGES = ['/seedance-api', '/ai-media-api'];

export function isStandaloneLandingPage(pathname) {
  return STANDALONE_LANDING_PAGES.includes(pathname);
}
