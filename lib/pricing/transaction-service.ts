import { createClient } from '@/lib/supabase/server'

export type TransactionType = 'deposit' | 'usage' | 'refund' | 'adjustment'

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  currency: string
  balanceBefore: number
  balanceAfter: number
  description?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export interface TransactionRecord {
  id: string
  user_id: string
  type: TransactionType
  amount: string
  currency: string
  balance_before: string
  balance_after: string
  description?: string
  stripe_payment_intent_id?: string
  stripe_charge_id?: string
  metadata?: Record<string, unknown>
  created_at: string
}

/**
 * Create a transaction record
 */
export async function createTransaction(params: {
  userId: string
  type: TransactionType
  amount: number
  currency: string
  balanceBefore: number
  balanceAfter: number
  description?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  metadata?: Record<string, unknown>
}): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('transactions').insert({
      user_id: params.userId,
      type: params.type,
      amount: params.amount,
      currency: params.currency,
      balance_before: params.balanceBefore,
      balance_after: params.balanceAfter,
      description: params.description,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_charge_id: params.stripeChargeId,
      metadata: params.metadata
    })

    if (error) {
      console.error('Failed to create transaction:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error creating transaction:', error)
    return false
  }
}

/**
 * Get user's transaction history
 */
export async function getUserTransactions(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Transaction[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch transactions:', error)
      return []
    }

    return (data || []).map(mapTransactionRecord)
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(
  transactionId: string
): Promise<Transaction | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single()

    if (error) {
      console.error('Failed to fetch transaction:', error)
      return null
    }

    return data ? mapTransactionRecord(data) : null
  } catch (error) {
    console.error('Error fetching transaction:', error)
    return null
  }
}

/**
 * Get transaction by Stripe payment intent ID
 */
export async function getTransactionByPaymentIntent(
  paymentIntentId: string
): Promise<Transaction | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (error) {
      console.error('Failed to fetch transaction by payment intent:', error)
      return null
    }

    return data ? mapTransactionRecord(data) : null
  } catch (error) {
    console.error('Error fetching transaction by payment intent:', error)
    return null
  }
}

/**
 * Get transactions by type
 */
export async function getTransactionsByType(
  userId: string,
  type: TransactionType,
  limit: number = 50,
  offset: number = 0
): Promise<Transaction[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch transactions by type:', error)
      return []
    }

    return (data || []).map(mapTransactionRecord)
  } catch (error) {
    console.error('Error fetching transactions by type:', error)
    return []
  }
}

/**
 * Get total amount for a transaction type in a date range
 */
export async function getTotalByType(
  userId: string,
  type: TransactionType,
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', type)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to calculate total by type:', error)
      return 0
    }

    return (data || []).reduce(
      (sum, record) => sum + parseFloat(record.amount),
      0
    )
  } catch (error) {
    console.error('Error calculating total by type:', error)
    return 0
  }
}

/**
 * Get transaction statistics for a user
 */
export async function getTransactionStats(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalDeposits: number
  totalUsage: number
  totalRefunds: number
  totalAdjustments: number
  transactionCount: number
}> {
  try {
    const [deposits, usage, refunds, adjustments] = await Promise.all([
      getTotalByType(userId, 'deposit', startDate, endDate),
      getTotalByType(userId, 'usage', startDate, endDate),
      getTotalByType(userId, 'refund', startDate, endDate),
      getTotalByType(userId, 'adjustment', startDate, endDate)
    ])

    const supabase = await createClient()
    let query = supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { count } = await query

    return {
      totalDeposits: deposits,
      totalUsage: usage,
      totalRefunds: refunds,
      totalAdjustments: adjustments,
      transactionCount: count || 0
    }
  } catch (error) {
    console.error('Error fetching transaction stats:', error)
    return {
      totalDeposits: 0,
      totalUsage: 0,
      totalRefunds: 0,
      totalAdjustments: 0,
      transactionCount: 0
    }
  }
}

/**
 * Map database transaction record to Transaction type
 */
function mapTransactionRecord(record: TransactionRecord): Transaction {
  return {
    id: record.id,
    userId: record.user_id,
    type: record.type,
    amount: parseFloat(record.amount),
    currency: record.currency,
    balanceBefore: parseFloat(record.balance_before),
    balanceAfter: parseFloat(record.balance_after),
    description: record.description,
    stripePaymentIntentId: record.stripe_payment_intent_id,
    stripeChargeId: record.stripe_charge_id,
    metadata: record.metadata,
    createdAt: new Date(record.created_at)
  }
}
