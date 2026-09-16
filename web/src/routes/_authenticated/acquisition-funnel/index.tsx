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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { AcquisitionFunnelPage } from '@/features/acquisition/admin'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

// Admin-only, unlisted internal page. Access matches the backend
// middleware.AdminAuth() boundary: any role >= ROLE.ADMIN (admins and super
// admins). The redirect happens in beforeLoad, so a non-admin never mounts
// the page and never issues GET /api/acquisition/funnel. There is no nav,
// sitemap or public metadata entry — this URL is convenience, not security;
// the backend AdminAuth is the enforcement point.
export const Route = createFileRoute('/_authenticated/acquisition-funnel/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  component: AcquisitionFunnelPage,
})
