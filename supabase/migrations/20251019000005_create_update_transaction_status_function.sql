-- ============================================================================
-- UPDATE TRANSACTION STATUS FUNCTION
-- ============================================================================
-- This function updates transaction status for reconciliation
-- Used after API calls complete to mark pending transactions as completed
-- Part of Phase 2: Optimized Pre-Deduction
-- ============================================================================

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

-- Add comment for documentation
COMMENT ON FUNCTION update_transaction_status IS 'Updates transaction status for reconciliation. Merges new metadata with existing metadata.';

-- ============================================================================
-- REFUND RESERVED BALANCE FUNCTION
-- ============================================================================
-- This function refunds a previously reserved balance if the API call fails
-- Part of Phase 2: Optimized Pre-Deduction
-- ============================================================================

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

-- Add comment for documentation
COMMENT ON FUNCTION refund_reserved_balance IS 'Refunds a previously reserved balance when API call fails. Creates refund transaction and marks original as failed.';
