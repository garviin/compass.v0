# Security Audit Report
## Production Readiness Assessment

**Date:** 2025-10-22
**Auditor:** Claude (AI Security Analysis)
**Codebase:** Compass.v0 (Morphic AI Search Platform)
**Status:** Pre-Production Review

---

## Executive Summary

This security audit identifies **17 critical security issues** that must be addressed before production deployment. The application has a solid foundation with authentication via Supabase, payment processing via Stripe, and database Row Level Security policies. However, several critical gaps exist in security headers, rate limiting, input validation, and production configurations.

**Risk Level: MEDIUM-HIGH**
**Production Ready: NO** (requires addressing critical and high-priority issues)

---

## Critical Findings (Must Fix Before Production)

### 1. Missing Security Headers (CRITICAL)
**Location:** `next.config.mjs:1-22`
**Risk:** High - Exposes application to XSS, clickjacking, MIME-sniffing attacks

**Issue:**
The Next.js configuration lacks essential security headers:
- No Content Security Policy (CSP)
- No X-Frame-Options (clickjacking protection)
- No X-Content-Type-Options (MIME-sniffing protection)
- No Referrer-Policy
- No Permissions-Policy

**Recommendation:**
```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com;"
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          }
        ]
      }
    ]
  }
}
```

### 2. No Rate Limiting (CRITICAL)
**Location:** All API routes
**Risk:** High - Vulnerable to DDoS, brute force attacks, API abuse

**Issue:**
No rate limiting is implemented on any API endpoints:
- `/api/chat` - Can be abused for unlimited AI requests
- `/api/payments/create-intent` - Payment endpoint without rate limit
- `/api/admin/*` - Admin endpoints without additional throttling
- `/api/auth/*` - Authentication endpoints vulnerable to brute force

**Current Mitigation:**
- Guest users limited to 3 exchanges (app/api/chat/route.ts:64-89)
- Authenticated users require $0.01 balance (app/api/chat/route.ts:92-116)

**Gaps:**
- No protection against rapid repeated requests
- No IP-based throttling
- No protection for authentication endpoints
- No distributed rate limiting (needed for serverless)

**Recommendation:**
Implement rate limiting using Upstash Ratelimit:

```bash
npm install @upstash/ratelimit
```

```typescript
// lib/rate-limit/config.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
})

// Different limits for different endpoints
export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
  prefix: '@upstash/ratelimit'
})

export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 attempts per minute
  analytics: true,
  prefix: '@upstash/ratelimit/auth'
})

export const chatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 chats per minute
  analytics: true,
  prefix: '@upstash/ratelimit/chat'
})

export const paymentLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '5 m'), // 10 payment attempts per 5 minutes
  analytics: true,
  prefix: '@upstash/ratelimit/payment'
})
```

Apply to API routes:
```typescript
// Example: app/api/chat/route.ts
import { chatLimiter } from '@/lib/rate-limit/config'

export async function POST(req: Request) {
  const identifier = userId === 'anonymous' ? guestId : userId
  const { success, limit, reset, remaining } = await chatLimiter.limit(identifier)

  if (!success) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString()
      }
    })
  }

  // ... rest of handler
}
```

### 3. Admin Authentication Hardcoded Domain (CRITICAL)
**Location:** `lib/auth/admin-middleware.ts:32-34`
**Risk:** High - Insecure admin access control

**Issue:**
```typescript
const isAdminUser = user.user_metadata?.role === 'admin' ||
                   user.email?.endsWith('@yourdomain.com') || // Placeholder!
                   process.env.ADMIN_EMAILS?.split(',').includes(user.email || '')
```

The hardcoded `@yourdomain.com` is a placeholder that will grant admin access to anyone with that email domain.

**Recommendation:**
1. Remove the hardcoded domain check entirely
2. Rely only on `user_metadata.role === 'admin'` and `ADMIN_EMAILS` environment variable
3. Implement proper admin role management in Supabase:

```typescript
const isAdminUser =
  user.user_metadata?.role === 'admin' ||
  user.app_metadata?.role === 'admin' || // Check app_metadata (more secure)
  process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).includes(user.email || '')
```

Add to `.env.local.example`:
```bash
# Admin Configuration
ADMIN_EMAILS=admin@example.com,superadmin@example.com
```

### 4. Weak CRON Authentication (CRITICAL)
**Location:** `app/api/cron/pricing-sync/route.ts:19-29`
**Risk:** Medium-High - Cron endpoint can be triggered by unauthorized parties

**Issue:**
```typescript
const authHeader = request.headers.get('authorization')
const cronSecret = process.env.CRON_SECRET

if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Problems:
- If `CRON_SECRET` is not set, the endpoint is completely unprotected
- No additional IP allowlisting for Vercel Cron
- Simple bearer token can be leaked

**Recommendation:**
```typescript
// Always require authentication
const authHeader = request.headers.get('authorization')
const cronSecret = process.env.CRON_SECRET

if (!cronSecret) {
  console.error('[Cron] CRON_SECRET not configured')
  return NextResponse.json(
    { error: 'Server misconfigured' },
    { status: 500 }
  )
}

if (authHeader !== `Bearer ${cronSecret}`) {
  console.error('[Cron] Unauthorized access attempt')
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Additional: Verify Vercel Cron headers if using Vercel
const cronHeader = request.headers.get('x-vercel-cron')
if (process.env.VERCEL && !cronHeader) {
  return NextResponse.json({ error: 'Invalid cron source' }, { status: 403 })
}
```

Add to `.env.local.example`:
```bash
# Cron Job Security
CRON_SECRET=[GENERATE_STRONG_SECRET_HERE]  # Use: openssl rand -base64 32
```

### 5. Insufficient Input Validation on Payment Endpoints (HIGH)
**Location:** `app/api/payments/create-intent/route.ts:31-55`
**Risk:** Medium - Potential for payment manipulation

**Issue:**
Basic validation exists but lacks comprehensive checks:
- No maximum amount limit (users could create extremely large payment intents)
- No minimum amount validation
- Type coercion vulnerabilities

**Current Code:**
```typescript
if (!amount || typeof amount !== 'number' || amount <= 0) {
  return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
}
```

**Recommendation:**
Use Zod for comprehensive validation:

```typescript
// lib/schema/payment.ts
import { z } from 'zod'

export const createPaymentIntentSchema = z.object({
  amount: z.number()
    .positive('Amount must be positive')
    .min(1, 'Minimum amount is $1')
    .max(10000, 'Maximum amount is $10,000') // Adjust as needed
    .finite('Amount must be a valid number'),
  currency: z.string()
    .length(3, 'Currency must be 3 characters')
    .toUpperCase()
    .refine(val => ['USD', 'EUR', 'GBP'].includes(val), {
      message: 'Unsupported currency'
    })
})

// In route handler:
import { createPaymentIntentSchema } from '@/lib/schema/payment'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate with Zod
    const validated = createPaymentIntentSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.format()
        },
        { status: 400 }
      )
    }

    const { amount, currency } = validated.data
    // ... rest of handler
  }
}
```

### 6. Missing Environment Variable Validation (HIGH)
**Location:** Multiple locations
**Risk:** Medium - Application may fail silently in production

**Issue:**
Environment variables are checked at runtime, not at startup. Missing variables can cause unexpected failures in production.

**Recommendation:**
Create environment variable validation at startup:

```typescript
// lib/config/env.ts
import { z } from 'zod'

const envSchema = z.object({
  // Required
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  TAVILY_API_KEY: z.string().min(1, 'Tavily API key is required'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),

  // Stripe (required for production)
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', 'Invalid Stripe secret key'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_', 'Invalid Stripe publishable key'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_', 'Invalid Stripe webhook secret'),

  // Admin
  ADMIN_EMAILS: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),

  // Cron
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),

  // Redis (required if chat history enabled)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Node env
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
})

export function validateEnv() {
  try {
    const env = envSchema.parse(process.env)
    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:')
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      throw new Error('Invalid environment configuration')
    }
    throw error
  }
}

// In next.config.mjs or app startup
// validateEnv() // Call this at startup
```

### 7. Excessive Console Logging in Production (HIGH)
**Location:** Throughout API routes (71 occurrences in 15 files)
**Risk:** Medium - Information disclosure, performance impact

**Issue:**
Extensive `console.log()`, `console.error()` usage can:
- Leak sensitive information (user IDs, payment details, metadata)
- Impact performance in serverless functions
- Make logs noisy and hard to monitor

Examples from `app/api/payments/webhook/route.ts`:
```typescript
console.log('💳 Payment intent succeeded:', paymentIntent.id)
console.log('📋 Metadata:', JSON.stringify(paymentIntent.metadata, null, 2))
console.log('🔍 Extracted values:', { userId, originalAmount, originalCurrency })
```

**Recommendation:**
1. Implement structured logging:

```typescript
// lib/logger/index.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  userId?: string
  requestId?: string
  [key: string]: any
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()

    // In production, send to monitoring service (e.g., Sentry, Datadog)
    if (!this.isDevelopment) {
      // Structured JSON logging for production
      console.log(JSON.stringify({
        timestamp,
        level,
        message,
        ...context
      }))
    } else {
      // Human-readable for development
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, context || '')
    }
  }

  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      this.log('debug', message, context)
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context)
  }
}

export const logger = new Logger()
```

2. Replace console.log calls:
```typescript
// Before:
console.log('💳 Payment intent succeeded:', paymentIntent.id)

// After:
logger.info('Payment intent succeeded', {
  paymentIntentId: paymentIntent.id,
  userId: metadata.userId
})
```

---

## High Priority Findings

### 8. Missing CSRF Protection (HIGH)
**Location:** All POST endpoints
**Risk:** Medium - State-changing operations vulnerable to CSRF

**Issue:**
No CSRF token validation on state-changing operations. While Next.js uses SameSite cookies (middleware.ts:36-42) which provides some protection, it's not sufficient for critical operations.

**Recommendation:**
For critical operations (payments, admin actions), implement additional CSRF protection:

```typescript
// lib/security/csrf.ts
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function generateCsrfToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const cookieStore = await cookies()

  cookieStore.set('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 // 1 hour
  })

  return token
}

export async function validateCsrfToken(token: string): Promise<boolean> {
  const cookieStore = await cookies()
  const storedToken = cookieStore.get('csrf-token')?.value

  if (!storedToken || !token) {
    return false
  }

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(storedToken),
    Buffer.from(token)
  )
}
```

Apply to critical endpoints:
```typescript
// app/api/payments/create-intent/route.ts
export async function POST(req: NextRequest) {
  const csrfToken = req.headers.get('x-csrf-token')

  if (!csrfToken || !(await validateCsrfToken(csrfToken))) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }

  // ... rest of handler
}
```

### 9. Webhook Replay Attack Vulnerability (HIGH)
**Location:** `app/api/payments/webhook/route.ts:85-101`
**Risk:** Medium - Potential for duplicate payment processing

**Current Mitigation:**
The code has idempotency check:
```typescript
const existingTransaction = await getTransactionByPaymentIntent(paymentIntent.id, true)
if (existingTransaction) {
  console.log('⏭️  Payment intent already processed')
  return
}
```

**Gap:**
- No event ID tracking (Stripe sends unique event IDs)
- Race condition possible if two webhooks arrive simultaneously
- No validation of event timestamp (old events could be replayed)

**Recommendation:**
```typescript
// Add event ID tracking in database
// supabase/migrations/new_webhook_events.sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- 'stripe', etc.
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);

-- Auto-delete old events (older than 30 days)
CREATE INDEX idx_webhook_events_cleanup ON webhook_events(created_at)
WHERE created_at < NOW() - INTERVAL '30 days';

// In webhook handler:
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // ... signature verification ...

  // Check for duplicate event
  const supabase = createAdminClient()
  const { data: existingEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', event.id)
    .single()

  if (existingEvent) {
    console.log(`Event ${event.id} already processed`)
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Validate event age (reject events older than 5 minutes)
  const eventAge = Date.now() - (event.created * 1000)
  if (eventAge > 5 * 60 * 1000) {
    console.error(`Event ${event.id} is too old: ${eventAge}ms`)
    return NextResponse.json({ error: 'Event too old' }, { status: 400 })
  }

  // Store event ID to prevent replay
  await supabase
    .from('webhook_events')
    .insert({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type
    })

  // ... process event ...
}
```

### 10. Insufficient Database RLS Policies (HIGH)
**Location:** Supabase migrations
**Risk:** Medium - Potential unauthorized data access

**Issues Found:**

1. **Sync Logs Policy Too Permissive** (`20251019000008_add_sync_logs_table.sql:31-40`):
```sql
CREATE POLICY "Admins can view sync logs" ON sync_logs
  FOR SELECT
  TO authenticated
  USING (
    -- Check if user is admin via app metadata
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );
```

Problem: Uses `user_metadata` instead of `app_metadata`. User metadata can be modified by users in some configurations.

**Fix:**
```sql
CREATE POLICY "Admins can view sync logs" ON sync_logs
  FOR SELECT
  TO authenticated
  USING (
    -- Check app_metadata (more secure, only admins can modify)
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    OR
    -- Alternative: check against ADMIN_EMAILS table
    auth.email() IN (SELECT email FROM admin_users)
  );
```

2. **Missing RLS on Anonymous Access**:
No policies prevent anonymous users from attempting to access data. While Supabase blocks this by default, explicit policies are better.

**Recommendation:**
Add explicit policies to deny anonymous access where needed:
```sql
-- Explicitly deny anonymous access to sensitive tables
CREATE POLICY "Deny anonymous access to user_balances"
  ON user_balances
  FOR ALL
  TO anon
  USING (false);

CREATE POLICY "Deny anonymous access to transactions"
  ON transactions
  FOR ALL
  TO anon
  USING (false);
```

### 11. Missing API Request Validation Middleware (MEDIUM)
**Location:** All API routes
**Risk:** Medium - Inconsistent input validation

**Issue:**
Each API route validates inputs independently. This leads to:
- Inconsistent validation logic
- Repeated code
- Easy to miss validation on new endpoints

**Recommendation:**
Create a validation middleware:

```typescript
// lib/middleware/validate-request.ts
import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema } from 'zod'

export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (req: NextRequest, data: T) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json()
      const validated = schema.safeParse(body)

      if (!validated.success) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            details: validated.error.flatten()
          },
          { status: 400 }
        )
      }

      return handler(req, validated.data)
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON' },
          { status: 400 }
        )
      }
      throw error
    }
  }
}

// Usage:
import { withValidation } from '@/lib/middleware/validate-request'

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  id: z.string().uuid()
})

export const POST = withValidation(
  chatRequestSchema,
  async (req, data) => {
    // data is typed and validated
    const { messages, id } = data
    // ... handler logic
  }
)
```

---

## Medium Priority Findings

### 12. Weak Guest ID Security (MEDIUM)
**Location:** `middleware.ts:33-43`
**Risk:** Low-Medium - Guest tracking can be bypassed

**Issue:**
```typescript
const guestId = crypto.randomUUID()
response.cookies.set('guest_id', guestId, {
  httpOnly: true,
  sameSite: 'lax', // Should be 'strict' for better security
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365
})
```

Problems:
- SameSite='lax' allows some cross-site requests
- No integrity check (users can modify cookie)
- Long expiration (1 year)

**Recommendation:**
```typescript
const guestId = crypto.randomUUID()
response.cookies.set('guest_id', guestId, {
  httpOnly: true,
  sameSite: 'strict', // Stricter protection
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30 // 30 days instead of 1 year
})

// Also add signed/HMAC cookie for integrity
const signature = createHmac('sha256', process.env.COOKIE_SECRET!)
  .update(guestId)
  .digest('hex')

response.cookies.set('guest_id_sig', signature, {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30
})
```

### 13. No Request Size Limits (MEDIUM)
**Location:** All API routes
**Risk:** Medium - Vulnerable to large payload DoS attacks

**Issue:**
No explicit request body size limits. Next.js has default limits, but they should be explicitly configured.

**Recommendation:**
Add to `next.config.mjs`:
```javascript
const nextConfig = {
  // ... existing config

  // Limit API request body size
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  }
}
```

For individual routes with larger needs (e.g., file uploads), use route-specific limits:
```typescript
export const maxBodySize = '10mb' // For specific routes
```

### 14. Missing Monitoring and Alerting (MEDIUM)
**Location:** Throughout application
**Risk:** Medium - Security incidents may go undetected

**Issue:**
No error tracking, monitoring, or alerting system in place for:
- Failed authentication attempts
- Payment failures
- API errors
- Unusual traffic patterns

**Recommendation:**
Integrate error monitoring and security alerting:

1. **Add Sentry for Error Tracking:**
```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,

  beforeSend(event, hint) {
    // Filter out sensitive data
    if (event.request) {
      delete event.request.cookies
      delete event.request.headers?.['authorization']
    }
    return event
  }
})
```

2. **Add Security Event Logging:**
```typescript
// lib/security/audit-log.ts
interface SecurityEvent {
  type: 'auth_failure' | 'payment_failure' | 'admin_access' | 'rate_limit'
  userId?: string
  ip?: string
  metadata?: Record<string, any>
}

export async function logSecurityEvent(event: SecurityEvent) {
  const supabase = createAdminClient()

  await supabase
    .from('security_events')
    .insert({
      event_type: event.type,
      user_id: event.userId,
      ip_address: event.ip,
      metadata: event.metadata,
      created_at: new Date().toISOString()
    })

  // Alert on critical events
  if (event.type === 'admin_access') {
    // Send alert to admin team
    await sendAdminAlert(`Admin access by ${event.userId}`)
  }
}
```

### 15. Insecure Secret Management in Code (MEDIUM)
**Location:** Multiple files checking for env vars at runtime
**Risk:** Medium - Secrets exposure risk

**Issue:**
Environment variables are accessed directly throughout the codebase using `process.env.*`. This makes it:
- Hard to track which secrets are used where
- Easy to accidentally log secrets
- Difficult to rotate secrets

**Recommendation:**
Centralize secret management:

```typescript
// lib/config/secrets.ts
class SecretManager {
  private secrets: Map<string, string> = new Map()

  constructor() {
    this.loadSecrets()
  }

  private loadSecrets() {
    // Load from environment
    const requiredSecrets = [
      'OPENAI_API_KEY',
      'STRIPE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'CRON_SECRET'
    ]

    requiredSecrets.forEach(key => {
      const value = process.env[key]
      if (!value) {
        throw new Error(`Required secret ${key} not found`)
      }
      this.secrets.set(key, value)
    })
  }

  get(key: string): string {
    const secret = this.secrets.get(key)
    if (!secret) {
      throw new Error(`Secret ${key} not found`)
    }
    return secret
  }

  // Safely log (redacted)
  getSafe(key: string): string {
    const secret = this.get(key)
    return `${secret.slice(0, 4)}...${secret.slice(-4)}`
  }
}

export const secrets = new SecretManager()

// Usage:
// const apiKey = secrets.get('OPENAI_API_KEY')
// logger.info('Using API key', { key: secrets.getSafe('OPENAI_API_KEY') })
```

---

## Low Priority Findings

### 16. Missing Subresource Integrity (SRI) (LOW)
**Location:** External script/style loads
**Risk:** Low - Compromised CDN could inject malicious code

**Recommendation:**
Add SRI hashes to external resources (Stripe.js, etc.) where possible.

### 17. No Security.txt File (LOW)
**Location:** Missing `public/.well-known/security.txt`
**Risk:** Low - Researchers have no way to report vulnerabilities

**Recommendation:**
```
# public/.well-known/security.txt
Contact: security@yourdomain.com
Expires: 2026-12-31T23:59:59.000Z
Preferred-Languages: en
```

---

## Production Deployment Checklist

### Before Deployment:
- [ ] Fix all CRITICAL issues (1-7)
- [ ] Fix all HIGH priority issues (8-11)
- [ ] Configure security headers in next.config.mjs
- [ ] Implement rate limiting with Upstash
- [ ] Set up environment variable validation
- [ ] Configure structured logging with Sentry/Datadog
- [ ] Remove hardcoded admin domain check
- [ ] Strengthen CRON_SECRET and require it
- [ ] Add comprehensive input validation schemas
- [ ] Implement CSRF protection for critical endpoints
- [ ] Add webhook event deduplication
- [ ] Review and strengthen RLS policies
- [ ] Set up monitoring and alerting
- [ ] Test payment webhook idempotency
- [ ] Verify all environment variables are set
- [ ] Run security headers test (securityheaders.com)
- [ ] Perform penetration testing on authentication
- [ ] Review all admin endpoints for authorization
- [ ] Enable Supabase security advisories
- [ ] Set up incident response plan
- [ ] Document security procedures

### Environment Variables to Add:
```bash
# Security
CRON_SECRET=<generate-with-openssl-rand-base64-32>
ADMIN_API_KEY=<generate-strong-key>
ADMIN_EMAILS=admin@yourdomain.com
COOKIE_SECRET=<generate-with-openssl-rand-base64-32>

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=<your-sentry-dsn>
SENTRY_AUTH_TOKEN=<your-sentry-token>

# Rate Limiting (required!)
UPSTASH_REDIS_REST_URL=<your-upstash-url>
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>
```

### Supabase Security Checklist:
- [ ] Enable 2FA for all admin accounts
- [ ] Configure database backups (daily)
- [ ] Review all RLS policies
- [ ] Enable Supabase auth email verification
- [ ] Configure password strength requirements
- [ ] Set up auth rate limiting
- [ ] Review API key permissions
- [ ] Enable audit logging
- [ ] Configure IP allowlisting (if applicable)

### Stripe Security Checklist:
- [ ] Use live mode keys (not test)
- [ ] Verify webhook signature on all webhooks
- [ ] Configure webhook endpoint monitoring
- [ ] Set up fraud detection rules
- [ ] Enable 3D Secure for payments
- [ ] Configure payment amount limits
- [ ] Review Stripe dashboard alerts
- [ ] Test refund flow
- [ ] Verify payment intent idempotency

---

## Testing Recommendations

### Security Testing:
1. **Authentication Testing:**
   - Test brute force protection
   - Test session management
   - Test admin role escalation
   - Test OAuth flow security

2. **API Testing:**
   - Test rate limiting effectiveness
   - Test input validation with fuzzing
   - Test CSRF protection
   - Test authorization bypass attempts

3. **Payment Testing:**
   - Test webhook replay attacks
   - Test duplicate payment prevention
   - Test refund processing
   - Test currency validation

4. **Infrastructure Testing:**
   - Test security headers (securityheaders.com)
   - Test SSL/TLS configuration (ssllabs.com)
   - Test for common vulnerabilities (OWASP ZAP)
   - Load testing with rate limits

---

## Compliance Considerations

### GDPR:
- [ ] Add privacy policy
- [ ] Implement data export functionality
- [ ] Implement data deletion (right to be forgotten)
- [ ] Add cookie consent banner
- [ ] Document data retention policies

### PCI DSS (Stripe handles most, but verify):
- [ ] Never log credit card numbers
- [ ] Use TLS 1.2+ for all connections
- [ ] Implement access logging
- [ ] Regular security reviews

### SOC 2 (if applicable):
- [ ] Implement audit logging
- [ ] Access control reviews
- [ ] Incident response procedures
- [ ] Security awareness training

---

## Positive Security Findings

The following security measures are **well implemented**:

1. ✅ **Supabase Authentication** - Proper session management
2. ✅ **Row Level Security** - Database policies in place
3. ✅ **Stripe Webhook Signature Verification** - Payment security
4. ✅ **HTTPS Cookies** - HttpOnly, Secure flags used
5. ✅ **Environment Separation** - .env files properly gitignored
6. ✅ **Payment Idempotency** - Duplicate payment prevention
7. ✅ **Balance Checks** - Users must have balance before API use
8. ✅ **Guest Limiting** - Free tier has usage limits
9. ✅ **Admin Middleware** - Centralized admin authorization
10. ✅ **TypeScript** - Type safety throughout codebase

---

## Summary

**Current State:** The application has good foundational security but requires significant hardening before production deployment.

**Priority Actions:**
1. Implement security headers (1 day)
2. Add rate limiting (2 days)
3. Fix admin authentication (1 day)
4. Strengthen CRON security (0.5 days)
5. Add comprehensive input validation (2 days)
6. Set up monitoring and logging (2 days)
7. Implement CSRF protection (1 day)
8. Test all security measures (3 days)

**Estimated Time to Production Ready:** 2-3 weeks with dedicated security focus

**Recommended Next Steps:**
1. Address all CRITICAL issues immediately
2. Set up security monitoring and alerting
3. Conduct penetration testing
4. Create security incident response plan
5. Schedule regular security audits

---

**Report Generated:** 2025-10-22
**Classification:** Internal - Security Sensitive
**Review Date:** Review after implementing all CRITICAL and HIGH priority fixes
