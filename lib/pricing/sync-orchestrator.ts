/**
 * Pricing Sync Orchestrator
 *
 * Coordinates the entire pricing synchronization process
 */

import { createAdminClient } from '@/lib/supabase/admin'

import { getProviderRegistry } from './providers/registry'
import { PricingChangeDetector } from './change-detector'
import { clearPricingCache } from './pricing-service'
import { validateBatchPricing } from './pricing-validator'
import { ModelPricing } from './types'

export interface SyncResult {
  success: boolean
  timestamp: Date
  duration: number
  providers: {
    total: number
    successful: number
    failed: number
  }
  changes: {
    total: number
    applied: number
    skipped: number
    failed: number
    newModels: number
    updatedModels: number
    removedModels: number
  }
  errors: string[]
  warnings: string[]
  metadata?: Record<string, any>
}

export interface SyncOptions {
  /** Dry run - detect changes but don't apply */
  dryRun?: boolean

  /** Force update even if no changes detected */
  force?: boolean

  /** Skip validation */
  skipValidation?: boolean

  /** Auto-apply threshold (percentage) */
  autoApplyThreshold?: number

  /** Specific providers to sync (empty = all) */
  providers?: string[]

  /** Enable debug logging */
  debug?: boolean

  /** Alert configuration */
  alerts?: {
    enabled: boolean
    slack?: string
    email?: string[]
  }

  /** Additional metadata to include with sync */
  metadata?: Record<string, any>
}

export class PricingSyncOrchestrator {
  private changeDetector: PricingChangeDetector
  private startTime: Date | null = null

  constructor(private options: SyncOptions = {}) {
    this.changeDetector = new PricingChangeDetector({
      autoApplyThreshold: options.autoApplyThreshold || 10,
      debug: options.debug
    })
  }

  /**
   * Main sync function - orchestrates the entire process
   */
  async sync(): Promise<SyncResult> {
    this.startTime = new Date()
    const result: SyncResult = {
      success: false,
      timestamp: this.startTime,
      duration: 0,
      providers: { total: 0, successful: 0, failed: 0 },
      changes: {
        total: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        newModels: 0,
        updatedModels: 0,
        removedModels: 0
      },
      errors: [],
      warnings: []
    }

    try {
      console.log('🔄 Starting pricing sync...')

      // Step 1: Fetch from all providers
      const providerResults = await this.fetchFromProviders()
      result.providers.total = providerResults.total
      result.providers.successful = providerResults.successful
      result.providers.failed = providerResults.failed

      if (providerResults.successful === 0) {
        throw new Error('Failed to fetch pricing from any provider')
      }

      // Step 2: Validate fetched pricing
      if (!this.options.skipValidation) {
        const validation = validateBatchPricing(providerResults.pricing)
        if (!validation.valid) {
          result.warnings.push(
            `Validation failed for ${validation.summary.invalid} models`
          )
          // Filter out invalid pricing
          providerResults.pricing = providerResults.pricing.filter(p => {
            const key = `${p.providerId}:${p.modelId}`
            const validationResult = validation.results.get(key)
            return validationResult?.valid || false
          })
        }
      }

      // Step 3: Detect changes
      const changes = await this.changeDetector.detectChanges(providerResults.pricing)
      result.changes.total = changes.changes.length
      result.changes.newModels = changes.newModels
      result.changes.updatedModels = changes.updatedModels
      result.changes.removedModels = changes.removedModels

      console.log(`📊 Detected changes: ${changes.summary}`)

      // Step 4: Apply changes (if not dry run)
      if (!this.options.dryRun) {
        const applyResult = await this.applyChanges(changes)
        result.changes.applied = applyResult.applied
        result.changes.skipped = applyResult.skipped
        result.changes.failed = applyResult.failed
        result.errors.push(...applyResult.errors)

        // Step 5: Clear cache after successful updates
        if (applyResult.applied > 0) {
          clearPricingCache()
          console.log('🗑️ Cleared pricing cache')
        }
      } else {
        console.log('🔍 Dry run mode - no changes applied')
        result.warnings.push('Dry run mode - no changes were applied')
      }

      // Step 6: Send alerts
      if (this.options.alerts?.enabled && result.changes.applied > 0) {
        await this.sendAlerts(result, changes)
      }

      result.success = true
      result.metadata = this.options.metadata
      console.log('✅ Pricing sync completed successfully')
    } catch (error) {
      console.error('❌ Pricing sync failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
    } finally {
      result.duration = Date.now() - this.startTime.getTime()
    }

    return result
  }

  /**
   * Fetch pricing from all configured providers
   */
  private async fetchFromProviders(): Promise<{
    total: number
    successful: number
    failed: number
    pricing: ModelPricing[]
  }> {
    const registry = getProviderRegistry()
    const allPricing: ModelPricing[] = []

    // Get providers to sync
    let providers = await registry.getAvailable()
    if (this.options.providers && this.options.providers.length > 0) {
      providers = providers.filter(p =>
        this.options.providers!.includes(p.providerId)
      )
    }

    console.log(`📡 Fetching from ${providers.length} providers...`)

    const results = {
      total: providers.length,
      successful: 0,
      failed: 0,
      pricing: [] as ModelPricing[]
    }

    // Fetch in parallel
    const fetchPromises = providers.map(async provider => {
      try {
        console.log(`  Fetching from ${provider.name}...`)
        const result = await provider.fetchPricing()

        if (result.success) {
          allPricing.push(...result.pricing)
          results.successful++
          console.log(`  ✓ ${provider.name}: ${result.pricing.length} models`)
        } else {
          results.failed++
          console.log(`  ✗ ${provider.name}: ${result.errors?.join(', ')}`)
        }
      } catch (error) {
        results.failed++
        console.error(`  ✗ ${provider.name}: ${error}`)
      }
    })

    await Promise.allSettled(fetchPromises)

    results.pricing = allPricing
    return results
  }

  /**
   * Apply detected changes to the database
   */
  private async applyChanges(changes: any): Promise<{
    applied: number
    skipped: number
    failed: number
    errors: string[]
  }> {
    const result = {
      applied: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[]
    }

    const supabase = createAdminClient()

    // Filter changes to apply
    const toApply = changes.changes.filter((c: any) => {
      if (c.changeType === 'unchanged') {
        result.skipped++
        return false
      }
      if (c.changeType === 'removed' && !this.options.force) {
        result.skipped++
        console.log(`  ⏭️ Skipping removal of ${c.modelId} (requires force mode)`)
        return false
      }
      if (!c.autoApplicable && !this.options.force) {
        result.skipped++
        console.log(`  ⏭️ Skipping ${c.modelId} (requires review)`)
        return false
      }
      return true
    })

    console.log(`📝 Applying ${toApply.length} changes...`)

    // Apply changes in batches
    for (const change of toApply) {
      try {
        if (change.changeType === 'new' || change.changeType === 'updated') {
          const { error } = await supabase
            .from('model_pricing')
            .upsert({
              model_id: change.newPricing.modelId,
              provider_id: change.newPricing.providerId,
              input_price_per_1k_tokens: change.newPricing.inputPricePer1kTokens,
              output_price_per_1k_tokens: change.newPricing.outputPricePer1kTokens,
              last_verified_at: new Date().toISOString(),
              verified_source: 'auto-sync',
              is_active: true,
              verification_metadata: {
                sync_timestamp: new Date().toISOString(),
                change_type: change.changeType,
                change_percent: change.changePercent
              }
            })

          if (error) {
            result.failed++
            result.errors.push(`Failed to update ${change.modelId}: ${error.message}`)
            console.error(`  ✗ Failed to update ${change.modelId}:`, error)
          } else {
            result.applied++
            console.log(`  ✓ Updated ${change.modelId}`)
          }
        } else if (change.changeType === 'removed' && this.options.force) {
          // Mark as inactive instead of deleting
          const { error } = await supabase
            .from('model_pricing')
            .update({
              is_active: false,
              last_verified_at: new Date().toISOString(),
              verified_source: 'auto-sync-removal'
            })
            .eq('model_id', change.modelId)
            .eq('provider_id', change.providerId)

          if (error) {
            result.failed++
            result.errors.push(`Failed to remove ${change.modelId}: ${error.message}`)
          } else {
            result.applied++
            console.log(`  ✓ Deactivated ${change.modelId}`)
          }
        }
      } catch (error) {
        result.failed++
        result.errors.push(
          `Error processing ${change.modelId}: ${error instanceof Error ? error.message : 'Unknown'}`
        )
      }
    }

    return result
  }

  /**
   * Send alerts about pricing changes
   */
  private async sendAlerts(result: SyncResult, changes: any): Promise<void> {
    // This would integrate with Slack, email, etc.
    // For now, just log
    console.log('📢 Would send alerts:', {
      slack: this.options.alerts?.slack,
      email: this.options.alerts?.email
    })

    const message = this.changeDetector.formatChangesForAlert(
      changes.changes.filter((c: any) => c.changeType !== 'unchanged')
    )

    console.log('\n' + message)
  }
}

/**
 * Convenience function to run a sync
 */
export async function syncPricing(options?: SyncOptions): Promise<SyncResult> {
  const orchestrator = new PricingSyncOrchestrator(options)
  return orchestrator.sync()
}