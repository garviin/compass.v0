# Database Migrations

This directory contains archived migrations for reference and version control.

## For Fresh Deployments

**Use the consolidated schema instead:**
```
supabase/schema.sql
```

This single file contains the complete current schema and is much faster to deploy.

## For Existing Databases

If you need to apply incremental migrations, run the files in chronological order:

1. `20251018000001_create_pricing_tables.sql`
2. `20251018000002_seed_model_pricing.sql` (optional)
3. `20251018000003_create_user_balance_trigger.sql`
4. `20251018000004_add_user_balance_insert_policy.sql`
5. `20251018000005_create_transactions_table.sql`
6. `20251018000006_add_currency_preferences.sql`
7. `20251019000001_create_increment_balance_function.sql`
8. `20251019000002_add_unique_payment_intent_constraint.sql`
9. `20251019000003_add_usage_tracking_improvements.sql`
10. `20251019000004_create_reserve_balance_function.sql`
11. `20251019000005_create_update_transaction_status_function.sql`

## Documentation

See [DATABASE_SETUP.md](../../docs/DATABASE_SETUP.md) for complete setup instructions.
