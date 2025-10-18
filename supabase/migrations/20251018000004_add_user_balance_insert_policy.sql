-- Add RLS policy to allow authenticated users to insert their own balance
-- This serves as a backup if the trigger fails for any reason
CREATE POLICY "Users can insert own balance on signup"
  ON user_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);
