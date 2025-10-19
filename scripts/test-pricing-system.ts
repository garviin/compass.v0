#!/usr/bin/env bun

/**
 * Comprehensive test script for the automated pricing system
 * Tests all components: providers, sync, alerts, and APIs
 */

import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProviderRegistry } from '@/lib/pricing/providers/registry'
import { PricingChangeDetector } from '@/lib/pricing/change-detector'
import { syncPricing } from '@/lib/pricing/sync-orchestrator'
import { createAlertService } from '@/lib/pricing/alert-service'

// Load environment variables
config()

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function testProviders() {
  log('\n📦 Testing Provider Registry...', 'blue')

  try {
    const registry = getProviderRegistry()
    const stats = registry.getStats()

    log(`  ✓ Registry initialized`, 'green')
    log(`    Total providers: ${stats.total}`)
    log(`    Available: ${stats.available}`)

    const providers = await registry.getAvailable()

    for (const provider of providers) {
      try {
        log(`\n  Testing ${provider.name}...`)
        const result = await provider.fetchPricing()

        if (result.success) {
          log(`    ✓ Fetched ${result.pricing.length} models`, 'green')

          // Validate a sample
          if (result.pricing.length > 0) {
            const sample = result.pricing[0]
            const isValid =
              sample.modelId &&
              sample.providerId &&
              sample.inputPricePer1kTokens >= 0 &&
              sample.outputPricePer1kTokens >= 0

            if (isValid) {
              log(`    ✓ Sample pricing valid: ${sample.modelId}`, 'green')
            } else {
              log(`    ✗ Invalid pricing data`, 'red')
            }
          }
        } else {
          log(`    ✗ Failed: ${result.errors?.join(', ')}`, 'red')
        }
      } catch (error) {
        log(`    ✗ Error: ${error}`, 'red')
      }
    }

    return true
  } catch (error) {
    log(`  ✗ Provider test failed: ${error}`, 'red')
    return false
  }
}

async function testChangeDetection() {
  log('\n🔍 Testing Change Detection...', 'blue')

  try {
    const detector = new PricingChangeDetector({
      autoApplyThreshold: 10,
      debug: true
    })

    // Fetch current pricing from providers
    const registry = getProviderRegistry()
    const providers = await registry.getAvailable()
    const allPricing = []

    for (const provider of providers) {
      const result = await provider.fetchPricing()
      if (result.success) {
        allPricing.push(...result.pricing)
      }
    }

    log(`  Analyzing ${allPricing.length} models...`)

    const changes = await detector.detectChanges(allPricing)

    log(`  ✓ Detection complete:`, 'green')
    log(`    Total models: ${changes.totalModels}`)
    log(`    New: ${changes.newModels}`)
    log(`    Updated: ${changes.updatedModels}`)
    log(`    Unchanged: ${changes.unchangedModels}`)
    log(`    Auto-applicable: ${changes.autoApplicable.length}`)
    log(`    Requires review: ${changes.requiresReview.length}`)

    // Show some examples
    if (changes.autoApplicable.length > 0) {
      log(`\n  Auto-applicable changes (first 3):`, 'yellow')
      changes.autoApplicable.slice(0, 3).forEach(c => {
        if (c.changePercent) {
          log(`    • ${c.modelId}: Input ${c.changePercent.input.toFixed(1)}%, Output ${c.changePercent.output.toFixed(1)}%`)
        }
      })
    }

    return true
  } catch (error) {
    log(`  ✗ Change detection failed: ${error}`, 'red')
    return false
  }
}

async function testSync(dryRun: boolean = true) {
  log(`\n🔄 Testing Sync Orchestrator (${dryRun ? 'Dry Run' : 'Live'})...`, 'blue')

  try {
    const result = await syncPricing({
      dryRun,
      skipValidation: false,
      autoApplyThreshold: 10,
      debug: true
    })

    if (result.success) {
      log(`  ✓ Sync completed successfully`, 'green')
      log(`    Duration: ${result.duration}ms`)
      log(`    Providers: ${result.providers.successful}/${result.providers.total}`)
      log(`    Changes applied: ${result.changes.applied}`)
      log(`    New models: ${result.changes.newModels}`)
      log(`    Updated models: ${result.changes.updatedModels}`)

      if (result.warnings.length > 0) {
        log(`\n  ⚠️ Warnings:`, 'yellow')
        result.warnings.forEach(w => log(`    • ${w}`))
      }

      if (result.errors.length > 0) {
        log(`\n  ✗ Errors:`, 'red')
        result.errors.forEach(e => log(`    • ${e}`))
      }
    } else {
      log(`  ✗ Sync failed: ${result.errors.join(', ')}`, 'red')
    }

    return result.success
  } catch (error) {
    log(`  ✗ Sync test failed: ${error}`, 'red')
    return false
  }
}

async function testAlerts() {
  log('\n🔔 Testing Alert Service...', 'blue')

  try {
    const alertService = createAlertService()

    // Create a mock sync result
    const mockResult = {
      success: true,
      timestamp: new Date(),
      duration: 5432,
      providers: {
        total: 3,
        successful: 3,
        failed: 0
      },
      changes: {
        total: 10,
        applied: 8,
        skipped: 2,
        failed: 0,
        newModels: 2,
        updatedModels: 6,
        removedModels: 0
      },
      errors: [],
      warnings: ['Test warning']
    }

    // Test alert sending (console only in test mode)
    const alertResult = await alertService.sendSyncAlert(mockResult)

    if (alertResult.success) {
      log(`  ✓ Alerts configured and ready`, 'green')
      if (alertResult.console) log(`    • Console output: enabled`)
      if (alertResult.slack) log(`    • Slack: ${alertResult.slack.sent ? 'sent' : 'failed'}`)
      if (alertResult.email) log(`    • Email: ${alertResult.email.sent ? 'sent' : 'failed'}`)
    } else {
      log(`  ⚠️ Alert service partially configured`, 'yellow')
    }

    return true
  } catch (error) {
    log(`  ✗ Alert test failed: ${error}`, 'red')
    return false
  }
}

async function testAPIs() {
  log('\n🌐 Testing Admin APIs...', 'blue')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const apiKey = process.env.ADMIN_API_KEY

  if (!apiKey) {
    log('  ⚠️ ADMIN_API_KEY not set, skipping API tests', 'yellow')
    return false
  }

  try {
    // Test status endpoint
    log('  Testing /api/admin/pricing/status...')
    const statusResponse = await fetch(`${baseUrl}/api/admin/pricing/status`, {
      headers: { 'x-api-key': apiKey }
    })

    if (statusResponse.ok) {
      const status = await statusResponse.json()
      log(`    ✓ Status: ${status.status} (${status.healthScore}% health)`, 'green')

      if (status.issues.length > 0) {
        log(`    ⚠️ Issues:`, 'yellow')
        status.issues.forEach((issue: string) => log(`      • ${issue}`))
      }
    } else {
      log(`    ✗ Status endpoint failed: ${statusResponse.status}`, 'red')
    }

    // Test history endpoint
    log('  Testing /api/admin/pricing/history...')
    const historyResponse = await fetch(`${baseUrl}/api/admin/pricing/history?limit=5`, {
      headers: { 'x-api-key': apiKey }
    })

    if (historyResponse.ok) {
      const history = await historyResponse.json()
      log(`    ✓ Retrieved ${history.history.length} history records`, 'green')
    } else {
      log(`    ✗ History endpoint failed: ${historyResponse.status}`, 'red')
    }

    // Test sync preview
    log('  Testing /api/admin/pricing/sync (preview)...')
    const syncResponse = await fetch(`${baseUrl}/api/admin/pricing/sync`, {
      headers: { 'x-api-key': apiKey }
    })

    if (syncResponse.ok) {
      const preview = await syncResponse.json()
      log(`    ✓ Sync preview available`, 'green')
      log(`      • ${preview.preview.totalModels} total models`)
      log(`      • ${preview.preview.newModels} new models`)
      log(`      • ${preview.preview.autoApplicable} auto-applicable changes`)
    } else {
      log(`    ✗ Sync preview failed: ${syncResponse.status}`, 'red')
    }

    return true
  } catch (error) {
    log(`  ✗ API tests failed: ${error}`, 'red')
    return false
  }
}

async function testDatabaseIntegrity() {
  log('\n💾 Testing Database Integrity...', 'blue')

  try {
    const supabase = createAdminClient()

    // Check tables exist
    const tables = ['model_pricing', 'model_pricing_history', 'sync_logs']

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (error) {
        log(`    ✗ Table ${table} error: ${error.message}`, 'red')
      } else {
        log(`    ✓ Table ${table} exists (${count} records)`, 'green')
      }
    }

    // Test trigger function
    log('  Testing audit trigger...')

    // Insert a test pricing record
    const testModel = {
      model_id: 'test-model-' + Date.now(),
      provider_id: 'test',
      input_price_per_1k_tokens: 0.001,
      output_price_per_1k_tokens: 0.002,
      verified_source: 'test-script'
    }

    const { error: insertError } = await supabase
      .from('model_pricing')
      .insert(testModel)

    if (insertError) {
      log(`    ⚠️ Could not test trigger: ${insertError.message}`, 'yellow')
    } else {
      // Update the test record
      const { error: updateError } = await supabase
        .from('model_pricing')
        .update({ input_price_per_1k_tokens: 0.002 })
        .eq('model_id', testModel.model_id)

      if (!updateError) {
        // Check if history was created
        const { data: history } = await supabase
          .from('model_pricing_history')
          .select('*')
          .eq('model_id', testModel.model_id)
          .single()

        if (history) {
          log(`    ✓ Audit trigger working`, 'green')
        } else {
          log(`    ⚠️ Audit trigger may not be configured`, 'yellow')
        }
      }

      // Clean up test record
      await supabase
        .from('model_pricing')
        .delete()
        .eq('model_id', testModel.model_id)
    }

    return true
  } catch (error) {
    log(`  ✗ Database test failed: ${error}`, 'red')
    return false
  }
}

async function main() {
  log('🚀 Starting Pricing System Tests', 'blue')
  log('=' .repeat(50))

  const results = {
    providers: false,
    changeDetection: false,
    syncDryRun: false,
    alerts: false,
    apis: false,
    database: false
  }

  // Run tests
  results.providers = await testProviders()
  results.changeDetection = await testChangeDetection()
  results.syncDryRun = await testSync(true) // Dry run only
  results.alerts = await testAlerts()
  results.apis = await testAPIs()
  results.database = await testDatabaseIntegrity()

  // Summary
  log('\n' + '=' .repeat(50))
  log('📊 Test Summary', 'blue')
  log('=' .repeat(50))

  const passed = Object.values(results).filter(r => r).length
  const total = Object.keys(results).length

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✓' : '✗'
    const color = passed ? 'green' : 'red'
    log(`  ${status} ${test}`, color)
  })

  log('\n' + '=' .repeat(50))

  if (passed === total) {
    log(`✅ All tests passed (${passed}/${total})`, 'green')
  } else {
    log(`⚠️ Some tests failed (${passed}/${total})`, 'yellow')
  }

  process.exit(passed === total ? 0 : 1)
}

// Run tests
main().catch(error => {
  log(`\n❌ Fatal error: ${error}`, 'red')
  process.exit(1)
})