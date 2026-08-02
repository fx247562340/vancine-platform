import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/user → Default /users
export const Route = createFileRoute('/console/user')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({ to: '/users', location }),
    })
  },
})
