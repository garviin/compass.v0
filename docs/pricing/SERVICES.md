# Service Layer Documentation

## Table of Contents

- [Overview](#overview)
- [Pricing Service](#pricing-service)
- [Usage Tracking Service](#usage-tracking-service)
- [Balance Service](#balance-service)
- [Cost Estimation](#cost-estimation)
- [Type Definitions](#type-definitions)

## Overview

The service layer (`lib/pricing/`) provides TypeScript services for managing pricing, usage tracking, balance management, and cost estimation.

**Import Path**: `@/lib/pricing`

```typescript
import {
  getModelPricing,
  calculateCost,
  recordUsage,
  getUserBalance,
  addBalance,
  estimateConversationCost
} from '@/lib/pricing'
```

## Pricing Service

**File**: `lib/pricing/pricing-service.ts`

Manages model pricing data with caching and fallback support.

### Functions

#### `getModelPricing(modelId, providerId)`

Get pricing for a specific model.

**Signature**:
```typescript
function getModelPricing(
  modelId: string,
  providerId: string
): Promise<ModelPricing | null>
```

**Parameters**:
- `modelId`: Model identifier (e.g., "gpt-4o")
- `providerId`: Provider key (e.g., "openai")

**Returns**: `ModelPricing` object or `null` if not found

**Example**:
```typescript
const pricing = await getModelPricing('gpt-4o', 'openai')

if (pricing) {
  console.log(`Input: $${pricing.inputPricePer1kTokens}/1K tokens`)
  console.log(`Output: $${pricing.outputPricePer1kTokens}/1K tokens`)
}
```

**Behavior**:
1. Check in-memory cache (5min TTL)
2. If miss, query Supabase `model_pricing` table
3. If DB fails, fallback to `models.json`
4. Cache result and return

---

#### `calculateCost(inputTokens, outputTokens, pricing)`

Calculate cost for given token usage.

**Signature**:
```typescript
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): CostCalculation
```

**Parameters**:
- `inputTokens`: Number of input tokens
- `outputTokens`: Number of output tokens
- `pricing`: Pricing object from `getModelPricing()`

**Returns**: `CostCalculation` object with detailed cost breakdown

**Example**:
```typescript
const pricing = await getModelPricing('gpt-4o', 'openai')
const cost = calculateCost(1500, 800, pricing)

console.log(`Total cost: $${cost.totalCost}`)
console.log(`Input cost: $${cost.inputCost} (${cost.inputTokens} tokens)`)
console.log(`Output cost: $${cost.outputCost} (${cost.outputTokens} tokens)`)
```

**Calculation**:
```
inputCost = (inputTokens / 1000) × inputPricePer1kTokens
outputCost = (outputTokens / 1000) × outputPricePer1kTokens
totalCost = inputCost + outputCost
```

---

#### `getAllModelPricing()`

Get pricing for all models.

**Signature**:
```typescript
function getAllModelPricing(): Promise<ModelPricing[]>
```

**Returns**: Array of `ModelPricing` objects

**Example**:
```typescript
const allPricing = await getAllModelPricing()

allPricing.forEach(p => {
  console.log(`${p.providerId}:${p.modelId} - $${p.inputPricePer1kTokens}/$${p.outputPricePer1kTokens}`)
})
```

---

#### `updateModelPricing(modelId, providerId, inputPrice, outputPrice)`

Update pricing for a model (admin function).

**Signature**:
```typescript
function updateModelPricing(
  modelId: string,
  providerId: string,
  inputPricePer1kTokens: number,
  outputPricePer1kTokens: number
): Promise<boolean>
```

**Returns**: `true` if successful, `false` otherwise

**Example**:
```typescript
const updated = await updateModelPricing(
  'gpt-4o',
  'openai',
  0.0025,  // $0.0025 per 1K input tokens
  0.01     // $0.01 per 1K output tokens
)

if (updated) {
  console.log('Pricing updated successfully')
}
```

**Note**: Also invalidates cache for the model.

---

#### `clearPricingCache()`

Clear the entire pricing cache.

**Signature**:
```typescript
function clearPricingCache(): void
```

**Example**:
```typescript
clearPricingCache()
console.log('Pricing cache cleared')
```

**Use Cases**:
- Force refresh of pricing data
- Testing
- After bulk pricing updates

---

## Usage Tracking Service

**File**: `lib/pricing/usage-tracking.ts`

Tracks and queries API usage data.

### Functions

#### `recordUsage(userId, chatId, costCalculation)`

Record usage to the database.

**Signature**:
```typescript
function recordUsage(
  userId: string,
  chatId: string,
  costCalculation: CostCalculation
): Promise<boolean>
```

**Parameters**:
- `userId`: User identifier
- `chatId`: Chat session identifier
- `costCalculation`: Cost calculation from `calculateCost()`

**Returns**: `true` if successful, `false` otherwise

**Example**:
```typescript
const pricing = await getModelPricing('gpt-4o', 'openai')
const cost = calculateCost(1500, 800, pricing)

const recorded = await recordUsage('user_123', 'chat_456', cost)

if (recorded) {
  console.log('Usage recorded successfully')
}
```

---

#### `getUserUsage(userId, limit?, offset?)`

Get usage history for a user.

**Signature**:
```typescript
function getUserUsage(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<UsageRecord[]>
```

**Parameters**:
- `userId`: User identifier
- `limit`: Max records to return (default: 100)
- `offset`: Pagination offset (default: 0)

**Returns**: Array of `UsageRecord` objects, sorted by newest first

**Example**:
```typescript
// Get last 10 requests
const usage = await getUserUsage('user_123', 10, 0)

usage.forEach(record => {
  console.log(`${record.modelId}: $${record.totalCost} (${record.totalTokens} tokens)`)
})

// Pagination
const nextPage = await getUserUsage('user_123', 10, 10)
```

---

#### `getUserTotalCost(userId, startDate?, endDate?)`

Get total cost for a user in a time period.

**Signature**:
```typescript
function getUserTotalCost(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<number>
```

**Parameters**:
- `userId`: User identifier
- `startDate`: (Optional) Start of period
- `endDate`: (Optional) End of period

**Returns**: Total cost in USD

**Example**:
```typescript
// Total all-time
const totalCost = await getUserTotalCost('user_123')

// Last 30 days
const startDate = new Date()
startDate.setDate(startDate.getDate() - 30)
const monthlyCost = await getUserTotalCost('user_123', startDate)

// Specific range
const start = new Date('2024-10-01')
const end = new Date('2024-10-31')
const octoberCost = await getUserTotalCost('user_123', start, end)

console.log(`Total cost: $${totalCost.toFixed(2)}`)
```

---

#### `getUserUsageStats(userId)`

Get comprehensive usage statistics for a user.

**Signature**:
```typescript
function getUserUsageStats(userId: string): Promise<{
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  modelBreakdown: Record<string, {
    requests: number
    tokens: number
    cost: number
  }>
} | null>
```

**Example**:
```typescript
const stats = await getUserUsageStats('user_123')

if (stats) {
  console.log(`Total requests: ${stats.totalRequests}`)
  console.log(`Total cost: $${stats.totalCost}`)
  console.log(`Average cost per request: $${(stats.totalCost / stats.totalRequests).toFixed(4)}`)

  console.log('\nBreakdown by model:')
  Object.entries(stats.modelBreakdown).forEach(([model, data]) => {
    console.log(`  ${model}: ${data.requests} requests, $${data.cost.toFixed(2)}`)
  })
}
```

---

#### `getChatUsage(chatId)`

Get usage for a specific chat session.

**Signature**:
```typescript
function getChatUsage(chatId: string): Promise<UsageRecord[]>
```

**Returns**: Array of `UsageRecord` objects for the chat, sorted by oldest first

**Example**:
```typescript
const chatUsage = await getChatUsage('chat_456')

const totalCost = chatUsage.reduce((sum, r) => sum + r.totalCost, 0)
console.log(`Chat total cost: $${totalCost.toFixed(4)}`)

chatUsage.forEach((record, i) => {
  console.log(`Message ${i + 1}: ${record.totalTokens} tokens, $${record.totalCost}`)
})
```

---

## Balance Service

**File**: `lib/pricing/balance-service.ts`

Manages user account balances.

### Functions

#### `getUserBalance(userId)`

Get user's current balance.

**Signature**:
```typescript
function getUserBalance(userId: string): Promise<number>
```

**Returns**: Balance in USD (or 0 if user not found)

**Example**:
```typescript
const balance = await getUserBalance('user_123')

if (balance < 1.00) {
  console.warn('Low balance!')
}
```

---

#### `getUserBalanceRecord(userId)`

Get full balance record with metadata.

**Signature**:
```typescript
function getUserBalanceRecord(userId: string): Promise<UserBalance | null>
```

**Returns**: `UserBalance` object or `null`

**Example**:
```typescript
const balanceRecord = await getUserBalanceRecord('user_123')

if (balanceRecord) {
  console.log(`Balance: $${balanceRecord.balance}`)
  console.log(`Currency: ${balanceRecord.currency}`)
  console.log(`Last updated: ${balanceRecord.updatedAt}`)
}
```

---

#### `initializeUserBalance(userId, initialBalance?)`

Initialize balance for a new user.

**Signature**:
```typescript
function initializeUserBalance(
  userId: string,
  initialBalance: number = 0
): Promise<boolean>
```

**Parameters**:
- `userId`: User identifier
- `initialBalance`: Starting balance in USD (default: 0)

**Returns**: `true` if successful

**Example**:
```typescript
// In signup flow
const success = await initializeUserBalance('user_123', 10.00)

if (success) {
  console.log('User initialized with $10 welcome credit')
}
```

---

#### `addBalance(userId, amount)`

Add credits to user's balance.

**Signature**:
```typescript
function addBalance(userId: string, amount: number): Promise<boolean>
```

**Parameters**:
- `userId`: User identifier
- `amount`: Amount to add (must be positive)

**Returns**: `true` if successful

**Example**:
```typescript
// After payment
const success = await addBalance('user_123', 25.00)

if (success) {
  const newBalance = await getUserBalance('user_123')
  console.log(`New balance: $${newBalance}`)
}
```

---

#### `deductBalance(userId, amount)`

Deduct cost from user's balance.

**Signature**:
```typescript
function deductBalance(userId: string, amount: number): Promise<boolean>
```

**Parameters**:
- `userId`: User identifier
- `amount`: Amount to deduct (must be >= 0)

**Returns**: `true` if successful, `false` if insufficient balance

**Example**:
```typescript
const cost = 0.0234

const deducted = await deductBalance('user_123', cost)

if (!deducted) {
  console.error('Insufficient balance')
  // Notify user to add credits
}
```

**Note**: Atomic operation - checks balance before deduction.

---

#### `hasSufficientBalance(userId, requiredAmount)`

Check if user has enough balance.

**Signature**:
```typescript
function hasSufficientBalance(
  userId: string,
  requiredAmount: number
): Promise<boolean>
```

**Example**:
```typescript
const canProceed = await hasSufficientBalance('user_123', 0.01)

if (!canProceed) {
  return { error: 'Insufficient balance', code: 402 }
}
```

---

#### `setBalance(userId, amount)`

Set balance to a specific amount (admin function).

**Signature**:
```typescript
function setBalance(userId: string, amount: number): Promise<boolean>
```

**Example**:
```typescript
// Admin operation
const success = await setBalance('user_123', 100.00)
```

---

## Cost Estimation

**File**: `lib/pricing/cost-estimation.ts`

Estimate costs before making requests.

### Functions

#### `estimateMessagesTokens(messages)`

Estimate token count for messages.

**Signature**:
```typescript
function estimateMessagesTokens(messages: Message[]): number
```

**Parameters**:
- `messages`: Array of message objects

**Returns**: Estimated token count

**Example**:
```typescript
import { Message } from 'ai'

const messages: Message[] = [
  { role: 'user', content: 'Hello, how are you?' }
]

const estimatedTokens = estimateMessagesTokens(messages)
console.log(`Estimated tokens: ${estimatedTokens}`)
```

**Note**: Uses ~4 characters per token heuristic. Not 100% accurate.

---

#### `estimateConversationCost(messages, model, estimatedCompletionTokens?)`

Estimate cost for a conversation.

**Signature**:
```typescript
function estimateConversationCost(
  messages: Message[],
  model: Model,
  estimatedCompletionTokens: number = 500
): Promise<{
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  estimatedCostRange: {
    min: number
    max: number
  }
} | null>
```

**Example**:
```typescript
const estimate = await estimateConversationCost(
  messages,
  selectedModel,
  500  // expect ~500 token response
)

if (estimate) {
  console.log(`Estimated cost: $${estimate.totalCost}`)
  console.log(`Range: $${estimate.estimatedCostRange.min} - $${estimate.estimatedCostRange.max}`)
}
```

---

#### `formatCost(cost, currency?)`

Format cost as currency string.

**Signature**:
```typescript
function formatCost(cost: number, currency: string = 'USD'): string
```

**Example**:
```typescript
console.log(formatCost(0.0234))  // "$0.0234"
console.log(formatCost(1.5))     // "$1.50"
```

---

#### `formatTokens(tokens)`

Format token count with commas.

**Signature**:
```typescript
function formatTokens(tokens: number): string
```

**Example**:
```typescript
console.log(formatTokens(1234567))  // "1,234,567"
```

---

#### `getPricingSummary(model)`

Get formatted pricing summary for a model.

**Signature**:
```typescript
function getPricingSummary(model: Model): Promise<{
  modelName: string
  provider: string
  inputPrice: string
  outputPrice: string
  inputPriceRaw: number
  outputPriceRaw: number
  pricePerMessage: string
} | null>
```

**Example**:
```typescript
const summary = await getPricingSummary(selectedModel)

if (summary) {
  console.log(`${summary.modelName} (${summary.provider})`)
  console.log(`Input: ${summary.inputPrice}/1K tokens`)
  console.log(`Output: ${summary.outputPrice}/1K tokens`)
  console.log(`${summary.pricePerMessage}`)
}
```

---

## Type Definitions

### ModelPricing

```typescript
interface ModelPricing {
  modelId: string
  providerId: string
  inputPricePer1kTokens: number
  outputPricePer1kTokens: number
  createdAt?: Date
  updatedAt?: Date
}
```

### CostCalculation

```typescript
interface CostCalculation {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  modelId: string
  providerId: string
}
```

### UsageRecord

```typescript
interface UsageRecord {
  id?: string
  userId: string
  chatId: string
  modelId: string
  providerId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  createdAt?: Date
}
```

### UserBalance

```typescript
interface UserBalance {
  userId: string
  balance: number
  currency: string
  createdAt?: Date
  updatedAt?: Date
}
```

---

**Last Updated**: October 2024
**Services Version**: 1.0.0
