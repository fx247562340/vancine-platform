import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /console/chat/:id → Default /chat/:id
export const Route = createFileRoute('/console/chat/$id')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location, params }) => {
    throw redirect({
      ...buildLegacyRedirect({
        to: '/chat/$chatId',
        location,
        params: { chatId: params.id },
      }),
    })
  },
})
