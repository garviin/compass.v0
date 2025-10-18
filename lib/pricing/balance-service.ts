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
 */
export async function getUserBalanceRecord(
  userId: string
): Promise<UserBalance | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_balances')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      // If user doesn't have a balance record yet, create one with $0
      if (error.code === 'PGRST116') {
        await initializeUserBalance(userId)
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
 */
export async function initializeUserBalance(
  userId: string,
  initialBalance: number = 0
): Promise<boolean> {
  try {
    const supabase = await createClient()

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
 * Add credits to user's balance (for payments/deposits)
 */
export async function addBalance(
  userId: string,
  amount: number
): Promise<boolean> {
  if (amount <= 0) {
    console.error('Amount must be positive')
    return false
  }

  try {
    const supabase = await createClient()

    // Ensure user has a balance record
    await initializeUserBalance(userId)

    // Get current balance
    const currentBalance = await getUserBalance(userId)

    // Update balance
    const { error } = await supabase
      .from('user_balances')
      .update({
        balance: currentBalance + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to add balance:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error adding balance:', error)
    return false
  }
}

/**
 * Deduct cost from user's balance (for API usage)
 */
export async function deductBalance(
  userId: string,
  amount: number
): Promise<boolean> {
  if (amount < 0) {
    console.error('Amount cannot be negative')
    return false
  }

  try {
    const supabase = await createClient()

    // Get current balance
    const currentBalance = await getUserBalance(userId)

    // Check if sufficient balance
    if (currentBalance < amount) {
      console.warn(
        `Insufficient balance for user ${userId}: ${currentBalance} < ${amount}`
      )
      return false
    }

    // Deduct balance
    const { error } = await supabase
      .from('user_balances')
      .update({
        balance: currentBalance - amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to deduct balance:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error deducting balance:', error)
    return false
  }
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
    const supabase = await createClient()

    // Ensure user has a balance record
    await initializeUserBalance(userId)

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
