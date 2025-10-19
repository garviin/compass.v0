/**
 * GET /api/cron/pricing-sync
 *
 * Automated pricing synchronization endpoint
 * Should be called by a cron job scheduler (e.g., Vercel Cron, GitHub Actions, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'

import { createAlertService } from '@/lib/pricing/alert-service'
import { syncPricing } from '@/lib/pricing/sync-orchestrator'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60 // Allow up to 60 seconds for sync

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // Check authorization
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Cron] Starting scheduled pricing sync...')

    // Check if sync is already running (prevent overlaps)
    const lockKey = 'pricing-sync-lock'
    const lockDuration = 5 * 60 * 1000 // 5 minutes

    // Simple in-memory lock (for serverless, consider using Redis/Upstash for distributed lock)
    const supabase = createAdminClient()

    // Check last sync time to prevent too frequent syncs
    const { data: lastSync } = await supabase
      .from('model_pricing_history')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastSync) {
      const lastSyncTime = new Date(lastSync.created_at).getTime()
      const timeSinceLastSync = Date.now() - lastSyncTime
      const minInterval = 60 * 60 * 1000 // 1 hour minimum between syncs

      if (timeSinceLastSync < minInterval) {
        console.log(`[Cron] Skipping sync - last sync was ${Math.round(timeSinceLastSync / 1000 / 60)} minutes ago`)
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'Too soon since last sync',
          lastSync: lastSync.created_at,
          nextAllowedSync: new Date(lastSyncTime + minInterval).toISOString()
        })
      }
    }

    // Run the sync
    const syncResult = await syncPricing({
      dryRun: false,
      skipValidation: false,
      autoApplyThreshold: 10, // Auto-apply changes under 10%
      debug: process.env.NODE_ENV === 'development',
      metadata: {
        source: 'scheduled-cron',
        triggeredBy: 'system',
        cronTime: new Date().toISOString()
      }
    })

    // Send alerts if changes were made
    if (syncResult.changes.applied > 0) {
      const alertService = createAlertService()
      await alertService.sendSyncAlert(syncResult)
    }

    // Log to database for audit
    await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'pricing',
        source: 'cron',
        success: syncResult.success,
        changes_applied: syncResult.changes.applied,
        duration_ms: syncResult.duration,
        metadata: {
          providers: syncResult.providers,
          changes: syncResult.changes,
          errors: syncResult.errors,
          warnings: syncResult.warnings
        }
      })
      .select()

    console.log(`[Cron] Sync completed:`, {
      success: syncResult.success,
      changes: syncResult.changes.applied,
      duration: syncResult.duration
    })

    return NextResponse.json({
      success: syncResult.success,
      timestamp: syncResult.timestamp,
      changes: syncResult.changes,
      providers: syncResult.providers,
      duration: syncResult.duration,
      source: 'cron'
    })
  } catch (error) {
    console.error('[Cron] Pricing sync error:', error)

    // Try to send error alert
    try {
      const alertService = createAlertService()
      await alertService.sendSyncAlert({
        success: false,
        timestamp: new Date(),
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
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      })
    } catch (alertError) {
      console.error('[Cron] Failed to send error alert:', alertError)
    }

    return NextResponse.json(
      {
        error: 'Sync failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cron/pricing-sync
 *
 * Alternative method for webhooks that prefer POST
 */
export async function POST(request: NextRequest) {
  return GET(request)
}