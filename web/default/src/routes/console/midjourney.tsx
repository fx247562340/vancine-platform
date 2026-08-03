import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/midjourney → Default /usage-logs/drawing
export const Route = createFileRoute('/console/midjourney')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/usage-logs/$section',
        location,
        params: { section: 'drawing' },
      }),
    })
  },
})
