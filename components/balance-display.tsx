'use client'

import { useEffect, useState } from 'react'

import { Wallet } from 'lucide-react'

import { formatCost } from '@/lib/pricing/format'

import { AddBalanceDialog } from './balance/add-balance-dialog'

interface BalanceData {
  balance: number
  currency: string
  isGuest?: boolean
}

interface BalanceDisplayProps {
  /** Optional publishable key passed from a server component */
  stripePublishableKey?: string
  /** Initial balance data from server component to avoid waterfall */
  initialBalance?: BalanceData
}

export function BalanceDisplay({
  stripePublishableKey,
  initialBalance
}: BalanceDisplayProps) {
  const [balance, setBalance] = useState<BalanceData | null>(
    initialBalance || null
  )
  const [loading, setLoading] = useState(!initialBalance)

  useEffect(() => {
    // Only fetch if no initial data was provided
    if (!initialBalance) {
      fetchBalance()
    }
  }, [initialBalance])

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

  const handleBalanceUpdate = () => {
    // Refresh balance after successful payment
    fetchBalance()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
        <Wallet className="size-4 animate-pulse" />
        <span className="animate-pulse">Loading...</span>
      </div>
    )
  }

  if (!balance || balance.isGuest) {
    return null
  }

  const isLowBalance = balance.balance < 1
  const isCriticalBalance = balance.balance < 0.1

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm ${
          isCriticalBalance
            ? 'bg-destructive/10 text-destructive'
            : isLowBalance
              ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        <Wallet className="size-4" />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-medium truncate">
            {formatCost(balance.balance, balance.currency)}
          </span>
          {isLowBalance && (
            <span className="text-xs opacity-80">Low balance</span>
          )}
        </div>
      </div>

      <AddBalanceDialog
        currentBalance={balance.balance}
        currentCurrency={balance.currency}
        onSuccess={handleBalanceUpdate}
        stripePublishableKey={stripePublishableKey}
      />
    </div>
  )
}
