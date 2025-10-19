-- Add unique constraint on stripe_payment_intent_id to prevent duplicate transactions
-- This ensures database-level idempotency protection against race conditions

-- First, remove any existing duplicates (keep oldest transaction per payment intent)
DELETE FROM transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY stripe_payment_intent_id
             ORDER BY created_at ASC
           ) as rn
    FROM transactions
    WHERE stripe_payment_intent_id IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Add unique constraint
ALTER TABLE transactions
ADD CONSTRAINT transactions_stripe_payment_intent_id_unique
UNIQUE (stripe_payment_intent_id);

-- Add comment
COMMENT ON CONSTRAINT transactions_stripe_payment_intent_id_unique ON transactions
IS 'Ensures each Stripe payment intent can only create one transaction, preventing race conditions in webhook processing';
