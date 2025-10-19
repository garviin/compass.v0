# Automated Pricing System Documentation

## Overview

The automated pricing system ensures accurate, up-to-date AI model pricing across all providers. It features automatic synchronization, change detection, alert notifications, and comprehensive audit trails.

### Key Features
- 🔄 **Automated Daily Sync** - Scheduled via Vercel Cron at 2 AM UTC
- 🎯 **Smart Change Detection** - Auto-applies minor changes, requires review for major ones
- 📊 **Full Audit Trail** - Database triggers log all pricing changes automatically
- 🔔 **Multi-Channel Alerts** - Slack, email, and console notifications
- 🛡️ **Validation & Safety** - Prevents anomalous pricing updates
- 📈 **Admin Dashboard** - Real-time monitoring and manual controls
- 🔌 **Extensible Architecture** - Easy to add new providers

## Architecture

### Core Components

1. **Provider Registry** (`/lib/pricing/providers/`)
   - Manages pricing data sources (OpenAI, Anthropic, Google)
   - Extensible architecture for adding new providers
   - Automatic provider discovery and registration

2. **Change Detection** (`/lib/pricing/change-detector.ts`)
   - Compares provider pricing with database
   - Smart thresholds for auto-approval:
     - <10% change: Auto-apply
     - 10-50% change: Requires review
     - >50% change: Requires manual review
     - >200% change: Rejected as anomaly

3. **Sync Orchestrator** (`/lib/pricing/sync-orchestrator.ts`)
   - Coordinates the entire sync process
   - Validates pricing data
   - Applies changes to database
   - Triggers alerts

4. **Alert Service** (`/lib/pricing/alert-service.ts`)
   - Slack webhook notifications
   - Email alerts via Resend
   - Console logging for development

5. **Admin APIs** (`/app/api/admin/pricing/`)
   - `/status` - System health and statistics
   - `/sync` - Manual sync trigger
   - `/history` - Price change history

6. **Admin Dashboard** (`/app/admin/pricing/`)
   - Real-time system status
   - Manual sync controls
   - Change history viewer
   - Configuration display

## Database Schema

### Tables

#### `model_pricing`
- Primary pricing data table
- Single source of truth for all pricing
- Fields: model_id, provider_id, input/output prices, verification metadata

#### `model_pricing_history`
- Automatic audit trail via database trigger
- Records all pricing changes
- Fields: old/new prices, change percentage, changed_by, reason

#### `sync_logs`
- Tracks all sync operations
- Success/failure status
- Detailed metadata for debugging

## Quick Start

1. **Apply database migrations:**
   ```bash
   supabase db push
   ```

2. **Set environment variables:**
   ```bash
   # Required
   CRON_SECRET=your-secure-cron-secret

   # Optional (for admin access)
   ADMIN_API_KEY=your-admin-api-key
   ADMIN_EMAILS=admin@example.com
   ```

3. **Deploy to Vercel:**
   The cron job is automatically configured in `vercel.json`

4. **Access admin dashboard:**
   Navigate to `/admin/pricing` (requires admin authentication)

## Setup

### Environment Variables

```bash
# Required for automated sync
CRON_SECRET=your-secure-cron-secret

# Admin access (optional, uses Supabase auth by default)
ADMIN_API_KEY=your-admin-api-key
ADMIN_EMAILS=admin@example.com,team@example.com

# Alerts (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL_RECIPIENTS=team@example.com
ALERT_EMAIL_FROM=pricing@yourdomain.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-resend-key
```

### Database Setup

Apply migrations:
```bash
supabase db push
```

Migrations include:
- `20251019000007_add_pricing_history_and_enhancements.sql` - History table and triggers
- `20251019000008_add_sync_logs_table.sql` - Sync audit logs

## Usage

### Automated Daily Sync

The system automatically syncs daily at 2 AM UTC via Vercel Cron:
- Configured in `vercel.json`
- Endpoint: `/api/cron/pricing-sync`
- Protected by `CRON_SECRET`

### Manual Operations

#### Via Admin Dashboard
1. Navigate to `/admin/pricing`
2. Click "Preview Sync" to see what would change
3. Click "Sync Now" to apply changes

#### Via API
```bash
# Get system status
curl -H "x-api-key: $ADMIN_API_KEY" \
  https://yourapp.com/api/admin/pricing/status

# Trigger sync (dry run)
curl -X POST -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}' \
  https://yourapp.com/api/admin/pricing/sync

# Trigger sync (apply changes)
curl -X POST -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}' \
  https://yourapp.com/api/admin/pricing/sync

# Get change history
curl -H "x-api-key: $ADMIN_API_KEY" \
  https://yourapp.com/api/admin/pricing/history?limit=50
```

#### Via Script
```bash
# Run comprehensive tests
bun run scripts/test-pricing-system.ts

# Test specific providers
bun run scripts/test-pricing-providers.ts
```

## Adding New Providers

1. Create provider class in `/lib/pricing/providers/`:

```typescript
export class NewProvider extends BasePricingProvider {
  constructor() {
    super('new-provider', 'New Provider')
  }

  async fetchPricing(): Promise<PricingFetchResult> {
    // Implement fetching logic
    return {
      success: true,
      pricing: [...],
      timestamp: new Date()
    }
  }
}
```

2. Register in `/lib/pricing/providers/registry.ts`:

```typescript
registry.register(new NewProvider())
```

## Monitoring

### Health Indicators
- **Healthy (80-100%)**: System functioning normally
- **Degraded (50-79%)**: Some issues detected
- **Critical (<50%)**: Immediate attention required

### Common Issues
1. **Stale pricing**: Models not updated in >7 days
2. **Provider failures**: Check API keys and endpoints
3. **Large price changes**: May indicate provider API changes
4. **Sync failures**: Check logs in `sync_logs` table

### Debugging

Check sync logs:
```sql
SELECT * FROM sync_logs
ORDER BY created_at DESC
LIMIT 10;
```

Check recent price changes:
```sql
SELECT * FROM model_pricing_history
ORDER BY created_at DESC
LIMIT 20;
```

Check pricing anomalies:
```sql
SELECT * FROM model_pricing
WHERE input_price_per_1k_tokens = 0
   OR output_price_per_1k_tokens = 0
   OR last_verified_at < NOW() - INTERVAL '7 days';
```

## Alert Configuration

### Slack
1. Create incoming webhook in Slack
2. Set `SLACK_WEBHOOK_URL` environment variable
3. Optionally set `SLACK_CHANNEL` for specific channel

### Email
1. Configure email provider (Resend recommended)
2. Set environment variables:
   - `ALERT_EMAIL_RECIPIENTS` (comma-separated)
   - `ALERT_EMAIL_FROM`
   - `RESEND_API_KEY`

## Security

- Admin endpoints protected by authentication middleware
- Supports both session auth (Supabase) and API key auth
- Cron endpoint protected by secret token
- Database triggers ensure audit trail integrity
- RLS policies restrict access to admin users

## Troubleshooting

### Sync not running automatically
- Check `CRON_SECRET` is set
- Verify Vercel cron configuration
- Check sync_logs for errors

### Pricing not updating
- Verify provider API keys
- Check network connectivity
- Review change detection thresholds
- Check for validation errors in logs

### Alerts not sending
- Verify webhook URL/API keys
- Check alert service configuration
- Test with `scripts/test-pricing-system.ts`

### Database issues
- Ensure migrations are applied
- Check RLS policies
- Verify service role permissions

## Performance Considerations

- Sync typically completes in <5 seconds
- Database queries optimized with indexes
- Caching layer can be added via Redis/Upstash
- Rate limiting built into providers

## Future Enhancements

Potential improvements:
- GraphQL API for real-time updates
- Webhook support for instant provider updates
- Machine learning for anomaly detection
- Multi-region redundancy
- Cost prediction models
- Usage analytics dashboard