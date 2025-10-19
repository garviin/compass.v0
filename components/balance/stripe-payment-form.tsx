'use client'

import { useState } from 'react'

import {
    PaymentElement,
    useElements,
    useStripe
} from '@stripe/react-stripe-js'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface StripePaymentFormProps {
  amount: number
  currency: string
  paymentIntentId?: string
  onSuccess: () => void
  onError: (error: string) => void
}

export function StripePaymentForm({
  amount,
  currency,
  paymentIntentId,
  onSuccess,
  onError
}: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setErrorMessage(undefined)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/account?payment=success`
        },
        redirect: 'if_required'
      })

      if (error) {
        setErrorMessage(error.message || 'Payment failed')
        onError(error.message || 'Payment failed')
      } else {
        // Hit server to finalize balance using the payment intent as source of truth
        try {
          const id = paymentIntent?.id || paymentIntentId
          if (id) {
            await fetch(`/api/payments/finalize?payment_intent_id=${encodeURIComponent(id)}`, {
              method: 'POST'
            })
          }
        } catch (e) {
          // Non-blocking; webhook may still update
        }
        onSuccess()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed'
      setErrorMessage(message)
      onError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {errorMessage && (
        <div className="text-sm text-destructive">{errorMessage}</div>
      )}

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay ${amount} ${currency}`
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Your payment is securely processed by Stripe
      </p>
    </form>
  )
}
