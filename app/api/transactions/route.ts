import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserTransactions } from '@/lib/pricing/transaction-service'

/**
 * GET /api/transactions
 * Get user's transaction history
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId()

    if (userId === 'anonymous') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const transactions = await getUserTransactions(userId, limit, offset)

    return NextResponse.json({
      transactions,
      count: transactions.length,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}
