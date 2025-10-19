/**
 * Check Pricing State Script
 *
 * Compares pricing data between models.json and Supabase database
 * Generates a detailed report of discrepancies
 *
 * Run with: bun run scripts/check-pricing-state.ts
 */

import { createAdminClient } from '@/lib/supabase/admin'

import modelsConfig from '@/public/config/models.json'

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

interface PricingComparison {
  modelId: string
  providerId: string
  inModelsJson: boolean
  inDatabase: boolean
  modelsJsonInput?: number
  modelsJsonOutput?: number
  dbInput?: number
  dbOutput?: number
  inputMatch: boolean
  outputMatch: boolean
  lastUpdated?: string
}

async function checkPricingState() {
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}  PRICING STATE ANALYSIS${colors.reset}`)
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

  // Step 1: Load pricing from models.json
  console.log(`${colors.blue}📋 Step 1: Loading pricing from models.json...${colors.reset}`)
  const modelsJsonPricing = new Map<string, any>()

  for (const model of modelsConfig.models) {
    if (model.pricing) {
      const key = `${model.providerId}:${model.id}`
      modelsJsonPricing.set(key, {
        modelId: model.id,
        providerId: model.providerId,
        inputPrice: model.pricing.inputPricePer1kTokens,
        outputPrice: model.pricing.outputPricePer1kTokens
      })
    }
  }

  console.log(`   Found ${modelsJsonPricing.size} models with pricing in models.json\n`)

  // Step 2: Load pricing from database
  console.log(`${colors.blue}📊 Step 2: Loading pricing from database...${colors.reset}`)
  const supabase = createAdminClient()

  const { data: dbPricing, error } = await supabase
    .from('model_pricing')
    .select('*')
    .order('provider_id', { ascending: true })
    .order('model_id', { ascending: true })

  if (error) {
    console.error(`${colors.red}❌ Error fetching database pricing:${colors.reset}`, error)
    process.exit(1)
  }

  console.log(`   Found ${dbPricing?.length || 0} models in database\n`)

  // Step 3: Compare
  console.log(`${colors.blue}🔍 Step 3: Comparing pricing data...${colors.reset}\n`)

  const dbPricingMap = new Map<string, any>()
  for (const row of dbPricing || []) {
    const key = `${row.provider_id}:${row.model_id}`
    dbPricingMap.set(key, {
      modelId: row.model_id,
      providerId: row.provider_id,
      inputPrice: parseFloat(row.input_price_per_1k_tokens),
      outputPrice: parseFloat(row.output_price_per_1k_tokens),
      updatedAt: row.updated_at
    })
  }

  // Build comparison
  const comparisons: PricingComparison[] = []
  const allKeys = new Set([...modelsJsonPricing.keys(), ...dbPricingMap.keys()])

  for (const key of allKeys) {
    const jsonData = modelsJsonPricing.get(key)
    const dbData = dbPricingMap.get(key)

    const inputMatch =
      jsonData && dbData ? jsonData.inputPrice === dbData.inputPrice : false
    const outputMatch =
      jsonData && dbData ? jsonData.outputPrice === dbData.outputPrice : false

    comparisons.push({
      modelId: jsonData?.modelId || dbData?.modelId || '',
      providerId: jsonData?.providerId || dbData?.providerId || '',
      inModelsJson: !!jsonData,
      inDatabase: !!dbData,
      modelsJsonInput: jsonData?.inputPrice,
      modelsJsonOutput: jsonData?.outputPrice,
      dbInput: dbData?.inputPrice,
      dbOutput: dbData?.outputPrice,
      inputMatch,
      outputMatch,
      lastUpdated: dbData?.updatedAt
    })
  }

  // Analysis
  const inBoth = comparisons.filter(c => c.inModelsJson && c.inDatabase)
  const onlyInJson = comparisons.filter(c => c.inModelsJson && !c.inDatabase)
  const onlyInDb = comparisons.filter(c => !c.inModelsJson && c.inDatabase)
  const mismatches = inBoth.filter(c => !c.inputMatch || !c.outputMatch)
  const matches = inBoth.filter(c => c.inputMatch && c.outputMatch)

  // Print results
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}  SUMMARY${colors.reset}`)
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

  console.log(`Total models in models.json: ${colors.yellow}${modelsJsonPricing.size}${colors.reset}`)
  console.log(`Total models in database:    ${colors.yellow}${dbPricingMap.size}${colors.reset}`)
  console.log(`Models in both sources:      ${colors.yellow}${inBoth.length}${colors.reset}`)
  console.log(`Perfect matches:             ${colors.green}${matches.length}${colors.reset}`)
  console.log(`Pricing mismatches:          ${colors.red}${mismatches.length}${colors.reset}`)
  console.log(`Only in models.json:         ${colors.yellow}${onlyInJson.length}${colors.reset}`)
  console.log(`Only in database:            ${colors.yellow}${onlyInDb.length}${colors.reset}\n`)

  // Detailed reports
  if (mismatches.length > 0) {
    console.log(`${colors.red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
    console.log(`${colors.red}  PRICING MISMATCHES (${mismatches.length})${colors.reset}`)
    console.log(`${colors.red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

    for (const m of mismatches) {
      console.log(`${colors.yellow}Model:${colors.reset} ${m.modelId} (${m.providerId})`)
      console.log(`  Input pricing:`)
      console.log(`    models.json: $${m.modelsJsonInput?.toFixed(6)}`)
      console.log(`    database:    $${m.dbInput?.toFixed(6)}`)
      console.log(
        `    ${m.inputMatch ? colors.green + '✓ Match' : colors.red + '✗ MISMATCH'}${colors.reset}`
      )
      console.log(`  Output pricing:`)
      console.log(`    models.json: $${m.modelsJsonOutput?.toFixed(6)}`)
      console.log(`    database:    $${m.dbOutput?.toFixed(6)}`)
      console.log(
        `    ${m.outputMatch ? colors.green + '✓ Match' : colors.red + '✗ MISMATCH'}${colors.reset}`
      )
      console.log(`  Last DB update: ${m.lastUpdated || 'Unknown'}\n`)
    }
  }

  if (onlyInJson.length > 0) {
    console.log(`${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
    console.log(`${colors.yellow}  ONLY IN MODELS.JSON (${onlyInJson.length})${colors.reset}`)
    console.log(`${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

    for (const m of onlyInJson) {
      console.log(`${colors.yellow}•${colors.reset} ${m.modelId} (${m.providerId})`)
      console.log(`  Input:  $${m.modelsJsonInput?.toFixed(6)}`)
      console.log(`  Output: $${m.modelsJsonOutput?.toFixed(6)}\n`)
    }
  }

  if (onlyInDb.length > 0) {
    console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
    console.log(`${colors.magenta}  ONLY IN DATABASE (${onlyInDb.length})${colors.reset}`)
    console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

    for (const m of onlyInDb) {
      console.log(`${colors.magenta}•${colors.reset} ${m.modelId} (${m.providerId})`)
      console.log(`  Input:  $${m.dbInput?.toFixed(6)}`)
      console.log(`  Output: $${m.dbOutput?.toFixed(6)}`)
      console.log(`  Last updated: ${m.lastUpdated || 'Unknown'}\n`)
    }
  }

  if (matches.length > 0 && mismatches.length === 0 && onlyInJson.length === 0 && onlyInDb.length === 0) {
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
    console.log(`${colors.green}  ✓ ALL PRICING DATA MATCHES!${colors.reset}`)
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)
  }

  // Recommendations
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}  RECOMMENDATIONS${colors.reset}`)
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

  if (mismatches.length > 0 || onlyInJson.length > 0) {
    console.log(`${colors.yellow}⚠${colors.reset}  Pricing discrepancies detected!`)
    console.log(`   Run sync script to update database from models.json:`)
    console.log(`   ${colors.cyan}bun run scripts/sync-pricing.ts${colors.reset}\n`)
  }

  if (onlyInDb.length > 0) {
    console.log(`${colors.yellow}⚠${colors.reset}  Database has models not in models.json`)
    console.log(`   These may be legacy models or manual additions`)
    console.log(`   Review and update models.json if needed\n`)
  }

  if (matches.length === comparisons.length) {
    console.log(`${colors.green}✓${colors.reset}  All pricing data is in sync!`)
    console.log(`   Ready to migrate to database-first architecture\n`)
  }

  // Exit with appropriate code
  const hasIssues = mismatches.length > 0 || onlyInJson.length > 0 || onlyInDb.length > 0
  process.exit(hasIssues ? 1 : 0)
}

// Run the script
checkPricingState().catch(error => {
  console.error(`${colors.red}❌ Fatal error:${colors.reset}`, error)
  process.exit(1)
})
