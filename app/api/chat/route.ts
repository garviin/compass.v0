import { cookies } from 'next/headers'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getUserBalance } from '@/lib/pricing/balance-service'
import { getRedisClient } from '@/lib/redis/config'
import { createManualToolStreamResponse } from '@/lib/streaming/create-manual-tool-stream'
import { createToolCallingStreamResponse } from '@/lib/streaming/create-tool-calling-stream'
import { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'

export const maxDuration = 30

const DEFAULT_MODEL: Model = {
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  provider: 'OpenAI',
  providerId: 'openai',
  enabled: true,
  toolCallType: 'native'
}

export async function POST(req: Request) {
  try {
    const { messages, id: chatId } = await req.json()
    const referer = req.headers.get('referer')
    const isSharePage = referer?.includes('/share/')
    const userId = await getCurrentUserId()

    if (isSharePage) {
      return new Response('Chat API is not available on share pages', {
        status: 403,
        statusText: 'Forbidden'
      })
    }

    const cookieStore = await cookies()
    const modelJson = cookieStore.get('selectedModel')?.value
    const searchMode = cookieStore.get('search-mode')?.value === 'true'

    let selectedModel = DEFAULT_MODEL

    if (modelJson) {
      try {
        selectedModel = JSON.parse(modelJson) as Model
      } catch (e) {
        console.error('Failed to parse selected model:', e)
      }
    }

    if (
      !isProviderEnabled(selectedModel.providerId) ||
      selectedModel.enabled === false
    ) {
      return new Response(
        `Selected provider is not enabled ${selectedModel.providerId}`,
        {
          status: 404,
          statusText: 'Not Found'
        }
      )
    }

    // Free guest limit enforcement
    if (userId === 'anonymous') {
      const guestId = cookieStore.get('guest_id')?.value
      if (!guestId) {
        return new Response('Unauthorized', { status: 401 })
      }
      try {
        const redis = await getRedisClient()
        const limit = parseInt(process.env.FREE_GUEST_EXCHANGES || '3', 10)
        const key = `guest:exchanges:${guestId}`
        const currentRaw = await redis.get(key)
        const current = currentRaw ? parseInt(String(currentRaw), 10) : 0
        if (!Number.isNaN(current) && current >= limit) {
          return new Response(
            JSON.stringify({ code: 'FREE_LIMIT_REACHED' }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'x-free-limit': 'reached'
              }
            }
          )
        }
      } catch (e) {
        console.error('Guest limit check failed:', e)
      }
    } else {
      // Check balance for authenticated users
      try {
        const balance = await getUserBalance(userId)
        // Require at least $0.01 to make a request
        // This prevents users with zero balance from making requests
        if (balance < 0.01) {
          return new Response(
            JSON.stringify({
              code: 'INSUFFICIENT_BALANCE',
              message:
                'Insufficient balance. Please add credits to your account.',
              balance
            }),
            {
              status: 402,
              headers: {
                'content-type': 'application/json',
                'x-balance': balance.toString()
              }
            }
          )
        }
      } catch (e) {
        console.error('Balance check failed:', e)
        // Continue anyway - we don't want to block users if balance check fails
      }
    }

    const supportsToolCalling = selectedModel.toolCallType === 'native'

    return supportsToolCalling
      ? createToolCallingStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode,
          userId
        })
      : createManualToolStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode,
          userId
        })
  } catch (error) {
    console.error('API route error:', error)
    return new Response('Error processing your request', {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
