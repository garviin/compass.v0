# Stripe Payment Integration Setup Guide

This guide explains how to set up Stripe payments for user balance top-ups with multi-currency support.

## Overview

The payment system allows users to:
- Add funds to their account balance in their local currency
- View transaction history
- Manage their account balance
- Automatic currency localization based on user preferences

## Prerequisites

1. A Stripe account ([Sign up here](https://dashboard.stripe.com/register))
2. Supabase database with migrations applied
3. Next.js application running

## Setup Steps

### 1. Get Stripe API Keys

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API keys**
3. Copy your keys:
   - **Publishable key** (starts with `pk_test_` for test mode)
   - **Secret key** (starts with `sk_test_` for test mode)

**IMPORTANT**: Use test mode keys for development. Switch to live mode keys only when ready for production.

### 2. Configure Environment Variables

Add the following to your [.env.local](../.env.local) file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Set Up Stripe Webhook

Webhooks are essential for processing successful payments and updating user balances.

#### For Local Development:

1. Install the Stripe CLI:
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe

   # Windows
   scoop install stripe

   # Linux
   # Download from https://github.com/stripe/stripe-cli/releases/latest
   ```

2. Login to Stripe CLI:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to http://localhost:3000/api/payments/webhook
   ```

4. Copy the webhook signing secret (starts with `whsec_`) to your `.env.local`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

#### For Production:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set the endpoint URL to: `https://yourdomain.com/api/payments/webhook`
4. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Copy the **Signing secret** and add it to your production environment variables

### 4. Apply Database Migrations

Run the Supabase migrations to create necessary tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually apply these migrations in order:
# 1. supabase/migrations/20251018000005_create_transactions_table.sql
# 2. supabase/migrations/20251018000006_add_currency_preferences.sql
# 3. supabase/migrations/20251019000001_create_increment_balance_function.sql
```

**Critical Migration**: The `increment_balance` function (migration 20251019000001) is required for atomic balance updates that prevent race conditions.

### 5. Test the Integration

#### Test with Stripe Test Cards:

Use these test card numbers in your application:

| Card Number         | Scenario                    |
| ------------------- | --------------------------- |
| 4242 4242 4242 4242 | Successful payment          |
| 4000 0000 0000 0002 | Card declined               |
| 4000 0025 0000 3155 | Requires authentication     |
| 4000 0000 0000 9995 | Insufficient funds          |

**Details for all test cards:**
- **Expiry**: Any future date (e.g., 12/34)
- **CVC**: Any 3 digits (e.g., 123)
- **ZIP**: Any 5 digits (e.g., 12345)

#### Testing Payment Flow:

1. Start your development server:
   ```bash
   bun dev
   ```

2. Start Stripe webhook forwarding (in another terminal):
   ```bash
   stripe listen --forward-to http://localhost:3000/api/payments/webhook
   ```

3. Log in to your application
4. Navigate to the sidebar or account page
5. Click "Add Funds"
6. Select an amount and currency
7. Enter test card details
8. Verify the payment succeeds and balance updates

## Supported Currencies

The system supports 34+ currencies including:
- USD (US Dollar)
- EUR (Euro)
- GBP (British Pound)
- CAD (Canadian Dollar)
- AUD (Australian Dollar)
- JPY (Japanese Yen)
- And many more...

See [lib/pricing/currency-service.ts](../lib/pricing/currency-service.ts) for the complete list.

## Features

### User Balance Management
- Real-time balance display in sidebar
- Add funds via Stripe
- View transaction history
- Currency localization

### Transaction Tracking
- Complete audit trail of all transactions
- Types: deposits, usage, refunds, adjustments
- Searchable and filterable history

### Security (Production-Ready)
- **Webhook signature verification** - All webhooks verified via Stripe signatures
- **Idempotent payment processing** - Duplicate webhook events automatically detected and skipped
- **Atomic balance updates** - Database-level atomic operations prevent race conditions
- **Admin client for webhooks** - Bypasses RLS for trusted server-side operations
- **Row Level Security (RLS)** - All database tables protected with RLS policies
- **Secure payment processing** - All payments processed securely via Stripe
- **No sensitive payment data stored** - Only Stripe IDs and metadata stored locally

## API Endpoints

### Create Payment Intent
```
POST /api/payments/create-intent
Content-Type: application/json

{
  "amount": 25.00,
  "currency": "USD"
}
```

### Webhook Handler
```
POST /api/payments/webhook
Stripe-Signature: <signature>

<Stripe event payload>
```

### Get Transactions
```
GET /api/transactions?limit=50&offset=0
```

## UI Components

### AddBalanceDialog
Dialog for adding funds to user balance with:
- Currency selector
- Predefined amount buttons
- Custom amount input
- Stripe payment form

Usage:
```tsx
import { AddBalanceDialog } from '@/components/balance/add-balance-dialog'

<AddBalanceDialog
  currentBalance={balance}
  currentCurrency="USD"
  onSuccess={() => console.log('Payment successful')}
/>
```

### TransactionHistory
Table displaying user's transaction history:
```tsx
import { TransactionHistory } from '@/components/balance/transaction-history'

<TransactionHistory userId={userId} limit={50} />
```

## Troubleshooting

### Payments not updating balance

1. **Check webhook is running**: Ensure Stripe CLI is forwarding webhooks (dev) or webhook endpoint is configured (prod)
2. **Verify webhook secret**: Ensure `STRIPE_WEBHOOK_SECRET` matches your Stripe webhook signing secret
3. **Check migrations**: Verify `increment_balance` function exists in database
4. **Check environment variables**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is set for admin operations
5. **Review server logs**: Check for webhook signature verification failures or database errors
6. **Test webhook manually**: Use Stripe Dashboard to resend webhook events for testing

### Currency mismatch errors

Users can only add funds in their account's currency. To change currency:
1. Update the `user_balances.currency` field in database
2. Or implement a currency preference setting

### Test mode vs Live mode

- Always use test mode keys during development
- Stripe Dashboard shows test/live mode toggle
- Test data does not affect real transactions
- Switch to live mode only when ready for production

## Production Checklist

Before going live:

- [ ] **Apply all database migrations** including `increment_balance` function
- [ ] **Verify `SUPABASE_SERVICE_ROLE_KEY`** is set in production environment
- [ ] Switch to live Stripe API keys
- [ ] Configure production webhook endpoint
- [ ] **Test idempotency** by manually resending webhook events in Stripe Dashboard
- [ ] Test with real payment methods (small amounts)
- [ ] **Test concurrent payments** to verify atomic updates work correctly
- [ ] Set up Stripe monitoring and alerts
- [ ] Review and configure Stripe payment settings
- [ ] Enable 3D Secure authentication
- [ ] Configure email receipts in Stripe
- [ ] Set up fraud prevention rules
- [ ] **Test refund process** end-to-end
- [ ] Document payment support procedures
- [ ] Monitor transaction logs for duplicate processing attempts

## Support & Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Currency Support](https://stripe.com/docs/currencies)
- [Next.js + Stripe Guide](https://stripe.com/docs/payments/accept-a-payment?platform=web&ui=elements)

## Security Implementation Details

### Idempotent Webhook Processing
The webhook handler (`app/api/payments/webhook/route.ts`) checks for existing transactions before processing payments, preventing duplicate credits if Stripe retries webhook delivery:

```typescript
const existingTransaction = await getTransactionByPaymentIntent(
  paymentIntent.id,
  true // useAdmin=true for webhook context
)
if (existingTransaction) {
  // Skip duplicate - already processed
  return
}
```

### Atomic Balance Updates
Balance updates use database-level atomic operations via the `increment_balance` PostgreSQL function to prevent race conditions:

```typescript
// Atomic operation - no read-then-write race condition
const { data } = await supabase.rpc('increment_balance', {
  p_user_id: userId,
  p_amount: amount
})
```

This ensures concurrent operations (e.g., simultaneous payment and usage deduction) don't lose updates.

### Admin Client for Webhooks
Webhook handlers use the Supabase admin client (service role) to bypass Row Level Security, since webhooks run without user authentication context:

```typescript
await addBalance(userId, amount, description, paymentIntentId, chargeId, metadata, true)
//                                                                                   ^^^^ useAdmin=true
```

### Refund Support
Refunds are handled automatically via the `charge.refunded` webhook event and use negative amounts to deduct balance atomically.

## Security Best Practices

1. **Never commit API keys** to version control
2. Use environment variables for all secrets
3. Verify webhook signatures (automatically handled)
4. Use HTTPS in production
5. Enable Stripe Radar for fraud prevention
6. Regularly review Stripe Dashboard for suspicious activity
7. Set up alerts for failed payments
8. Keep Stripe SDK updated
9. **Ensure migrations are applied** - The `increment_balance` function is critical for production safety

## Common Issues

### "STRIPE_SECRET_KEY is not defined"
- Ensure `.env.local` has the secret key set
- Restart your development server after adding env vars

### "Webhook signature verification failed"
- Check `STRIPE_WEBHOOK_SECRET` matches the CLI output or Dashboard
- Ensure webhook is being forwarded correctly

### "Unsupported currency"
- Check the currency code is in `lib/pricing/currency-service.ts`
- Verify Stripe supports the currency in your account

## Next Steps

After setup:
1. Test the complete payment flow
2. Customize predefined amounts per currency
3. Set up email notifications for successful payments
4. Configure balance low warnings
5. Implement payment analytics dashboard
