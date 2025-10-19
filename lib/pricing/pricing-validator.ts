/**
 * Pricing Validator
 *
 * Validates pricing data for accuracy and safety before applying updates
 * Prevents common issues like $0 pricing, huge changes, invalid formats
 */

import { ModelPricing } from './types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PricingChange {
  modelId: string
  providerId: string
  oldInputPrice?: number
  oldOutputPrice?: number
  newInputPrice: number
  newOutputPrice: number
  source?: string
}

/**
 * Validate a single pricing entry
 */
export function validatePricing(pricing: ModelPricing): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for required fields
  if (!pricing.modelId || pricing.modelId.trim() === '') {
    errors.push('Model ID is required')
  }

  if (!pricing.providerId || pricing.providerId.trim() === '') {
    errors.push('Provider ID is required')
  }

  // Check for zero or negative pricing
  if (pricing.inputPricePer1kTokens <= 0) {
    errors.push(
      `Input price must be > 0, got ${pricing.inputPricePer1kTokens}`
    )
  }

  if (pricing.outputPricePer1kTokens <= 0) {
    errors.push(
      `Output price must be > 0, got ${pricing.outputPricePer1kTokens}`
    )
  }

  // Check for unreasonably high pricing (likely error)
  const MAX_PRICE_PER_1K = 100 // $100 per 1k tokens is absurdly high
  if (pricing.inputPricePer1kTokens > MAX_PRICE_PER_1K) {
    errors.push(
      `Input price suspiciously high: $${pricing.inputPricePer1kTokens} > $${MAX_PRICE_PER_1K}`
    )
  }

  if (pricing.outputPricePer1kTokens > MAX_PRICE_PER_1K) {
    errors.push(
      `Output price suspiciously high: $${pricing.outputPricePer1kTokens} > $${MAX_PRICE_PER_1K}`
    )
  }

  // Check for unreasonably low pricing (likely parsing error)
  const MIN_PRICE_PER_1K = 0.00001 // $0.00001 per 1k tokens is suspiciously low
  if (pricing.inputPricePer1kTokens < MIN_PRICE_PER_1K) {
    warnings.push(
      `Input price very low: $${pricing.inputPricePer1kTokens} < $${MIN_PRICE_PER_1K}`
    )
  }

  if (pricing.outputPricePer1kTokens < MIN_PRICE_PER_1K) {
    warnings.push(
      `Output price very low: $${pricing.outputPricePer1kTokens} < $${MIN_PRICE_PER_1K}`
    )
  }

  // Warn if output price is less than input (unusual but possible)
  if (pricing.outputPricePer1kTokens < pricing.inputPricePer1kTokens) {
    warnings.push(
      `Output price ($${pricing.outputPricePer1kTokens}) < input price ($${pricing.inputPricePer1kTokens}) - unusual but may be correct`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate a pricing change (old → new)
 * Detects anomalies like huge price jumps that might indicate errors
 */
export function validatePricingChange(
  change: PricingChange
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate new pricing format
  const newPricing: ModelPricing = {
    modelId: change.modelId,
    providerId: change.providerId,
    inputPricePer1kTokens: change.newInputPrice,
    outputPricePer1kTokens: change.newOutputPrice
  }

  const baseValidation = validatePricing(newPricing)
  errors.push(...baseValidation.errors)
  warnings.push(...baseValidation.warnings)

  // If there's old pricing, check for anomalous changes
  if (change.oldInputPrice !== undefined && change.oldOutputPrice !== undefined) {
    // Calculate percentage changes
    const inputChangePercent =
      ((change.newInputPrice - change.oldInputPrice) / change.oldInputPrice) *
      100
    const outputChangePercent =
      ((change.newOutputPrice - change.oldOutputPrice) /
        change.oldOutputPrice) *
      100

    // Flag huge increases (>200%) as potential errors
    if (inputChangePercent > 200) {
      errors.push(
        `Input price increased by ${inputChangePercent.toFixed(1)}% - this seems incorrect`
      )
    }

    if (outputChangePercent > 200) {
      errors.push(
        `Output price increased by ${outputChangePercent.toFixed(1)}% - this seems incorrect`
      )
    }

    // Flag large decreases (>90%) as potential errors
    if (inputChangePercent < -90) {
      errors.push(
        `Input price decreased by ${Math.abs(inputChangePercent).toFixed(1)}% - this seems incorrect`
      )
    }

    if (outputChangePercent < -90) {
      errors.push(
        `Output price decreased by ${Math.abs(outputChangePercent).toFixed(1)}% - this seems incorrect`
      )
    }

    // Warn on moderate changes (50-200% increase, 50-90% decrease)
    if (inputChangePercent > 50 && inputChangePercent <= 200) {
      warnings.push(
        `Input price increased by ${inputChangePercent.toFixed(1)}% - please verify`
      )
    }

    if (outputChangePercent > 50 && outputChangePercent <= 200) {
      warnings.push(
        `Output price increased by ${outputChangePercent.toFixed(1)}% - please verify`
      )
    }

    if (inputChangePercent < -50 && inputChangePercent >= -90) {
      warnings.push(
        `Input price decreased by ${Math.abs(inputChangePercent).toFixed(1)}% - please verify`
      )
    }

    if (outputChangePercent < -50 && outputChangePercent >= -90) {
      warnings.push(
        `Output price decreased by ${Math.abs(outputChangePercent).toFixed(1)}% - please verify`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate multiple pricing entries at once
 */
export function validateBatchPricing(
  pricingList: ModelPricing[]
): {
  valid: boolean
  results: Map<string, ValidationResult>
  summary: { total: number; valid: number; invalid: number; warnings: number }
} {
  const results = new Map<string, ValidationResult>()
  let validCount = 0
  let warningCount = 0

  for (const pricing of pricingList) {
    const key = `${pricing.providerId}:${pricing.modelId}`
    const result = validatePricing(pricing)
    results.set(key, result)

    if (result.valid) {
      validCount++
    }

    if (result.warnings.length > 0) {
      warningCount++
    }
  }

  return {
    valid: validCount === pricingList.length,
    results,
    summary: {
      total: pricingList.length,
      valid: validCount,
      invalid: pricingList.length - validCount,
      warnings: warningCount
    }
  }
}

/**
 * Check if pricing is stale (not verified recently)
 */
export function isPricingStale(
  lastVerifiedAt: Date,
  maxAgeDays: number = 30
): boolean {
  const ageInDays =
    (Date.now() - lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
  return ageInDays > maxAgeDays
}

/**
 * Get human-readable validation summary
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return '✓ Valid'
  }

  const parts: string[] = []

  if (!result.valid) {
    parts.push(`${result.errors.length} error(s)`)
  }

  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning(s)`)
  }

  return parts.join(', ')
}
