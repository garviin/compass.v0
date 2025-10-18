# Pricing System Architecture

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Design Decisions](#design-decisions)
- [Technology Stack](#technology-stack)
- [Security Architecture](#security-architecture)
- [Performance Considerations](#performance-considerations)

## System Overview

The pricing system is built on a **database-first** architecture that provides real-time usage tracking, automated cost calculation, and user balance management for AI API consumption.

### Core Principles

1. **Accuracy**: Every token is tracked and billed accurately
2. **Transparency**: Users can see exactly what they're paying for
3. **Reliability**: Failures in pricing don't break the chat experience
4. **Performance**: Caching minimizes database queries
5. **Security**: RLS policies prevent unauthorized access
6. **Scalability**: Database-driven design supports growth

## Component Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────────────┐         ┌──────────────────────┐     │
│  │ BalanceDisplay   │         │ ChatCostDisplay      │     │
│  │ Component        │         │ Component            │     │
│  └──────────────────┘         └──────────────────────┘     │
└────────────┬─────────────────────────────┬─────────────────┘
             │                             │
             │ GET /api/balance            │ GET /api/usage/chat/{id}
             │                             │
┌────────────▼─────────────────────────────▼─────────────────┐
│                    API Layer (Next.js)                      │
│  ┌──────────────────┐         ┌──────────────────────┐     │
│  │ Balance Endpoint │         │ Usage Endpoint       │     │
│  └──────────────────┘         └──────────────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Chat API Route (/api/chat)                  │  │
│  │  - Balance Check (pre-request)                       │  │
│  │  - Stream Handling                                   │  │
│  │  - Usage Tracking (post-request)                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────┬──────────────┘
             │                                │
             │ Services                       │ Streaming
             │                                │
┌────────────▼────────────────────────────────▼──────────────┐
│                    Service Layer                            │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Pricing Service │  │ Usage Track  │  │ Balance Svc   │ │
│  │ - Get pricing   │  │ - Record use │  │ - Get balance │ │
│  │ - Cache (5min)  │  │ - Query data │  │ - Add/deduct  │ │
│  │ - Fallback cfg  │  │ - Statistics │  │ - Initialize  │ │
│  └─────────────────┘  └──────────────┘  └───────────────┘ │
└────────────┬────────────────────────────────┬──────────────┘
             │                                │
             │ Supabase Client                │ Fallback
             │                                │
┌────────────▼────────────────────────────────▼──────────────┐
│                    Data Layer                               │
│  ┌──────────────────┐         ┌──────────────────────┐     │
│  │ Supabase (RLS)   │         │ models.json (Config) │     │
│  │ - model_pricing  │         │ - Pricing fallback   │     │
│  │ - usage_records  │         │ - Development mode   │     │
│  │ - user_balances  │         └──────────────────────┘     │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. Frontend Layer
- **Components**: Display balance and cost information
- **Hooks**: Fetch and manage pricing data state
- **Updates**: Real-time balance and cost tracking

#### 2. API Layer
- **Route Handlers**: Process HTTP requests
- **Balance Checking**: Pre-request validation
- **Error Handling**: Return appropriate status codes

#### 3. Service Layer
- **Pricing Service**: Manage model pricing with caching
- **Usage Tracking**: Record and query usage data
- **Balance Service**: Atomic balance operations
- **Cost Estimation**: Pre-request cost calculation

#### 4. Data Layer
- **Supabase**: Primary data store with RLS
- **Config Files**: Fallback pricing source
- **Caching**: In-memory pricing cache (5min TTL)

## Data Flow

### Request Processing Flow

```
1. User sends chat message
       ↓
2. GET /api/chat receives request
       ↓
3. Get userId from auth context
       ↓
4. Check if anonymous
       ├─ Yes → Use free tier limits (existing system)
       └─ No → Continue to balance check
              ↓
5. getUserBalance(userId)
       ↓
6. balance < $0.01 ?
       ├─ Yes → Return 402 Payment Required
       └─ No → Continue processing
              ↓
7. Process AI request (Vercel AI SDK)
       ↓
8. Stream response to user
       ↓
9. onFinish callback triggered
       ↓
10. Extract usage data (promptTokens, completionTokens)
       ↓
11. Get model pricing (DB → Cache → Config fallback)
       ↓
12. Calculate cost (tokens × pricing)
       ↓
13. Record usage to database
       ↓
14. Deduct cost from balance
       ↓
15. Complete request
```

### Pricing Data Flow

```
Request for pricing
       ↓
Check in-memory cache (5min TTL)
       ├─ Cache hit → Return cached pricing
       └─ Cache miss ↓
              ↓
Query Supabase model_pricing table
       ├─ Success → Cache result → Return pricing
       └─ Failure ↓
              ↓
Fallback to models.json
       ↓
Return pricing (or null if not found)
```

### Balance Update Flow

```
Usage recorded with cost
       ↓
Get current user balance
       ↓
Calculate new balance (current - cost)
       ↓
Update user_balances table (atomic operation)
       ├─ Success → Balance updated
       └─ Failure → Log warning (doesn't break chat)
```

## Design Decisions

### Why Database-First?

**Decision**: Primary pricing source is Supabase, with config file as fallback.

**Rationale**:
- ✅ Update pricing without redeployment
- ✅ Historical pricing data for analytics
- ✅ Enables dynamic pricing strategies
- ✅ Audit trail for pricing changes
- ✅ Supports A/B testing and promotions

**Trade-offs**:
- ⚠️ Requires database connection
- ⚠️ Slight latency vs pure config
- ✅ Mitigated by 5-minute cache

### Why 5-Minute Cache TTL?

**Decision**: Cache pricing data for 5 minutes in-memory.

**Rationale**:
- ✅ Reduces database load significantly
- ✅ Fast lookups (nanoseconds vs milliseconds)
- ✅ Short enough for pricing updates to propagate quickly
- ✅ No external cache service needed (Redis, etc.)

**Trade-offs**:
- ⚠️ Up to 5-minute delay for pricing changes
- ⚠️ Memory usage per server instance
- ✅ Acceptable for pricing data (changes infrequently)

### Why Service Role for Balance Updates?

**Decision**: All balance modifications happen server-side via service role.

**Rationale**:
- ✅ Prevents client tampering
- ✅ Atomic operations (no race conditions)
- ✅ Centralized logic for auditing
- ✅ Consistent error handling

**Trade-offs**:
- ⚠️ Can't use client-side Supabase SDK for balance
- ✅ This is intentional for security

### Why Graceful Failure?

**Decision**: Usage tracking failures don't break chat functionality.

**Rationale**:
- ✅ User experience is paramount
- ✅ Temporary billing issues shouldn't block service
- ✅ Logs warnings for manual review
- ✅ Can backfill missing data if needed

**Trade-offs**:
- ⚠️ Potential revenue loss if tracking consistently fails
- ✅ Monitor logs to catch issues early

### Why Separate Tables?

**Decision**: Three tables instead of one combined table.

**Rationale**:
- ✅ `model_pricing`: Shared across all users, infrequently updated
- ✅ `usage_records`: High write volume, user-specific
- ✅ `user_balances`: Single row per user, frequently updated
- ✅ Better indexing strategy per table
- ✅ Easier to query and optimize individually

**Trade-offs**:
- ⚠️ Requires joins for some queries
- ✅ Performance benefits outweigh complexity

## Technology Stack

### Core Technologies

| Component | Technology | Why? |
|-----------|-----------|------|
| Database | Supabase (PostgreSQL) | RLS, real-time, managed |
| Caching | In-memory Map | Simple, fast, no dependencies |
| API | Next.js API Routes | Integrated with app, TypeScript |
| Streaming | Vercel AI SDK | Native usage data, streaming support |
| Auth | Supabase Auth | Integrated with database |

### Service Layer Stack

- **TypeScript**: Type safety, IDE support
- **Async/Await**: Modern error handling
- **Error Boundaries**: Graceful degradation

### Database Stack

- **PostgreSQL**: ACID compliance, powerful queries
- **Row Level Security**: User data isolation
- **Triggers**: Automatic timestamp updates
- **Indexes**: Optimized query performance

## Security Architecture

### Row Level Security (RLS)

All tables have RLS enabled with specific policies:

#### model_pricing
```sql
-- Anyone can read (needed for cost estimates)
SELECT: authenticated users

-- Only service role can modify
INSERT/UPDATE: service_role only
```

#### usage_records
```sql
-- Users can only see their own records
SELECT: WHERE auth.uid()::text = user_id

-- Only service role can insert
INSERT: service_role only
```

#### user_balances
```sql
-- Users can only see their own balance
SELECT: WHERE auth.uid()::text = user_id

-- Only service role can modify
INSERT/UPDATE: service_role only
```

### Service Role vs User Role

- **Service Role**: Used by backend services
  - Full database access
  - Bypasses RLS
  - Used for balance updates, usage recording

- **User Role**: Used by client/frontend
  - RLS enforced
  - Can only see own data
  - Read-only for pricing

### Authentication Flow

```
User requests balance
       ↓
Extract userId from session (Supabase Auth)
       ↓
userId === 'anonymous' ?
       ├─ Yes → Return $0, isGuest: true
       └─ No → Query user_balances (RLS applied)
              ↓
       Return user's balance
```

## Performance Considerations

### Database Indexes

Optimized for common query patterns:

```sql
-- model_pricing: Lookup by model
idx_model_pricing_model_id
idx_model_pricing_provider_id

-- usage_records: User queries, analytics
idx_usage_records_user_id
idx_usage_records_chat_id
idx_usage_records_created_at
idx_usage_records_user_created (composite)

-- user_balances: User lookup
idx_user_balances_user_id (primary key)
```

### Query Optimization

- **Pricing Lookup**: Cached in-memory → ~0ms
- **Balance Check**: Single row query with index → ~5-10ms
- **Usage Recording**: INSERT only, non-blocking → ~10-20ms
- **Analytics**: Indexed queries with date ranges → ~50-100ms

### Caching Strategy

```typescript
// In-memory cache with TTL
const pricingCache = new Map<string, { data, timestamp }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Cache key format
const key = `${providerId}:${modelId}`
```

**Cache Hit Rate**: Expected >95% in production (pricing rarely changes)

### Concurrency Handling

- **Balance Updates**: Atomic SQL operations
- **Usage Recording**: Asynchronous (doesn't block response)
- **Pricing Queries**: Read-heavy, cached

### Scalability

**Current Design Handles**:
- 10,000+ users
- 100,000+ requests/day
- Horizontal scaling (stateless services)

**Bottlenecks**:
- Database writes (usage_records)
  - Solution: Batch writes, partitioning
- Balance updates
  - Solution: Optimistic locking, queuing

## Error Handling Strategy

### Levels of Failure

1. **Critical** (Block request)
   - Insufficient balance → 402 Payment Required
   - Invalid auth → 401 Unauthorized

2. **Non-Critical** (Log & continue)
   - Usage tracking failure → Log warning
   - Balance deduction failure → Log warning
   - Cache miss → Fallback to database

3. **Recoverable** (Retry)
   - Database timeout → Retry with backoff
   - Connection error → Use fallback config

### Error Flow

```typescript
try {
  // Attempt database pricing fetch
} catch (dbError) {
  console.warn('DB fetch failed, using fallback')
  // Use config file pricing
  return getPricingFromConfig()
}

try {
  // Record usage
  await recordUsage()
} catch (error) {
  console.error('Usage recording failed:', error)
  // Don't throw - continue serving chat
}
```

## Monitoring & Observability

### Key Metrics to Track

1. **Usage Metrics**
   - Total API calls per day
   - Total tokens processed
   - Total revenue (sum of costs)
   - Cost by model distribution

2. **Performance Metrics**
   - Cache hit rate
   - Average pricing lookup time
   - Average balance check time
   - Database query latency

3. **Error Metrics**
   - 402 errors (insufficient balance)
   - Failed usage recordings
   - Failed balance deductions
   - Database connection failures

### Logging Strategy

```typescript
// Info: Normal operations
console.log('Usage recorded:', { userId, cost, tokens })

// Warn: Recoverable issues
console.warn('Failed to deduct balance:', { userId, cost })

// Error: Unexpected failures
console.error('Database connection failed:', error)
```

## Future Architecture Considerations

### Potential Enhancements

1. **Event-Driven Architecture**
   - Pub/sub for usage events
   - Async processing pipeline
   - Better scalability

2. **Distributed Caching**
   - Redis for multi-instance deployments
   - Shared cache across servers
   - Cache invalidation strategies

3. **Batch Processing**
   - Batch usage records every N seconds
   - Reduce database write load
   - Trade-off: Slight delay in tracking

4. **Analytics Pipeline**
   - Separate analytics database
   - Real-time dashboards
   - ML for fraud detection

5. **Payment Integration**
   - Stripe webhooks for auto-topup
   - Subscription management
   - Invoice generation

---

**Last Updated**: October 2024
**Architecture Version**: 1.0.0
