# Troubleshooting Guide

## Table of Contents

- [Common Issues](#common-issues)
- [Database Issues](#database-issues)
- [Balance Issues](#balance-issues)
- [Usage Tracking Issues](#usage-tracking-issues)
- [Pricing Issues](#pricing-issues)
- [UI Issues](#ui-issues)
- [Debugging Tips](#debugging-tips)

## Common Issues

### Issue: Insufficient Balance Error

**Symptoms**:
- Users receive 402 Payment Required error
- Chat requests blocked
- Message: "Insufficient balance"

**Diagnosis**:
```typescript
// Check user's balance
const balance = await getUserBalance(userId)
console.log(`User balance: $${balance}`)

// Check if below threshold
if (balance < 0.01) {
  console.log('Balance too low')
}
```

**Solutions**:

1. **Add credits to user**:
```typescript
import { addBalance } from '@/lib/pricing/balance-service'

await addBalance(userId, 10.00)
```

2. **Lower minimum balance** (temporary fix):
```typescript
// In app/api/chat/route.ts
// Change from 0.01 to 0.001
if (balance < 0.001) {  // Lower threshold
  return new Response(...)
}
```

3. **Initialize balance if missing**:
```typescript
import { initializeUserBalance } from '@/lib/pricing/balance-service'

await initializeUserBalance(userId, 10.00)
```

---

### Issue: Usage Not Being Tracked

**Symptoms**:
- `usage_records` table empty
- No cost deductions
- Balance not updating

**Diagnosis**:
```typescript
// Check if usage data is being received
console.log('Usage data:', result.usage)

// Check database connection
const supabase = await createClient()
const { data, error } = await supabase.from('usage_records').select('*').limit(1)

if (error) {
  console.error('Database error:', error)
}
```

**Solutions**:

1. **Verify AI SDK returns usage**:
```typescript
// In onFinish callback
onFinish: async (result) => {
  console.log('Usage:', result.usage)

  if (!result.usage) {
    console.error('No usage data returned from AI SDK')
  }
}
```

2. **Check service role permissions**:
```sql
-- Test insert as service role
INSERT INTO usage_records (user_id, chat_id, model_id, provider_id, input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost)
VALUES ('test', 'test', 'gpt-4o', 'openai', 100, 50, 150, 0.001, 0.001, 0.002);
```

3. **Verify pricing exists**:
```typescript
const pricing = await getModelPricing(modelId, providerId)

if (!pricing) {
  console.error(`No pricing for ${modelId}/${providerId}`)
}
```

---

### Issue: Pricing Not Found

**Symptoms**:
- Log: "No pricing found for model X"
- Cost calculations fail
- Usage recorded with $0 cost

**Diagnosis**:
```typescript
// Check database
const supabase = await createClient()
const { data } = await supabase
  .from('model_pricing')
  .select('*')
  .eq('model_id', 'gpt-4o')
  .eq('provider_id', 'openai')

console.log('Pricing in DB:', data)

// Check config fallback
import modelsConfig from '@/public/config/models.json'
const model = modelsConfig.models.find(m => m.id === 'gpt-4o')
console.log('Pricing in config:', model?.pricing)
```

**Solutions**:

1. **Add missing pricing to database**:
```sql
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES ('gpt-4o', 'openai', 0.0025, 0.01)
ON CONFLICT (model_id, provider_id) DO UPDATE
SET
  input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
  output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens;
```

2. **Add to models.json**:
```json
{
  "id": "gpt-4o",
  "pricing": {
    "inputPricePer1kTokens": 0.0025,
    "outputPricePer1kTokens": 0.01
  }
}
```

3. **Clear cache**:
```typescript
import { clearPricingCache } from '@/lib/pricing/pricing-service'

clearPricingCache()
```

---

## Database Issues

### Issue: Tables Not Created

**Symptoms**:
- Error: "relation does not exist"
- Database queries fail

**Diagnosis**:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('model_pricing', 'usage_records', 'user_balances');
```

**Solution**:

Apply migrations:
```bash
supabase db push

# Or manually via SQL editor
-- Run supabase/migrations/20251018000001_create_pricing_tables.sql
-- Then run supabase/migrations/20251018000002_seed_model_pricing.sql
```

---

### Issue: RLS Blocking Queries

**Symptoms**:
- Queries return empty results
- Permission denied errors
- Users can't see own data

**Diagnosis**:
```sql
-- Check RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances');

-- Check policies
SELECT * FROM pg_policies
WHERE tablename IN ('model_pricing', 'usage_records', 'user_balances');
```

**Solutions**:

1. **Verify service role key**:
```typescript
// Ensure using service role for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Not anon key!
)
```

2. **Test policy**:
```sql
-- As authenticated user
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-id-here';

SELECT * FROM user_balances WHERE user_id = 'user-id-here';
-- Should return 1 row

SELECT * FROM user_balances WHERE user_id != 'user-id-here';
-- Should return 0 rows
```

3. **Temporarily disable RLS** (debugging only):
```sql
-- WARNING: Only for debugging!
ALTER TABLE user_balances DISABLE ROW LEVEL SECURITY;

-- Remember to re-enable
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
```

---

### Issue: Database Connection Failures

**Symptoms**:
- Timeout errors
- Connection refused
- Intermittent failures

**Diagnosis**:
```typescript
try {
  const supabase = await createClient()
  const { error } = await supabase.from('model_pricing').select('count').single()

  if (error) {
    console.error('DB connection error:', error)
  } else {
    console.log('DB connection OK')
  }
} catch (error) {
  console.error('Failed to create client:', error)
}
```

**Solutions**:

1. **Verify environment variables**:
```bash
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
echo $SUPABASE_SERVICE_ROLE_KEY
```

2. **Check Supabase status**: Visit https://status.supabase.com

3. **Increase timeout**:
```typescript
const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false,
  },
  global: {
    headers: {
      timeout: '30000' // 30 seconds
    }
  }
})
```

---

## Balance Issues

### Issue: Balance Deduction Failed

**Symptoms**:
- Log: "Failed to deduct balance"
- Usage recorded but balance unchanged
- Potential revenue loss

**Diagnosis**:
```typescript
const balance = await getUserBalance(userId)
const cost = 0.0234

console.log(`Balance: $${balance}`)
console.log(`Cost: $${cost}`)

if (balance < cost) {
  console.log('Insufficient balance for deduction')
}

// Try manual deduction
const success = await deductBalance(userId, cost)
console.log('Deduction success:', success)
```

**Solutions**:

1. **Check balance sufficient**:
```sql
SELECT user_id, balance
FROM user_balances
WHERE user_id = 'user-id'
  AND balance < 0.01;
```

2. **Check for race conditions**:
```sql
-- Ensure atomic updates
UPDATE user_balances
SET balance = balance - 0.0234
WHERE user_id = 'user-id'
  AND balance >= 0.0234;  -- Check before update

-- If no rows updated, balance was insufficient
```

3. **Manual correction**:
```typescript
// If usage was recorded but not deducted
const usage = await getChatUsage(chatId)
const totalCost = usage.reduce((sum, r) => sum + r.totalCost, 0)

// Deduct missing amount
await deductBalance(userId, totalCost)
```

---

### Issue: Negative Balance

**Symptoms**:
- User has negative balance
- Should be prevented by CHECK constraint

**Diagnosis**:
```sql
SELECT user_id, balance
FROM user_balances
WHERE balance < 0;
```

**This should not happen!** If it does:

**Solutions**:

1. **Check database constraints**:
```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE '%balance%';
```

2. **Reset balance**:
```sql
UPDATE user_balances
SET balance = 0
WHERE balance < 0;
```

3. **Investigate logs** to understand how it happened.

---

## Usage Tracking Issues

### Issue: Duplicate Usage Records

**Symptoms**:
- Multiple records for same request
- Inflated usage statistics
- Double charging

**Diagnosis**:
```sql
SELECT chat_id, created_at, COUNT(*)
FROM usage_records
GROUP BY chat_id, created_at
HAVING COUNT(*) > 1;
```

**Solutions**:

1. **Add idempotency**:
```typescript
// Use unique transaction ID
const transactionId = `${chatId}-${Date.now()}`

// Check if already recorded
const { data: existing } = await supabase
  .from('usage_records')
  .select('id')
  .eq('transaction_id', transactionId)

if (existing && existing.length > 0) {
  console.log('Usage already recorded, skipping')
  return
}

// Record with transaction ID
await supabase.from('usage_records').insert({
  transaction_id: transactionId,
  // ... other fields
})
```

2. **Clean up duplicates**:
```sql
-- Delete duplicates keeping oldest
DELETE FROM usage_records a
USING usage_records b
WHERE a.id > b.id
  AND a.chat_id = b.chat_id
  AND a.created_at = b.created_at;
```

---

## Pricing Issues

### Issue: Cache Not Updating

**Symptoms**:
- Updated pricing in database
- Old prices still being used
- Up to 5 minute delay

**Expected behavior**: Cache TTL is 5 minutes.

**Solutions**:

1. **Force cache clear**:
```typescript
import { clearPricingCache } from '@/lib/pricing/pricing-service'

clearPricingCache()
console.log('Cache cleared')
```

2. **Wait for TTL** (5 minutes)

3. **Reduce cache TTL**:
```typescript
// In lib/pricing/pricing-service.ts
const CACHE_TTL = 1 * 60 * 1000 // Change to 1 minute
```

---

## UI Issues

### Issue: Balance Not Displaying

**Symptoms**:
- Sidebar shows no balance
- Component not rendering

**Diagnosis**:
```typescript
// In browser console
fetch('/api/balance')
  .then(r => r.json())
  .then(console.log)

// Check component props
console.log('BalanceDisplay mounted')
```

**Solutions**:

1. **Check API endpoint**:
```bash
curl https://your-app.com/api/balance \
  -H "Cookie: sb-<project>-auth-token=<token>"
```

2. **Check authentication**:
```typescript
const userId = await getCurrentUserId()
console.log('User ID:', userId)

if (userId === 'anonymous') {
  console.log('Balance hidden for anonymous users')
}
```

3. **Check component integration**:
```typescript
// Verify component is imported and used
<SidebarFooter>
  <BalanceDisplay />  {/* Should be here */}
</SidebarFooter>
```

---

### Issue: Chat Cost Not Updating

**Symptoms**:
- Cost display shows $0
- Cost doesn't update after chat

**Diagnosis**:
```typescript
// Check if hook is receiving data
const { cost, loading } = useChatCost(chatId)

console.log('Chat ID:', chatId)
console.log('Cost:', cost)
console.log('Loading:', loading)
```

**Solutions**:

1. **Verify chatId is set**:
```typescript
// chatId must not be null
if (!chatId) {
  console.error('chatId is null!')
}
```

2. **Check API endpoint**:
```bash
curl https://your-app.com/api/usage/chat/chat_123
```

3. **Force refresh**:
```typescript
// Add dependency array
useEffect(() => {
  fetchChatCost()
}, [chatId]) // Will refetch when chatId changes
```

---

## Debugging Tips

### Enable Verbose Logging

```typescript
// Add to services
export async function recordUsage(...) {
  console.log('[PRICING] Recording usage:', {
    userId,
    chatId,
    cost: costCalculation.totalCost
  })

  const success = await supabase.from('usage_records').insert(...)

  if (success) {
    console.log('[PRICING] ✓ Usage recorded')
  } else {
    console.error('[PRICING] ✗ Failed to record usage')
  }
}
```

### Monitor Database in Real-Time

```sql
-- Watch for new usage records
SELECT user_id, model_id, total_cost, created_at
FROM usage_records
ORDER BY created_at DESC
LIMIT 10;

-- Run this repeatedly or use Supabase Realtime
```

### Test Pricing Flow End-to-End

```typescript
async function testPricingFlow() {
  const testUserId = 'test-user-123'

  console.log('1. Initialize balance')
  await initializeUserBalance(testUserId, 10.00)

  console.log('2. Check balance')
  const balance = await getUserBalance(testUserId)
  console.log(`   Balance: $${balance}`)

  console.log('3. Get pricing')
  const pricing = await getModelPricing('gpt-4o', 'openai')
  console.log(`   Pricing: ${JSON.stringify(pricing)}`)

  console.log('4. Calculate cost')
  const cost = calculateCost(100, 50, pricing!)
  console.log(`   Cost: $${cost.totalCost}`)

  console.log('5. Record usage')
  await recordUsage(testUserId, 'test-chat', cost)

  console.log('6. Deduct balance')
  await deductBalance(testUserId, cost.totalCost)

  console.log('7. Check new balance')
  const newBalance = await getUserBalance(testUserId)
  console.log(`   New balance: $${newBalance}`)
  console.log(`   Expected: $${(10 - cost.totalCost).toFixed(2)}`)

  console.log('✓ Test complete')
}
```

### Check Logs in Production

```bash
# Vercel
vercel logs --follow | grep PRICING

# Filter for errors
vercel logs --follow | grep -i error

# Filter for specific user
vercel logs --follow | grep user_123
```

---

**Last Updated**: October 2024
**Troubleshooting Version**: 1.0.0
