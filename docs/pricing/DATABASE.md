# Database Documentation

## Table of Contents

- [Overview](#overview)
- [Schema Reference](#schema-reference)
- [Migrations](#migrations)
- [Row Level Security](#row-level-security)
- [Indexes](#indexes)
- [Common Queries](#common-queries)
- [Maintenance](#maintenance)

## Overview

The pricing system uses three PostgreSQL tables in Supabase:

1. **`model_pricing`** - Pricing data for AI models
2. **`usage_records`** - Historical usage tracking
3. **user_balances`** - User account balances

All tables have Row Level Security (RLS) enabled for data protection.

## Schema Reference

### Table: `model_pricing`

Stores pricing information for each AI model and provider combination.

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `uuid_generate_v4()` | Primary key |
| `model_id` | TEXT | No | - | Model identifier (e.g., "gpt-4o") |
| `provider_id` | TEXT | No | - | Provider key (e.g., "openai") |
| `input_price_per_1k_tokens` | DECIMAL(10,6) | No | - | Cost per 1K input tokens (USD) |
| `output_price_per_1k_tokens` | DECIMAL(10,6) | No | - | Cost per 1K output tokens (USD) |
| `created_at` | TIMESTAMP WITH TIME ZONE | No | `NOW()` | Record creation time |
| `updated_at` | TIMESTAMP WITH TIME ZONE | No | `NOW()` | Last update time |

#### Constraints

- **Primary Key**: `id`
- **Unique**: `(model_id, provider_id)` - Prevents duplicate pricing entries
- **Check**: Prices must be >= 0

#### Example Data

```sql
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('gpt-4o', 'openai', 0.0025, 0.01),
  ('claude-3-5-sonnet-latest', 'anthropic', 0.003, 0.015);
```

#### Usage Pattern

```sql
-- Lookup pricing for a specific model
SELECT input_price_per_1k_tokens, output_price_per_1k_tokens
FROM model_pricing
WHERE model_id = 'gpt-4o' AND provider_id = 'openai';
```

---

### Table: `usage_records`

Tracks every AI API call with token usage and calculated costs.

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `uuid_generate_v4()` | Primary key |
| `user_id` | TEXT | No | - | User identifier |
| `chat_id` | TEXT | No | - | Chat session identifier |
| `model_id` | TEXT | No | - | Model used |
| `provider_id` | TEXT | No | - | Provider used |
| `input_tokens` | INTEGER | No | `0` | Input tokens consumed |
| `output_tokens` | INTEGER | No | `0` | Output tokens generated |
| `total_tokens` | INTEGER | No | `0` | Sum of input + output |
| `input_cost` | DECIMAL(10,6) | No | `0` | Cost of input tokens (USD) |
| `output_cost` | DECIMAL(10,6) | No | `0` | Cost of output tokens (USD) |
| `total_cost` | DECIMAL(10,6) | No | `0` | Total cost (USD) |
| `created_at` | TIMESTAMP WITH TIME ZONE | No | `NOW()` | Request timestamp |

#### Constraints

- **Primary Key**: `id`
- **Check**: All numeric values >= 0

#### Example Data

```sql
INSERT INTO usage_records (
  user_id, chat_id, model_id, provider_id,
  input_tokens, output_tokens, total_tokens,
  input_cost, output_cost, total_cost
)
VALUES (
  'user_abc123', 'chat_xyz789', 'gpt-4o', 'openai',
  1500, 800, 2300,
  0.00375, 0.008, 0.01175
);
```

#### Usage Pattern

```sql
-- Get user's total usage
SELECT
  SUM(total_cost) as total_spent,
  SUM(total_tokens) as total_tokens,
  COUNT(*) as total_requests
FROM usage_records
WHERE user_id = 'user_abc123';

-- Get chat-specific usage
SELECT *
FROM usage_records
WHERE chat_id = 'chat_xyz789'
ORDER BY created_at ASC;
```

---

### Table: `user_balances`

Maintains current balance for each user.

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `user_id` | TEXT | No | - | User identifier (primary key) |
| `balance` | DECIMAL(10,2) | No | `0` | Current balance (USD) |
| `currency` | TEXT | No | `'USD'` | Currency code |
| `created_at` | TIMESTAMP WITH TIME ZONE | No | `NOW()` | Account creation time |
| `updated_at` | TIMESTAMP WITH TIME ZONE | No | `NOW()` | Last balance change |

#### Constraints

- **Primary Key**: `user_id`
- **Check**: `balance >= 0`

#### Example Data

```sql
INSERT INTO user_balances (user_id, balance, currency)
VALUES ('user_abc123', 10.00, 'USD');
```

#### Usage Pattern

```sql
-- Get user balance
SELECT balance
FROM user_balances
WHERE user_id = 'user_abc123';

-- Update balance (atomic)
UPDATE user_balances
SET balance = balance - 0.01175,
    updated_at = NOW()
WHERE user_id = 'user_abc123'
  AND balance >= 0.01175;
```

## Migrations

### Migration Files

Located in `supabase/migrations/`:

1. **`20251018000001_create_pricing_tables.sql`** - Creates tables, indexes, RLS
2. **`20251018000002_seed_model_pricing.sql`** - Populates initial pricing

### Applying Migrations

#### Option 1: Supabase CLI (Recommended)

```bash
# Link to your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

#### Option 2: Supabase Dashboard

1. Navigate to **SQL Editor** in your Supabase project
2. Open each migration file in order
3. Copy and paste the SQL
4. Execute

#### Option 3: Direct Database Connection

```bash
psql <connection-string> < supabase/migrations/20251018000001_create_pricing_tables.sql
psql <connection-string> < supabase/migrations/20251018000002_seed_model_pricing.sql
```

### Verifying Migrations

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('model_pricing', 'usage_records', 'user_balances');

-- Expected output: 3 rows

-- Check pricing data loaded
SELECT COUNT(*) FROM model_pricing;
-- Expected: 23 rows (all models)

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances');
-- All should have rowsecurity = true
```

## Row Level Security

All tables use RLS to enforce data access control.

### model_pricing Policies

#### SELECT Policy (Anyone can read)
```sql
CREATE POLICY "Anyone can read model pricing"
  ON model_pricing
  FOR SELECT
  TO authenticated
  USING (true);
```

**Why**: Users need pricing to estimate costs before making requests.

#### INSERT/UPDATE Policies (Service role only)
```sql
CREATE POLICY "Service role can insert model pricing"
  ON model_pricing
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update model pricing"
  ON model_pricing
  FOR UPDATE
  TO service_role
  USING (true);
```

**Why**: Only backend can modify pricing to prevent tampering.

---

### usage_records Policies

#### SELECT Policy (Own records only)
```sql
CREATE POLICY "Users can read own usage records"
  ON usage_records
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);
```

**Why**: Users can only see their own usage history.

#### INSERT Policy (Service role only)
```sql
CREATE POLICY "Service role can insert usage records"
  ON usage_records
  FOR INSERT
  TO service_role
  WITH CHECK (true);
```

**Why**: Only backend can record usage to prevent fake entries.

---

### user_balances Policies

#### SELECT Policy (Own balance only)
```sql
CREATE POLICY "Users can read own balance"
  ON user_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);
```

**Why**: Users can only see their own balance.

#### INSERT/UPDATE Policies (Service role only)
```sql
CREATE POLICY "Service role can insert user balances"
  ON user_balances
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update user balances"
  ON user_balances
  FOR UPDATE
  TO service_role
  USING (true);
```

**Why**: Only backend can modify balances to prevent fraud.

---

### Testing RLS Policies

```sql
-- As an authenticated user (should see own data)
SELECT * FROM user_balances WHERE user_id = auth.uid()::text;

-- As an authenticated user (should see nothing)
SELECT * FROM user_balances WHERE user_id != auth.uid()::text;

-- As service role (should see everything)
SELECT * FROM user_balances;
```

## Indexes

Optimized for common query patterns.

### model_pricing Indexes

```sql
CREATE INDEX idx_model_pricing_model_id ON model_pricing(model_id);
CREATE INDEX idx_model_pricing_provider_id ON model_pricing(provider_id);
```

**Benefit**: Fast pricing lookups (< 5ms)

### usage_records Indexes

```sql
CREATE INDEX idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX idx_usage_records_chat_id ON usage_records(chat_id);
CREATE INDEX idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX idx_usage_records_user_created ON usage_records(user_id, created_at);
CREATE INDEX idx_usage_records_model_id ON usage_records(model_id);
```

**Benefit**:
- User queries: < 50ms
- Analytics queries: < 100ms
- Time-range queries: Efficient with composite index

### user_balances Indexes

```sql
CREATE INDEX idx_user_balances_user_id ON user_balances(user_id);
```

**Note**: Already primary key, so inherently indexed.

### Index Maintenance

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Rebuild indexes if needed (rare)
REINDEX TABLE model_pricing;
REINDEX TABLE usage_records;
REINDEX TABLE user_balances;
```

## Common Queries

### Analytics Queries

#### Total Revenue
```sql
SELECT SUM(total_cost) as total_revenue
FROM usage_records;
```

#### Revenue by Model
```sql
SELECT
  provider_id,
  model_id,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  SUM(total_cost) as revenue
FROM usage_records
GROUP BY provider_id, model_id
ORDER BY revenue DESC;
```

#### Daily Usage Trend
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as requests,
  SUM(total_cost) as revenue
FROM usage_records
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### Top Users by Spending
```sql
SELECT
  user_id,
  COUNT(*) as requests,
  SUM(total_cost) as total_spent
FROM usage_records
GROUP BY user_id
ORDER BY total_spent DESC
LIMIT 10;
```

### User Queries

#### User's Last 10 Requests
```sql
SELECT
  chat_id,
  model_id,
  total_tokens,
  total_cost,
  created_at
FROM usage_records
WHERE user_id = 'user_abc123'
ORDER BY created_at DESC
LIMIT 10;
```

#### User's Monthly Spending
```sql
SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(total_cost) as monthly_cost
FROM usage_records
WHERE user_id = 'user_abc123'
  AND created_at >= NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

### Administrative Queries

#### Users with Low Balance
```sql
SELECT user_id, balance
FROM user_balances
WHERE balance < 1.00
ORDER BY balance ASC;
```

#### Users with Negative Balance (should be empty)
```sql
SELECT user_id, balance
FROM user_balances
WHERE balance < 0;
```

#### Pricing Update Needed
```sql
-- Find models in config but not in database
SELECT m.id as model_id, m.provider_id
FROM (SELECT jsonb_array_elements(jsonb_agg((m->>'id', m->>'providerId'))) FROM json_each(...)) m
LEFT JOIN model_pricing mp ON m.id = mp.model_id AND m.provider_id = mp.provider_id
WHERE mp.id IS NULL;
```

## Maintenance

### Updating Pricing

#### Via SQL
```sql
UPDATE model_pricing
SET
  input_price_per_1k_tokens = 0.003,
  output_price_per_1k_tokens = 0.012,
  updated_at = NOW()
WHERE model_id = 'gpt-4o' AND provider_id = 'openai';
```

#### Via Application
```typescript
import { updateModelPricing } from '@/lib/pricing/pricing-service'

await updateModelPricing('gpt-4o', 'openai', 0.003, 0.012)
```

### Adding New Models

```sql
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES ('new-model-id', 'provider-id', 0.001, 0.002)
ON CONFLICT (model_id, provider_id) DO NOTHING;
```

### Archiving Old Data

```sql
-- Create archive table
CREATE TABLE usage_records_archive (LIKE usage_records INCLUDING ALL);

-- Move old records (older than 1 year)
INSERT INTO usage_records_archive
SELECT * FROM usage_records
WHERE created_at < NOW() - INTERVAL '1 year';

-- Delete archived records
DELETE FROM usage_records
WHERE created_at < NOW() - INTERVAL '1 year';

-- Vacuum to reclaim space
VACUUM ANALYZE usage_records;
```

### Database Backups

```bash
# Supabase handles automatic backups
# Manual backup:
pg_dump <connection-string> --table=model_pricing --table=usage_records --table=user_balances > pricing_backup.sql

# Restore:
psql <connection-string> < pricing_backup.sql
```

### Performance Monitoring

```sql
-- Table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances');

-- Row counts
SELECT
  'model_pricing' as table, COUNT(*) as rows FROM model_pricing
UNION ALL
SELECT 'usage_records', COUNT(*) FROM usage_records
UNION ALL
SELECT 'user_balances', COUNT(*) FROM user_balances;

-- Slow queries (if any)
SELECT
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%pricing%' OR query LIKE '%usage_%' OR query LIKE '%balance%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

**Last Updated**: October 2024
**Schema Version**: 1.0.0
