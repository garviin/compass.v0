# Pricing System Documentation

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Features](#features)
- [How It Works](#how-it-works)
- [Documentation](#documentation)
- [Support](#support)

## Overview

The Morphic pricing system is a comprehensive pay-per-use billing solution that tracks AI API usage and manages user account balances. It provides direct cost passthrough from AI providers (1:1 pricing, no markup) with real-time usage tracking and balance management.

### Key Benefits

- **Transparent Pricing**: Users pay exactly what providers charge
- **Real-time Tracking**: Every API call is tracked with token counts and costs
- **Balance Management**: Automated deduction with low-balance warnings
- **Detailed Analytics**: Per-chat and user-level usage statistics
- **Scalable Architecture**: Database-first design with caching for performance

## Quick Start

### Prerequisites

- Supabase project configured
- Supabase CLI installed (recommended) OR database access via dashboard
- User authentication system in place

### 5-Minute Setup

#### 1. Apply Database Migrations

```bash
# Using Supabase CLI (recommended)
supabase link --project-ref <your-project-ref>
supabase db push

# Or manually via Supabase Dashboard SQL Editor
# Run files in supabase/migrations/ in order
```

#### 2. Initialize User Balances

Add this to your user signup flow:

```typescript
import { initializeUserBalance } from '@/lib/pricing/balance-service'

// Give new users $10 starting credit
await initializeUserBalance(userId, 10.00)
```

#### 3. Deploy

```bash
bun run build
# Deploy to your platform
```

That's it! The system is now active and tracking usage.

## Features

### Core Capabilities

#### ✅ Usage Tracking
- Automatic recording of all API calls
- Token-level granularity (input/output tokens)
- Per-model cost calculation
- Historical usage data

#### ✅ Balance Management
- User account balances in USD
- Atomic balance operations
- Minimum balance enforcement ($0.01)
- Real-time deductions after each request

#### ✅ Cost Transparency
- Live balance display in UI
- Per-chat cost breakdown
- Token usage statistics
- Cost estimation before requests

#### ✅ Multiple Pricing Sources
1. **Supabase Database** (primary)
   - Update pricing without deployment
   - 5-minute cache for performance
2. **Config File Fallback** (`models.json`)
   - Works offline
   - Development-friendly

#### ✅ Security
- Row Level Security (RLS) policies
- Service-role-only balance updates
- User isolation (can only see own data)

### Supported Models

All 23 configured models have pricing data:
- OpenAI (GPT-4, GPT-4o, GPT-4o mini, o3-mini, etc.)
- Anthropic (Claude 3.5 Sonnet, Claude 3.5 Haiku, etc.)
- Google (Gemini 2.0 Flash, Gemini 2.5 Pro, etc.)
- DeepSeek, Groq, Fireworks, xAI (Grok), Azure

## How It Works

### Request Flow

```
User sends message
    ↓
Check balance ($0.01 minimum)
    ↓ (if sufficient)
Process AI request
    ↓
AI generates response
    ↓
Extract usage data (tokens)
    ↓
Fetch model pricing
    ↓
Calculate cost
    ↓
Record usage to database
    ↓
Deduct from user balance
    ↓
Response delivered to user
```

### For Anonymous Users

Guest users are **not charged** and use the existing free tier system with Redis-based rate limiting.

### Data Flow

1. **Pricing Data**: Database → Cache (5 min) → Service → API
2. **Usage Data**: AI SDK → Handler → Pricing Service → Database
3. **Balance Data**: Database → Service → API → UI

## Documentation

### For Developers

- **[Architecture](./ARCHITECTURE.md)** - System design, components, and technical decisions
- **[Database](./DATABASE.md)** - Schema, migrations, RLS policies
- **[Services](./SERVICES.md)** - Service layer API reference
- **[Examples](./EXAMPLES.md)** - Common usage patterns and code samples

### For Deployment

- **[Deployment Guide](./DEPLOYMENT.md)** - Step-by-step deployment instructions
- **[API Reference](./API_REFERENCE.md)** - HTTP endpoints documentation
- **[UI Components](./UI_COMPONENTS.md)** - Frontend integration guide

### For Operations

- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## Pricing Examples

Based on current provider rates (as of October 2024):

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Est. per message* |
|-------|----------------------|------------------------|-------------------|
| GPT-4o | $2.50 | $10.00 | $0.006 |
| GPT-4o mini | $0.15 | $0.60 | $0.0004 |
| Claude 3.5 Sonnet | $3.00 | $15.00 | $0.009 |
| Claude 3.5 Haiku | $0.80 | $4.00 | $0.0024 |
| Gemini 2.0 Flash | $0.075 | $0.30 | $0.0002 |
| DeepSeek Chat | $0.14 | $0.28 | $0.0002 |

*Estimated cost assumes ~500 input + 500 output tokens per message

## API Quick Reference

### Get User Balance
```bash
GET /api/balance

Response:
{
  "balance": 10.50,
  "currency": "USD"
}
```

### Get Chat Usage
```bash
GET /api/usage/chat/{chatId}

Response:
{
  "totalCost": 0.0234,
  "inputTokens": 1500,
  "outputTokens": 800,
  "totalTokens": 2300
}
```

## Common Tasks

### Add Credits to User
```typescript
import { addBalance } from '@/lib/pricing/balance-service'

await addBalance(userId, 25.00) // Add $25
```

### Update Model Pricing
```typescript
import { updateModelPricing } from '@/lib/pricing/pricing-service'

await updateModelPricing('gpt-4o', 'openai', 0.0025, 0.01)
```

### Get Usage Statistics
```typescript
import { getUserUsageStats } from '@/lib/pricing/usage-tracking'

const stats = await getUserUsageStats(userId)
console.log(stats.totalCost, stats.totalRequests, stats.modelBreakdown)
```

## Support

### Need Help?

1. **Check the documentation** - Start with [Deployment Guide](./DEPLOYMENT.md)
2. **Review examples** - See [Examples](./EXAMPLES.md) for code samples
3. **Troubleshooting** - Check [Troubleshooting Guide](./TROUBLESHOOTING.md)
4. **Database issues** - Review [Database Documentation](./DATABASE.md)

### Common Questions

**Q: How do I give users free credits?**
A: Use `initializeUserBalance(userId, amount)` when they sign up or `addBalance(userId, amount)` anytime.

**Q: Can I change pricing without redeploying?**
A: Yes! Update the `model_pricing` table in Supabase. Changes are cached for 5 minutes.

**Q: What happens if a user runs out of balance?**
A: They receive a 402 Payment Required error. You can catch this in your UI to prompt them to add credits.

**Q: How accurate is cost estimation?**
A: Token estimation is approximate (~4 chars per token). Actual costs are calculated from real usage data returned by the AI SDK.

**Q: Are anonymous users charged?**
A: No. Guest users use the existing free tier rate limiting system.

## Architecture Highlights

- **Database**: Supabase (PostgreSQL) with RLS
- **Caching**: In-memory 5-minute TTL
- **Services**: TypeScript with comprehensive error handling
- **UI**: React components with real-time updates
- **Security**: Row-level security, service-role-only writes

## Next Steps

1. **Deploy** - Follow the [Deployment Guide](./DEPLOYMENT.md)
2. **Integrate** - Add payment processing for credit top-ups
3. **Monitor** - Set up usage analytics and alerts
4. **Customize** - Adjust pricing, add tiers, create promotions

---

**Last Updated**: October 2024
**Version**: 1.0.0
**Status**: Production Ready ✅
