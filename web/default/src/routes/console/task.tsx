import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/task → Default /usage-logs/task
export const Route = createFileRoute('/console/task')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/usage-logs/$section',
        location,
        params: { section: 'task' },
      }),
    })
  },
})
