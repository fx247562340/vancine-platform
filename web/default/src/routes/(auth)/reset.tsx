import { createFileRoute, redirect } from '@tanstack/react-router'
import { buildLegacyRedirect, legacySearchSchema } from '@/lib/legacy-redirect'

// Classic /reset always renders the reset-email request form.
// Default uses /forgot-password for that flow.
//
// Backend password-reset confirmation emails use /user/reset?email=...&token=...
// (see (auth)/user/reset.tsx). They do NOT use /reset.
//
// Therefore /reset unconditionally redirects to /forgot-password.
export const Route = createFileRoute('/(auth)/reset')({
  validateSearch: legacySearchSchema,
  beforeLoad: ({ location }) => {
    throw redirect({
      ...buildLegacyRedirect({ to: '/forgot-password', location }),
    })
  },
})
