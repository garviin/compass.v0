import { NextRequest, NextResponse } from 'next/server'

import { addBalance } from '@/lib/pricing/balance-service'
import { getPaymentIntent } from '@/lib/stripe/payment-service'

/**
 * POST /api/payments/finalize?payment_intent_id=pi_...
 * Best-effort finalization in case webhooks are delayed/misconfigured.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const paymentIntentId = searchParams.get('payment_intent_id')

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: 'payment_intent_id is required' },
        { status: 400 }
      )
    }

    const pi = await getPaymentIntent(paymentIntentId)

    if (pi.status !== 'succeeded') {
      return NextResponse.json({ skipped: true, status: pi.status })
    }

    const userId = (pi.metadata as any)?.userId as string | undefined
    const originalAmount = (pi.metadata as any)?.originalAmount as string | undefined
    const originalCurrency = (pi.metadata as any)?.originalCurrency as string | undefined

    if (!userId || !originalAmount || !originalCurrency) {
      return NextResponse.json({ skipped: true, reason: 'missing_metadata' })
    }

    const amount = parseFloat(originalAmount)
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ skipped: true, reason: 'invalid_amount' })
    }

    const chargeId =
      typeof pi.latest_charge === 'string'
        ? pi.latest_charge
        : (pi.latest_charge as any)?.id

    const success = await addBalance(
      userId,
      amount,
      `Payment received: ${pi.id}`,
      pi.id,
      chargeId,
      {
        paymentIntentStatus: pi.status,
        paymentMethod: pi.payment_method as any,
        receiptEmail: (pi as any).receipt_email || undefined
      }
    )

    return NextResponse.json({ success })
  } catch (error) {
    console.error('Error finalizing payment:', error)
    return NextResponse.json({ error: 'finalize_failed' }, { status: 500 })
  }
}



