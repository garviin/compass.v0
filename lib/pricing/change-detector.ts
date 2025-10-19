/**
 * Pricing Change Detector
 *
 * Detects changes between current database pricing and fetched provider pricing
 */

import { createAdminClient } from '@/lib/supabase/admin'

import { validatePricingChange } from './pricing-validator'
import { ModelPricing } from './types'

export interface PricingChangeDetection {
  modelId: string
  providerId: string
  changeType: 'new' | 'updated' | 'removed' | 'unchanged'
  oldPricing?: ModelPricing
  newPricing?: ModelPricing
  changePercent?: {
    input: number
    output: number
  }
  validation?: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
  requiresReview: boolean
  autoApplicable: boolean
}

export interface ChangeDetectionResult {
  totalModels: number
  newModels: number
  updatedModels: number
  removedModels: number
  unchangedModels: number
  changes: PricingChangeDetection[]
  requiresReview: PricingChangeDetection[]
  autoApplicable: PricingChangeDetection[]
  summary: string
}

export class PricingChangeDetector {
  private threshold = {
    autoApply: 10, // Auto-apply if change is <10%
    review: 50, // Require review if change is >50%
    reject: 200 // Reject if change is >200% (likely error)
  }

  constructor(
    private options: {
      autoApplyThreshold?: number
      reviewThreshold?: number
      rejectThreshold?: number
      debug?: boolean
    } = {}
  ) {
    if (options.autoApplyThreshold) {
      this.threshold.autoApply = options.autoApplyThreshold
    }
    if (options.reviewThreshold) {
      this.threshold.review = options.reviewThreshold
    }
    if (options.rejectThreshold) {
      this.threshold.reject = options.rejectThreshold
    }
  }

  /**
   * Detect changes between database and provider pricing
   */
  async detectChanges(
    providerPricing: ModelPricing[]
  ): Promise<ChangeDetectionResult> {
    const supabase = createAdminClient()

    // Get current database pricing
    const { data: dbPricing, error } = await supabase
      .from('model_pricing')
      .select('*')
      .eq('is_active', true)

    if (error) {
      throw new Error(`Failed to fetch database pricing: ${error.message}`)
    }

    // Build maps for comparison
    const dbMap = new Map<string, ModelPricing>()
    for (const row of dbPricing || []) {
      const key = `${row.provider_id}:${row.model_id}`
      dbMap.set(key, {
        modelId: row.model_id,
        providerId: row.provider_id,
        inputPricePer1kTokens: parseFloat(row.input_price_per_1k_tokens),
        outputPricePer1kTokens: parseFloat(row.output_price_per_1k_tokens)
      })
    }

    const providerMap = new Map<string, ModelPricing>()
    for (const pricing of providerPricing) {
      const key = `${pricing.providerId}:${pricing.modelId}`
      providerMap.set(key, pricing)
    }

    // Detect changes
    const changes: PricingChangeDetection[] = []
    const allKeys = new Set([...dbMap.keys(), ...providerMap.keys()])

    for (const key of allKeys) {
      const oldPricing = dbMap.get(key)
      const newPricing = providerMap.get(key)

      const detection = this.analyzeChange(oldPricing, newPricing)
      changes.push(detection)
    }

    // Categorize changes
    const result: ChangeDetectionResult = {
      totalModels: changes.length,
      newModels: changes.filter(c => c.changeType === 'new').length,
      updatedModels: changes.filter(c => c.changeType === 'updated').length,
      removedModels: changes.filter(c => c.changeType === 'removed').length,
      unchangedModels: changes.filter(c => c.changeType === 'unchanged').length,
      changes,
      requiresReview: changes.filter(c => c.requiresReview),
      autoApplicable: changes.filter(c => c.autoApplicable),
      summary: this.generateSummary(changes)
    }

    if (this.options.debug) {
      console.log('[ChangeDetector] Detection result:', result.summary)
    }

    return result
  }

  /**
   * Analyze a single pricing change
   */
  private analyzeChange(
    oldPricing?: ModelPricing,
    newPricing?: ModelPricing
  ): PricingChangeDetection {
    // Case 1: New model (not in database)
    if (!oldPricing && newPricing) {
      const validation = validatePricingChange({
        modelId: newPricing.modelId,
        providerId: newPricing.providerId,
        newInputPrice: newPricing.inputPricePer1kTokens,
        newOutputPrice: newPricing.outputPricePer1kTokens
      })

      return {
        modelId: newPricing.modelId,
        providerId: newPricing.providerId,
        changeType: 'new',
        newPricing,
        validation,
        requiresReview: !validation.valid || validation.warnings.length > 0,
        autoApplicable: validation.valid && validation.warnings.length === 0
      }
    }

    // Case 2: Removed model (not in provider data)
    if (oldPricing && !newPricing) {
      return {
        modelId: oldPricing.modelId,
        providerId: oldPricing.providerId,
        changeType: 'removed',
        oldPricing,
        requiresReview: true, // Always review removals
        autoApplicable: false
      }
    }

    // Case 3: Existing model - check for changes
    if (oldPricing && newPricing) {
      const inputChanged = oldPricing.inputPricePer1kTokens !== newPricing.inputPricePer1kTokens
      const outputChanged = oldPricing.outputPricePer1kTokens !== newPricing.outputPricePer1kTokens

      // No change
      if (!inputChanged && !outputChanged) {
        return {
          modelId: oldPricing.modelId,
          providerId: oldPricing.providerId,
          changeType: 'unchanged',
          oldPricing,
          newPricing,
          requiresReview: false,
          autoApplicable: false
        }
      }

      // Calculate change percentages
      const inputChangePercent = this.calculateChangePercent(
        oldPricing.inputPricePer1kTokens,
        newPricing.inputPricePer1kTokens
      )
      const outputChangePercent = this.calculateChangePercent(
        oldPricing.outputPricePer1kTokens,
        newPricing.outputPricePer1kTokens
      )

      // Validate the change
      const validation = validatePricingChange({
        modelId: newPricing.modelId,
        providerId: newPricing.providerId,
        oldInputPrice: oldPricing.inputPricePer1kTokens,
        oldOutputPrice: oldPricing.outputPricePer1kTokens,
        newInputPrice: newPricing.inputPricePer1kTokens,
        newOutputPrice: newPricing.outputPricePer1kTokens
      })

      // Determine if auto-applicable
      const maxChange = Math.max(
        Math.abs(inputChangePercent),
        Math.abs(outputChangePercent)
      )
      const autoApplicable =
        validation.valid &&
        validation.warnings.length === 0 &&
        maxChange <= this.threshold.autoApply

      const requiresReview =
        !validation.valid ||
        validation.warnings.length > 0 ||
        maxChange > this.threshold.review

      return {
        modelId: oldPricing.modelId,
        providerId: oldPricing.providerId,
        changeType: 'updated',
        oldPricing,
        newPricing,
        changePercent: {
          input: inputChangePercent,
          output: outputChangePercent
        },
        validation,
        requiresReview,
        autoApplicable
      }
    }

    // Should never reach here
    throw new Error('Invalid pricing comparison state')
  }

  /**
   * Calculate percentage change
   */
  private calculateChangePercent(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0
    return ((newValue - oldValue) / oldValue) * 100
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(changes: PricingChangeDetection[]): string {
    const parts: string[] = []

    const newCount = changes.filter(c => c.changeType === 'new').length
    const updatedCount = changes.filter(c => c.changeType === 'updated').length
    const removedCount = changes.filter(c => c.changeType === 'removed').length
    const unchangedCount = changes.filter(c => c.changeType === 'unchanged').length

    if (newCount > 0) parts.push(`${newCount} new`)
    if (updatedCount > 0) parts.push(`${updatedCount} updated`)
    if (removedCount > 0) parts.push(`${removedCount} removed`)
    if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`)

    if (parts.length === 0) return 'No models found'

    return `${changes.length} models: ${parts.join(', ')}`
  }

  /**
   * Format changes for logging/alerts
   */
  formatChangesForAlert(changes: PricingChangeDetection[]): string {
    const lines: string[] = ['📊 Pricing Changes Detected\n']

    // Group by change type
    const updated = changes.filter(c => c.changeType === 'updated')
    const newModels = changes.filter(c => c.changeType === 'new')
    const removed = changes.filter(c => c.changeType === 'removed')

    if (updated.length > 0) {
      lines.push('✏️ Updated Models:')
      for (const change of updated) {
        if (change.oldPricing && change.newPricing && change.changePercent) {
          const inputSign = change.changePercent.input > 0 ? '+' : ''
          const outputSign = change.changePercent.output > 0 ? '+' : ''
          lines.push(
            `• ${change.modelId} (${change.providerId}):\n` +
            `  Input: $${change.oldPricing.inputPricePer1kTokens} → $${change.newPricing.inputPricePer1kTokens} ` +
            `(${inputSign}${change.changePercent.input.toFixed(1)}%)\n` +
            `  Output: $${change.oldPricing.outputPricePer1kTokens} → $${change.newPricing.outputPricePer1kTokens} ` +
            `(${outputSign}${change.changePercent.output.toFixed(1)}%)`
          )
        }
      }
      lines.push('')
    }

    if (newModels.length > 0) {
      lines.push('✅ New Models:')
      for (const change of newModels) {
        if (change.newPricing) {
          lines.push(
            `• ${change.modelId} (${change.providerId}): ` +
            `$${change.newPricing.inputPricePer1kTokens}/$${change.newPricing.outputPricePer1kTokens}`
          )
        }
      }
      lines.push('')
    }

    if (removed.length > 0) {
      lines.push('❌ Removed Models:')
      for (const change of removed) {
        lines.push(`• ${change.modelId} (${change.providerId})`)
      }
      lines.push('')
    }

    // Summary
    const autoApplicable = changes.filter(c => c.autoApplicable).length
    const requiresReview = changes.filter(c => c.requiresReview).length

    lines.push('📈 Summary:')
    lines.push(`• Total changes: ${changes.filter(c => c.changeType !== 'unchanged').length}`)
    lines.push(`• Auto-applicable: ${autoApplicable}`)
    lines.push(`• Requires review: ${requiresReview}`)

    return lines.join('\n')
  }
}