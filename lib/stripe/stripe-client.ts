/**
 * Stripe client initialization
 * Server-side Stripe SDK client
 */

import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

/**
 * Get Stripe client instance (singleton pattern)
 */
export function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance
  }

  const apiKey = process.env.STRIPE_SECRET_KEY

  if (!apiKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not defined in environment variables'
    )
  }

  stripeInstance = new Stripe(apiKey, {
    apiVersion: '2025-09-30.clover',
    typescript: true
  })

  return stripeInstance
}

/**
 * Get publishable key for client-side Stripe.js
 */
export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not defined in environment variables'
    )
  }

  return key
}

/**
 * Get webhook secret for verifying Stripe webhook signatures
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not defined in environment variables'
    )
  }

  return secret
}
