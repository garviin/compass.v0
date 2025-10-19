-- ============================================================================
-- COMPLETE DATABASE SCHEMA FOR FRESH DEPLOYMENTS
-- ============================================================================
-- This is a consolidated schema file that includes all tables, functions,
-- policies, and constraints. For fresh deployments, you can run this single
-- file instead of running individual migrations.
--
-- For existing databases, use the incremental migrations in /migrations/
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Model Pricing Table
-- Stores pricing information for each AI model
CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  input_price_per_1k_tokens DECIMAL(10, 6) NOT NULL,
  output_price_per_1k_tokens DECIMAL(10, 6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(model_id, provider_id)
);

-- Usage Records Table
-- Tracks all API usage with token counts and costs
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  output_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  request_id TEXT UNIQUE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Balances Table
-- Stores current balance and currency preferences for each user
CREATE TABLE IF NOT EXISTS user_balances (
  user_id TEXT PRIMARY KEY,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  locale TEXT DEFAULT 'en-US',
  preferred_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_currency CHECK (
    preferred_currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'ILS', 'CLP', 'PHP', 'AED', 'SAR', 'THB', 'IDR', 'MYR', 'KRW', 'TWD', 'VND')
  ),
  CONSTRAINT user_balances_non_negative_balance CHECK (balance >= 0)
);

-- Transactions Table
-- Complete audit trail for all balance changes
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'usage', 'refund', 'adjustment')),
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_before DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT transactions_stripe_payment_intent_id_unique UNIQUE (stripe_payment_intent_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Model Pricing
CREATE INDEX IF NOT EXISTS idx_model_pricing_model_id ON model_pricing(model_id);
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_id ON model_pricing(provider_id);

-- Usage Records
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_chat_id ON usage_records(chat_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_created ON usage_records(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_model_id ON usage_records(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_request_id ON usage_records(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_records_transaction_id ON usage_records(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_records_status ON usage_records(status) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at_desc ON usage_records(created_at DESC);

-- User Balances
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_currency ON user_balances(preferred_currency);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent ON transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create balance record for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_balances (user_id, balance, currency)
  VALUES (NEW.id::text, 0, 'USD')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user currency preference
CREATE OR REPLACE FUNCTION update_user_currency_preference(
  p_user_id TEXT,
  p_currency TEXT,
  p_locale TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_balances
  SET
    preferred_currency = p_currency,
    locale = COALESCE(p_locale, locale),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Atomic balance increment (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_balance(
  p_user_id TEXT,
  p_amount DECIMAL
)
RETURNS TABLE (
  balance_before DECIMAL,
  balance_after DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_before DECIMAL;
  v_balance_after DECIMAL;
BEGIN
  -- Get current balance and update atomically
  UPDATE user_balances
  SET
    balance = balance + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance - p_amount, balance INTO v_balance_before, v_balance_after;

  -- If no row was updated, the user doesn't have a balance record
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User balance record not found for user_id: %', p_user_id;
  END IF;

  -- Return both values
  RETURN QUERY SELECT v_balance_before, v_balance_after;
END;
$$;

-- Reserve balance for API usage (Pre-Deduction Pattern)
CREATE OR REPLACE FUNCTION reserve_balance(
  p_user_id TEXT,
  p_amount DECIMAL,
  p_request_id TEXT,
  p_description TEXT DEFAULT 'API usage (pending)'
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id UUID,
  balance_before DECIMAL,
  balance_after DECIMAL,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance DECIMAL;
  v_currency TEXT;
  v_transaction_id UUID;
BEGIN
  -- Lock the user's balance row for update
  SELECT balance, currency INTO v_balance, v_currency
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user has balance record
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      0::DECIMAL,
      0::DECIMAL,
      'User balance record not found'::TEXT;
    RETURN;
  END IF;

  -- Check if user has sufficient balance
  IF v_balance < p_amount THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      v_balance,
      v_balance,
      format('Insufficient balance: have %s, need %s', v_balance, p_amount)::TEXT;
    RETURN;
  END IF;

  -- Deduct the amount (reserve it)
  UPDATE user_balances
  SET
    balance = balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create a pending transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    description,
    metadata
  )
  VALUES (
    p_user_id,
    'usage',
    p_amount,
    v_currency,
    v_balance,
    v_balance - p_amount,
    p_description,
    jsonb_build_object('request_id', p_request_id, 'status', 'pending')
  )
  RETURNING id INTO v_transaction_id;

  -- Return success with transaction details
  RETURN QUERY SELECT
    TRUE,
    v_transaction_id,
    v_balance,
    v_balance - p_amount,
    'Balance reserved successfully'::TEXT;
END;
$$;

-- Update transaction status for reconciliation
CREATE OR REPLACE FUNCTION update_transaction_status(
  p_transaction_id UUID,
  p_status TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate status
  IF p_status NOT IN ('pending', 'completed', 'failed', 'refunded') THEN
    RAISE EXCEPTION 'Invalid transaction status: %', p_status;
  END IF;

  -- Update transaction metadata with status
  UPDATE transactions
  SET
    metadata = CASE
      WHEN p_metadata IS NOT NULL THEN
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('status', p_status) || p_metadata
      ELSE
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('status', p_status)
    END,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  RETURN FOUND;
END;
$$;

-- Refund reserved balance if API call fails
CREATE OR REPLACE FUNCTION refund_reserved_balance(
  p_user_id TEXT,
  p_amount DECIMAL,
  p_transaction_id UUID,
  p_description TEXT DEFAULT 'API usage refund (failed request)'
)
RETURNS TABLE (
  success BOOLEAN,
  balance_after DECIMAL,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_after DECIMAL;
BEGIN
  -- Add the amount back to user's balance
  UPDATE user_balances
  SET
    balance = balance + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance_after;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      0::DECIMAL,
      'User balance record not found'::TEXT;
    RETURN;
  END IF;

  -- Mark the original transaction as failed
  UPDATE transactions
  SET
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('status', 'failed'),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- Create a refund transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    description,
    metadata
  )
  SELECT
    p_user_id,
    'refund',
    p_amount,
    currency,
    v_balance_after - p_amount,
    v_balance_after,
    p_description,
    jsonb_build_object('original_transaction_id', p_transaction_id, 'status', 'completed')
  FROM user_balances
  WHERE user_id = p_user_id;

  -- Return success
  RETURN QUERY SELECT
    TRUE,
    v_balance_after,
    'Balance refunded successfully'::TEXT;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps on model_pricing changes
CREATE TRIGGER update_model_pricing_updated_at
  BEFORE UPDATE ON model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamps on user_balances changes
CREATE TRIGGER update_user_balances_updated_at
  BEFORE UPDATE ON user_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-create balance for new users
-- Note: This trigger assumes auth.users table exists (standard Supabase setup)
-- If auth.users doesn't exist yet, this trigger will be created but won't fire until it does
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Model Pricing Policies
CREATE POLICY "Anyone can read model pricing"
  ON model_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert model pricing"
  ON model_pricing FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update model pricing"
  ON model_pricing FOR UPDATE
  TO service_role
  USING (true);

-- Usage Records Policies
CREATE POLICY "Users can read own usage records"
  ON usage_records FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can insert usage records"
  ON usage_records FOR INSERT
  TO service_role
  WITH CHECK (true);

-- User Balances Policies
CREATE POLICY "Users can read own balance"
  ON user_balances FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own balance"
  ON user_balances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Service role can insert user balances"
  ON user_balances FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update user balances"
  ON user_balances FOR UPDATE
  TO service_role
  USING (true);

-- Transactions Policies
CREATE POLICY "Users can read own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can insert transactions"
  ON transactions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update transactions"
  ON transactions FOR UPDATE
  TO service_role
  USING (true);

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_currency_preference(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_currency_preference(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION increment_balance(TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_balance(TEXT, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_balance(TEXT, DECIMAL, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_transaction_status(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION refund_reserved_balance(TEXT, DECIMAL, UUID, TEXT) TO service_role;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE transactions IS 'Audit trail for all user balance changes including deposits, usage, refunds, and adjustments';
COMMENT ON TABLE usage_records IS 'Tracks all API usage with token counts, costs, and links to balance transactions for reconciliation';
COMMENT ON COLUMN transactions.type IS 'Transaction type: deposit (payment), usage (API costs), refund (payment refund), adjustment (admin correction)';
COMMENT ON COLUMN transactions.stripe_payment_intent_id IS 'Stripe Payment Intent ID for deposit transactions';
COMMENT ON COLUMN transactions.metadata IS 'Extensible JSON field for additional transaction data including status for reconciliation';
COMMENT ON COLUMN user_balances.locale IS 'User locale for number and currency formatting (e.g., en-US, fr-FR, de-DE)';
COMMENT ON COLUMN user_balances.preferred_currency IS 'User preferred currency code (ISO 4217 format)';
COMMENT ON COLUMN usage_records.request_id IS 'Unique identifier for idempotency - prevents duplicate billing for retried requests';
COMMENT ON COLUMN usage_records.transaction_id IS 'Links usage record to the balance transaction that debited the user account';
COMMENT ON COLUMN usage_records.status IS 'Lifecycle status: pending (reserved), completed (charged), failed (refunded), refunded (manually refunded)';
COMMENT ON FUNCTION increment_balance IS 'Atomically increment user balance and return before/after values. Prevents race conditions in concurrent balance updates.';
COMMENT ON FUNCTION update_user_currency_preference IS 'Updates user currency and locale preferences';
COMMENT ON FUNCTION reserve_balance IS 'Atomically reserves balance for API usage. Checks sufficient funds and creates pending transaction in single atomic operation.';
COMMENT ON FUNCTION update_transaction_status IS 'Updates transaction status for reconciliation. Merges new metadata with existing metadata.';
COMMENT ON FUNCTION refund_reserved_balance IS 'Refunds a previously reserved balance when API call fails. Creates refund transaction and marks original as failed.';
COMMENT ON CONSTRAINT transactions_stripe_payment_intent_id_unique ON transactions IS 'Ensures each Stripe payment intent can only create one transaction, preventing race conditions in webhook processing';

-- ============================================================================
-- SEED DATA (Optional - Model Pricing)
-- ============================================================================
-- Uncomment and run the migration file 20251018000002_seed_model_pricing.sql
-- if you need initial model pricing data
