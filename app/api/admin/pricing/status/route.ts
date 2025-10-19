/**
 * GET /api/admin/pricing/status
 *
 * Get current pricing system status and health check
 */

import { NextRequest, NextResponse } from 'next/server'

import { withAdminAuth } from '@/lib/auth/admin-middleware'
import { getProviderRegistry } from '@/lib/pricing/providers/registry'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  return withAdminAuth(request, async (req, user) => {
    try {
      console.log(`[Admin API] Status check by ${user.email}`)

      const supabase = createAdminClient()
      const registry = getProviderRegistry()

      // Get database stats
      const { data: dbStats, error: dbError } = await supabase
        .from('model_pricing')
        .select('provider_id, is_active, count', { count: 'exact', head: false })

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`)
      }

      // Count by status
      const activeModels = dbStats?.filter(m => m.is_active).length || 0
      const inactiveModels = dbStats?.filter(m => !m.is_active).length || 0
      const totalModels = dbStats?.length || 0

      // Group by provider
      const modelsByProvider = dbStats?.reduce((acc, model) => {
        acc[model.provider_id] = (acc[model.provider_id] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      // Get last sync info
      const { data: lastSync } = await supabase
        .from('model_pricing_history')
        .select('created_at, changed_by, change_source')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Get recent changes (last 24 hours)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count: recentChanges } = await supabase
        .from('model_pricing_history')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo)

      // Get provider status
      const providerStats = registry.getStats()
      const availableProviders = await registry.getAvailable()

      // Check provider health
      const providerHealth = await Promise.all(
        availableProviders.map(async (provider) => {
          try {
            // Do a lightweight check (just verify we can instantiate)
            return {
              providerId: provider.providerId,
              name: provider.name,
              status: 'healthy',
              modelCount: modelsByProvider[provider.providerId] || 0
            }
          } catch (error) {
            return {
              providerId: provider.providerId,
              name: provider.name,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
              modelCount: modelsByProvider[provider.providerId] || 0
            }
          }
        })
      )

      // Check cache status
      const cacheStats = {
        // These would be actual cache metrics if we had Redis/Upstash configured
        enabled: !!process.env.UPSTASH_REDIS_URL || !!process.env.KV_URL,
        type: process.env.UPSTASH_REDIS_URL ? 'upstash' : process.env.KV_URL ? 'vercel-kv' : 'none'
      }

      // Check alert configuration
      const alertConfig = {
        slack: {
          enabled: !!process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || 'not configured'
        },
        email: {
          enabled: !!process.env.ALERT_EMAIL_RECIPIENTS,
          recipients: process.env.ALERT_EMAIL_RECIPIENTS ?
            process.env.ALERT_EMAIL_RECIPIENTS.split(',').length : 0,
          provider: process.env.EMAIL_PROVIDER || 'resend'
        }
      }

      // Get sync schedule info
      const syncSchedule = {
        enabled: !!process.env.CRON_SECRET,
        frequency: process.env.SYNC_FREQUENCY || 'daily',
        nextRun: getNextSyncTime()
      }

      // Check for stale pricing (not updated in 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: staleModels } = await supabase
        .from('model_pricing')
        .select('*', { count: 'exact', head: true })
        .lt('last_verified_at', sevenDaysAgo)
        .eq('is_active', true)

      // Build health score (0-100)
      let healthScore = 100
      const issues = []

      if (totalModels === 0) {
        healthScore -= 50
        issues.push('No pricing data in database')
      }

      if (staleModels && staleModels > totalModels * 0.2) {
        healthScore -= 20
        issues.push(`${staleModels} models have stale pricing (>7 days)`)
      }

      if (!syncSchedule.enabled) {
        healthScore -= 15
        issues.push('Automated sync not configured')
      }

      if (!alertConfig.slack.enabled && !alertConfig.email.enabled) {
        healthScore -= 10
        issues.push('No alert channels configured')
      }

      if (providerHealth.some(p => p.status === 'error')) {
        healthScore -= 15
        issues.push('Some providers are unhealthy')
      }

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'critical'
      if (healthScore >= 80) {
        overallStatus = 'healthy'
      } else if (healthScore >= 50) {
        overallStatus = 'degraded'
      } else {
        overallStatus = 'critical'
      }

      return NextResponse.json({
        status: overallStatus,
        healthScore,
        issues,
        database: {
          totalModels,
          activeModels,
          inactiveModels,
          modelsByProvider,
          staleModels: staleModels || 0,
          lastSync: lastSync ? {
            timestamp: lastSync.created_at,
            triggeredBy: lastSync.changed_by,
            source: lastSync.change_source
          } : null,
          recentChanges: recentChanges || 0
        },
        providers: {
          registered: providerStats.total,
          available: providerStats.available,
          health: providerHealth
        },
        cache: cacheStats,
        alerts: alertConfig,
        sync: syncSchedule,
        system: {
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      })
    } catch (error) {
      console.error('[Admin API] Status error:', error)
      return NextResponse.json(
        {
          error: 'Failed to fetch status',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  })
}

/**
 * Calculate next sync time based on schedule
 */
function getNextSyncTime(): string {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(2, 0, 0, 0) // 2 AM UTC

  // If it's already past 2 AM today, use tomorrow
  const nextRun = new Date()
  nextRun.setHours(2, 0, 0, 0)
  if (nextRun < now) {
    return tomorrow.toISOString()
  }
  return nextRun.toISOString()
}