/**
 * Test script for token usage tracking and balance management
 *
 * This script validates:
 * 1. Token calculation accuracy
 * 2. Balance check logic
 * 3. Cost calculation precision
 * 4. Edge cases and error handling
 *
 * Run with: bun run scripts/test-usage-tracking.ts
 */

import { calculateCost } from '@/lib/pricing/pricing-service'
import { ModelPricing } from '@/lib/pricing/types'

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function logTest(name: string) {
  console.log(`\n${colors.blue}▶ ${name}${colors.reset}`)
}

function logSuccess(message: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`)
}

function logError(message: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`)
}

function logWarning(message: string) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`)
}

function logInfo(message: string) {
  console.log(`  ${colors.cyan}ℹ${colors.reset} ${message}`)
}

// Test counter
let passed = 0
let failed = 0

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    logSuccess(`${message}: ${actual}`)
    passed++
  } else {
    logError(`${message}: expected ${expected}, got ${actual}`)
    failed++
  }
}

function assertApproximately(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
) {
  const diff = Math.abs(actual - expected)
  if (diff <= tolerance) {
    logSuccess(`${message}: ${actual} (within ${tolerance} of ${expected})`)
    passed++
  } else {
    logError(
      `${message}: expected ~${expected}, got ${actual} (diff: ${diff})`
    )
    failed++
  }
}

// ============================================================================
// TEST DATA
// ============================================================================

// Sample pricing from real-world models
const gpt4Pricing: ModelPricing = {
  modelId: 'gpt-4',
  providerId: 'openai',
  inputPricePer1kTokens: 0.03, // $0.03 per 1k input tokens
  outputPricePer1kTokens: 0.06 // $0.06 per 1k output tokens
}

const gpt35TurboPricing: ModelPricing = {
  modelId: 'gpt-3.5-turbo',
  providerId: 'openai',
  inputPricePer1kTokens: 0.0005, // $0.0005 per 1k input tokens
  outputPricePer1kTokens: 0.0015 // $0.0015 per 1k output tokens
}

const claudeSonnetPricing: ModelPricing = {
  modelId: 'claude-sonnet-4',
  providerId: 'anthropic',
  inputPricePer1kTokens: 0.003, // $0.003 per 1k input tokens
  outputPricePer1kTokens: 0.015 // $0.015 per 1k output tokens
}

// ============================================================================
// TEST 1: Basic Token Calculation
// ============================================================================

logTest('Test 1: Basic Token Calculation')

const test1 = calculateCost(1000, 1000, gpt4Pricing)

assertEqual(test1.inputTokens, 1000, 'Input tokens')
assertEqual(test1.outputTokens, 1000, 'Output tokens')
assertEqual(test1.totalTokens, 2000, 'Total tokens')
assertEqual(test1.inputCost, 0.03, 'Input cost')
assertEqual(test1.outputCost, 0.06, 'Output cost')
assertEqual(test1.totalCost, 0.09, 'Total cost')

// ============================================================================
// TEST 2: Fractional Token Costs (Real-world scenario)
// ============================================================================

logTest('Test 2: Fractional Token Costs')

// Typical chat: 500 input tokens, 200 output tokens
const test2 = calculateCost(500, 200, gpt4Pricing)

// Expected: 500/1000 * 0.03 = 0.015
// Expected: 200/1000 * 0.06 = 0.012
// Expected total: 0.027

assertEqual(test2.inputTokens, 500, 'Input tokens')
assertEqual(test2.outputTokens, 200, 'Output tokens')
assertEqual(test2.totalTokens, 700, 'Total tokens')
assertEqual(test2.inputCost, 0.015, 'Input cost')
assertEqual(test2.outputCost, 0.012, 'Output cost')
assertEqual(test2.totalCost, 0.027, 'Total cost')

// ============================================================================
// TEST 3: High-precision Costs (GPT-3.5 Turbo)
// ============================================================================

logTest('Test 3: High-precision Costs (GPT-3.5 Turbo)')

// Typical request: 1500 input tokens, 300 output tokens
const test3 = calculateCost(1500, 300, gpt35TurboPricing)

// Expected: 1500/1000 * 0.0005 = 0.00075
// Expected: 300/1000 * 0.0015 = 0.00045
// Expected total: 0.0012

assertEqual(test3.inputTokens, 1500, 'Input tokens')
assertEqual(test3.outputTokens, 300, 'Output tokens')
assertEqual(test3.totalCost, 0.0012, 'Total cost')

// ============================================================================
// TEST 4: Large Token Counts
// ============================================================================

logTest('Test 4: Large Token Counts')

// Long conversation: 10,000 input tokens, 5,000 output tokens
const test4 = calculateCost(10000, 5000, claudeSonnetPricing)

// Expected: 10000/1000 * 0.003 = 0.03
// Expected: 5000/1000 * 0.015 = 0.075
// Expected total: 0.105

assertEqual(test4.inputTokens, 10000, 'Input tokens')
assertEqual(test4.outputTokens, 5000, 'Output tokens')
assertEqual(test4.inputCost, 0.03, 'Input cost')
assertEqual(test4.outputCost, 0.075, 'Output cost')
assertEqual(test4.totalCost, 0.105, 'Total cost')

// ============================================================================
// TEST 5: Edge Case - Zero Tokens
// ============================================================================

logTest('Test 5: Edge Case - Zero Tokens')

const test5 = calculateCost(0, 0, gpt4Pricing)

assertEqual(test5.totalCost, 0, 'Zero tokens should cost $0')

// ============================================================================
// TEST 6: Edge Case - Only Input Tokens
// ============================================================================

logTest('Test 6: Edge Case - Only Input Tokens')

const test6 = calculateCost(1000, 0, gpt4Pricing)

assertEqual(test6.inputCost, 0.03, 'Input cost')
assertEqual(test6.outputCost, 0, 'Output cost should be $0')
assertEqual(test6.totalCost, 0.03, 'Total cost')

// ============================================================================
// TEST 7: Edge Case - Only Output Tokens
// ============================================================================

logTest('Test 7: Edge Case - Only Output Tokens')

const test7 = calculateCost(0, 1000, gpt4Pricing)

assertEqual(test7.inputCost, 0, 'Input cost should be $0')
assertEqual(test7.outputCost, 0.06, 'Output cost')
assertEqual(test7.totalCost, 0.06, 'Total cost')

// ============================================================================
// TEST 8: Precision Test - Rounding to 6 Decimals
// ============================================================================

logTest('Test 8: Precision Test - Rounding to 6 Decimals')

// Create pricing that would create repeating decimals
const precisionPricing: ModelPricing = {
  modelId: 'test',
  providerId: 'test',
  inputPricePer1kTokens: 0.003333, // 1/3 of a cent
  outputPricePer1kTokens: 0.006667 // 2/3 of a cent
}

const test8 = calculateCost(100, 100, precisionPricing)

// Verify precision is maintained at 6 decimal places
logInfo(`Input cost: ${test8.inputCost} (should have max 6 decimals)`)
logInfo(`Output cost: ${test8.outputCost} (should have max 6 decimals)`)
logInfo(`Total cost: ${test8.totalCost} (should have max 6 decimals)`)

// Check that we don't have more than 6 decimal places
const inputDecimals = test8.inputCost.toString().split('.')[1]?.length || 0
const outputDecimals = test8.outputCost.toString().split('.')[1]?.length || 0
const totalDecimals = test8.totalCost.toString().split('.')[1]?.length || 0

if (inputDecimals <= 6 && outputDecimals <= 6 && totalDecimals <= 6) {
  logSuccess('All costs rounded to max 6 decimal places')
  passed++
} else {
  logError(
    `Precision error: input=${inputDecimals}, output=${outputDecimals}, total=${totalDecimals}`
  )
  failed++
}

// ============================================================================
// TEST 9: Token Validation Logic
// ============================================================================

logTest('Test 9: Token Validation Logic')

// Simulate the validation from handle-stream-finish.ts
function validateTokenCounts(usage: {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}): boolean {
  if (
    usage.promptTokens < 0 ||
    usage.completionTokens < 0 ||
    usage.totalTokens !== usage.promptTokens + usage.completionTokens
  ) {
    return false
  }
  return true
}

// Valid case
const valid1 = validateTokenCounts({
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150
})
assertEqual(valid1, true, 'Valid token counts should pass')

// Invalid: negative tokens
const invalid1 = validateTokenCounts({
  promptTokens: -100,
  completionTokens: 50,
  totalTokens: -50
})
assertEqual(invalid1, false, 'Negative prompt tokens should fail')

// Invalid: total mismatch
const invalid2 = validateTokenCounts({
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 200
})
assertEqual(invalid2, false, 'Mismatched total should fail')

// ============================================================================
// TEST 10: Balance Check Logic
// ============================================================================

logTest('Test 10: Balance Check Logic')

// Simulate the balance check from deductBalance
function simulateDeductBalance(
  currentBalance: number,
  cost: number
): { success: boolean; message?: string } {
  if (cost < 0) {
    return { success: false, message: 'Amount cannot be negative' }
  }

  if (cost === 0) {
    return { success: false, message: 'Amount cannot be zero' }
  }

  if (currentBalance < cost) {
    return {
      success: false,
      message: `Insufficient balance: has $${currentBalance}, needs $${cost}`
    }
  }

  return { success: true }
}

// Test: Sufficient balance
const balance1 = simulateDeductBalance(10.0, 0.05)
assertEqual(balance1.success, true, 'Sufficient balance should succeed')

// Test: Insufficient balance
const balance2 = simulateDeductBalance(0.01, 0.05)
assertEqual(balance2.success, false, 'Insufficient balance should fail')

// Test: Exact balance
const balance3 = simulateDeductBalance(0.05, 0.05)
assertEqual(balance3.success, true, 'Exact balance should succeed')

// Test: Zero cost
const balance4 = simulateDeductBalance(10.0, 0)
assertEqual(balance4.success, false, 'Zero cost should fail')

// Test: Negative cost
const balance5 = simulateDeductBalance(10.0, -0.05)
assertEqual(balance5.success, false, 'Negative cost should fail')

// ============================================================================
// TEST 11: Real-world Usage Scenarios
// ============================================================================

logTest('Test 11: Real-world Usage Scenarios')

// Scenario 1: Short chat with GPT-4
const scenario1 = calculateCost(250, 100, gpt4Pricing)
logInfo(
  `Short GPT-4 chat (250 in / 100 out): $${scenario1.totalCost.toFixed(6)}`
)
assertApproximately(
  scenario1.totalCost,
  0.0135,
  0.000001,
  'Short chat cost'
)

// Scenario 2: Long conversation with GPT-3.5
const scenario2 = calculateCost(4000, 2000, gpt35TurboPricing)
logInfo(
  `Long GPT-3.5 chat (4000 in / 2000 out): $${scenario2.totalCost.toFixed(6)}`
)
assertApproximately(
  scenario2.totalCost,
  0.005,
  0.000001,
  'Long chat cost'
)

// Scenario 3: Code generation with Claude
const scenario3 = calculateCost(1500, 3000, claudeSonnetPricing)
logInfo(
  `Code gen with Claude (1500 in / 3000 out): $${scenario3.totalCost.toFixed(6)}`
)
assertApproximately(
  scenario3.totalCost,
  0.0495,
  0.000001,
  'Code generation cost'
)

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60))
console.log(`${colors.cyan}TEST SUMMARY${colors.reset}`)
console.log('='.repeat(60))

const total = passed + failed
const passRate = ((passed / total) * 100).toFixed(1)

if (failed === 0) {
  console.log(
    `${colors.green}✓ All ${passed} tests passed! (100%)${colors.reset}\n`
  )
  process.exit(0)
} else {
  console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`)
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`)
  console.log(`${colors.yellow}Pass rate: ${passRate}%${colors.reset}\n`)
  process.exit(1)
}
