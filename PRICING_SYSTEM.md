# Pricing System Documentation

This document explains the pay-per-use pricing system that has been implemented for this application.

## Overview

The pricing system provides:
- **Direct passthrough pricing** from AI provider costs
- **Automatic usage tracking** with token counts and costs
- **User balance management** with real-time deductions
- **Balance display** in the UI
- **Cost transparency** with per-chat cost tracking

## Architecture

### Database Tables

Three main tables power the pricing system:

1. **`model_pricing`** - Stores pricing per model and provider
2. **`usage_records`** - Tracks all API usage with costs
3. **`user_balances`** - Maintains user balance information

### Services

Located in `lib/pricing/`:

- **`pricing-service.ts`** - Fetch and manage model pricing (with 5-min cache)
- **`usage-tracking.ts`** - Record and query usage data
- **`balance-service.ts`** - Manage user balances
- **`cost-estimation.ts`** - Estimate costs before requests

## Setup

### 1. Apply Database Migrations

Choose one of the following methods:

#### Option A: Supabase CLI (Recommended)
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

#### Option B: Supabase Dashboard
1. Navigate to SQL Editor in your Supabase project
2. Run `supabase/migrations/20251018000001_create_pricing_tables.sql`
3. Run `supabase/migrations/20251018000002_seed_model_pricing.sql`

See `supabase/README.md` for detailed instructions.

### 2. Initialize User Balances

When a user signs up, initialize their balance:

```typescript
import { initializeUserBalance } from '@/lib/pricing/balance-service'

// Give new user $10 credit
await initializeUserBalance(userId, 10.00)
```

### 3. Add Cost Display to Your UI (Optional)

The `ChatCostDisplay` component can be added to show per-chat costs:

```typescript
import { ChatCostDisplay } from '@/components/chat-cost-display'

// In your chat component
<ChatCostDisplay chatId={chatId} />
```

This will show total cost and token usage for a chat session.

## How It Works

### Request Flow

1. **User sends a message** → Chat API receives request
2. **Balance check** → Ensures user has at least $0.01 balance
3. **Process request** → AI generates response
4. **Track usage** → On completion:
   - Extract token usage from AI SDK
   - Fetch pricing for the model
   - Calculate cost
   - Record usage to database
   - Deduct from user balance

### Pricing Sources

Pricing is fetched in this order:
1. **Supabase database** (cached for 5 minutes)
2. **Fallback to `models.json`** if database unavailable

This allows you to update pricing in the database without redeployment.

### Anonymous Users

Guest users are **not charged** - they use the existing free tier limit system based on Redis counters.

## API Endpoints

### Get User Balance
```
GET /api/balance
```

Returns:
```json
{
  "balance": 10.50,
  "currency": "USD"
}
```

### Get Chat Usage
```
GET /api/usage/chat/{chatId}
```

Returns:
```json
{
  "totalCost": 0.0234,
  "inputTokens": 1500,
  "outputTokens": 800,
  "totalTokens": 2300,
  "messages": [...]
}
```

## Managing Balances

### Add Credits
```typescript
import { addBalance } from '@/lib/pricing/balance-service'

await addBalance(userId, 25.00) // Add $25
```

### Set Balance (Admin)
```typescript
import { setBalance } from '@/lib/pricing/balance-service'

await setBalance(userId, 100.00) // Set to $100
```

### Check Balance
```typescript
import { getUserBalance } from '@/lib/pricing/balance-service'

const balance = await getUserBalance(userId)
```

## Updating Pricing

### Via Database (Recommended for Production)
```sql
UPDATE model_pricing
SET
  input_price_per_1k_tokens = 0.003,
  output_price_per_1k_tokens = 0.012
WHERE model_id = 'gpt-4o' AND provider_id = 'openai';
```

### Via Code
```typescript
import { updateModelPricing } from '@/lib/pricing/pricing-service'

await updateModelPricing(
  'gpt-4o',      // modelId
  'openai',      // providerId
  0.003,         // input price per 1k tokens
  0.012          // output price per 1k tokens
)
```

### Via `models.json` (Development)
Edit `public/config/models.json` and update the `pricing` field:

```json
{
  "id": "gpt-4o",
  "pricing": {
    "inputPricePer1kTokens": 0.0025,
    "outputPricePer1kTokens": 0.01
  }
}
```

## Usage Analytics

### Get User Statistics
```typescript
import { getUserUsageStats } from '@/lib/pricing/usage-tracking'

const stats = await getUserUsageStats(userId)
// Returns: totalRequests, totalTokens, totalCost, modelBreakdown
```

### Get Usage History
```typescript
import { getUserUsage } from '@/lib/pricing/usage-tracking'

const usage = await getUserUsage(userId, 50, 0) // limit, offset
```

### Get Total Cost for Period
```typescript
import { getUserTotalCost } from '@/lib/pricing/usage-tracking'

const startDate = new Date('2025-10-01')
const endDate = new Date('2025-10-31')
const totalCost = await getUserTotalCost(userId, startDate, endDate)
```

## UI Components

### Balance Display (Already Integrated)
Shows user's current balance in the sidebar:
- Green/normal when balance > $1
- Yellow warning when balance < $1
- Red critical when balance < $0.10

### Chat Cost Display
Shows cost for current chat session:

```tsx
import { ChatCostDisplay } from '@/components/chat-cost-display'

<ChatCostDisplay chatId={currentChatId} />
```

## Cost Estimation

Estimate cost before making a request:

```typescript
import { estimateConversationCost } from '@/lib/pricing/cost-estimation'

const estimate = await estimateConversationCost(
  messages,
  selectedModel,
  500 // estimated completion tokens
)

console.log(`Estimated cost: $${estimate.totalCost}`)
console.log(`Range: $${estimate.estimatedCostRange.min} - $${estimate.estimatedCostRange.max}`)
```

## Security

### Row Level Security (RLS)

All tables have RLS policies:
- Users can only read their own usage and balance
- Only service role can insert/update pricing
- Service role handles all balance updates to prevent tampering

### Balance Checks

- Balance checked **before** processing requests
- Requires minimum $0.01 balance
- Returns 402 Payment Required if insufficient

## Monitoring

### Failed Balance Deductions

Check logs for warnings:
```
Failed to deduct balance for user {userId}, cost: {cost}
```

This indicates a user made a request but the balance deduction failed (possibly due to race conditions or database issues).

### Missing Pricing

Check logs for warnings:
```
No pricing found for model {modelId} ({providerId})
```

This means a model is configured but has no pricing data.

## Troubleshooting

### User has zero balance but can't add credits

Check if user balance record exists:
```typescript
const balance = await getUserBalanceRecord(userId)
```

If null, initialize:
```typescript
await initializeUserBalance(userId, 0)
```

### Pricing not updating

Clear the cache:
```typescript
import { clearPricingCache } from '@/lib/pricing/pricing-service'

clearPricingCache()
```

### Usage not being tracked

Check:
1. AI SDK is returning usage data in `onFinish` callback
2. Database connection is working
3. User is not anonymous (`userId !== 'anonymous'`)

## Future Enhancements

Potential additions to consider:
1. **Payment integration** (Stripe) for adding credits
2. **Usage quotas** with different pricing tiers
3. **Cost alerts** when nearing zero balance
4. **Usage analytics dashboard** for users
5. **Promotional credits** and discount codes
6. **Monthly invoicing** for enterprise users

## Example Integration

Here's a complete example of integrating the pricing system:

```typescript
// In your signup flow
import { initializeUserBalance } from '@/lib/pricing/balance-service'

async function handleSignup(email: string, password: string) {
  const user = await createUser(email, password)

  // Give new users $5 in credits
  await initializeUserBalance(user.id, 5.00)

  return user
}

// In your chat component
import { ChatCostDisplay } from '@/components/chat-cost-display'
import { estimateConversationCost } from '@/lib/pricing/cost-estimation'
import { getUserBalance } from '@/lib/pricing/balance-service'

function ChatInterface({ chatId, messages, selectedModel }) {
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    async function fetchBalance() {
      const bal = await getUserBalance(userId)
      setBalance(bal)
    }
    fetchBalance()
  }, [])

  return (
    <div>
      <div className="chat-header">
        Balance: ${balance.toFixed(2)}
      </div>

      <div className="messages">
        {/* Your messages */}
      </div>

      <ChatCostDisplay chatId={chatId} />
    </div>
  )
}
```

## Support

For issues or questions about the pricing system:
1. Check the migration files in `supabase/migrations/`
2. Review service implementations in `lib/pricing/`
3. Check console logs for warnings/errors
4. Verify database connection and RLS policies
