-- Seed model pricing with current provider rates (as of October 2024)
-- All prices are per 1,000 tokens in USD

-- OpenAI Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('gpt-4.1', 'openai', 0.01, 0.03),
  ('gpt-4.1-mini', 'openai', 0.0005, 0.0015),
  ('gpt-4.1-nano', 'openai', 0.0001, 0.0003),
  ('o3-mini', 'openai', 0.0015, 0.006),
  ('gpt-4o', 'openai', 0.0025, 0.01),
  ('gpt-4o-mini', 'openai', 0.00015, 0.0006)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- Anthropic Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('claude-3-7-sonnet-20250219', 'anthropic', 0.003, 0.015),
  ('claude-3-5-sonnet-latest', 'anthropic', 0.003, 0.015),
  ('claude-3-5-haiku-20241022', 'anthropic', 0.0008, 0.004)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- Google Generative AI Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('gemini-2.0-flash', 'google', 0.000075, 0.0003),
  ('gemini-2.0-flash-thinking-exp-01-21', 'google', 0.000075, 0.0003),
  ('gemini-2.5-pro-exp-03-25', 'google', 0.00125, 0.005)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- DeepSeek Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('deepseek-reasoner', 'deepseek', 0.00055, 0.0022),
  ('deepseek-chat', 'deepseek', 0.00014, 0.00028)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- Groq Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('deepseek-r1-distill-llama-70b', 'groq', 0.00059, 0.00079),
  ('meta-llama/llama-4-maverick-17b-128e-instruct', 'groq', 0.0002, 0.0002)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- Fireworks Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('accounts/fireworks/models/deepseek-r1', 'fireworks', 0.0002, 0.0002),
  ('accounts/fireworks/models/llama4-maverick-instruct-basic', 'fireworks', 0.0002, 0.0002)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- xAI Models
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('grok-2-1212', 'xai', 0.002, 0.01),
  ('grok-2-vision-1212', 'xai', 0.002, 0.01),
  ('grok-3-beta', 'xai', 0.005, 0.015)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- Azure OpenAI (typically same pricing as OpenAI, using GPT-4o as default)
-- Note: Actual Azure deployment pricing may vary
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('<AZURE_DEPLOYMENT_NAME>', 'azure', 0.0025, 0.01)
ON CONFLICT (model_id, provider_id) DO NOTHING;

-- OpenAI Compatible (generic placeholder - should be configured per deployment)
INSERT INTO model_pricing (model_id, provider_id, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES
  ('<OPENAI_COMPATIBLE_MODEL>', 'openai-compatible', 0.001, 0.002)
ON CONFLICT (model_id, provider_id) DO NOTHING;
