import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/topup → Default /wallet (caller query forwarded as-is)
export const Route = createFileRoute('/console/topup')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({ to: '/wallet', location }),
    })
  },
})
