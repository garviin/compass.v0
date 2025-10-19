/**
 * Test Pricing Validation
 *
 * Validates that pricing validator catches common issues
 *
 * Run with: bun run scripts/test-pricing-validation.ts
 */

import {
  validatePricing,
  validatePricingChange,
  validateBatchPricing
} from '@/lib/pricing/pricing-validator'
import { ModelPricing } from '@/lib/pricing/types'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${colors.green}✓${colors.reset} ${name}`)
    passed++
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} ${name}`)
    console.log(`  ${colors.red}Error:${colors.reset} ${error}`)
    failed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

console.log(`${colors.cyan}Testing Pricing Validator...${colors.reset}\n`)

// Test 1: Valid pricing
test('Accepts valid pricing', () => {
  const pricing: ModelPricing = {
    modelId: 'gpt-4o',
    providerId: 'openai',
    inputPricePer1kTokens: 0.0025,
    outputPricePer1kTokens: 0.01
  }

  const result = validatePricing(pricing)
  assert(result.valid, 'Should be valid')
  assert(result.errors.length === 0, 'Should have no errors')
})

// Test 2: Zero pricing
test('Rejects zero pricing', () => {
  const pricing: ModelPricing = {
    modelId: 'test',
    providerId: 'test',
    inputPricePer1kTokens: 0,
    outputPricePer1kTokens: 0.01
  }

  const result = validatePricing(pricing)
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.length > 0, 'Should have errors')
})

// Test 3: Negative pricing
test('Rejects negative pricing', () => {
  const pricing: ModelPricing = {
    modelId: 'test',
    providerId: 'test',
    inputPricePer1kTokens: -0.001,
    outputPricePer1kTokens: 0.01
  }

  const result = validatePricing(pricing)
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.some(e => e.includes('must be > 0')), 'Should error on negative price')
})

// Test 4: Unreasonably high pricing
test('Rejects absurdly high pricing', () => {
  const pricing: ModelPricing = {
    modelId: 'test',
    providerId: 'test',
    inputPricePer1kTokens: 150,
    outputPricePer1kTokens: 0.01
  }

  const result = validatePricing(pricing)
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.some(e => e.includes('suspiciously high')), 'Should error on high price')
})

// Test 5: Very low pricing (warning)
test('Warns on suspiciously low pricing', () => {
  const pricing: ModelPricing = {
    modelId: 'test',
    providerId: 'test',
    inputPricePer1kTokens: 0.000001,
    outputPricePer1kTokens: 0.000001
  }

  const result = validatePricing(pricing)
  assert(result.valid, 'Should be valid (warnings only)')
  assert(result.warnings.length > 0, 'Should have warnings')
})

// Test 6: Valid pricing change
test('Accepts valid pricing change', () => {
  const change = {
    modelId: 'gpt-4o',
    providerId: 'openai',
    oldInputPrice: 0.0025,
    oldOutputPrice: 0.01,
    newInputPrice: 0.002,
    newOutputPrice: 0.008
  }

  const result = validatePricingChange(change)
  assert(result.valid, 'Should be valid')
})

// Test 7: Huge price increase
test('Rejects huge price increases (>200%)', () => {
  const change = {
    modelId: 'test',
    providerId: 'test',
    oldInputPrice: 0.001,
    oldOutputPrice: 0.002,
    newInputPrice: 0.005, // 400% increase
    newOutputPrice: 0.002
  }

  const result = validatePricingChange(change)
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.some(e => e.includes('increased by')), 'Should error on huge increase')
})

// Test 8: Large price decrease
test('Rejects huge price decreases (>90%)', () => {
  const change = {
    modelId: 'test',
    providerId: 'test',
    oldInputPrice: 0.01,
    oldOutputPrice: 0.02,
    newInputPrice: 0.0005, // 95% decrease
    newOutputPrice: 0.02
  }

  const result = validatePricingChange(change)
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.some(e => e.includes('decreased by')), 'Should error on huge decrease')
})

// Test 9: Moderate change (warning)
test('Warns on moderate price changes (50-200%)', () => {
  const change = {
    modelId: 'test',
    providerId: 'test',
    oldInputPrice: 0.001,
    oldOutputPrice: 0.002,
    newInputPrice: 0.002, // 100% increase
    newOutputPrice: 0.002
  }

  const result = validatePricingChange(change)
  assert(result.valid, 'Should be valid (warnings only)')
  assert(result.warnings.length > 0, 'Should have warnings')
})

// Test 10: Batch validation
test('Validates multiple pricing entries', () => {
  const pricingList: ModelPricing[] = [
    {
      modelId: 'gpt-4o',
      providerId: 'openai',
      inputPricePer1kTokens: 0.0025,
      outputPricePer1kTokens: 0.01
    },
    {
      modelId: 'claude-sonnet',
      providerId: 'anthropic',
      inputPricePer1kTokens: 0.003,
      outputPricePer1kTokens: 0.015
    },
    {
      modelId: 'invalid',
      providerId: 'test',
      inputPricePer1kTokens: 0, // Invalid
      outputPricePer1kTokens: 0.01
    }
  ]

  const result = validateBatchPricing(pricingList)
  assert(!result.valid, 'Should be invalid (one bad entry)')
  assert(result.summary.total === 3, 'Should have 3 entries')
  assert(result.summary.valid === 2, 'Should have 2 valid entries')
  assert(result.summary.invalid === 1, 'Should have 1 invalid entry')
})

// Summary
console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
console.log(`${colors.cyan}SUMMARY${colors.reset}`)
console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)

const total = passed + failed
const passRate = ((passed / total) * 100).toFixed(1)

console.log(`Passed: ${colors.green}${passed}${colors.reset}`)
console.log(`Failed: ${failed > 0 ? colors.red : colors.reset}${failed}${colors.reset}`)
console.log(`Pass rate: ${passed === total ? colors.green : colors.yellow}${passRate}%${colors.reset}\n`)

process.exit(failed > 0 ? 1 : 0)
