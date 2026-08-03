import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/models → Default /models/metadata
export const Route = createFileRoute('/console/models')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/models/$section',
        location,
        params: { section: 'metadata' },
      }),
    })
  },
})
