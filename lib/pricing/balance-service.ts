import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { createTransaction } from './transaction-service'

export interface UserBalance {
  userId: string
  balance: number
  currency: string
  locale?: string
  preferredCurrency?: string
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Get user's current balance
 */
export async function getUserBalance(userId: string): Promise<number> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('user_id', userId)
      .single()

    if (error) {
      // If user doesn't have a balance record yet, return 0
      if (error.code === 'PGRST116') {
        return 0
      }
      console.error('Failed to fetch user balance:', error)
      return 0
    }

    return parseFloat(data.balance) || 0
  } catch (error) {
    console.error('Error fetching user balance:', error)
    return 0
  }
}

/**
 * Get full user balance record
 * @param useAdmin - Use admin client to bypass RLS (for server-side operations like webhooks)
 */
export async function getUserBalanceRecord(
  userId: string,
  useAdmin: boolean = false
): Promise<UserBalance | null> {
  try {
    const supabase = useAdmin ? createAdminClient() : await createClient()

    const { data, error } = await supabase
      .from('user_balances')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      // If user doesn't have a balance record yet, create one with $0
      if (error.code === 'PGRST116') {
        await initializeUserBalance(userId, 0, useAdmin)
        return {
          userId,
          balance: 0,
          currency: 'USD',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
      console.error('Failed to fetch user balance record:', error)
      return null
    }

    return {
      userId: data.user_id,
      balance: parseFloat(data.balance),
      currency: data.currency,
      locale: data.locale,
      preferredCurrency: data.preferred_currency,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    }
  } catch (error) {
    console.error('Error fetching user balance record:', error)
    return null
  }
}

/**
 * Initialize a user's balance (usually called on signup)
 * @param useAdmin - Use admin client to bypass RLS (for server-side operations like webhooks)
 */
export async function initializeUserBalance(
  userId: string,
  initialBalance: number = 0,
  useAdmin: boolean = false
): Promise<boolean> {
  try {
    const supabase = useAdmin ? createAdminClient() : await createClient()

    const { error } = await supabase.from('user_balances').insert({
      user_id: userId,
      balance: initialBalance,
      currency: 'USD'
    })

    if (error) {
      // If record already exists, that's fine
      if (error.code === '23505') {
        return true
      }
      console.error('Failed to initialize user balance:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error initializing user balance:', error)
    return false
  }
}

/**
 * Add or deduct balance (for payments/deposits/refunds)
 * Now includes transaction logging and uses atomic operations to prevent race conditions
 * @param useAdmin - Use admin client to bypass RLS (required for webhook processing)
 */
export async function addBalance(
  userId: string,
  amount: number,
  description?: string,
  stripePaymentIntentId?: string,
  stripeChargeId?: string,
  metadata?: Record<string, unknown>,
  useAdmin: boolean = true
): Promise<boolean> {
  if (amount === 0) {
    console.error('Amount cannot be zero')
    return false
  }

  try {
    // Use admin client for webhook operations, regular client for user operations
    const supabase = useAdmin ? createAdminClient() : await createClient()

    // Ensure user has a balance record
    await initializeUserBalance(userId, 0, useAdmin)

    // Get currency before the atomic update
    const balanceRecord = await getUserBalanceRecord(userId, useAdmin)
    if (!balanceRecord) {
      console.error('Failed to get balance record for user:', userId)
      return false
    }
    const currency = balanceRecord.currency

    // Determine transaction type based on amount and context
    let type: 'deposit' | 'usage' | 'refund' | 'adjustment'
    if (stripePaymentIntentId) {
      type = amount > 0 ? 'deposit' : 'refund'
    } else {
      type = amount > 0 ? 'adjustment' : 'usage'
    }

    // For payment intents, check if transaction already exists (idempotency at DB level)
    if (stripePaymentIntentId) {
      const existingTxn = await supabase
        .from('transactions')
        .select('id, balance_after')
        .eq('stripe_payment_intent_id', stripePaymentIntentId)
        .single()

      if (existingTxn.data) {
        console.log(
          `Transaction already exists for payment intent ${stripePaymentIntentId}, skipping balance update`
        )
        return true // Already processed
      }
    }

    // Use atomic operation to update balance and get both old and new values
    // This prevents race conditions by doing the increment in the database
    const { data, error } = await supabase.rpc('increment_balance', {
      p_user_id: userId,
      p_amount: amount
    })

    if (error) {
      console.error('Failed to update balance:', error)
      return false
    }

    if (!data || data.length === 0) {
      console.error('No data returned from balance update')
      return false
    }

    const balanceBefore = parseFloat(data[0].balance_before)
    const balanceAfter = parseFloat(data[0].balance_after)

    // Log transaction - this will fail gracefully if duplicate due to UNIQUE constraint
    const transactionCreated = await createTransaction({
      userId,
      type,
      amount: Math.abs(amount), // Store absolute value
      currency,
      balanceBefore,
      balanceAfter,
      description: description || `${type}: ${Math.abs(amount)} ${currency}`,
      stripePaymentIntentId,
      stripeChargeId,
      metadata
    })

    if (!transactionCreated) {
      console.error(
        'Failed to create transaction record - balance was updated but not logged!'
      )
      // Balance was already updated, so we can't easily roll back
      // This should trigger monitoring alerts in production
    }

    return true
  } catch (error) {
    console.error('Error updating balance:', error)
    return false
  }
}

/**
 * Deduct cost from user's balance (for API usage)
 * Now uses atomic operations and includes transaction logging
 */
export async function deductBalance(
  userId: string,
  amount: number,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (amount < 0) {
    console.error('Amount cannot be negative')
    return false
  }

  if (amount === 0) {
    console.error('Amount cannot be zero')
    return false
  }

  // Use addBalance with negative amount for atomic operation
  return addBalance(
    userId,
    -amount,
    description || `API usage cost: ${amount}`,
    undefined,
    undefined,
    metadata,
    true // useAdmin=true for server-side operations
  )
}

/**
 * Check if user has sufficient balance for a cost
 */
export async function hasSufficientBalance(
  userId: string,
  requiredAmount: number
): Promise<boolean> {
  const balance = await getUserBalance(userId)
  return balance >= requiredAmount
}

/**
 * Set user balance to a specific amount (admin function)
 */
export async function setBalance(
  userId: string,
  amount: number
): Promise<boolean> {
  if (amount < 0) {
    console.error('Balance cannot be negative')
    return false
  }

  try {
    // Use admin client for writes to bypass RLS during trusted server events
    const supabase = createAdminClient()

    // Ensure user has a balance record
    await initializeUserBalance(userId, 0, true)

    const { error } = await supabase
      .from('user_balances')
      .update({
        balance: amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to set balance:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error setting balance:', error)
    return false
  }
}
