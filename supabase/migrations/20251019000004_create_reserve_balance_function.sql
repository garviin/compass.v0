-- ============================================================================
-- RESERVE BALANCE FUNCTION (Pre-Deduction Pattern)
-- ============================================================================
-- This function atomically reserves balance for API usage before the request
-- Prevents users from using API without sufficient funds
-- Part of Phase 2: Optimized Pre-Deduction
-- ============================================================================

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

-- Add comment for documentation
COMMENT ON FUNCTION reserve_balance IS 'Atomically reserves balance for API usage. Checks sufficient funds and creates pending transaction in single atomic operation.';
