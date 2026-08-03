import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/log → Default /usage-logs/common
export const Route = createFileRoute('/console/log')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/usage-logs/$section',
        location,
        params: { section: 'common' },
      }),
    })
  },
})
