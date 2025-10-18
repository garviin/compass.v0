import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserBalanceRecord } from '@/lib/pricing/balance-service'

export async function GET() {
  try {
    const userId = await getCurrentUserId()

    if (userId === 'anonymous') {
      return new Response(
        JSON.stringify({
          balance: 0,
          currency: 'USD',
          isGuest: true
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    }

    const balanceRecord = await getUserBalanceRecord(userId)

    if (!balanceRecord) {
      return new Response(
        JSON.stringify({
          balance: 0,
          currency: 'USD'
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        balance: balanceRecord.balance,
        currency: balanceRecord.currency
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error fetching balance:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch balance'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    )
  }
}
