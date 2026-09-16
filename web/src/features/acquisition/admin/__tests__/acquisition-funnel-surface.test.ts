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
import type { TFunction } from 'i18next'
/**
 * Surface-isolation contract for the acquisition funnel admin page, verified
 * through behavior and importable registries only (no source-text or file
 * layout assertions):
 *
 * 1. The route's beforeLoad guard redirects a regular user to /403 BEFORE any
 *    funnel API request — exercised by the real route module in
 *    acquisition-funnel-page.test.tsx.
 * 2. The dashboard section registry (the only in-app navigation registry that
 *    could expose an admin funnel surface) exports no acquisition entry.
 * 3. The public sitemap is a backend-owned static whitelist (router/
 *    web-router.go `publicSitemapPaths`); its "not listing this page" is
 *    proven by precise git diff review of that file in the handoff report —
 *    no frontend behavior interface exists to assert it here.
 */
import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_SECTION_IDS,
  getDashboardSectionNavItems,
} from '@/features/dashboard/section-registry'

/** Identity t() so nav titles come back as their raw keys for matching. */
const identityT = ((key: string) => key) as unknown as TFunction

describe('acquisition funnel surface isolation', () => {
  it('is not part of the dashboard section registry (route ids)', () => {
    expect(DASHBOARD_SECTION_IDS).not.toContain('acquisition')
    expect(DASHBOARD_SECTION_IDS).not.toContain('acquisition-funnel')
  })

  it('appears in no dashboard nav item for any role', () => {
    const adminNav = getDashboardSectionNavItems(identityT, {
      isAdmin: true,
    })
    const userNav = getDashboardSectionNavItems(identityT)
    for (const items of [adminNav, userNav]) {
      expect(
        items.filter(
          (item) =>
            item.url.includes('acquisition') ||
            item.title.includes('Acquisition')
        )
      ).toHaveLength(0)
    }
  })
})
