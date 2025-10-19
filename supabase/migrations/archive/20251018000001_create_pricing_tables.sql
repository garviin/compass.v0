-- Use pgcrypto for UUID generation (preferred on Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Model Pricing Table
-- Stores pricing information for each model
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

-- Add indexes for better query performance
CREATE INDEX idx_model_pricing_model_id ON model_pricing(model_id);
CREATE INDEX idx_model_pricing_provider_id ON model_pricing(provider_id);

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for analytics and user lookups
CREATE INDEX idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX idx_usage_records_chat_id ON usage_records(chat_id);
CREATE INDEX idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX idx_usage_records_user_created ON usage_records(user_id, created_at);
CREATE INDEX idx_usage_records_model_id ON usage_records(model_id);

-- User Balances Table
-- Stores current balance for each user
CREATE TABLE IF NOT EXISTS user_balances (
  user_id TEXT PRIMARY KEY,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for balance lookups
CREATE INDEX idx_user_balances_user_id ON user_balances(user_id);

-- Add Row Level Security (RLS) Policies
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

-- Model Pricing Policies
-- Everyone can read pricing (needed for cost estimates)
CREATE POLICY "Anyone can read model pricing"
  ON model_pricing
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update pricing
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

-- Usage Records Policies
-- Users can only read their own usage records
CREATE POLICY "Users can read own usage records"
  ON usage_records
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Service role can insert usage records
CREATE POLICY "Service role can insert usage records"
  ON usage_records
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- User Balances Policies
-- Users can only read their own balance
CREATE POLICY "Users can read own balance"
  ON user_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Service role can manage all balances
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

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_model_pricing_updated_at
  BEFORE UPDATE ON model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_balances_updated_at
  BEFORE UPDATE ON user_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
