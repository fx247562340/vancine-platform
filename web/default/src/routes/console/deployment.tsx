import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/deployment → Default /models/deployments
export const Route = createFileRoute('/console/deployment')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/models/$section',
        location,
        params: { section: 'deployments' },
      }),
    })
  },
})
