/**
 * Test Pricing Providers
 *
 * Tests the provider system and sync orchestrator
 *
 * Run with: bun run scripts/test-pricing-providers.ts
 */

import { PricingChangeDetector } from '@/lib/pricing/change-detector'
import { getProviderRegistry } from '@/lib/pricing/providers/registry'
import { syncPricing } from '@/lib/pricing/sync-orchestrator'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

async function testProviders() {
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}  PRICING PROVIDER SYSTEM TEST${colors.reset}`)
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

  // Test 1: Registry
  console.log(`${colors.blue}1. Testing Provider Registry${colors.reset}`)
  const registry = getProviderRegistry()
  const stats = registry.getStats()

  console.log(`   Total providers: ${colors.yellow}${stats.total}${colors.reset}`)
  for (const provider of stats.providers) {
    console.log(`   • ${provider.name}: ${provider.models} models`)
  }

  // Test 2: Provider Availability
  console.log(`\n${colors.blue}2. Testing Provider Availability${colors.reset}`)
  const available = await registry.getAvailable()
  console.log(`   Available providers: ${colors.green}${available.length}${colors.reset}`)
  for (const provider of available) {
    console.log(`   ✓ ${provider.name}`)
  }

  // Test 3: Fetch Pricing
  console.log(`\n${colors.blue}3. Testing Pricing Fetch${colors.reset}`)
  const fetchResults = await registry.fetchAll()

  for (const [providerId, result] of fetchResults) {
    if (result.success) {
      const pricingCount = result.data?.pricing?.length || 0
      console.log(
        `   ${colors.green}✓${colors.reset} ${providerId}: ${pricingCount} models (source: ${result.data?.source})`
      )
    } else {
      console.log(
        `   ${colors.red}✗${colors.reset} ${providerId}: ${result.error || 'Failed'}`
      )
    }
  }

  // Test 4: Change Detection (Dry Run)
  console.log(`\n${colors.blue}4. Testing Change Detection${colors.reset}`)

  // Collect all pricing
  const allPricing = []
  for (const [, result] of fetchResults) {
    if (result.success && result.data?.pricing) {
      allPricing.push(...result.data.pricing)
    }
  }

  if (allPricing.length > 0) {
    const detector = new PricingChangeDetector({ debug: false })
    const changes = await detector.detectChanges(allPricing)

    console.log(`   ${colors.cyan}Change Summary:${colors.reset} ${changes.summary}`)
    console.log(`   • New models: ${colors.green}${changes.newModels}${colors.reset}`)
    console.log(`   • Updated models: ${colors.yellow}${changes.updatedModels}${colors.reset}`)
    console.log(`   • Removed models: ${colors.red}${changes.removedModels}${colors.reset}`)
    console.log(`   • Unchanged models: ${changes.unchangedModels}`)
    console.log(`   • Auto-applicable: ${colors.green}${changes.autoApplicable.length}${colors.reset}`)
    console.log(`   • Requires review: ${colors.yellow}${changes.requiresReview.length}${colors.reset}`)
  } else {
    console.log(`   ${colors.yellow}⚠${colors.reset} No pricing data to compare`)
  }

  // Test 5: Sync Orchestrator (Dry Run)
  console.log(`\n${colors.blue}5. Testing Sync Orchestrator (DRY RUN)${colors.reset}`)

  const syncResult = await syncPricing({
    dryRun: true,
    debug: false,
    autoApplyThreshold: 10
  })

  console.log(`   Success: ${syncResult.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`)
  console.log(`   Duration: ${syncResult.duration}ms`)
  console.log(`   Providers: ${syncResult.providers.successful}/${syncResult.providers.total}`)
  console.log(`   Changes detected: ${syncResult.changes.total}`)

  if (syncResult.errors.length > 0) {
    console.log(`   ${colors.red}Errors:${colors.reset}`)
    for (const error of syncResult.errors) {
      console.log(`     • ${error}`)
    }
  }

  if (syncResult.warnings.length > 0) {
    console.log(`   ${colors.yellow}Warnings:${colors.reset}`)
    for (const warning of syncResult.warnings) {
      console.log(`     • ${warning}`)
    }
  }

  // Summary
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}  TEST SUMMARY${colors.reset}`)
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)

  const allTestsPassed =
    stats.total > 0 &&
    available.length > 0 &&
    fetchResults.size > 0 &&
    syncResult.success

  if (allTestsPassed) {
    console.log(`${colors.green}✅ All provider tests passed!${colors.reset}`)
    console.log('Provider system is ready for production use.')
  } else {
    console.log(`${colors.yellow}⚠️ Some tests had issues${colors.reset}`)
    console.log('Review the output above for details.')
  }

  console.log(`\n${colors.cyan}Next Steps:${colors.reset}`)
  console.log('1. Review detected changes above')
  console.log('2. Run without dry-run to apply changes:')
  console.log(`   ${colors.cyan}bun run scripts/sync-pricing.ts${colors.reset}`)
  console.log('3. Set up cron job for automated sync')
}

// Run the test
testProviders().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error)
  process.exit(1)
})