-- ============================================================================
-- SCHEMA VERIFICATION SCRIPT
-- ============================================================================
-- Run this in your Supabase SQL Editor to verify the current schema
-- Compare the output with supabase/schema.sql to ensure accuracy
-- ============================================================================

-- 1. Check all tables exist
SELECT
  'TABLES' as category,
  table_name,
  'EXISTS' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')
ORDER BY table_name;

-- 2. Check all columns in each table
SELECT
  'COLUMNS: model_pricing' as category,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'model_pricing'
ORDER BY ordinal_position;

SELECT
  'COLUMNS: usage_records' as category,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'usage_records'
ORDER BY ordinal_position;

SELECT
  'COLUMNS: user_balances' as category,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_balances'
ORDER BY ordinal_position;

SELECT
  'COLUMNS: transactions' as category,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transactions'
ORDER BY ordinal_position;

-- 3. Check all indexes
SELECT
  'INDEXES' as category,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')
ORDER BY tablename, indexname;

-- 4. Check all functions
SELECT
  'FUNCTIONS' as category,
  proname as function_name,
  pg_get_function_result(oid) as return_type,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname IN ('increment_balance', 'handle_new_user', 'update_user_currency_preference', 'update_updated_at_column', 'reserve_balance', 'update_transaction_status', 'refund_reserved_balance')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;

-- 5. Check all triggers
SELECT
  'TRIGGERS' as category,
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('model_pricing', 'usage_records', 'user_balances', 'transactions', 'users')
ORDER BY event_object_table, trigger_name;

-- 6. Check all constraints
SELECT
  'CONSTRAINTS' as category,
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')
ORDER BY table_name, constraint_type, constraint_name;

-- 7. Check RLS policies
SELECT
  'RLS POLICIES' as category,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')
ORDER BY tablename, policyname;

-- 8. Check if RLS is enabled
SELECT
  'RLS ENABLED' as category,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')
ORDER BY tablename;

-- 9. Summary
SELECT
  'SUMMARY' as category,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')) as total_tables,
  (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('increment_balance', 'handle_new_user', 'update_user_currency_preference', 'update_updated_at_column', 'reserve_balance', 'update_transaction_status', 'refund_reserved_balance') AND pronamespace = 'public'::regnamespace) as total_functions,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')) as total_indexes,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('model_pricing', 'usage_records', 'user_balances', 'transactions')) as total_policies;

-- Expected Results:
-- total_tables: 4
-- total_functions: 7
-- total_indexes: 18+
-- total_policies: 11+
