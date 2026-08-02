import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/chat (no id) → /dashboard/overview
// Rationale: Classic's /console/chat without an id shows a loading
// spinner (no iframe URL can be built). Dashboard is an intentional
// safe recovery target, not equivalent behavior.
export const Route = createFileRoute('/console/chat/')({
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
