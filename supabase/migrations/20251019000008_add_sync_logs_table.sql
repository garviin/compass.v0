-- Migration: Add sync_logs table for audit trail
-- Purpose: Track all automated and manual sync operations

-- Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'pricing', 'balance', etc.
  source TEXT NOT NULL, -- 'cron', 'manual', 'api'
  success BOOLEAN NOT NULL DEFAULT false,
  changes_applied INTEGER DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB, -- Store detailed sync results
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system'
);

-- Add indexes for common queries
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX idx_sync_logs_source ON sync_logs(source);
CREATE INDEX idx_sync_logs_success ON sync_logs(success);

-- Add comment
COMMENT ON TABLE sync_logs IS 'Audit log for all system synchronization operations';

-- Create RLS policies (assuming we want admins only)
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Admin read policy (you'll need to adjust based on your auth setup)
CREATE POLICY "Admins can view sync logs" ON sync_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- System insert policy (for the cron job and API)
CREATE POLICY "System can insert sync logs" ON sync_logs
  FOR INSERT
  WITH CHECK (true); -- Allow inserts from authenticated connections

-- Grant permissions
GRANT SELECT ON sync_logs TO authenticated;
GRANT INSERT ON sync_logs TO authenticated;
GRANT ALL ON sync_logs TO service_role;