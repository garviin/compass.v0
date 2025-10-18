-- Create transactions table for tracking all balance changes
-- This provides a complete audit trail of deposits, usage, and refunds

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'usage', 'refund', 'adjustment')),
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_before DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  -- Stripe-related fields
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  -- Additional metadata for extensibility
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_stripe_payment_intent ON transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own transactions
CREATE POLICY "Users can read own transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Service role can insert transactions (deposits from payments, usage tracking)
CREATE POLICY "Service role can insert transactions"
  ON transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update transactions (for refunds, corrections)
CREATE POLICY "Service role can update transactions"
  ON transactions
  FOR UPDATE
  TO service_role
  USING (true);

-- Anonymous users can't access transactions
-- (Guest users don't have balances or transactions)

-- Add helpful comment
COMMENT ON TABLE transactions IS 'Audit trail for all user balance changes including deposits, usage, refunds, and adjustments';
COMMENT ON COLUMN transactions.type IS 'Transaction type: deposit (payment), usage (API costs), refund (payment refund), adjustment (admin correction)';
COMMENT ON COLUMN transactions.stripe_payment_intent_id IS 'Stripe Payment Intent ID for deposit transactions';
COMMENT ON COLUMN transactions.metadata IS 'Extensible JSON field for additional transaction data';
