/**
 * Stripe payment service
 * Handles payment intent creation and processing
 */

import type Stripe from 'stripe'

import type { SupportedCurrency } from '../pricing/currency-service'
import { isSupportedCurrency } from '../pricing/currency-service'

import { getStripeClient } from './stripe-client'

export interface PaymentIntentParams {
  amount: number
  currency: SupportedCurrency
  userId: string
  userEmail?: string
  metadata?: Record<string, string>
}

export interface PaymentIntentResult {
  clientSecret: string
  paymentIntentId: string
}

// Minimum and maximum deposit amounts (in USD equivalent)
const MIN_DEPOSIT_AMOUNT = 5
const MAX_DEPOSIT_AMOUNT = 500

// Currency-specific minimum amounts (Stripe requires minimum amounts in smallest currency unit)
const CURRENCY_MINIMUMS: Partial<Record<SupportedCurrency, number>> = {
  USD: 5,
  EUR: 5,
  GBP: 5,
  CAD: 5,
  AUD: 5,
  JPY: 500, // ¥500
  CHF: 5,
  CNY: 30,
  INR: 350,
  MXN: 100,
  BRL: 25,
  ZAR: 75,
  SGD: 7,
  HKD: 40,
  NZD: 8,
  SEK: 50,
  NOK: 50,
  DKK: 35,
  PLN: 20,
  CZK: 120,
  HUF: 1800,
  RON: 25,
  TRY: 150,
  ILS: 18,
  CLP: 4000,
  PHP: 275,
  AED: 18,
  SAR: 19,
  THB: 170,
  IDR: 75000,
  MYR: 22,
  KRW: 6500,
  TWD: 160,
  VND: 120000
}

/**
 * Validate payment amount for a given currency
 */
function validateAmount(
  amount: number,
  currency: SupportedCurrency
): { valid: boolean; error?: string } {
  const minAmount = CURRENCY_MINIMUMS[currency] || MIN_DEPOSIT_AMOUNT

  if (amount < minAmount) {
    return {
      valid: false,
      error: `Minimum deposit amount is ${minAmount} ${currency}`
    }
  }

  // For USD equivalent check, we'll use a simple approximation
  // In production, you might want to use real-time exchange rates
  const usdEquivalent = amount // Simplified for now

  if (usdEquivalent > MAX_DEPOSIT_AMOUNT * 2) {
    // Allow some buffer for exchange rates
    return {
      valid: false,
      error: `Maximum deposit amount is ${MAX_DEPOSIT_AMOUNT} USD equivalent`
    }
  }

  return { valid: true }
}

/**
 * Create a Stripe Payment Intent
 */
export async function createPaymentIntent(
  params: PaymentIntentParams
): Promise<PaymentIntentResult> {
  const { amount, currency, userId, userEmail, metadata } = params

  // Validate currency
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }

  // Validate amount
  const validation = validateAmount(amount, currency)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Get Stripe client
  const stripe = getStripeClient()

  // Convert amount to smallest currency unit (cents, pence, etc.)
  // Most currencies use 2 decimal places, but some (like JPY) use 0
  const decimalPlaces = ['JPY', 'KRW', 'CLP', 'TWD', 'VND', 'HUF', 'IDR'].includes(
    currency
  )
    ? 0
    : 2
  const amountInSmallestUnit = Math.round(amount * Math.pow(10, decimalPlaces))

  try {
    // Create payment intent
    const paymentIntent: Stripe.PaymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        userId,
        type: 'balance_deposit',
        originalAmount: amount.toString(),
        originalCurrency: currency,
        ...metadata
      },
      ...(userEmail && {
        receipt_email: userEmail
      }),
      description: `Balance deposit: ${amount} ${currency}`
    })

    if (!paymentIntent.client_secret) {
      throw new Error('Payment intent created but no client secret returned')
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    }
  } catch (error) {
    console.error('Error creating payment intent:', error)
    if (error instanceof Error) {
      throw new Error(`Failed to create payment intent: ${error.message}`)
    }
    throw new Error('Failed to create payment intent')
  }
}

/**
 * Retrieve a payment intent
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient()

  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (error) {
    console.error('Error retrieving payment intent:', error)
    if (error instanceof Error) {
      throw new Error(`Failed to retrieve payment intent: ${error.message}`)
    }
    throw new Error('Failed to retrieve payment intent')
  }
}

/**
 * Cancel a payment intent
 */
export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient()

  try {
    return await stripe.paymentIntents.cancel(paymentIntentId)
  } catch (error) {
    console.error('Error canceling payment intent:', error)
    if (error instanceof Error) {
      throw new Error(`Failed to cancel payment intent: ${error.message}`)
    }
    throw new Error('Failed to cancel payment intent')
  }
}

/**
 * Create a refund for a payment
 */
export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  const stripe = getStripeClient()

  try {
    return await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount && { amount }),
      ...(reason && { reason })
    })
  } catch (error) {
    console.error('Error creating refund:', error)
    if (error instanceof Error) {
      throw new Error(`Failed to create refund: ${error.message}`)
    }
    throw new Error('Failed to create refund')
  }
}

/**
 * Get predefined deposit amounts for a currency
 */
export function getPredefinedAmounts(
  currency: SupportedCurrency
): number[] {
  // Currency-specific predefined amounts
  const amounts: Record<SupportedCurrency, number[]> = {
    USD: [5, 10, 25, 50, 100],
    EUR: [5, 10, 25, 50, 100],
    GBP: [5, 10, 20, 50, 100],
    CAD: [5, 10, 25, 50, 100],
    AUD: [5, 10, 25, 50, 100],
    JPY: [500, 1000, 2500, 5000, 10000],
    CHF: [5, 10, 25, 50, 100],
    CNY: [30, 50, 100, 200, 500],
    INR: [350, 700, 1750, 3500, 7000],
    MXN: [100, 200, 500, 1000, 2000],
    BRL: [25, 50, 125, 250, 500],
    ZAR: [75, 150, 375, 750, 1500],
    SGD: [7, 14, 35, 70, 140],
    HKD: [40, 80, 200, 400, 800],
    NZD: [8, 16, 40, 80, 160],
    SEK: [50, 100, 250, 500, 1000],
    NOK: [50, 100, 250, 500, 1000],
    DKK: [35, 70, 175, 350, 700],
    PLN: [20, 40, 100, 200, 400],
    CZK: [120, 240, 600, 1200, 2400],
    HUF: [1800, 3600, 9000, 18000, 36000],
    RON: [25, 50, 125, 250, 500],
    TRY: [150, 300, 750, 1500, 3000],
    ILS: [18, 36, 90, 180, 360],
    CLP: [4000, 8000, 20000, 40000, 80000],
    PHP: [275, 550, 1375, 2750, 5500],
    AED: [18, 36, 90, 180, 360],
    SAR: [19, 38, 95, 190, 380],
    THB: [170, 340, 850, 1700, 3400],
    IDR: [75000, 150000, 375000, 750000, 1500000],
    MYR: [22, 44, 110, 220, 440],
    KRW: [6500, 13000, 32500, 65000, 130000],
    TWD: [160, 320, 800, 1600, 3200],
    VND: [120000, 240000, 600000, 1200000, 2400000]
  }

  return amounts[currency] || [5, 10, 25, 50, 100]
}
