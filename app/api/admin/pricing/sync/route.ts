/**
 * POST /api/admin/pricing/sync
 *
 * Manually trigger a pricing sync
 */

import { NextRequest, NextResponse } from 'next/server'

import { withAdminAuth } from '@/lib/auth/admin-middleware'
import { createAlertService } from '@/lib/pricing/alert-service'
import { PricingChangeDetector } from '@/lib/pricing/change-detector'
import { getProviderRegistry } from '@/lib/pricing/providers/registry'
import { syncPricing } from '@/lib/pricing/sync-orchestrator'

export async function POST(request: NextRequest) {
  return withAdminAuth(request, async (req, user) => {
    try {
      console.log(`[Admin API] Pricing sync triggered by ${user.email}`)

      // Parse request body for options
      let options: any = {}
      try {
        const body = await req.json()
        options = {
          dryRun: body.dryRun ?? false,
          force: body.force ?? false,
          skipValidation: body.skipValidation ?? false,
          autoApplyThreshold: body.autoApplyThreshold ?? 10,
          providers: body.providers,
          debug: body.debug ?? false
        }
      } catch {
        // No body or invalid JSON, use defaults
      }

      // Add user to metadata
      options.metadata = {
        triggeredBy: user.email,
        triggeredAt: new Date().toISOString(),
        source: 'admin-api'
      }

      // Run sync
      const syncResult = await syncPricing(options)

      // Send alerts if not dry run and changes were applied
      if (!options.dryRun && syncResult.changes.applied > 0) {
        const alertService = createAlertService()
        await alertService.sendSyncAlert(syncResult)
      }

      // Return result
      return NextResponse.json({
        success: syncResult.success,
        timestamp: syncResult.timestamp,
        duration: syncResult.duration,
        providers: syncResult.providers,
        changes: syncResult.changes,
        errors: syncResult.errors,
        warnings: syncResult.warnings,
        dryRun: options.dryRun,
        triggeredBy: user.email
      })
    } catch (error) {
      console.error('[Admin API] Sync error:', error)
      return NextResponse.json(
        {
          error: 'Failed to sync pricing',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  })
}

/**
 * GET /api/admin/pricing/sync
 *
 * Get sync status and preview changes
 */
export async function GET(request: NextRequest) {
  return withAdminAuth(request, async (req, user) => {
    try {
      // Get registry stats
      const registry = getProviderRegistry()
      const stats = registry.getStats()

      // Fetch current pricing (dry run)
      const providers = await registry.getAvailable()
      const allPricing = []

      for (const provider of providers) {
        try {
          const result = await provider.fetchPricing()
          if (result.success) {
            allPricing.push(...result.pricing)
          }
        } catch (error) {
          console.error(`Failed to fetch from ${provider.name}:`, error)
        }
      }

      // Detect what would change
      const detector = new PricingChangeDetector({
        autoApplyThreshold: 10,
        debug: false
      })

      const changes = await detector.detectChanges(allPricing)

      return NextResponse.json({
        providers: stats,
        preview: {
          totalModels: changes.totalModels,
          newModels: changes.newModels,
          updatedModels: changes.updatedModels,
          removedModels: changes.removedModels,
          unchangedModels: changes.unchangedModels,
          autoApplicable: changes.autoApplicable.length,
          requiresReview: changes.requiresReview.length,
          summary: changes.summary
        },
        lastCheck: new Date().toISOString()
      })
    } catch (error) {
      console.error('[Admin API] Preview error:', error)
      return NextResponse.json(
        {
          error: 'Failed to preview sync',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  })
}