# Usage Examples

## Table of Contents

- [Common Workflows](#common-workflows)
- [User Management](#user-management)
- [Payment Integration](#payment-integration)
- [Analytics](#analytics)
- [Admin Operations](#admin-operations)
- [Complete Integration Example](#complete-integration-example)

## Common Workflows

### Initialize New User

When a user signs up, give them starting credits:

```typescript
import { initializeUserBalance } from '@/lib/pricing/balance-service'

export async function handleSignup(email: string, password: string) {
  // Create user via Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) throw error

  const userId = data.user!.id

  // Initialize with $10 welcome credit
  await initializeUserBalance(userId, 10.00)

  console.log(`User ${userId} created with $10 balance`)

  return data.user
}
```

### Check Balance Before Request

Verify user has sufficient funds:

```typescript
import { getUserBalance } from '@/lib/pricing/balance-service'

export async function canUserMakeRequest(userId: string): Promise<boolean> {
  const balance = await getUserBalance(userId)

  const MIN_BALANCE = 0.01 // $0.01 minimum

  if (balance < MIN_BALANCE) {
    console.warn(`User ${userId} has insufficient balance: $${balance}`)
    return false
  }

  return true
}

// Usage
if (!(await canUserMakeRequest(userId))) {
  return res.status(402).json({
    error: 'Insufficient balance. Please add credits.',
    balance: await getUserBalance(userId)
  })
}
```

### Track Usage After Request

Record API usage and deduct from balance:

```typescript
import {
  getModelPricing,
  calculateCost,
  recordUsage,
  deductBalance
} from '@/lib/pricing'

// In your onFinish callback
async function handleRequestComplete(
  userId: string,
  chatId: string,
  modelId: string,
  providerId: string,
  usage: { promptTokens: number; completionTokens: number }
) {
  // Get pricing
  const pricing = await getModelPricing(modelId, providerId)
  if (!pricing) {
    console.warn(`No pricing for ${modelId}`)
    return
  }

  // Calculate cost
  const cost = calculateCost(usage.promptTokens, usage.completionTokens, pricing)

  console.log(`Request cost: $${cost.totalCost}`)

  // Record usage
  await recordUsage(userId, chatId, cost)

  // Deduct from balance
  const deducted = await deductBalance(userId, cost.totalCost)

  if (!deducted) {
    console.error(`Failed to deduct $${cost.totalCost} from user ${userId}`)
  }
}
```

## User Management

### Get User's Balance

Display balance in UI:

```typescript
import { getUserBalance, formatCost } from '@/lib/pricing'

async function displayUserBalance(userId: string) {
  const balance = await getUserBalance(userId)

  console.log(`Current balance: ${formatCost(balance)}`)

  if (balance < 1.00) {
    console.warn('⚠️ Low balance warning')
  }

  if (balance < 0.10) {
    console.error('🚨 Critical balance - user needs to add credits')
  }

  return balance
}
```

### Get User's Usage History

Show recent activity:

```typescript
import { getUserUsage } from '@/lib/pricing/usage-tracking'

async function getUserRecentActivity(userId: string) {
  // Get last 10 requests
  const usage = await getUserUsage(userId, 10, 0)

  console.log('Recent Activity:')
  usage.forEach((record, i) => {
    console.log(`${i + 1}. ${record.modelId}`)
    console.log(`   Tokens: ${record.totalTokens.toLocaleString()}`)
    console.log(`   Cost: $${record.totalCost.toFixed(6)}`)
    console.log(`   Time: ${record.createdAt}`)
  })

  return usage
}
```

### Get User's Statistics

Comprehensive usage stats:

```typescript
import { getUserUsageStats } from '@/lib/pricing/usage-tracking'

async function getUserDashboard(userId: string) {
  const stats = await getUserUsageStats(userId)

  if (!stats) {
    console.log('No usage data yet')
    return
  }

  console.log('User Dashboard')
  console.log('==============')
  console.log(`Total Requests: ${stats.totalRequests}`)
  console.log(`Total Tokens: ${stats.totalTokens.toLocaleString()}`)
  console.log(`Total Spent: $${stats.totalCost.toFixed(2)}`)
  console.log(`Avg per Request: $${(stats.totalCost / stats.totalRequests).toFixed(4)}`)

  console.log('\nBreakdown by Model:')
  Object.entries(stats.modelBreakdown).forEach(([model, data]) => {
    console.log(`  ${model}:`)
    console.log(`    Requests: ${data.requests}`)
    console.log(`    Tokens: ${data.tokens.toLocaleString()}`)
    console.log(`    Cost: $${data.cost.toFixed(2)}`)
  })

  return stats
}
```

## Payment Integration

### Add Credits via Stripe

After successful payment:

```typescript
import { addBalance } from '@/lib/pricing/balance-service'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function handleStripeWebhook(req: Request) {
  const sig = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return new Response('Webhook signature verification failed', {
      status: 400
    })
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    const userId = session.metadata?.userId
    const amount = (session.amount_total || 0) / 100 // Convert cents to dollars

    if (userId && amount > 0) {
      // Add credits to user's balance
      await addBalance(userId, amount)

      console.log(`Added $${amount} to user ${userId}`)

      // Optional: Send confirmation email
      await sendPaymentConfirmation(userId, amount)
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
}
```

### Auto Top-Up

Automatically add credits when balance is low:

```typescript
import { getUserBalance, addBalance } from '@/lib/pricing/balance-service'

async function checkAndAutoTopUp(userId: string, autoTopUpSettings: {
  enabled: boolean
  threshold: number
  amount: number
}) {
  if (!autoTopUpSettings.enabled) return

  const balance = await getUserBalance(userId)

  if (balance < autoTopUpSettings.threshold) {
    // Charge user via payment processor
    const paymentSuccess = await processPayment(userId, autoTopUpSettings.amount)

    if (paymentSuccess) {
      await addBalance(userId, autoTopUpSettings.amount)
      console.log(`Auto top-up: Added $${autoTopUpSettings.amount} to user ${userId}`)
    }
  }
}

// Usage
await checkAndAutoTopUp('user_123', {
  enabled: true,
  threshold: 1.00,  // Top up when balance < $1
  amount: 10.00     // Add $10
})
```

## Analytics

### Daily Revenue Report

Calculate total revenue for a day:

```typescript
import { createClient } from '@/lib/supabase/server'

async function getDailyRevenue(date: Date) {
  const supabase = await createClient()

  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('usage_records')
    .select('total_cost')
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())

  if (error) {
    console.error('Failed to fetch daily revenue:', error)
    return 0
  }

  const revenue = data.reduce((sum, record) => sum + parseFloat(record.total_cost), 0)

  console.log(`Revenue for ${date.toDateString()}: $${revenue.toFixed(2)}`)

  return revenue
}

// Usage
const today = new Date()
const revenue = await getDailyRevenue(today)
```

### Model Usage Report

See which models are most used:

```typescript
import { createClient } from '@/lib/supabase/server'

async function getModelUsageReport() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usage_records')
    .select('model_id, provider_id, total_cost, total_tokens')

  if (error) {
    console.error('Failed to fetch usage:', error)
    return
  }

  // Aggregate by model
  const report: Record<string, {
    requests: number
    tokens: number
    revenue: number
  }> = {}

  data.forEach(record => {
    const key = `${record.provider_id}:${record.model_id}`

    if (!report[key]) {
      report[key] = { requests: 0, tokens: 0, revenue: 0 }
    }

    report[key].requests++
    report[key].tokens += record.total_tokens
    report[key].revenue += parseFloat(record.total_cost)
  })

  // Sort by revenue
  const sorted = Object.entries(report)
    .sort(([, a], [, b]) => b.revenue - a.revenue)

  console.log('Model Usage Report')
  console.log('==================')
  sorted.forEach(([model, stats]) => {
    console.log(`${model}:`)
    console.log(`  Requests: ${stats.requests}`)
    console.log(`  Tokens: ${stats.tokens.toLocaleString()}`)
    console.log(`  Revenue: $${stats.revenue.toFixed(2)}`)
  })

  return sorted
}
```

### Top Users Report

Find highest-spending users:

```typescript
import { createClient } from '@/lib/supabase/server'

async function getTopUsers(limit: number = 10) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usage_records')
    .select('user_id, total_cost')

  if (error) {
    console.error('Failed to fetch usage:', error)
    return []
  }

  // Aggregate by user
  const userTotals: Record<string, number> = {}

  data.forEach(record => {
    if (!userTotals[record.user_id]) {
      userTotals[record.user_id] = 0
    }
    userTotals[record.user_id] += parseFloat(record.total_cost)
  })

  // Sort by total spent
  const sorted = Object.entries(userTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)

  console.log(`Top ${limit} Users by Spending`)
  console.log('=============================')
  sorted.forEach(([userId, total], i) => {
    console.log(`${i + 1}. ${userId}: $${total.toFixed(2)}`)
  })

  return sorted
}
```

## Admin Operations

### Set User Balance

Admin function to adjust balance:

```typescript
import { setBalance } from '@/lib/pricing/balance-service'

async function adminSetBalance(userId: string, amount: number, reason: string) {
  console.log(`Admin: Setting balance for ${userId} to $${amount}`)
  console.log(`Reason: ${reason}`)

  const success = await setBalance(userId, amount)

  if (success) {
    console.log('✓ Balance updated successfully')

    // Log the action
    await logAdminAction({
      action: 'SET_BALANCE',
      userId,
      amount,
      reason,
      timestamp: new Date()
    })
  } else {
    console.error('✗ Failed to update balance')
  }

  return success
}

// Usage
await adminSetBalance('user_123', 50.00, 'Compensation for service outage')
```

### Update Model Pricing

Change pricing for a model:

```typescript
import { updateModelPricing, clearPricingCache } from '@/lib/pricing'

async function adminUpdatePricing(
  modelId: string,
  providerId: string,
  inputPrice: number,
  outputPrice: number
) {
  console.log(`Updating pricing for ${providerId}:${modelId}`)
  console.log(`  Input: $${inputPrice}/1K tokens`)
  console.log(`  Output: $${outputPrice}/1K tokens`)

  const success = await updateModelPricing(modelId, providerId, inputPrice, outputPrice)

  if (success) {
    console.log('✓ Pricing updated')

    // Clear cache to force refresh
    clearPricingCache()
    console.log('✓ Cache cleared')

    // Log the change
    await logPricingChange({
      modelId,
      providerId,
      inputPrice,
      outputPrice,
      timestamp: new Date()
    })
  } else {
    console.error('✗ Failed to update pricing')
  }

  return success
}

// Usage
await adminUpdatePricing('gpt-4o', 'openai', 0.0025, 0.01)
```

### Bulk Add Credits

Give credits to multiple users:

```typescript
import { addBalance } from '@/lib/pricing/balance-service'

async function bulkAddCredits(userIds: string[], amount: number, reason: string) {
  console.log(`Adding $${amount} to ${userIds.length} users`)
  console.log(`Reason: ${reason}`)

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  }

  for (const userId of userIds) {
    try {
      const success = await addBalance(userId, amount)

      if (success) {
        results.success++
        console.log(`✓ ${userId}`)
      } else {
        results.failed++
        results.errors.push(`${userId}: Balance update failed`)
      }
    } catch (error) {
      results.failed++
      results.errors.push(`${userId}: ${error}`)
    }
  }

  console.log('\nResults:')
  console.log(`  Success: ${results.success}`)
  console.log(`  Failed: ${results.failed}`)

  if (results.errors.length > 0) {
    console.log('\nErrors:')
    results.errors.forEach(err => console.log(`  ${err}`))
  }

  return results
}

// Usage
await bulkAddCredits(
  ['user_1', 'user_2', 'user_3'],
  5.00,
  'Promotional credit for early adopters'
)
```

## Complete Integration Example

Here's a complete example showing all components working together:

```typescript
// app/api/chat/route.ts

import { cookies } from 'next/headers'
import { streamText } from 'ai'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  getUserBalance,
  getModelPricing,
  calculateCost,
  recordUsage,
  deductBalance
} from '@/lib/pricing'

export async function POST(req: Request) {
  try {
    // 1. Get user
    const userId = await getCurrentUserId()

    // 2. Check balance (skip for anonymous)
    if (userId !== 'anonymous') {
      const balance = await getUserBalance(userId)

      if (balance < 0.01) {
        return new Response(
          JSON.stringify({
            error: 'Insufficient balance',
            balance,
            message: 'Please add credits to continue'
          }),
          {
            status: 402,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
    }

    // 3. Get request data
    const { messages, id: chatId } = await req.json()
    const cookieStore = await cookies()
    const modelJson = cookieStore.get('selectedModel')?.value
    const selectedModel = JSON.parse(modelJson)

    // 4. Process request
    const result = streamText({
      model: getModel(selectedModel),
      messages,
      onFinish: async (result) => {
        // 5. Track usage (only for authenticated users)
        if (userId !== 'anonymous' && result.usage) {
          try {
            // Get pricing
            const pricing = await getModelPricing(
              selectedModel.id,
              selectedModel.providerId
            )

            if (pricing) {
              // Calculate cost
              const cost = calculateCost(
                result.usage.promptTokens,
                result.usage.completionTokens,
                pricing
              )

              // Record usage
              await recordUsage(userId, chatId, cost)

              // Deduct from balance
              const deducted = await deductBalance(userId, cost.totalCost)

              if (!deducted) {
                console.warn(`Failed to deduct $${cost.totalCost} from ${userId}`)
              } else {
                console.log(`✓ Charged ${userId}: $${cost.totalCost}`)
              }
            }
          } catch (error) {
            console.error('Usage tracking error:', error)
            // Don't throw - continue serving chat
          }
        }
      }
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Error processing request', { status: 500 })
  }
}
```

---

**Last Updated**: October 2024
**Examples Version**: 1.0.0
