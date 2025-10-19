import { cookies } from 'next/headers'

import { CoreMessage, DataStreamWriter, JSONValue, Message } from 'ai'

import { getChat, saveChat } from '@/lib/actions/chat'
import { generateRelatedQuestions } from '@/lib/agents/generate-related-questions'
import {
  calculateCost,
  deductBalance,
  getModelPricing,
  recordUsage
} from '@/lib/pricing'
import { getRedisClient } from '@/lib/redis/config'
import { ExtendedCoreMessage } from '@/lib/types'
import { convertToExtendedCoreMessages } from '@/lib/utils'

interface HandleStreamFinishParams {
  responseMessages: CoreMessage[]
  originalMessages: Message[]
  model: string
  chatId: string
  dataStream: DataStreamWriter
  userId: string
  skipRelatedQuestions?: boolean
  annotations?: ExtendedCoreMessage[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export async function handleStreamFinish({
  responseMessages,
  originalMessages,
  model,
  chatId,
  dataStream,
  userId,
  skipRelatedQuestions = false,
  annotations = [],
  usage
}: HandleStreamFinishParams) {
  // Track usage and deduct balance if usage data is available
  if (usage && userId !== 'anonymous') {
    // Generate unique request ID for idempotency
    const requestId = `${chatId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    try {
      // Validate token counts (server-side validation)
      if (
        usage.promptTokens < 0 ||
        usage.completionTokens < 0 ||
        usage.totalTokens !== usage.promptTokens + usage.completionTokens
      ) {
        throw new Error(
          `Invalid token counts: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`
        )
      }

      // Parse model string (format: "providerId:modelId")
      const [providerId, modelId] = model.split(':')

      // Get pricing for this model
      const pricing = await getModelPricing(modelId, providerId)

      if (pricing) {
        // Calculate cost
        const cost = calculateCost(
          usage.promptTokens,
          usage.completionTokens,
          pricing
        )

        // Deduct cost from user balance FIRST (fail fast if insufficient funds)
        const transactionId = await deductBalance(userId, cost.totalCost)
        if (!transactionId) {
          throw new Error(
            `Failed to deduct balance for user ${userId}, cost: ${cost.totalCost}. Insufficient funds or database error.`
          )
        }

        // Record usage to database with link to transaction
        const usageRecordId = await recordUsage(
          userId,
          chatId,
          cost,
          requestId,
          transactionId,
          'completed'
        )

        if (!usageRecordId) {
          // CRITICAL: Balance was deducted but usage not recorded
          // This creates an accounting discrepancy that requires manual reconciliation
          const errorDetails = {
            userId,
            chatId,
            transactionId,
            requestId,
            cost: cost.totalCost,
            modelId,
            providerId,
            timestamp: new Date().toISOString()
          }
          console.error(
            '🚨 CRITICAL: Failed to record usage after balance deduction',
            JSON.stringify(errorDetails, null, 2)
          )
          // TODO: Send alert to monitoring system (e.g., Sentry, DataDog)
          // TODO: Queue for retry or manual reconciliation
          // Balance already deducted, so we continue rather than failing the request
        }
      } else {
        console.warn(`No pricing found for model ${modelId} (${providerId})`)
      }
    } catch (error) {
      console.error('Error tracking usage:', error)
      // Throw error to fail the request - we don't want to provide free service
      throw error
    }
  }

  try {
    const extendedCoreMessages = convertToExtendedCoreMessages(originalMessages)
    let allAnnotations = [...annotations]

    if (!skipRelatedQuestions) {
      // Notify related questions loading
      const relatedQuestionsAnnotation: JSONValue = {
        type: 'related-questions',
        data: { items: [] }
      }
      dataStream.writeMessageAnnotation(relatedQuestionsAnnotation)

      // Generate related questions
      const relatedQuestions = await generateRelatedQuestions(
        responseMessages,
        model
      )

      // Create and add related questions annotation
      const updatedRelatedQuestionsAnnotation: ExtendedCoreMessage = {
        role: 'data',
        content: {
          type: 'related-questions',
          data: relatedQuestions.object
        } as JSONValue
      }

      dataStream.writeMessageAnnotation(
        updatedRelatedQuestionsAnnotation.content as JSONValue
      )
      allAnnotations.push(updatedRelatedQuestionsAnnotation)
    }

    // Create the message to save
    const generatedMessages = [
      ...extendedCoreMessages,
      ...responseMessages.slice(0, -1),
      ...allAnnotations, // Add annotations before the last message
      ...responseMessages.slice(-1)
    ] as ExtendedCoreMessage[]

    if (process.env.ENABLE_SAVE_CHAT_HISTORY !== 'true') {
      return
    }

    // Get the chat from the database if it exists, otherwise create a new one
    const savedChat = (await getChat(chatId, userId)) ?? {
      messages: [],
      createdAt: new Date(),
      userId: userId,
      path: `/search/${chatId}`,
      title: originalMessages[0].content,
      id: chatId
    }

    // Save chat with complete response and related questions
    await saveChat(
      {
        ...savedChat,
        messages: generatedMessages
      },
      userId
    ).catch(error => {
      console.error('Failed to save chat:', error)
      throw new Error('Failed to save chat history')
    })
  } catch (error) {
    console.error('Error in handleStreamFinish:', error)
    throw error
  }

  // Increment guest exchange count after a successful assistant response
  try {
    if (userId === 'anonymous') {
      const cookieStore = await cookies()
      const guestId = cookieStore.get('guest_id')?.value
      if (guestId) {
        const redis = await getRedisClient()
        const key = `guest:exchanges:${guestId}`
        await redis.incr(key)
        // Ensure a 24h rolling window from first increment
        await redis.expire(key, 60 * 60 * 24)
      }
    }
  } catch (e) {
    console.error('Failed to increment guest exchange count:', e)
  }
}
