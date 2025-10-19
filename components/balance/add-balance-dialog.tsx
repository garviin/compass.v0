'use client'

import { useEffect, useState } from 'react'

import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import {
  getSupportedCurrencies,
  type SupportedCurrency
} from '@/lib/pricing/currency-service'
import { formatCost } from '@/lib/pricing/format'
import { getPredefinedAmounts } from '@/lib/stripe/payment-service'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import { StripePaymentForm } from './stripe-payment-form'

// Read publishable key from env (client-safe NEXT_PUBLIC variable)
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

// Lazily initialize Stripe only when a valid key is present
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

interface AddBalanceDialogProps {
  currentBalance: number
  currentCurrency: string
  onSuccess?: () => void
  /** Optional publishable key from a server component */
  stripePublishableKey?: string
}

export function AddBalanceDialog({
  currentBalance,
  currentCurrency,
  onSuccess,
  stripePublishableKey
}: AddBalanceDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>(
    currentCurrency as SupportedCurrency
  )
  const [amount, setAmount] = useState<number>(10)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [isCreatingIntent, setIsCreatingIntent] = useState(false)
  const [clientSecret, setClientSecret] = useState<string>()
  const [paymentIntentId, setPaymentIntentId] = useState<string>()

  const predefinedAmounts = getPredefinedAmounts(selectedCurrency)
  const supportedCurrencies = getSupportedCurrencies()

  // Prefer server-provided key; fall back to client-env if available
  const resolvedPublishableKey =
    stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  // Lazily initialize Stripe only when a valid key is present
  const stripePromise = resolvedPublishableKey
    ? loadStripe(resolvedPublishableKey)
    : null

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setClientSecret(undefined)
      setCustomAmount('')
      setAmount(predefinedAmounts[1] || 10)
    }
  }, [open, predefinedAmounts])

  const handleAmountSelect = (value: number) => {
    setAmount(value)
    setCustomAmount('')
  }

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value)
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed)
    }
  }

  const handleContinueToPayment = async () => {
    if (!resolvedPublishableKey) {
      toast.error(
        'Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.'
      )
      return
    }
    if (amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsCreatingIntent(true)

    try {
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          currency: selectedCurrency
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create payment intent')
      }

      const data = await response.json()
      setClientSecret(data.clientSecret)
      setPaymentIntentId(data.paymentIntentId)
    } catch (error) {
      console.error('Error creating payment intent:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to initiate payment'
      )
    } finally {
      setIsCreatingIntent(false)
    }
  }

  const handlePaymentSuccess = () => {
    toast.success('Payment successful! Your balance has been updated.')
    setOpen(false)
    onSuccess?.()
  }

  const handlePaymentError = (error: string) => {
    toast.error(error)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Plus className="mr-2 size-4" />
          Add Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Funds to Your Balance</DialogTitle>
          <DialogDescription>
            Current balance: {formatCost(currentBalance, currentCurrency)}
          </DialogDescription>
        </DialogHeader>

        {!clientSecret ? (
          <div className="space-y-6 py-4">
            {/* Currency Selector */}
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={selectedCurrency}
                onValueChange={(value) =>
                  setSelectedCurrency(value as SupportedCurrency)
                }
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount Selection */}
            <div className="space-y-2">
              <Label>Select Amount</Label>
              <div className="grid grid-cols-3 gap-2">
                {predefinedAmounts.map((presetAmount) => (
                  <Button
                    key={presetAmount}
                    type="button"
                    variant={
                      amount === presetAmount && !customAmount
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => handleAmountSelect(presetAmount)}
                  >
                    {formatCost(presetAmount, selectedCurrency)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div className="space-y-2">
              <Label htmlFor="custom-amount">Or Enter Custom Amount</Label>
              <Input
                id="custom-amount"
                type="number"
                placeholder={`Enter amount in ${selectedCurrency}`}
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            {/* Total */}
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Amount to add:</span>
                <span className="text-lg font-bold">
                  {formatCost(amount, selectedCurrency)}
                </span>
              </div>
            </div>

            {/* Continue Button */}
            <Button
              onClick={handleContinueToPayment}
              disabled={amount <= 0 || isCreatingIntent || !resolvedPublishableKey}
              className="w-full"
            >
              {isCreatingIntent ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Continue to Payment'
              )}
            </Button>
            {!resolvedPublishableKey && (
              <p className="text-xs text-destructive text-center">
                Missing Stripe publishable key. Define NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
              </p>
            )}
          </div>
        ) : (
          <div className="py-4">
            {stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe'
                  }
                }}
              >
                <StripePaymentForm
                  amount={amount}
                  currency={selectedCurrency}
                  paymentIntentId={paymentIntentId}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </Elements>
            ) : (
              <p className="text-sm text-destructive text-center">
                Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
