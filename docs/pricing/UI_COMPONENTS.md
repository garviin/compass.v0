# UI Components Documentation

## Table of Contents

- [Overview](#overview)
- [Balance Display](#balance-display)
- [Chat Cost Display](#chat-cost-display)
- [React Hook](#react-hook)
- [Integration Examples](#integration-examples)
- [Styling](#styling)

## Overview

The pricing system includes React components and hooks for displaying balance and usage information in the UI.

**Components**:
- `BalanceDisplay` - Shows user's current balance in sidebar
- `ChatCostDisplay` - Shows cost/tokens for current chat

**Hooks**:
- `useChatCost` - Fetches and manages chat cost data

## Balance Display

**File**: `components/balance-display.tsx`

Shows the user's current account balance in the sidebar with color-coded warnings.

### Features

- Real-time balance fetching
- Color-coded warnings (green/yellow/red)
- Loading state
- Hidden for anonymous users
- Auto-refresh capability

### Usage

```typescript
import { BalanceDisplay } from '@/components/balance-display'

export default function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        {/* ... other sidebar content ... */}
      </SidebarContent>
      <SidebarFooter>
        <BalanceDisplay />
      </SidebarFooter>
    </Sidebar>
  )
}
```

### Props

This component takes no props.

### Behavior

1. **On Mount**: Fetches balance from `/api/balance`
2. **Loading State**: Shows "Loading..." with pulse animation
3. **Anonymous Users**: Hidden (returns `null`)
4. **Error Handling**: Silently fails, doesn't render

### Visual States

#### Normal Balance (>= $1.00)
```
┌─────────────────┐
│ 💳 $10.50       │ (neutral colors)
└─────────────────┘
```

#### Low Balance (< $1.00)
```
┌─────────────────┐
│ 💳 $0.75        │ (yellow warning)
│ Low balance     │
└─────────────────┘
```

#### Critical Balance (< $0.10)
```
┌─────────────────┐
│ 💳 $0.05        │ (red critical)
│ Low balance     │
└─────────────────┘
```

### Source Code Reference

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { formatCost } from '@/lib/pricing/cost-estimation'

interface BalanceData {
  balance: number
  currency: string
  isGuest?: boolean
}

export function BalanceDisplay() {
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBalance()
  }, [])

  const fetchBalance = async () => {
    try {
      const response = await fetch('/api/balance')
      if (response.ok) {
        const data = await response.json()
        setBalance(data)
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error)
    } finally {
      setLoading(false)
    }
  }

  // Conditional rendering logic...
  // Color-coded warning system...
}
```

### Customization

#### Change Warning Thresholds

```typescript
// Modify in balance-display.tsx
const LOW_BALANCE_THRESHOLD = 2.00    // Change from 1.00
const CRITICAL_BALANCE_THRESHOLD = 0.50  // Change from 0.10
```

#### Add Refresh Button

```typescript
export function BalanceDisplay() {
  // ... existing code ...

  const handleRefresh = async () => {
    setLoading(true)
    await fetchBalance()
  }

  return (
    <div className="flex items-center gap-2">
      <Wallet className="size-4" />
      <span>{formatCost(balance.balance)}</span>
      <button onClick={handleRefresh}>🔄</button>
    </div>
  )
}
```

#### Add Auto-Refresh

```typescript
useEffect(() => {
  fetchBalance()

  // Refresh every 30 seconds
  const interval = setInterval(fetchBalance, 30000)

  return () => clearInterval(interval)
}, [])
```

---

## Chat Cost Display

**File**: `components/chat-cost-display.tsx`

Shows total cost and token usage for the current chat session.

### Features

- Real-time cost tracking
- Token breakdown (input/output)
- Formatted numbers with commas
- Hidden when no cost data

### Usage

```typescript
import { ChatCostDisplay } from '@/components/chat-cost-display'

export default function ChatInterface() {
  const [chatId, setChatId] = useState<string | null>(null)

  return (
    <div>
      <div className="messages">
        {/* Your chat messages */}
      </div>

      <ChatCostDisplay chatId={chatId} />

      <div className="input">
        {/* Your chat input */}
      </div>
    </div>
  )
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `chatId` | `string \| null` | Yes | Current chat session ID |

### Behavior

1. **On Mount / Chat Change**: Fetches cost from `/api/usage/chat/{chatId}`
2. **Loading**: Silent (no loading indicator)
3. **No Data**: Hidden (returns `null`)
4. **Error Handling**: Silent fail

### Visual Display

```
┌────────────────────────────────────────────────────────┐
│ $ Cost: $0.0234  |  Tokens: 2,300 (1,500 in / 800 out) │
└────────────────────────────────────────────────────────┘
```

### Source Code Reference

```typescript
'use client'

import { DollarSign } from 'lucide-react'
import { formatCost, formatTokens } from '@/lib/pricing/cost-estimation'
import { useChatCost } from '@/hooks/use-chat-cost'

interface ChatCostDisplayProps {
  chatId: string | null
}

export function ChatCostDisplay({ chatId }: ChatCostDisplayProps) {
  const { cost, loading } = useChatCost(chatId)

  if (!chatId || loading || !cost || cost.totalCost === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs">
      <DollarSign className="size-3" />
      <div className="flex items-center gap-3">
        <span>Cost: {formatCost(cost.totalCost)}</span>
        <span>|</span>
        <span>Tokens: {formatTokens(cost.totalTokens)}</span>
      </div>
    </div>
  )
}
```

### Customization

#### Add Cost per Message

```typescript
export function ChatCostDisplay({ chatId }: ChatCostDisplayProps) {
  const { cost, loading, messageCount } = useChatCost(chatId)

  const avgCostPerMessage = cost.totalCost / messageCount

  return (
    <div>
      <span>Total: {formatCost(cost.totalCost)}</span>
      <span>Avg: {formatCost(avgCostPerMessage)}/msg</span>
    </div>
  )
}
```

#### Add Download Report Button

```typescript
const handleDownload = () => {
  const data = {
    chatId,
    totalCost: cost.totalCost,
    tokens: cost.totalTokens,
    breakdown: cost.messages
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-${chatId}-report.json`
  a.click()
}

return (
  <div>
    {/* Cost display */}
    <button onClick={handleDownload}>Download Report</button>
  </div>
)
```

---

## React Hook

**File**: `hooks/use-chat-cost.ts`

Custom hook for fetching and managing chat cost data.

### Usage

```typescript
import { useChatCost } from '@/hooks/use-chat-cost'

function MyComponent() {
  const { cost, loading } = useChatCost(chatId)

  if (loading) return <div>Loading...</div>
  if (!cost) return <div>No cost data</div>

  return (
    <div>
      <p>Cost: ${cost.totalCost}</p>
      <p>Tokens: {cost.totalTokens}</p>
    </div>
  )
}
```

### API

```typescript
function useChatCost(chatId: string | null): {
  cost: ChatCost | null
  loading: boolean
}

interface ChatCost {
  totalCost: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `chatId` | `string \| null` | Chat session ID (null clears cost) |

### Returns

| Field | Type | Description |
|-------|------|-------------|
| `cost` | `ChatCost \| null` | Cost data or null if not loaded |
| `loading` | `boolean` | True while fetching |

### Behavior

- Fetches cost when `chatId` changes
- Clears cost when `chatId` is `null`
- Handles errors silently

### Source Code Reference

```typescript
'use client'

import { useEffect, useState } from 'react'

interface ChatCost {
  totalCost: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export function useChatCost(chatId: string | null) {
  const [cost, setCost] = useState<ChatCost | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!chatId) {
      setCost(null)
      return
    }

    const fetchChatCost = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/usage/chat/${chatId}`)
        if (response.ok) {
          const data = await response.json()
          setCost(data)
        }
      } catch (error) {
        console.error('Failed to fetch chat cost:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchChatCost()
  }, [chatId])

  return { cost, loading }
}
```

---

## Integration Examples

### Complete Sidebar with Balance

```typescript
// components/app-sidebar.tsx

import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar'
import { BalanceDisplay } from '@/components/balance-display'
import { ChatHistory } from './sidebar/chat-history'

export default function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <ChatHistory />
      </SidebarContent>

      <SidebarFooter className="px-2 py-2 border-t">
        <BalanceDisplay />
      </SidebarFooter>
    </Sidebar>
  )
}
```

### Chat Interface with Cost Display

```typescript
// components/chat-interface.tsx

import { useState } from 'react'
import { ChatCostDisplay } from '@/components/chat-cost-display'
import { ChatMessages } from './chat-messages'
import { ChatInput } from './chat-input'

export function ChatInterface() {
  const [chatId, setChatId] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <ChatMessages chatId={chatId} />
      </div>

      <div className="border-t p-4">
        <ChatCostDisplay chatId={chatId} />
        <ChatInput onNewChat={(id) => setChatId(id)} />
      </div>
    </div>
  )
}
```

### Low Balance Warning

```typescript
import { useEffect, useState } from 'react'
import { getUserBalance } from '@/lib/pricing/balance-service'

export function LowBalanceWarning() {
  const [balance, setBalance] = useState<number>(0)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    async function checkBalance() {
      const bal = await fetch('/api/balance').then(r => r.json())
      setBalance(bal.balance)
      setShowWarning(bal.balance < 1.00)
    }

    checkBalance()
    const interval = setInterval(checkBalance, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  if (!showWarning) return null

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
      <p className="text-yellow-800">
        ⚠️ Low balance: ${balance.toFixed(2)}
      </p>
      <button className="mt-2 btn-primary">
        Add Credits
      </button>
    </div>
  )
}
```

---

## Styling

### Tailwind Classes Used

```typescript
// Balance Display
className="flex items-center gap-2 px-2 py-2 rounded-md text-sm bg-muted text-muted-foreground"

// Low Balance (yellow)
className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500"

// Critical Balance (red)
className="bg-destructive/10 text-destructive"

// Chat Cost Display
className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md border border-border/50"
```

### Custom Styling

Override default styles:

```typescript
// Custom balance display
<BalanceDisplay className="bg-blue-100 text-blue-900 font-bold" />

// Or modify component directly
export function BalanceDisplay({ className }: { className?: string }) {
  return (
    <div className={cn("default-classes", className)}>
      {/* ... */}
    </div>
  )
}
```

---

**Last Updated**: October 2024
**Components Version**: 1.0.0
