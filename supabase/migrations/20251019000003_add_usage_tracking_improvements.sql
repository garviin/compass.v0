-- ============================================================================
-- USAGE TRACKING IMPROVEMENTS
-- ============================================================================
-- This migration adds robust tracking capabilities to prevent duplicate billing,
-- link usage to transactions, and enable reconciliation
-- ============================================================================

-- Add request_id for idempotency (prevents duplicate billing)
ALTER TABLE usage_records
ADD COLUMN IF NOT EXISTS request_id TEXT UNIQUE;

-- Add transaction_id to link usage records to balance transactions
ALTER TABLE usage_records
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- Add status column for tracking lifecycle
ALTER TABLE usage_records
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'
CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));

-- Create indexes for efficient reconciliation queries
CREATE INDEX IF NOT EXISTS idx_usage_records_request_id
ON usage_records(request_id) WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_records_transaction_id
ON usage_records(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_records_status
ON usage_records(status) WHERE status IN ('pending', 'failed');

-- Create index for recent records reconciliation
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at
ON usage_records(created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN usage_records.request_id IS 'Unique identifier for idempotency - prevents duplicate billing for retried requests';
COMMENT ON COLUMN usage_records.transaction_id IS 'Links usage record to the balance transaction that debited the user account';
COMMENT ON COLUMN usage_records.status IS 'Lifecycle status: pending (reserved), completed (charged), failed (refunded), refunded (manually refunded)';
