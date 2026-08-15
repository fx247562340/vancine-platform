/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { Wallet } from '@/features/wallet'

// One-shot payment-return status flags appended by the payment redirect flow
// (e.g. PayPal return). They are consumed exactly once by the wallet page.
// `payment_cancel` is set by PayPal's cancel_url when the user abandons the
// checkout and is distinct from error/pending/show_history so the wallet can
// surface a localized cancel toast without confusing it with any other state.
const walletSearchSchema = z.object({
  show_history: z.boolean().optional(),
  payment_error: z.boolean().optional(),
  payment_pending: z.boolean().optional(),
  payment_cancel: z.boolean().optional(),
})

export const Route = createFileRoute('/_authenticated/wallet/')({
  component: RouteComponent,
  validateSearch: walletSearchSchema,
})

function RouteComponent() {
  const { show_history, payment_error, payment_pending, payment_cancel } =
    Route.useSearch()
  return (
    <Wallet
      initialShowHistory={show_history}
      paymentError={payment_error}
      paymentPending={payment_pending}
      paymentCancel={payment_cancel}
    />
  )
}
