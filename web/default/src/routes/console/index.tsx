import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console → Default /dashboard/overview
export const Route = createFileRoute('/console/')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/dashboard/$section',
        location,
        params: { section: 'overview' },
      }),
    })
  },
})
