# Deployment Guide

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Steps](#deployment-steps)
- [Post-Deployment](#post-deployment)
- [Verification](#verification)
- [Production Considerations](#production-considerations)
- [Rollback Plan](#rollback-plan)

## Prerequisites

Before deploying the pricing system, ensure you have:

### Required

- ✅ **Supabase Project** - Active Supabase project with database access
- ✅ **Supabase Auth** - User authentication configured and working
- ✅ **Environment Variables** - Required vars set (see below)
- ✅ **Database Access** - Supabase CLI installed OR dashboard access

### Optional

- Supabase CLI (`npm install -g supabase`)
- PostgreSQL client (for verification)
- Payment integration (Stripe, etc.) for credit purchases

### Environment Variables

The pricing system doesn't require new environment variables, but verify these exist:

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=[YOUR_SUPABASE_URL]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_SUPABASE_ANON_KEY]

# Service Role (for backend operations)
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_ROLE_KEY]

# Chat history (should be enabled)
NEXT_PUBLIC_ENABLE_SAVE_CHAT_HISTORY=true

# Free tier limit (optional, default is 3)
FREE_GUEST_EXCHANGES=3
```

## Deployment Steps

### Step 1: Apply Database Migrations

Choose **one** of the following methods:

#### Method A: Supabase CLI (Recommended)

```bash
# 1. Link to your project
supabase link --project-ref <your-project-ref>

# 2. Apply migrations
supabase db push

# Expected output:
# Applying migration 20251018000001_create_pricing_tables.sql...
# Applying migration 20251018000002_seed_model_pricing.sql...
# Finished supabase db push.
```

#### Method B: Supabase Dashboard

1. Navigate to your Supabase project dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy contents of `supabase/migrations/20251018000001_create_pricing_tables.sql`
5. Paste and click **Run**
6. Repeat for `20251018000002_seed_model_pricing.sql`

#### Method C: Direct PostgreSQL Connection

```bash
# Get connection string from Supabase dashboard (Settings > Database)
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres" \
  -f supabase/migrations/20251018000001_create_pricing_tables.sql

psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres" \
  -f supabase/migrations/20251018000002_seed_model_pricing.sql
```

### Step 2: Verify Database Setup

Run verification queries:

```sql
-- 1. Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('model_pricing', 'usage_records', 'user_balances');
-- Expected: 3 rows

-- 2. Check pricing data
SELECT COUNT(*) FROM model_pricing;
-- Expected: 23 rows

-- 3. Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances');
-- All should have rowsecurity = true

-- 4. Check indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances');
-- Should see multiple indexes per table

-- 5. Verify a pricing record
SELECT * FROM model_pricing WHERE model_id = 'gpt-4o' AND provider_id = 'openai';
-- Should return pricing data
```

### Step 3: Initialize User Balances

Add this to your user signup flow:

```typescript
// Example: app/auth/signup/route.ts or wherever you handle signup

import { initializeUserBalance } from '@/lib/pricing/balance-service'

export async function POST(req: Request) {
  // ... your existing signup code ...

  // After user is created
  const userId = newUser.id

  // Initialize with $10 welcome credit
  await initializeUserBalance(userId, 10.00)

  // ... rest of signup flow ...
}
```

For existing users, run a migration script:

```typescript
// scripts/initialize-existing-users.ts

import { createClient } from '@supabase/supabase-js'
import { initializeUserBalance } from '@/lib/pricing/balance-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function initializeExistingUsers() {
  // Get all users
  const { data: users } = await supabase.auth.admin.listUsers()

  for (const user of users.users) {
    console.log(`Initializing balance for user ${user.id}`)

    // Give existing users $5 credit
    await initializeUserBalance(user.id, 5.00)

    console.log(`✓ User ${user.id} initialized`)
  }

  console.log('Done!')
}

initializeExistingUsers()
```

Run the script:
```bash
bun run scripts/initialize-existing-users.ts
```

### Step 4: Build and Deploy

```bash
# 1. Type check
bun typecheck

# 2. Lint
bun lint

# 3. Build
bun run build

# 4. Test build locally (optional)
bun start

# 5. Deploy to your platform
# Vercel:
vercel --prod

# Or other platforms:
# - Railway: railway up
# - Fly.io: fly deploy
# - Docker: docker build && docker push
```

## Post-Deployment

### Immediate Actions

#### 1. Test the System

```bash
# Test balance endpoint
curl https://your-app.com/api/balance \
  -H "Cookie: sb-<project>-auth-token=<token>"

# Expected: {"balance": 10.00, "currency": "USD"}
```

#### 2. Monitor Logs

Watch for:
- ✅ Usage recording logs: `"Usage recorded: {...}"`
- ⚠️ Warnings: `"Failed to deduct balance"`
- ❌ Errors: `"No pricing found for model"`

```bash
# If using Vercel
vercel logs --follow

# Check Supabase logs
# Dashboard > Logs > Postgres Logs
```

#### 3. Test Full Flow

1. Sign up a new user
2. Verify balance initialized
3. Send a chat message
4. Check `usage_records` table has entry
5. Verify balance deducted

### Communication

#### Internal Team

- Notify team that pricing is live
- Share this documentation
- Set up monitoring alerts

#### Users

Consider announcing:
- New pricing model active
- Existing users received welcome credits
- How to check balance
- How to add credits (when payment is integrated)

Example email:
```
Subject: Your Account Credits

Hi [Name],

We're excited to announce our new pay-per-use pricing system!

✅ You've been credited with $5.00 to get started
✅ View your balance in the app sidebar
✅ Transparent, usage-based pricing

Questions? Contact support@your-app.com
```

## Verification

### Health Checks

Create a health check endpoint:

```typescript
// app/api/health/pricing/route.ts

import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Check database connection
    const { error: pricingError } = await supabase
      .from('model_pricing')
      .select('count')
      .limit(1)

    if (pricingError) throw pricingError

    const { error: balanceError } = await supabase
      .from('user_balances')
      .select('count')
      .limit(1)

    if (balanceError) throw balanceError

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ status: 'error', error: String(error) }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    )
  }
}
```

Test:
```bash
curl https://your-app.com/api/health/pricing
# Expected: {"status":"ok"}
```

### Test Checklist

- [ ] Database tables created
- [ ] Pricing data seeded (23 models)
- [ ] RLS policies active
- [ ] New user signup initializes balance
- [ ] Balance endpoint returns data
- [ ] Chat request checks balance
- [ ] 402 error when balance insufficient
- [ ] Usage recorded after chat
- [ ] Balance deducted correctly
- [ ] UI shows balance in sidebar
- [ ] Chat cost display works

## Production Considerations

### Monitoring

Set up alerts for:

1. **Low Balance Failures**
   ```typescript
   if (failedDeductions > 10) {
     sendAlert('High rate of balance deduction failures')
   }
   ```

2. **Missing Pricing**
   ```typescript
   if (!pricing) {
     sendAlert(`No pricing found for ${modelId}`)
   }
   ```

3. **Database Errors**
   ```typescript
   if (dbErrors > 5) {
     sendAlert('Database connection issues')
   }
   ```

### Performance

1. **Caching**: Pricing cached for 5 minutes (already implemented)
2. **Indexes**: All necessary indexes created
3. **Connection Pooling**: Supabase handles this

Monitor:
- Database query times
- Cache hit rate
- API response times

### Security

Verify:
- ✅ RLS policies prevent user data leakage
- ✅ Service role key not exposed to client
- ✅ Balance updates server-side only
- ✅ User can only see own data

Test RLS:
```sql
-- As authenticated user, should see only own balance
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-id-here';
SELECT * FROM user_balances;
-- Should see 1 row (your own)
```

### Backup

Supabase provides automatic backups, but you can also:

```bash
# Manual backup
pg_dump <connection-string> \
  --table=model_pricing \
  --table=usage_records \
  --table=user_balances \
  > pricing_backup_$(date +%Y%m%d).sql

# Restore
psql <connection-string> < pricing_backup_20241018.sql
```

### Cost Estimation

Estimate Supabase costs:
- Database: Covered by free tier for < 10K users
- Storage: ~1GB per 1M usage records
- Bandwidth: Minimal (pricing cached)

## Rollback Plan

If issues arise, follow this rollback procedure:

### Option 1: Disable Usage Tracking (Soft Rollback)

```typescript
// In lib/streaming/handle-stream-finish.ts
// Comment out usage tracking:

// if (usage && userId !== 'anonymous') {
//   try {
//     const [providerId, modelId] = model.split(':')
//     const pricing = await getModelPricing(modelId, providerId)
//     // ... rest of tracking
//   } catch (error) {
//     console.error('Error tracking usage:', error)
//   }
// }
```

Redeploy. Users can still chat, but usage won't be tracked.

### Option 2: Remove Balance Check (Emergency)

```typescript
// In app/api/chat/route.ts
// Comment out balance check:

// } else {
//   try {
//     const balance = await getUserBalance(userId)
//     if (balance < 0.01) {
//       return new Response(...)
//     }
//   } catch (e) {
//     console.error('Balance check failed:', e)
//   }
// }
```

Redeploy. All users can chat without balance restrictions.

### Option 3: Full Rollback (Database)

```sql
-- Drop tables (WARNING: Loses all data)
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS user_balances;
DROP TABLE IF EXISTS model_pricing;
```

Then revert code changes and redeploy.

### Recovery

After fixing issues:
1. Reapply migrations
2. Re-initialize user balances
3. Backfill usage data if possible
4. Redeploy with fixes

---

**Last Updated**: October 2024
**Deployment Version**: 1.0.0
