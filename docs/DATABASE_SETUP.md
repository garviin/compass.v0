# Database Setup Guide

This guide explains how to set up the database for fresh deployments and development.

## Quick Start (Fresh Deployment)

For a brand new Supabase project, use the consolidated schema file:

### Option 1: Single Schema File (Fastest)

1. Go to your Supabase Dashboard → SQL Editor
2. Copy the entire contents of `supabase/schema.sql`
3. Paste and run in SQL Editor
4. Done! All tables, functions, and policies are created

**Time:** ~30 seconds

### Option 2: Individual Migrations (Version Controlled)

If you prefer to track each change individually:

1. Go to Supabase Dashboard → SQL Editor
2. Run migrations in order:
   ```
   20251018000001_create_pricing_tables.sql
   20251018000002_seed_model_pricing.sql (optional - adds default pricing)
   20251018000003_create_user_balance_trigger.sql
   20251018000004_add_user_balance_insert_policy.sql
   20251018000005_create_transactions_table.sql
   20251018000006_add_currency_preferences.sql
   20251019000001_create_increment_balance_function.sql
   20251019000002_add_unique_payment_intent_constraint.sql
   ```

**Time:** ~5 minutes

## Local Development with Supabase CLI

For local development with automatic schema management:

### Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

### Initialize Local Project

```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Pull current schema
supabase db pull

# Start local Supabase (includes PostgreSQL, Studio, etc.)
supabase start
```

### Apply Schema

```bash
# Reset database and apply all migrations
supabase db reset

# Or apply migrations incrementally
supabase db push
```

### Access Local Services

When `supabase start` is running:
- **API**: http://localhost:54321
- **Studio**: http://localhost:54323
- **PostgreSQL**: localhost:54322

Update your `.env.local` to use local endpoints:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
```

## Schema Overview

### Tables

1. **model_pricing** - AI model pricing information
2. **usage_records** - API usage tracking with token counts
3. **user_balances** - User account balances and currency preferences
4. **transactions** - Complete audit trail of all balance changes

### Key Functions

1. **increment_balance()** - Atomic balance updates (prevents race conditions)
2. **handle_new_user()** - Auto-creates balance record for new users
3. **update_user_currency_preference()** - Updates user currency settings

### Security

- **Row Level Security (RLS)** enabled on all tables
- Users can only read/modify their own data
- Service role has full access for backend operations
- Webhook processing uses service role to bypass RLS

## Verifying Installation

### Method 1: Quick Verification (SQL Editor)

After setup, run this quick check in Supabase SQL Editor:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')) as tables,
  (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('increment_balance', 'handle_new_user', 'update_user_currency_preference', 'update_updated_at_column') AND pronamespace = 'public'::regnamespace) as functions,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')) as policies;
```

**Expected results:**
- `tables`: 4
- `functions`: 4
- `policies`: 11+

### Method 2: Comprehensive Verification

Run the complete verification script in Supabase SQL Editor:

```bash
# Copy contents of scripts/verify-schema.sql
# Paste into Supabase SQL Editor and run
```

This provides detailed information about:
- All tables, columns, and data types
- All indexes and constraints
- All functions and their signatures
- All RLS policies
- All triggers

### Method 3: Schema Export & Comparison (Most Accurate)

For fresh deployments, verify `schema.sql` matches your current database:

```bash
# 1. Export current schema from Supabase
./scripts/export-current-schema.sh

# 2. Compare with consolidated schema
diff supabase/schema.sql supabase/migrations/current_schema_export.sql

# 3. No output = schemas match perfectly ✅
# Any differences will be shown
```

### Functional Testing

Test the atomic balance function works correctly:

```sql
-- Create a test balance record
INSERT INTO user_balances (user_id, balance, currency)
VALUES ('test-user-123', 0, 'USD');

-- Test atomic increment
SELECT * FROM increment_balance('test-user-123', 10.00);

-- Should return: balance_before=0, balance_after=10

-- Verify balance updated
SELECT balance FROM user_balances WHERE user_id = 'test-user-123';

-- Clean up
DELETE FROM user_balances WHERE user_id = 'test-user-123';
```

## Migration Strategy

### For Fresh Deployments
Use `supabase/schema.sql` - single file with complete schema

### For Existing Databases
Use individual migrations in `supabase/migrations/` to track changes over time

### For Development
Use Supabase CLI with `supabase db reset` to apply all migrations at once

## Troubleshooting

### "Function already exists" errors
If you see this error, the function was created by a previous migration. This is safe to ignore, or add `CREATE OR REPLACE FUNCTION` to make it idempotent.

### "Relation already exists" errors
If tables already exist, this is safe to ignore. The schema uses `CREATE TABLE IF NOT EXISTS` for idempotency.

### RLS policy errors
Ensure you're using the service role key for backend operations (webhooks, admin tasks). Regular users should use the anon key.

### Missing SUPABASE_SERVICE_ROLE_KEY
This is required for webhook processing and admin operations. Get it from:
Supabase Dashboard → Settings → API → service_role (secret)

## Next Steps

After database setup:
1. Configure environment variables (see `.env.local.example`)
2. Set up Stripe webhook endpoint (see `docs/STRIPE_SETUP.md`)
3. Test payment flow with Stripe test cards
4. Verify balance updates correctly after payments

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Supabase Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [STRIPE_SETUP.md](./STRIPE_SETUP.md) - Payment integration guide
