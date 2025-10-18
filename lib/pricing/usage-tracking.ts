import { createClient } from '@/lib/supabase/server'

import { CostCalculation } from './types'

export interface UsageRecord {
  id?: string
  userId: string
  chatId: string
  modelId: string
  providerId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  createdAt?: Date
}

/**
 * Record usage to the database
 */
export async function recordUsage(
  userId: string,
  chatId: string,
  costCalculation: CostCalculation
): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('usage_records').insert({
      user_id: userId,
      chat_id: chatId,
      model_id: costCalculation.modelId,
      provider_id: costCalculation.providerId,
      input_tokens: costCalculation.inputTokens,
      output_tokens: costCalculation.outputTokens,
      total_tokens: costCalculation.totalTokens,
      input_cost: costCalculation.inputCost,
      output_cost: costCalculation.outputCost,
      total_cost: costCalculation.totalCost
    })

    if (error) {
      console.error('Failed to record usage:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error recording usage:', error)
    return false
  }
}

/**
 * Get usage records for a user
 */
export async function getUserUsage(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<UsageRecord[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('usage_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch user usage:', error)
      return []
    }

    return (
      data?.map(row => ({
        id: row.id,
        userId: row.user_id,
        chatId: row.chat_id,
        modelId: row.model_id,
        providerId: row.provider_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        inputCost: parseFloat(row.input_cost),
        outputCost: parseFloat(row.output_cost),
        totalCost: parseFloat(row.total_cost),
        createdAt: new Date(row.created_at)
      })) || []
    )
  } catch (error) {
    console.error('Error fetching user usage:', error)
    return []
  }
}

/**
 * Get total usage cost for a user in a time period
 */
export async function getUserTotalCost(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('usage_records')
      .select('total_cost')
      .eq('user_id', userId)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch user total cost:', error)
      return 0
    }

    const total = data?.reduce(
      (sum, record) => sum + parseFloat(record.total_cost),
      0
    )
    return parseFloat((total || 0).toFixed(2))
  } catch (error) {
    console.error('Error fetching user total cost:', error)
    return 0
  }
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsageStats(userId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('usage_records')
      .select('*')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to fetch user usage stats:', error)
      return null
    }

    if (!data || data.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        modelBreakdown: {}
      }
    }

    const totalRequests = data.length
    const totalTokens = data.reduce((sum, r) => sum + r.total_tokens, 0)
    const totalInputTokens = data.reduce((sum, r) => sum + r.input_tokens, 0)
    const totalOutputTokens = data.reduce((sum, r) => sum + r.output_tokens, 0)
    const totalCost = data.reduce(
      (sum, r) => sum + parseFloat(r.total_cost),
      0
    )

    // Breakdown by model
    const modelBreakdown: Record<
      string,
      { requests: number; tokens: number; cost: number }
    > = {}

    data.forEach(record => {
      const key = `${record.provider_id}:${record.model_id}`
      if (!modelBreakdown[key]) {
        modelBreakdown[key] = { requests: 0, tokens: 0, cost: 0 }
      }
      modelBreakdown[key].requests++
      modelBreakdown[key].tokens += record.total_tokens
      modelBreakdown[key].cost += parseFloat(record.total_cost)
    })

    return {
      totalRequests,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCost: parseFloat(totalCost.toFixed(2)),
      modelBreakdown
    }
  } catch (error) {
    console.error('Error fetching user usage stats:', error)
    return null
  }
}

/**
 * Get usage for a specific chat
 */
export async function getChatUsage(chatId: string): Promise<UsageRecord[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('usage_records')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch chat usage:', error)
      return []
    }

    return (
      data?.map(row => ({
        id: row.id,
        userId: row.user_id,
        chatId: row.chat_id,
        modelId: row.model_id,
        providerId: row.provider_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        inputCost: parseFloat(row.input_cost),
        outputCost: parseFloat(row.output_cost),
        totalCost: parseFloat(row.total_cost),
        createdAt: new Date(row.created_at)
      })) || []
    )
  } catch (error) {
    console.error('Error fetching chat usage:', error)
    return []
  }
}
