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
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { trackEvent } from '@/lib/analytics'
import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoPancakeAmount,
  calculatePayPalAmount,
  requestPayment,
  requestStripePayment,
  requestPayPalPayment,
  isApiSuccess,
} from '../api'
import { PAYMENT_TYPES } from '../constants'
import {
  isSafeHttpPaymentUrl,
  isStripePayment,
  isWaffoPancakePayment,
  isPayPalPayment,
  resolvePayPalRedirect,
  resolvePaymentErrorMessage,
  navigateToPaymentUrl,
  submitPaymentForm,
} from '../lib'

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment() {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)

        // Dispatch to the provider-specific amount endpoint. Each branch calls
        // exactly one endpoint; PayPal never falls back to the generic amount.
        let response
        if (isStripePayment(paymentType)) {
          response = await calculateStripeAmount({ amount: topupAmount })
        } else if (isWaffoPancakePayment(paymentType)) {
          response = await calculateWaffoPancakeAmount({ amount: topupAmount })
        } else if (isPayPalPayment(paymentType)) {
          response = await calculatePayPalAmount({ amount: topupAmount })
        } else {
          response = await calculateAmount({ amount: topupAmount })
        }

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch (_error) {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isPayPal = isPayPalPayment(paymentType)
        const amount = Math.floor(topupAmount)

        // PayPal: dedicated /api/user/paypal/* endpoints, then a current-window
        // redirect to data.pay_link. Never uses window.open or the generic epay
        // form submission. checkout_started is recorded only after the pay_link
        // passes isSafeHttpPaymentUrl (inside resolvePayPalRedirect).
        if (isPayPal) {
          const response = await requestPayPalPayment({
            amount,
            payment_method: PAYMENT_TYPES.PAYPAL,
          })
          // Business failure: prefer the backend's readable message (which may
          // live in `data` when message is the literal 'error'), else generic.
          if (!isApiSuccess(response)) {
            toast.error(
              resolvePaymentErrorMessage(response, t('Payment request failed'))
            )
            return false
          }
          // Business success: the pay_link must be present and safe. A missing
          // or unsafe pay_link is an invalid redirect URL (NOT the backend's
          // 'success' message).
          const redirect = resolvePayPalRedirect(response)
          if (!redirect.ok) {
            toast.error(t('Invalid payment redirect URL'))
            return false
          }
          trackEvent('checkout_started', {
            provider: 'paypal',
            amount,
          })
          navigateToPaymentUrl(redirect.url)
          toast.success(t('Redirecting to payment page...'))
          return true
        }

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          toast.error(
            resolvePaymentErrorMessage(response, t('Payment request failed'))
          )
          return false
        }

        // Handle Stripe payment
        if (isStripe && response.data?.pay_link) {
          const payLink = response.data.pay_link as string
          if (!isSafeHttpPaymentUrl(payLink)) {
            toast.error(t('Invalid payment redirect URL'))
            return false
          }
          trackEvent('checkout_started', {
            provider: 'stripe',
            amount,
          })
          window.open(payLink, '_blank')
          toast.success(t('Redirecting to payment page...'))
          return true
        }

        // Handle non-Stripe payment
        if (!isStripe && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            if (!isSafeHttpPaymentUrl(url)) {
              toast.error(t('Invalid payment redirect URL'))
              return false
            }
            trackEvent('checkout_started', {
              provider: paymentType,
              amount,
            })
            submitPaymentForm(url, response.data)
            toast.success(t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (_error) {
        toast.error(t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    [t]
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
