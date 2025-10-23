import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserBalanceRecord } from '@/lib/pricing/balance-service'
import { getStripePublishableKey } from '@/lib/stripe/stripe-client'

import { BalanceDisplay } from './balance-display'

export async function BalanceDisplayWrapper() {
  const stripePublishableKey = getStripePublishableKey()

  try {
    const userId = await getCurrentUserId()

    if (userId === 'anonymous') {
      return (
        <BalanceDisplay
          initialBalance={{
            balance: 0,
            currency: 'USD',
            isGuest: true
          }}
          stripePublishableKey={stripePublishableKey}
        />
      )
    }

    const balanceRecord = await getUserBalanceRecord(userId)

    const balanceData = balanceRecord
      ? {
          balance: balanceRecord.balance,
          currency: balanceRecord.currency
        }
      : {
          balance: 0,
          currency: 'USD'
        }

    return (
      <BalanceDisplay
        initialBalance={balanceData}
        stripePublishableKey={stripePublishableKey}
      />
    )
  } catch (error) {
    console.error('Error fetching balance:', error)
    // Return component with default data on error
    return (
      <BalanceDisplay
        initialBalance={{
          balance: 0,
          currency: 'USD'
        }}
        stripePublishableKey={stripePublishableKey}
      />
    )
  }
}
