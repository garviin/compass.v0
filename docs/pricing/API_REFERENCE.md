# API Reference

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [GET /api/balance](#get-apibalance)
  - [GET /api/usage/chat/{chatId}](#get-apiusagechatchatid)
  - [POST /api/chat](#post-apichat)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)

## Overview

The pricing system exposes HTTP endpoints for balance management and usage tracking. All endpoints return JSON responses and require authentication (except for anonymous users).

**Base URL**: Your application domain (e.g., `https://your-app.com`)

## Authentication

All API endpoints use Supabase authentication via session cookies.

### User Types

1. **Authenticated Users**: Have a valid Supabase session
2. **Anonymous Users** (`userId === 'anonymous'`): Guest users without signup

### Authentication Flow

```
Request → Extract session cookie → Verify with Supabase → Get userId
```

If authentication fails, endpoints return `401 Unauthorized`.

## Endpoints

### GET /api/balance

Get the current balance for the authenticated user.

#### Request

```http
GET /api/balance HTTP/1.1
Host: your-app.com
Cookie: sb-<project>-auth-token=<session-token>
```

#### Response (200 OK)

**Authenticated User**:
```json
{
  "balance": 10.50,
  "currency": "USD"
}
```

**Anonymous User**:
```json
{
  "balance": 0,
  "currency": "USD",
  "isGuest": true
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number | Current account balance |
| `currency` | string | Currency code (always "USD") |
| `isGuest` | boolean | (Optional) `true` for anonymous users |

#### Error Responses

**500 Internal Server Error**:
```json
{
  "error": "Failed to fetch balance"
}
```

#### Example Usage

```typescript
// Frontend code
const response = await fetch('/api/balance')
const data = await response.json()

console.log(`Balance: $${data.balance}`)
```

```bash
# cURL
curl -X GET https://your-app.com/api/balance \
  -H "Cookie: sb-<project>-auth-token=<session-token>"
```

---

### GET /api/usage/chat/{chatId}

Get usage statistics for a specific chat session.

#### Request

```http
GET /api/usage/chat/chat_xyz789 HTTP/1.1
Host: your-app.com
Cookie: sb-<project>-auth-token=<session-token>
```

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `chatId` | string | path | Yes | Chat session identifier |

#### Response (200 OK)

**With Usage Data**:
```json
{
  "totalCost": 0.0234,
  "inputTokens": 1500,
  "outputTokens": 800,
  "totalTokens": 2300,
  "messages": [
    {
      "modelId": "gpt-4o",
      "providerId": "openai",
      "inputTokens": 500,
      "outputTokens": 300,
      "cost": 0.0081,
      "timestamp": "2024-10-18T14:23:45.123Z"
    },
    {
      "modelId": "gpt-4o",
      "providerId": "openai",
      "inputTokens": 1000,
      "outputTokens": 500,
      "cost": 0.0153,
      "timestamp": "2024-10-18T14:24:12.456Z"
    }
  ]
}
```

**No Usage Data**:
```json
{
  "totalCost": 0,
  "inputTokens": 0,
  "outputTokens": 0,
  "totalTokens": 0,
  "messages": []
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalCost` | number | Sum of all costs for this chat (USD) |
| `inputTokens` | number | Total input tokens consumed |
| `outputTokens` | number | Total output tokens generated |
| `totalTokens` | number | Sum of input + output tokens |
| `messages` | array | Array of individual message usage records |

**Message Object**:
| Field | Type | Description |
|-------|------|-------------|
| `modelId` | string | Model used for this message |
| `providerId` | string | Provider used for this message |
| `inputTokens` | number | Input tokens for this message |
| `outputTokens` | number | Output tokens for this message |
| `cost` | number | Cost for this message (USD) |
| `timestamp` | string | ISO 8601 timestamp of the message |

#### Error Responses

**500 Internal Server Error**:
```json
{
  "error": "Failed to fetch chat usage"
}
```

#### Example Usage

```typescript
// Frontend code
const chatId = 'chat_xyz789'
const response = await fetch(`/api/usage/chat/${chatId}`)
const data = await response.json()

console.log(`Chat cost: $${data.totalCost.toFixed(4)}`)
console.log(`Total tokens: ${data.totalTokens.toLocaleString()}`)
```

```bash
# cURL
curl -X GET https://your-app.com/api/usage/chat/chat_xyz789 \
  -H "Cookie: sb-<project>-auth-token=<session-token>"
```

---

### POST /api/chat

Process a chat message with balance checking and usage tracking.

#### Request

```http
POST /api/chat HTTP/1.1
Host: your-app.com
Content-Type: application/json
Cookie: sb-<project>-auth-token=<session-token>

{
  "messages": [
    {
      "role": "user",
      "content": "What is the capital of France?"
    }
  ],
  "id": "chat_xyz789"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | array | Yes | Array of message objects |
| `id` | string | Yes | Chat session identifier |

**Message Object**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | Message role ("user", "assistant", "system") |
| `content` | string | Yes | Message content |

#### Response (200 OK)

Returns a streaming response with AI-generated content and usage data.

**Stream Format**: Server-Sent Events (SSE)

```
data: {"type":"text","content":"Paris"}
...
data: {"type":"usage","tokens":{"input":15,"output":8,"total":23}}
```

#### Error Responses

**401 Unauthorized**:
```
Unauthorized
```
*Returned when guest ID is missing for anonymous users.*

**402 Payment Required**:
```json
{
  "code": "INSUFFICIENT_BALANCE",
  "message": "Insufficient balance. Please add credits to your account.",
  "balance": 0.00
}
```
*Returned when authenticated user has balance < $0.01.*

**404 Not Found**:
```
Selected provider is not enabled <providerId>
```
*Returned when the selected AI provider is disabled or not configured.*

**429 Too Many Requests**:
```json
{
  "code": "FREE_LIMIT_REACHED"
}
```
*Returned when anonymous user exceeds free tier limit.*

**500 Internal Server Error**:
```
Error processing your request
```

#### Balance Check Logic

For **authenticated users**, the endpoint:
1. Fetches current balance via `getUserBalance(userId)`
2. Checks if balance >= $0.01
3. If insufficient, returns 402 Payment Required
4. If sufficient, continues processing

For **anonymous users**, the endpoint:
1. Checks free tier limit via Redis
2. If limit reached, returns 429
3. Otherwise, continues processing

#### Usage Tracking

After successful response:
1. Extract token usage from AI SDK (`result.usage`)
2. Fetch model pricing
3. Calculate cost: `(inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice`
4. Record usage to `usage_records` table
5. Deduct cost from user balance

#### Example Usage

```typescript
// Frontend code
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    id: 'chat_123'
  })
})

// Handle streaming response
const reader = response.body.getReader()
// ... process stream
```

```bash
# cURL
curl -X POST https://your-app.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-<project>-auth-token=<session-token>" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "id": "chat_123"
  }'
```

## Error Responses

### Standard Error Format

Most errors return JSON:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE" // (optional)
}
```

### HTTP Status Codes

| Code | Meaning | When It Happens |
|------|---------|-----------------|
| 200 | OK | Request successful |
| 401 | Unauthorized | Missing or invalid authentication |
| 402 | Payment Required | Insufficient balance |
| 404 | Not Found | Resource not found or provider disabled |
| 429 | Too Many Requests | Rate limit exceeded (free tier) |
| 500 | Internal Server Error | Server-side error |

### Error Handling Best Practices

```typescript
const response = await fetch('/api/balance')

if (response.status === 402) {
  // Insufficient balance
  const data = await response.json()
  alert(`Please add credits. Current balance: $${data.balance}`)
  redirectToPayment()
} else if (response.status === 401) {
  // Not authenticated
  redirectToLogin()
} else if (response.ok) {
  // Success
  const data = await response.json()
  // ... process data
} else {
  // Other error
  console.error('Request failed:', response.status)
}
```

## Rate Limiting

### Anonymous Users

- Enforced via Redis counter
- Default: 3 exchanges per 24 hours
- Configurable via `FREE_GUEST_EXCHANGES` env var
- Resets after 24 hours from first request

### Authenticated Users

- No rate limiting (balance-based instead)
- Requests blocked when balance < $0.01
- No token bucket or request-per-second limits

### Headers

No rate limit headers are currently returned, but you can add:

```typescript
// In your API route
res.setHeader('X-RateLimit-Limit', '100')
res.setHeader('X-RateLimit-Remaining', '95')
res.setHeader('X-RateLimit-Reset', '1634567890')
```

## Webhooks

The pricing system does not currently support webhooks, but you can implement them for:
- Balance low warnings
- Usage threshold alerts
- Payment received notifications

Example webhook endpoint:

```typescript
// app/api/webhooks/balance/route.ts
export async function POST(req: Request) {
  const { userId, balance } = await req.json()

  if (balance < 1.00) {
    await sendLowBalanceEmail(userId, balance)
  }

  return new Response('OK', { status: 200 })
}
```

---

**Last Updated**: October 2024
**API Version**: 1.0.0
