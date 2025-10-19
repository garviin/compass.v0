-- Create atomic increment_balance function to prevent race conditions
-- This function updates the balance and returns both old and new values in a single transaction

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

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION increment_balance(TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_balance(TEXT, DECIMAL) TO service_role;

-- Add comment
COMMENT ON FUNCTION increment_balance IS 'Atomically increment user balance and return before/after values. Prevents race conditions in concurrent balance updates.';
