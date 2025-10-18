-- Add currency preference and locale support to user_balances table
-- This allows users to view their balance in their preferred currency

-- Add new columns to user_balances
ALTER TABLE user_balances
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD';

-- Add constraint to ensure valid currency codes (ISO 4217)
ALTER TABLE user_balances
  ADD CONSTRAINT valid_currency CHECK (
    preferred_currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'ILS', 'CLP', 'PHP', 'AED', 'SAR', 'THB', 'IDR', 'MYR', 'KRW', 'TWD', 'VND')
  );

-- Add index for currency lookups
CREATE INDEX idx_user_balances_currency ON user_balances(preferred_currency);

-- Update existing records to have default locale and currency
UPDATE user_balances
SET
  locale = 'en-US',
  preferred_currency = currency
WHERE locale IS NULL OR preferred_currency IS NULL;

-- Add helpful comments
COMMENT ON COLUMN user_balances.locale IS 'User locale for number and currency formatting (e.g., en-US, fr-FR, de-DE)';
COMMENT ON COLUMN user_balances.preferred_currency IS 'User preferred currency code (ISO 4217 format)';

-- Create function to update user currency preference
CREATE OR REPLACE FUNCTION update_user_currency_preference(
  p_user_id TEXT,
  p_currency TEXT,
  p_locale TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_balances
  SET
    preferred_currency = p_currency,
    locale = COALESCE(p_locale, locale),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_user_currency_preference TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_currency_preference TO service_role;

COMMENT ON FUNCTION update_user_currency_preference IS 'Updates user currency and locale preferences';
