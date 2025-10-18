import { Message } from 'ai'

import { Model } from '../types/models'

import { formatCost } from './format'
import { getModelPricing } from './pricing-service'

// Re-export client-safe formatting utilities
export { formatCost, formatTokens } from './format'

/**
 * Estimate the number of tokens in a message
 * This is a rough estimate based on character count
 * For more accurate estimation, consider using tiktoken or similar
 */
function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  // This varies by model and language
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens in messages array
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let totalTokens = 0

  for (const message of messages) {
    // Add tokens for role and formatting
    totalTokens += 4 // Role tokens

    const content = message.content
    if (typeof content === 'string') {
      totalTokens += estimateTokenCount(content)
    } else if (content && typeof content === 'object' && Array.isArray(content)) {
      // Handle multi-part content (text + images, etc.)
      for (const part of content as any[]) {
        if (part && typeof part === 'object') {
          if ('text' in part && typeof part.text === 'string') {
            totalTokens += estimateTokenCount(part.text)
          } else if ('image' in part) {
            // Images typically cost ~85-170 tokens depending on size
            // Using average of 128 tokens per image
            totalTokens += 128
          }
        }
      }
    }
  }

  // Add overhead for message formatting
  totalTokens += 3 * messages.length

  return totalTokens
}

/**
 * Estimate cost for a conversation
 */
export async function estimateConversationCost(
  messages: Message[],
  model: Model,
  estimatedCompletionTokens: number = 500
) {
  try {
    const pricing = await getModelPricing(model.id, model.providerId)

    if (!pricing) {
      return null
    }

    const inputTokens = estimateMessagesTokens(messages)
    const outputTokens = estimatedCompletionTokens

    const inputCost = (inputTokens / 1000) * pricing.inputPricePer1kTokens
    const outputCost = (outputTokens / 1000) * pricing.outputPricePer1kTokens
    const totalCost = inputCost + outputCost

    return {
      inputTokens,
      outputTokens: estimatedCompletionTokens,
      totalTokens: inputTokens + estimatedCompletionTokens,
      inputCost: parseFloat(inputCost.toFixed(6)),
      outputCost: parseFloat(outputCost.toFixed(6)),
      totalCost: parseFloat(totalCost.toFixed(6)),
      estimatedCostRange: {
        min: parseFloat(
          (
            inputCost +
            (estimatedCompletionTokens * 0.5 * pricing.outputPricePer1kTokens) /
              1000
          ).toFixed(6)
        ),
        max: parseFloat(
          (
            inputCost +
            (estimatedCompletionTokens * 2 * pricing.outputPricePer1kTokens) /
              1000
          ).toFixed(6)
        )
      }
    }
  } catch (error) {
    console.error('Error estimating conversation cost:', error)
    return null
  }
}


/**
 * Get pricing summary for display
 */
export async function getPricingSummary(model: Model) {
  const pricing = await getModelPricing(model.id, model.providerId)

  if (!pricing) {
    return null
  }

  return {
    modelName: model.name,
    provider: model.provider,
    inputPrice: formatCost(pricing.inputPricePer1kTokens),
    outputPrice: formatCost(pricing.outputPricePer1kTokens),
    inputPriceRaw: pricing.inputPricePer1kTokens,
    outputPriceRaw: pricing.outputPricePer1kTokens,
    pricePerMessage: `~${formatCost(
      (500 / 1000) * pricing.inputPricePer1kTokens +
        (500 / 1000) * pricing.outputPricePer1kTokens
    )} per message (estimated)`
  }
}
