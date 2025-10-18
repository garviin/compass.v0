import { createClient } from '@/lib/supabase/server'

import { ModelPricing } from './types'

import modelsConfig from '@/public/config/models.json'

// In-memory cache for pricing data (TTL: 5 minutes)
const pricingCache = new Map<
  string,
  { data: ModelPricing; timestamp: number }
>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get pricing for a specific model from database or config fallback
 */
export async function getModelPricing(
  modelId: string,
  providerId: string
): Promise<ModelPricing | null> {
  const cacheKey = `${providerId}:${modelId}`

  // Check cache first
  const cached = pricingCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    // Try to fetch from database
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('model_pricing')
      .select('*')
      .eq('model_id', modelId)
      .eq('provider_id', providerId)
      .single()

    if (data && !error) {
      const pricing: ModelPricing = {
        modelId: data.model_id,
        providerId: data.provider_id,
        inputPricePer1kTokens: parseFloat(data.input_price_per_1k_tokens),
        outputPricePer1kTokens: parseFloat(data.output_price_per_1k_tokens),
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      }

      // Cache the result
      pricingCache.set(cacheKey, { data: pricing, timestamp: Date.now() })

      return pricing
    }
  } catch (dbError) {
    console.warn(
      `Failed to fetch pricing from database for ${modelId}:`,
      dbError
    )
  }

  // Fallback to models.json
  return getPricingFromConfig(modelId, providerId)
}

/**
 * Get pricing from the models.json config file
 */
function getPricingFromConfig(
  modelId: string,
  providerId: string
): ModelPricing | null {
  const model = modelsConfig.models.find(
    m => m.id === modelId && m.providerId === providerId
  )

  if (!model?.pricing) {
    console.warn(`No pricing found for model ${modelId} (${providerId})`)
    return null
  }

  return {
    modelId,
    providerId,
    inputPricePer1kTokens: model.pricing.inputPricePer1kTokens,
    outputPricePer1kTokens: model.pricing.outputPricePer1kTokens
  }
}

/**
 * Calculate cost for a given number of tokens
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
) {
  const inputCost = (inputTokens / 1000) * pricing.inputPricePer1kTokens
  const outputCost = (outputTokens / 1000) * pricing.outputPricePer1kTokens
  const totalCost = inputCost + outputCost

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    modelId: pricing.modelId,
    providerId: pricing.providerId
  }
}

/**
 * Get all model pricing (useful for displaying cost estimates in UI)
 */
export async function getAllModelPricing(): Promise<ModelPricing[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('model_pricing').select('*')

    if (data && !error) {
      return data.map(row => ({
        modelId: row.model_id,
        providerId: row.provider_id,
        inputPricePer1kTokens: parseFloat(row.input_price_per_1k_tokens),
        outputPricePer1kTokens: parseFloat(row.output_price_per_1k_tokens),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }))
    }
  } catch (error) {
    console.warn('Failed to fetch all pricing from database:', error)
  }

  // Fallback to config
  return modelsConfig.models
    .filter(m => m.pricing)
    .map(m => ({
      modelId: m.id,
      providerId: m.providerId,
      inputPricePer1kTokens: m.pricing!.inputPricePer1kTokens,
      outputPricePer1kTokens: m.pricing!.outputPricePer1kTokens
    }))
}

/**
 * Update model pricing (admin function)
 */
export async function updateModelPricing(
  modelId: string,
  providerId: string,
  inputPricePer1kTokens: number,
  outputPricePer1kTokens: number
): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('model_pricing')
      .upsert(
        {
          model_id: modelId,
          provider_id: providerId,
          input_price_per_1k_tokens: inputPricePer1kTokens,
          output_price_per_1k_tokens: outputPricePer1kTokens,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'model_id,provider_id'
        }
      )

    if (!error) {
      // Invalidate cache
      const cacheKey = `${providerId}:${modelId}`
      pricingCache.delete(cacheKey)
      return true
    }

    console.error('Failed to update pricing:', error)
    return false
  } catch (error) {
    console.error('Error updating pricing:', error)
    return false
  }
}

/**
 * Clear the pricing cache (useful for testing or force refresh)
 */
export function clearPricingCache() {
  pricingCache.clear()
}
