-- ============================================================================
-- PRICING HISTORY AND ENHANCEMENTS
-- ============================================================================
-- This migration adds comprehensive pricing change tracking and metadata
-- Part of automated pricing system implementation
-- ============================================================================

-- ============================================================================
-- 1. CREATE PRICING HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,

  -- Old pricing (NULL for first entry)
  old_input_price DECIMAL(10, 6),
  old_output_price DECIMAL(10, 6),

  -- New pricing
  new_input_price DECIMAL(10, 6) NOT NULL,
  new_output_price DECIMAL(10, 6) NOT NULL,

  -- Change metrics
  change_percent_input DECIMAL(7, 2), -- -100.00 to 9999.99
  change_percent_output DECIMAL(7, 2),

  -- Audit trail
  changed_by TEXT NOT NULL, -- 'auto-sync', 'admin:user@example.com', 'manual', 'cron-job'
  change_source TEXT, -- 'openai-api', 'anthropic-docs', 'manual', 'models-json-sync'
  change_reason TEXT, -- Human-readable reason

  -- Additional context
  metadata JSONB, -- Flexible storage for sync job details, errors, etc.

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pricing_history_model
ON model_pricing_history(model_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_pricing_history_date
ON model_pricing_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_history_changed_by
ON model_pricing_history(changed_by);

-- Comments for documentation
COMMENT ON TABLE model_pricing_history IS 'Complete audit trail of all pricing changes for compliance and debugging';
COMMENT ON COLUMN model_pricing_history.change_percent_input IS 'Percentage change for input pricing: ((new - old) / old) * 100';
COMMENT ON COLUMN model_pricing_history.change_percent_output IS 'Percentage change for output pricing: ((new - old) / old) * 100';
COMMENT ON COLUMN model_pricing_history.changed_by IS 'Who/what triggered the change (user, system, cron job)';
COMMENT ON COLUMN model_pricing_history.change_source IS 'Where the pricing data came from (provider API, docs, manual update)';
COMMENT ON COLUMN model_pricing_history.metadata IS 'Additional context: sync job ID, errors, provider response, etc.';

-- ============================================================================
-- 2. ENHANCE MODEL_PRICING TABLE
-- ============================================================================

-- Add verification tracking columns
ALTER TABLE model_pricing
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS verified_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS verification_metadata JSONB;

-- Comments for new columns
COMMENT ON COLUMN model_pricing.last_verified_at IS 'Last time pricing was verified against provider source';
COMMENT ON COLUMN model_pricing.verified_source IS 'Where this pricing was last verified from (openai-api, anthropic-docs, manual, etc.)';
COMMENT ON COLUMN model_pricing.is_active IS 'Whether this model is currently active and should be synced';
COMMENT ON COLUMN model_pricing.verification_metadata IS 'Additional verification context: provider response, sync job details, etc.';

-- Index for active models
CREATE INDEX IF NOT EXISTS idx_model_pricing_active
ON model_pricing(is_active) WHERE is_active = true;

-- Index for stale pricing detection
CREATE INDEX IF NOT EXISTS idx_model_pricing_verification_date
ON model_pricing(last_verified_at);

-- ============================================================================
-- 3. TRIGGER FOR AUTOMATIC HISTORY LOGGING
-- ============================================================================

-- Function to log pricing changes automatically
CREATE OR REPLACE FUNCTION log_pricing_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if pricing actually changed
  IF (OLD.input_price_per_1k_tokens != NEW.input_price_per_1k_tokens) OR
     (OLD.output_price_per_1k_tokens != NEW.output_price_per_1k_tokens) THEN

    INSERT INTO model_pricing_history (
      model_id,
      provider_id,
      old_input_price,
      old_output_price,
      new_input_price,
      new_output_price,
      change_percent_input,
      change_percent_output,
      changed_by,
      change_source,
      change_reason,
      metadata
    )
    VALUES (
      NEW.model_id,
      NEW.provider_id,
      OLD.input_price_per_1k_tokens,
      OLD.output_price_per_1k_tokens,
      NEW.input_price_per_1k_tokens,
      NEW.output_price_per_1k_tokens,
      -- Calculate percentage change (handle division by zero)
      CASE
        WHEN OLD.input_price_per_1k_tokens > 0 THEN
          ROUND(((NEW.input_price_per_1k_tokens - OLD.input_price_per_1k_tokens) / OLD.input_price_per_1k_tokens * 100)::numeric, 2)
        ELSE NULL
      END,
      CASE
        WHEN OLD.output_price_per_1k_tokens > 0 THEN
          ROUND(((NEW.output_price_per_1k_tokens - OLD.output_price_per_1k_tokens) / OLD.output_price_per_1k_tokens * 100)::numeric, 2)
        ELSE NULL
      END,
      COALESCE(NEW.verified_source, 'unknown'),
      NEW.verified_source,
      NULL, -- change_reason will be set by application if provided
      NEW.verification_metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on model_pricing updates
DROP TRIGGER IF EXISTS trigger_log_pricing_change ON model_pricing;
CREATE TRIGGER trigger_log_pricing_change
  AFTER UPDATE ON model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION log_pricing_change();

COMMENT ON FUNCTION log_pricing_change IS 'Automatically logs all pricing changes to model_pricing_history table';

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

-- Enable RLS on pricing history
ALTER TABLE model_pricing_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read pricing history
CREATE POLICY "Anyone can read pricing history"
  ON model_pricing_history FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update pricing history
CREATE POLICY "Service role can insert pricing history"
  ON model_pricing_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to get pricing change history for a model
CREATE OR REPLACE FUNCTION get_pricing_history(
  p_model_id TEXT,
  p_provider_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  old_input_price DECIMAL,
  old_output_price DECIMAL,
  new_input_price DECIMAL,
  new_output_price DECIMAL,
  change_percent_input DECIMAL,
  change_percent_output DECIMAL,
  changed_by TEXT,
  change_source TEXT,
  change_reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    id,
    old_input_price,
    old_output_price,
    new_input_price,
    new_output_price,
    change_percent_input,
    change_percent_output,
    changed_by,
    change_source,
    change_reason,
    created_at as changed_at
  FROM model_pricing_history
  WHERE model_id = p_model_id AND provider_id = p_provider_id
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_pricing_history IS 'Get pricing change history for a specific model';

-- ============================================================================
-- 6. INITIAL DATA POPULATION
-- ============================================================================

-- Update existing pricing records with verification metadata
UPDATE model_pricing
SET
  last_verified_at = COALESCE(updated_at, NOW()),
  verified_source = 'models-json-sync',
  is_active = true,
  verification_metadata = jsonb_build_object(
    'initial_sync', true,
    'synced_at', NOW(),
    'source', 'database-migration'
  )
WHERE last_verified_at IS NULL;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION log_pricing_change() TO service_role;
GRANT EXECUTE ON FUNCTION get_pricing_history(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pricing_history(TEXT, TEXT, INTEGER) TO service_role;
