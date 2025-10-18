# Supabase Database Migrations

This directory contains SQL migrations for the pricing and usage tracking system.

## Applying Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI if not already installed:
```bash
npm install -g supabase
```

2. Link your project:
```bash
supabase link --project-ref <your-project-ref>
```

3. Apply migrations:
```bash
supabase db push
```

### Option 2: Manual Application via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of each migration file in order:
   - `20251018000001_create_pricing_tables.sql`
   - `20251018000002_seed_model_pricing.sql`
   - `20251018000003_create_user_balance_trigger.sql`
   - `20251018000004_add_user_balance_insert_policy.sql`
4. Execute each file

### Option 3: Using Direct Database Connection

Connect to your Supabase database directly and run the migration files in order.

## Migration Files

- **20251018000001_create_pricing_tables.sql**: Creates the core tables for pricing infrastructure
  - `model_pricing`: Stores pricing per model and provider
  - `usage_records`: Tracks all API usage with costs
  - `user_balances`: Maintains user balance information
  - Includes RLS policies for security

- **20251018000002_seed_model_pricing.sql**: Seeds initial pricing data
  - Populates pricing for all supported models
  - Uses current market rates (as of October 2024)
  - Safe to re-run (uses `ON CONFLICT DO NOTHING`)

- **20251018000003_create_user_balance_trigger.sql**: Creates automatic user balance initialization
  - Adds trigger to automatically create balance record on user signup
  - Ensures every new user starts with $0 balance
  - Prevents RLS errors when fetching user balances
  - Uses SECURITY DEFINER to bypass RLS policies
  - Includes error handling to prevent signup failures

- **20251018000004_add_user_balance_insert_policy.sql**: Adds backup RLS policy
  - Allows users to insert their own balance record
  - Serves as fallback if trigger fails
  - Provides additional security layer

## Updating Pricing

To update model pricing, you can either:

1. Run an UPDATE query via the Supabase dashboard SQL editor
2. Use the pricing service in your application code
3. Create a new migration file

Example UPDATE query:
```sql
UPDATE model_pricing
SET
  input_price_per_1k_tokens = 0.003,
  output_price_per_1k_tokens = 0.012
WHERE model_id = 'gpt-4o' AND provider_id = 'openai';
```

## Verifying Migration

After applying migrations, verify with:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('model_pricing', 'usage_records', 'user_balances');

-- Check pricing data
SELECT * FROM model_pricing ORDER BY provider_id, model_id;

-- Check RLS policies
SELECT * FROM pg_policies
WHERE tablename IN ('model_pricing', 'usage_records', 'user_balances');
```
