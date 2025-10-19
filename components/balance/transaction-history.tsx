'use client'

import { useEffect, useState } from 'react'

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  RefreshCw,
  Settings
} from 'lucide-react'

import { formatCost } from '@/lib/pricing/format'
import type { Transaction } from '@/lib/pricing/transaction-service'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

interface TransactionHistoryProps {
  userId: string
  limit?: number
}

export function TransactionHistory({
  userId,
  limit = 50
}: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const fetchTransactions = async () => {
    setLoading(true)
    setError(undefined)

    try {
      const response = await fetch(
        `/api/transactions?limit=${limit}&offset=0`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch transactions')
      }

      const data = await response.json()
      setTransactions(data.transactions || [])
    } catch (err) {
      console.error('Error fetching transactions:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to load transactions'
      )
    } finally {
      setLoading(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowUpCircle className="size-4 text-green-600" />
      case 'usage':
        return <ArrowDownCircle className="size-4 text-red-600" />
      case 'refund':
        return <RefreshCw className="size-4 text-blue-600" />
      case 'adjustment':
        return <Settings className="size-4 text-yellow-600" />
      default:
        return null
    }
  }

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'Deposit'
      case 'usage':
        return 'Usage'
      case 'refund':
        return 'Refund'
      case 'adjustment':
        return 'Adjustment'
      default:
        return type
    }
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(date))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          No transactions yet. Add funds to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTransactionIcon(transaction.type)}
                    <span className="text-sm font-medium">
                      {getTransactionLabel(transaction.type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[300px] truncate">
                  {transaction.description || '-'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(transaction.createdAt)}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    transaction.type === 'deposit' || transaction.type === 'refund'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {transaction.type === 'deposit' || transaction.type === 'refund'
                    ? '+'
                    : '-'}
                  {formatCost(transaction.amount, transaction.currency)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatCost(transaction.balanceAfter, transaction.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
