import { redirect } from 'next/navigation'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserBalanceRecord } from '@/lib/pricing/balance-service'
import { formatCost } from '@/lib/pricing/format'
import { getTransactionStats } from '@/lib/pricing/transaction-service'
import { getStripePublishableKey } from '@/lib/stripe/stripe-client'

import { AddBalanceDialog } from '@/components/balance/add-balance-dialog'
import { TransactionHistory } from '@/components/balance/transaction-history'

export default async function AccountPage() {
  const userId = await getCurrentUserId()

  if (userId === 'anonymous') {
    redirect('/auth/login')
  }

  const balanceRecord = await getUserBalanceRecord(userId)
  const stats = await getTransactionStats(userId)
  const stripePublishableKey = getStripePublishableKey()

  if (!balanceRecord) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account</h1>
          <p className="text-muted-foreground mt-2">
            Unable to load balance information
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Balance</h1>
          <p className="text-muted-foreground mt-2">
            Manage your balance and view transaction history
          </p>
        </div>

        {/* Balance Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Current Balance
            </div>
            <div className="mt-2 text-3xl font-bold">
              {formatCost(balanceRecord.balance, balanceRecord.currency)}
            </div>
            <div className="mt-4">
              <AddBalanceDialog
                currentBalance={balanceRecord.balance}
                currentCurrency={balanceRecord.currency}
                stripePublishableKey={stripePublishableKey}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Total Deposited
            </div>
            <div className="mt-2 text-2xl font-bold text-green-600">
              {formatCost(stats.totalDeposits, balanceRecord.currency)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              All-time deposits
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Total Usage
            </div>
            <div className="mt-2 text-2xl font-bold text-red-600">
              {formatCost(stats.totalUsage, balanceRecord.currency)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              All-time API costs
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Transactions
            </div>
            <div className="mt-2 text-2xl font-bold">
              {stats.transactionCount}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Total transactions
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="rounded-lg border bg-card">
          <div className="border-b p-6">
            <h2 className="text-xl font-semibold">Transaction History</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View all your balance transactions
            </p>
          </div>
          <div className="p-6">
            <TransactionHistory userId={userId} limit={50} />
          </div>
        </div>

        {/* Account Info */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Account Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Currency
              </div>
              <div className="mt-1 text-base font-medium">
                {balanceRecord.preferredCurrency || balanceRecord.currency}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Locale
              </div>
              <div className="mt-1 text-base font-medium">
                {balanceRecord.locale || 'en-US'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
