import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserBalanceRecord } from '@/lib/pricing/balance-service'
import { isSupportedCurrency } from '@/lib/pricing/currency-service'
import { createPaymentIntent } from '@/lib/stripe/payment-service'
import { createClient } from '@/lib/supabase/server'

interface CreateIntentRequest {
  amount: number
  currency: string
}

/**
 * POST /api/payments/create-intent
 * Create a Stripe Payment Intent for adding balance
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const userId = await getCurrentUserId()

    if (userId === 'anonymous') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: CreateIntentRequest = await req.json()
    const { amount, currency } = body

    // Validate input
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number.' },
        { status: 400 }
      )
    }

    if (!currency || typeof currency !== 'string') {
      return NextResponse.json(
        { error: 'Currency is required.' },
        { status: 400 }
      )
    }

    // Validate currency
    if (!isSupportedCurrency(currency)) {
      return NextResponse.json(
        { error: `Unsupported currency: ${currency}` },
        { status: 400 }
      )
    }

    // Get user email for receipt
    const supabase = await createClient()
    const {
      data: { user }
    } = await supabase.auth.getUser()

    const userEmail = user?.email

    // Get user's balance record to verify currency matches
    const balanceRecord = await getUserBalanceRecord(userId)
    if (balanceRecord && balanceRecord.currency !== currency) {
      return NextResponse.json(
        {
          error: `Currency mismatch. Your account currency is ${balanceRecord.currency}.`,
          accountCurrency: balanceRecord.currency
        },
        { status: 400 }
      )
    }

    // Create payment intent
    const paymentIntent = await createPaymentIntent({
      amount,
      currency,
      userId,
      userEmail,
      metadata: {
        source: 'balance_top_up'
      }
    })

    return NextResponse.json({
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId
    })
  } catch (error) {
    console.error('Error creating payment intent:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    )
  }
}
