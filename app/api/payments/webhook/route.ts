import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import Stripe from 'stripe'

import { addBalance } from '@/lib/pricing/balance-service'
import { getTransactionByPaymentIntent } from '@/lib/pricing/transaction-service'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/stripe-client'

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 */
export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    console.error('Missing stripe-signature header')
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    const stripe = getStripeClient()
    const webhookSecret = getStripeWebhookSecret()

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Webhook Error: ${error.message}` },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  // Handle the event
  try {
    console.log(`📥 Received webhook: ${event.type} [${event.id}]`)

    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('💰 Processing payment_intent.succeeded...')
        await handlePaymentIntentSucceeded(event.data.object)
        break

      case 'payment_intent.payment_failed':
        console.log('❌ Processing payment_intent.payment_failed...')
        await handlePaymentIntentFailed(event.data.object)
        break

      case 'charge.refunded':
        console.log('💸 Processing charge.refunded...')
        await handleChargeRefunded(event.data.object)
        break

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  console.log('💳 Payment intent succeeded:', paymentIntent.id)
  console.log('📋 Metadata:', JSON.stringify(paymentIntent.metadata, null, 2))

  // Idempotency check: verify this payment hasn't already been processed
  const existingTransaction = await getTransactionByPaymentIntent(
    paymentIntent.id,
    true // useAdmin=true for webhook context
  )
  if (existingTransaction) {
    console.log(
      `⏭️  Payment intent ${paymentIntent.id} already processed (transaction ${existingTransaction.id}). Skipping duplicate.`
    )
    return
  }

  const { metadata } = paymentIntent
  const userId = metadata?.userId
  const originalAmount = metadata?.originalAmount
  const originalCurrency = metadata?.originalCurrency

  console.log('🔍 Extracted values:', {
    userId,
    originalAmount,
    originalCurrency
  })

  if (!userId) {
    console.error('❌ Missing userId in payment intent metadata')
    console.error('📋 Full metadata:', metadata)
    return
  }

  if (!originalAmount || !originalCurrency) {
    console.error('❌ Missing amount or currency in payment intent metadata')
    console.error('📋 Full metadata:', metadata)
    return
  }

  const amount = parseFloat(originalAmount)

  if (isNaN(amount) || amount <= 0) {
    console.error('Invalid amount in payment intent metadata:', originalAmount)
    return
  }

  // Get charge ID from the payment intent
  const chargeId =
    typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id

  // Add balance to user account (useAdmin=true for webhook context)
  console.log(`Attempting to add ${amount} ${originalCurrency} to user ${userId}`)

  const success = await addBalance(
    userId,
    amount,
    `Payment received: ${paymentIntent.id}`,
    paymentIntent.id,
    chargeId,
    {
      paymentIntentStatus: paymentIntent.status,
      paymentMethod: paymentIntent.payment_method,
      receiptEmail: paymentIntent.receipt_email || undefined
    },
    true // useAdmin=true for webhook processing
  )

  if (success) {
    console.log(
      `✅ SUCCESS: Added ${amount} ${originalCurrency} to user ${userId}'s balance`
    )
  } else {
    console.error(
      `❌ FAILED: Could not add balance for user ${userId}, payment intent ${paymentIntent.id}`
    )
    console.error('Check server logs for detailed error messages')
    // In production, you might want to send an alert or retry mechanism here
  }
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent failed:', paymentIntent.id)

  const { metadata } = paymentIntent
  const userId = metadata?.userId

  if (!userId) {
    console.error('Missing userId in payment intent metadata')
    return
  }

  // Log the failure
  console.error(
    `Payment failed for user ${userId}:`,
    paymentIntent.last_payment_error?.message || 'Unknown error'
  )

  // In production, you might want to:
  // 1. Send an email notification to the user
  // 2. Log to an error tracking service
  // 3. Store failed payment attempt in database
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  console.log('Charge refunded:', charge.id)

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.error('Missing payment intent in charge')
    return
  }

  // Retrieve the payment intent to get metadata
  const stripe = getStripeClient()
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  const { metadata } = paymentIntent
  const userId = metadata?.userId
  const originalAmount = metadata?.originalAmount
  const originalCurrency = metadata?.originalCurrency

  if (!userId || !originalAmount || !originalCurrency) {
    console.error('Missing metadata in payment intent for refund')
    return
  }

  const refundAmount = charge.amount_refunded / 100 // Convert from cents to currency units

  // Deduct the refunded amount from user's balance
  // Note: This uses addBalance with a negative amount
  const success = await addBalance(
    userId,
    -refundAmount,
    `Refund processed: ${charge.id}`,
    paymentIntentId,
    charge.id,
    {
      refundReason: charge.refunds?.data[0]?.reason || 'unknown',
      refundStatus: charge.refunds?.data[0]?.status || 'unknown'
    },
    true // useAdmin=true for webhook processing
  )

  if (success) {
    console.log(
      `Successfully deducted refund ${refundAmount} ${originalCurrency} from user ${userId}'s balance`
    )
  } else {
    console.error(
      `Failed to process refund for user ${userId}, charge ${charge.id}`
    )
  }
}
