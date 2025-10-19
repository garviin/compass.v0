-- ============================================================================
-- ADD BALANCE CONSTRAINT
-- ============================================================================
-- This migration adds a check constraint to prevent negative balances
-- This is a safety measure to ensure users can't spend beyond their balance
-- even in the case of race conditions or bugs
-- ============================================================================

-- Add constraint to prevent negative balances
ALTER TABLE user_balances
ADD CONSTRAINT user_balances_non_negative_balance
CHECK (balance >= 0);

-- Add comment for documentation
COMMENT ON CONSTRAINT user_balances_non_negative_balance ON user_balances IS 'Ensures users cannot have negative balances - prevents overspending even in race conditions';
