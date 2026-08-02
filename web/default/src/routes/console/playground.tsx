import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/playground → Default /playground
export const Route = createFileRoute('/console/playground')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({ to: '/playground', location }),
    })
  },
})
